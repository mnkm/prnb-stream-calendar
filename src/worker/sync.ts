import { countTimestamps } from '../shared/setlist';
import { auditSetlist, problemSignature } from '../shared/setlist-audit';
import type { LiveStatus } from '../shared/types';
import { RequestBudget, countD1 } from './budget';
import {
  type ChannelProfile,
  type ChannelRow,
  type VideoRow,
  deletePlaylistsStmt,
  deleteVideosStmt,
  fillSearchTitles,
  findActiveLiveIds,
  findPendingPlaylist,
  findSetlistAuditsToNotify,
  findSetlistTargets,
  findSetlistsToAudit,
  findExistingVideoIds,
  listEnabledChannels,
  listPlaylistIds,
  markChannelSyncedStmt,
  markMembersOnlyStmt,
  markPlaylistsSyncedStmt,
  markPremieresStmt,
  markSetlistAuditsNotifiedStmts,
  markShortsStmt,
  playlistItemsPageStmts,
  saveBackfillProgress,
  saveMembersScanProgress,
  saveSetlistAuditStmts,
  saveSetlistStmt,
  savePremieresScanProgress,
  updateChannelProfile,
  upsertPlaylistStmt,
  upsertVideoStmts,
  writeBatch,
} from './db';
import { buildSetlistAuditIssue, createIssue } from './github';
import { toIsoSeconds } from './time';
import {
  RequestBudgetExceededError,
  SHORTS_MAX_DURATION_SEC,
  type YtChannel,
  type YtComment,
  type YtVideo,
  YouTubeClient,
  membersPlaylistId,
  membersVideosPlaylistId,
  parseDuration,
  shortsPlaylistId,
  uploadsPlaylistId,
  videosPlaylistId,
} from './youtube';

/**
 * 1 回の実行で使うサブリクエスト(YouTube への fetch + D1 の呼び出し)の予算。
 * Workers 無料プランの上限(50)から、最後の後片付け(検索用の列の補完)の分を残した値
 */
const REQUEST_BUDGET = 45;
/**
 * 差分同期 1 チャンネル分に必要なサブリクエスト数の上限。
 * YouTube 5 回(RSS・UUMO・UUSH・UULF・videos.list)+ D1 3 回(読み取り 2・書き込み 1)+ プロフィール 2 回
 */
const INCREMENTAL_REQUESTS = 10;
/**
 * 1 回の実行で差分同期するチャンネル数。最後に同期してから時間がたったものから順に回す。
 * Cron は 5 分ごとなので、6 チャンネルならそれぞれ約 15 分ごとに同期される
 */
const INCREMENTAL_CHANNELS_PER_RUN = 2;
/** 過去分の取得やメンバー限定の取り込みを 1 ページ進めるのに必要な数(playlistItems + videos.list + D1 書き込み) */
const PAGE_REQUESTS = 3;
/**
 * 1 回の実行で過去分を取得するページ数の上限(1 ページ = 50 件)。
 * 実際には REQUEST_BUDGET の残りの範囲で進め、続きは次回の Cron に持ち越す
 */
const BACKFILL_PAGES_PER_RUN = 8;
/** 1 回の実行で search_title を埋める件数 */
const SEARCH_TITLE_FILL_PER_RUN = 1000;
/** 1 回の実行でセトリを確認する歌枠の数(過去分の確認が多いあいだも、CPU 時間が増えすぎないように) */
const SETLIST_CHECKS_PER_RUN = 10;
/** セトリを確認する時刻(配信終了からの時間)。セトリのコメントは終了後しばらくして書かれることが多い */
const SETLIST_CHECK_HOURS = [1, 6, 24, 72, 168];
/** 関連性順で確認するコメントの数(固定コメントは先頭に来るが、固定されていないセトリも拾うため) */
const SETLIST_COMMENTS = 20;
/** セトリとみなすコメントに含まれるタイムスタンプの数 */
const SETLIST_MIN_TIMESTAMPS = 3;
/** 1 回の実行で点検するセトリの数(読み取りは 1 本 0.3ms ほど) */
const SETLIST_AUDITS_PER_RUN = 20;
/** セトリの点検の Issue を作る時刻(JST)。この時刻を過ぎた最初の実行で、1 日 1 回まで作る */
const SETLIST_AUDIT_NOTIFY_HOUR_JST = 9;
/** 1 つの Issue に載せる歌枠の数の上限(残りは次の日に回す) */
const SETLIST_AUDITS_PER_ISSUE = 20;
/** 再生リストの一覧を取り直す間隔 */
const PLAYLISTS_REFRESH_MS = 24 * 60 * 60 * 1000;
/** 1 回の実行で読む再生リストの中身のページ数(1 ページ = 50 件) */
const PLAYLIST_PAGES_PER_RUN = 8;
/** チャンネルのプロフィール(説明・登録者数など)を取り直す間隔 */
const PROFILE_REFRESH_MS = 24 * 60 * 60 * 1000;

export interface SyncEnv {
  DB: D1Database;
  YOUTUBE_API_KEY: string;
  /** セトリの点検の Issue を作る GitHub のトークン(Issues の読み書き)。無ければ点検だけ行い、通知しない */
  GITHUB_TOKEN?: string;
  /** Issue を作るリポジトリ(owner/name) */
  GITHUB_REPO?: string;
}

export interface ChannelSyncResult {
  channelId: string;
  /** backfill = 過去分の取得、incremental = 差分同期、scan = 一度だけの補正(プレミア公開・メンバー限定) */
  mode: 'backfill' | 'incremental' | 'scan';
  upserted: number;
  removed: number;
  backfillStage?: string;
  error?: string;
}

/**
 * 15 分ごとの同期。リクエスト数の予算を、まず取り込み済みチャンネルの差分同期(新着・配信状況)に使い、
 * 残りで過去分の取得と一度だけの補正を進める。チャンネルが増えても新着の反映が遅れないようにするため
 */
export async function syncAll(env: SyncEnv): Promise<ChannelSyncResult[]> {
  const budget = new RequestBudget(REQUEST_BUDGET);
  const db = countD1(env.DB, budget);
  const yt = new YouTubeClient(env.YOUTUBE_API_KEY, budget);
  const channels = await listEnabledChannels(db);
  const results: ChannelSyncResult[] = [];

  // 1. 取り込み済みチャンネルの差分同期。最後に同期してから時間がたったものから、決まった数だけ行う
  const due = channels
    .filter((c) => c.backfill_stage === 'done')
    .sort((a, b) => (a.synced_at ?? '').localeCompare(b.synced_at ?? ''))
    .slice(0, INCREMENTAL_CHANNELS_PER_RUN);
  for (const channel of due) {
    if (budget.remaining < INCREMENTAL_REQUESTS) {
      results.push(skipped(channel, 'incremental'));
      continue;
    }
    results.push(
      await runSafely(channel, 'incremental', async () => {
        await ensureChannelProfile(db, yt, channel);
        return incrementalSync(db, yt, channel);
      }),
    );
  }

  // 2. 残りの予算で、過去分の取得と一度だけの補正を sort_order の順に進める
  for (const channel of channels) {
    const mode = channel.backfill_stage !== 'done' ? 'backfill' : needsScan(channel) ? 'scan' : null;
    if (!mode) continue;
    if (budget.remaining < PAGE_REQUESTS + 2) {
      results.push(skipped(channel, mode));
      continue;
    }
    results.push(
      await runSafely(channel, mode, async () => {
        if (mode === 'scan') return oneTimeScans(db, yt, budget, channel);
        await ensureChannelProfile(db, yt, channel);
        return backfillStep(db, yt, budget, channel);
      }),
    );
  }

  // 3. 残りの予算で、配信が終わった歌枠のセトリを確認する
  try {
    await checkSetlists(db, yt, budget);
  } catch (err) {
    console.error('checkSetlists failed', err);
  }

  // 4. 取得したセトリを点検し、問題があれば 1 日 1 回 GitHub の Issue で知らせる
  try {
    await auditSetlists(db, budget);
    if (env.GITHUB_TOKEN && env.GITHUB_REPO) await notifySetlistAudits(db, budget, env.GITHUB_TOKEN, env.GITHUB_REPO);
  } catch (err) {
    console.error('setlist audit failed', err);
  }

  // 5. 残りの予算で、再生リストの一覧(1 日 1 回)と、本数が変わった再生リストの中身を読む
  try {
    await syncPlaylists(db, yt, budget, channels);
  } catch (err) {
    console.error('syncPlaylists failed', err);
  }

  // 検索用の列を追加する前に登録した行を埋める(全部埋まっていれば読み取り 1 回だけ)
  try {
    await fillSearchTitles(db, SEARCH_TITLE_FILL_PER_RUN);
  } catch (err) {
    console.error('fillSearchTitles failed', err);
  }
  return results;
}

const needsScan = (channel: ChannelRow) => !channel.premieres_scanned_at || !channel.members_scanned_at;

const skipped = (channel: ChannelRow, mode: ChannelSyncResult['mode']): ChannelSyncResult => ({
  channelId: channel.id,
  mode,
  upserted: 0,
  removed: 0,
  error: 'skipped: request budget',
});

/** 1 チャンネル分の処理を行い、失敗しても他のチャンネルの同期は続ける */
async function runSafely(
  channel: ChannelRow,
  mode: ChannelSyncResult['mode'],
  run: () => Promise<ChannelSyncResult>,
): Promise<ChannelSyncResult> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof RequestBudgetExceededError) console.warn(`request budget ran out during ${channel.id}`);
    else console.error(`sync failed for ${channel.id}`, err);
    return { channelId: channel.id, mode, upserted: 0, removed: 0, error: String(err) };
  }
}

/** チャンネルのプロフィールを 1 日 1 回取り直す(1 unit)。名前とアイコンがまだ無いときはすぐ取る */
async function ensureChannelProfile(db: D1Database, yt: YouTubeClient, channel: ChannelRow) {
  const hasBasics = !!(channel.title && channel.icon_url);
  const updatedAt = channel.profile_updated_at ? Date.parse(channel.profile_updated_at) : 0;
  if (hasBasics && Date.now() - updatedAt < PROFILE_REFRESH_MS) return;
  try {
    const info = await yt.getChannel(channel.id);
    if (!info) throw new Error(`channel not found: ${channel.id}`);
    await updateChannelProfile(db, channel.id, toChannelProfile(info), nowIso());
  } catch (err) {
    // 名前とアイコンがあれば同期は続けられるので、プロフィールの更新失敗では止めない
    if (!hasBasics) throw err;
    console.warn(`profile refresh failed for ${channel.id}`, err);
  }
}

function toChannelProfile(info: YtChannel): ChannelProfile {
  const { snippet, statistics, brandingSettings } = info;
  const banner = brandingSettings?.image?.bannerExternalUrl;
  const count = (value?: string) => (value === undefined ? null : Number(value));
  return {
    title: snippet.title,
    iconUrl: snippet.thumbnails.medium?.url ?? snippet.thumbnails.default?.url ?? null,
    description: snippet.description?.trim() || null,
    customUrl: snippet.customUrl ?? null,
    // 元画像はテレビ用の大きなサイズなので、パソコン用の横長(約 6:1)に切り出したものを使う
    bannerUrl: banner ? `${banner}=w1280-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj` : null,
    subscriberCount: statistics?.hiddenSubscriberCount ? null : count(statistics?.subscriberCount),
    videoCount: count(statistics?.videoCount),
  };
}

/** 過去分の取得。uploads を全件 → UUSH でショートを判定、の順に数回の Cron に分けて進める */
async function backfillStep(
  db: D1Database,
  yt: YouTubeClient,
  budget: RequestBudget,
  channel: ChannelRow,
): Promise<ChannelSyncResult> {
  let stage = channel.backfill_stage;
  let pageToken = channel.backfill_page_token ?? undefined;
  let upserted = 0;

  // 最後の進み具合の保存(D1 1 回)の分を残して進める
  for (let i = 0; i < BACKFILL_PAGES_PER_RUN && stage !== 'done' && budget.remaining > PAGE_REQUESTS; i++) {
    if (stage === 'uploads') {
      const page = await yt.listPlaylistPage(uploadsPlaylistId(channel.id), pageToken);
      if (page) {
        const rows = (await yt.getVideos(page.ids)).map((v) => toVideoRow(v, false, false));
        await writeBatch(db, upsertVideoStmts(db, rows, nowIso()));
        upserted += rows.length;
      }
      pageToken = page?.nextPageToken;
      if (!pageToken) stage = 'shorts';
    } else {
      const page = await yt.listPlaylistPage(shortsPlaylistId(channel.id), pageToken);
      if (page) await writeBatch(db, [markShortsStmt(db, page.ids)]);
      pageToken = page?.nextPageToken;
      if (!pageToken) stage = 'done';
    }
  }

  await saveBackfillProgress(db, channel.id, stage, pageToken ?? null, nowIso());
  return { channelId: channel.id, mode: 'backfill', upserted, removed: 0, backfillStage: stage };
}

/** 通常の差分同期。RSS で新着を検知し、新着 + 予定/配信中ライブだけを videos.list で取得する */
async function incrementalSync(db: D1Database, yt: YouTubeClient, channel: ChannelRow): Promise<ChannelSyncResult> {
  let latestIds: string[];
  try {
    latestIds = await yt.fetchRssVideoIds(channel.id);
  } catch (err) {
    if (err instanceof RequestBudgetExceededError) throw err;
    console.warn(`RSS unavailable for ${channel.id}, falling back to playlistItems`, err);
    latestIds = (await yt.listPlaylistPage(uploadsPlaylistId(channel.id)))?.ids ?? [];
  }

  // メンバー限定は RSS にも UU にも出てこないので、UUMO の先頭も見る
  const membersPage = await yt.listPlaylistPage(membersPlaylistId(channel.id));
  const candidateIds = [...new Set([...latestIds, ...(membersPage?.ids ?? [])])];

  const known = await findExistingVideoIds(db, candidateIds);
  const newIds = candidateIds.filter((id) => !known.has(id));
  const activeLiveIds = await findActiveLiveIds(db, channel.id);
  const targetIds = [...new Set([...newIds, ...activeLiveIds])];

  const shortsPage = await yt.listPlaylistPage(shortsPlaylistId(channel.id));
  const shortIds = new Set(shortsPage?.ids ?? []);
  const videosPage = await yt.listPlaylistPage(videosPlaylistId(channel.id));
  const premiereIds = new Set(videosPage?.ids ?? []);
  const videos = targetIds.length > 0 ? await yt.getVideos(targetIds) : [];

  if (!shortsPage) {
    try {
      for (const v of videos) {
        const duration = parseDuration(v.contentDetails?.duration);
        const maybeShort = !v.liveStreamingDetails && duration !== null && duration <= SHORTS_MAX_DURATION_SEC;
        if (maybeShort && (await yt.isShortByUrl(v.id))) shortIds.add(v.id);
      }
    } catch (err) {
      // 予算を使い切ったら、残りは次回以降の UUSH での補正に任せる
      if (!(err instanceof RequestBudgetExceededError)) throw err;
    }
  }

  // 予定枠が削除・非公開化された場合は videos.list に返ってこないので、カレンダーからも消す
  const returned = new Set(videos.map((v) => v.id));
  const removedIds = activeLiveIds.filter((id) => !returned.has(id));

  // 書き込みは 1 回の batch にまとめる。UUSH / UULF / UUMO の先頭ページで、
  // 反映が遅れて誤った種別で登録されたものも後から補正する
  const now = nowIso();
  await writeBatch(db, [
    ...upsertVideoStmts(db, videos.map((v) => toVideoRow(v, shortIds.has(v.id), premiereIds.has(v.id))), now),
    markShortsStmt(db, shortsPage?.ids ?? []),
    markPremieresStmt(db, videosPage?.ids ?? []),
    markMembersOnlyStmt(db, membersPage?.ids ?? []),
    deleteVideosStmt(db, removedIds),
    markChannelSyncedStmt(db, channel.id, now),
  ]);
  return { channelId: channel.id, mode: 'incremental', upserted: videos.length, removed: removedIds.length };
}

/** 過去分の取得のあとに 1 回だけ行う補正。終わるまで、残りの予算の範囲で毎回少しずつ進める */
async function oneTimeScans(
  db: D1Database,
  yt: YouTubeClient,
  budget: RequestBudget,
  channel: ChannelRow,
): Promise<ChannelSyncResult> {
  if (!channel.premieres_scanned_at) await scanPremieres(db, yt, budget, channel);
  const upserted = channel.members_scanned_at ? 0 : await scanMembers(db, yt, budget, channel);
  return { channelId: channel.id, mode: 'scan', upserted, removed: 0 };
}

/** UULF を最後まで見て、ライブとして登録されたプレミア公開を動画に分類し直す */
async function scanPremieres(db: D1Database, yt: YouTubeClient, budget: RequestBudget, channel: ChannelRow) {
  let pageToken = channel.premieres_page_token ?? undefined;
  // 1 ページ = playlistItems + D1 書き込み。最後の進み具合の保存の分を残す
  for (let i = 0; i < BACKFILL_PAGES_PER_RUN && budget.remaining > 2; i++) {
    const page = await yt.listPlaylistPage(videosPlaylistId(channel.id), pageToken);
    if (page) await writeBatch(db, [markPremieresStmt(db, page.ids)]);
    pageToken = page?.nextPageToken;
    if (!pageToken) break;
  }
  await savePremieresScanProgress(db, channel.id, pageToken ?? null, nowIso());
}

/**
 * UUMO を最後まで見て、メンバー限定を取り込む。
 * メンバー限定のプレミア公開は UUMF の先頭ページで判定する(メンバー限定の動画は少ないため)
 */
async function scanMembers(
  db: D1Database,
  yt: YouTubeClient,
  budget: RequestBudget,
  channel: ChannelRow,
): Promise<number> {
  // UUMF 1 回 + 1 ページ以上 + 進み具合の保存 1 回が入らなければ、次回に回す
  if (budget.remaining < PAGE_REQUESTS + 2) return 0;
  const premiereIds = new Set((await yt.listPlaylistPage(membersVideosPlaylistId(channel.id)))?.ids ?? []);

  let pageToken = channel.members_page_token ?? undefined;
  let upserted = 0;
  for (let i = 0; i < BACKFILL_PAGES_PER_RUN && budget.remaining > PAGE_REQUESTS; i++) {
    const page = await yt.listPlaylistPage(membersPlaylistId(channel.id), pageToken);
    if (page) {
      const rows = (await yt.getVideos(page.ids)).map((v) => toVideoRow(v, false, premiereIds.has(v.id)));
      await writeBatch(db, [...upsertVideoStmts(db, rows, nowIso()), markMembersOnlyStmt(db, page.ids)]);
      upserted += rows.length;
    }
    pageToken = page?.nextPageToken;
    if (!pageToken) break;
  }
  await saveMembersScanProgress(db, channel.id, pageToken ?? null, nowIso());
  return upserted;
}

function toVideoRow(v: YtVideo, isShort: boolean, inVideosTab: boolean): VideoRow {
  const live = v.liveStreamingDetails;
  const broadcast = v.snippet.liveBroadcastContent;
  const liveStatus: LiveStatus | null = live ? (broadcast === 'none' ? 'ended' : broadcast) : null;
  const eventAt = live?.actualStartTime ?? live?.scheduledStartTime ?? v.snippet.publishedAt;
  const thumbs = v.snippet.thumbnails;
  const duration = parseDuration(v.contentDetails?.duration);
  // プレミア公開も liveStreamingDetails を持つ。公開前・公開中は動画がアップロード済みなので長さがあり、
  // 長さ 0 のライブ配信と区別できる。公開後は UULF に含まれるかどうかで判定する
  const isPremiere = !!live && (inVideosTab || (broadcast !== 'none' && !!duration));

  return {
    id: v.id,
    channel_id: v.snippet.channelId,
    type: live && !isPremiere ? 'live' : isShort ? 'short' : 'video',
    live_status: liveStatus,
    title: v.snippet.title,
    thumbnail_url: thumbs.medium?.url ?? thumbs.default?.url ?? null,
    duration_sec: duration,
    event_at: toIsoSeconds(eventAt),
    ended_at: live?.actualEndTime ? toIsoSeconds(live.actualEndTime) : null,
    published_at: toIsoSeconds(v.snippet.publishedAt),
  };
}

const nowIso = () => toIsoSeconds(new Date());

/**
 * 歌枠のセトリを確認する。関連性順の上位コメントから、タイムスタンプを多く含む最初のものをセトリとして保存する。
 * 見つからなければ、配信終了の 1・6・24 時間後、3・7 日後に確認し直し、7 日を過ぎたらあきらめる
 */
async function checkSetlists(db: D1Database, yt: YouTubeClient, budget: RequestBudget) {
  // 対象の読み取り 1 回 + 書き込み 1 回 + 1 本以上の確認が入らなければ、次回に回す
  if (budget.remaining < 4) return;
  const now = new Date();
  const notBefore = toIsoSeconds(new Date(now.getTime() - SETLIST_CHECK_HOURS[0] * 3600_000));
  const targets = await findSetlistTargets(db, toIsoSeconds(now), notBefore, SETLIST_CHECKS_PER_RUN);

  const stmts: D1PreparedStatement[] = [];
  for (const target of targets) {
    if (budget.remaining <= 1) break; // 最後の書き込みの分を残す
    let comments: YtComment[] | null;
    try {
      comments = await yt.getTopComments(target.id, SETLIST_COMMENTS);
    } catch (err) {
      // クォータ超過などで続けられないときは、ここまでの結果だけ保存する
      console.warn(`setlist check failed for ${target.id}`, err);
      break;
    }
    const found = comments?.find((c) => countTimestamps(c.text) >= SETLIST_MIN_TIMESTAMPS) ?? null;
    stmts.push(
      saveSetlistStmt(db, {
        videoId: target.id,
        comment: found,
        checkedAt: toIsoSeconds(now),
        // コメントが無効な配信や、見つかった配信は、もう確認しない
        nextCheckAt: found || comments === null ? null : nextSetlistCheck(target.ended_at, now),
      }),
    );
  }
  await writeBatch(db, stmts);
}

/** 次にセトリを確認する日時。配信終了から 7 日を過ぎていれば null(あきらめる) */
function nextSetlistCheck(endedAt: string, now: Date): string | null {
  const ended = Date.parse(endedAt);
  const next = SETLIST_CHECK_HOURS.map((h) => ended + h * 3600_000).find((t) => t > now.getTime());
  return next === undefined ? null : toIsoSeconds(new Date(next));
}

/** 取得・確認してからまだ点検していないセトリを、表示と同じ読み取りで点検する(読み取り 1 回 + 書き込み 1 回) */
async function auditSetlists(db: D1Database, budget: RequestBudget) {
  if (budget.remaining < 2) return;
  const rows = await findSetlistsToAudit(db, SETLIST_AUDITS_PER_RUN);
  const now = toIsoSeconds(new Date());
  const stmts = rows.flatMap((row) => {
    const problems = auditSetlist(row.text, row.duration_sec);
    return saveSetlistAuditStmts(db, {
      videoId: row.video_id,
      problems,
      signature: problemSignature(row.comment_id, problems),
      checkedAt: row.checked_at,
      now,
    });
  });
  await writeBatch(db, stmts);
}

/**
 * まだ知らせていない問題を、1 つの Issue にまとめて知らせる。毎日 SETLIST_AUDIT_NOTIFY_HOUR_JST 時(JST)を過ぎてから、
 * その日にまだ知らせていなければ作る(読み取り 1 回 + GitHub 1 回 + 書き込み 1 回)
 */
async function notifySetlistAudits(db: D1Database, budget: RequestBudget, token: string, repo: string) {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600_000);
  if (jst.getUTCHours() < SETLIST_AUDIT_NOTIFY_HOUR_JST || budget.remaining < 3) return;
  // JST の今日の 0 時(UTC で表す)
  const todayStart = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 3600_000);
  const rows = await findSetlistAuditsToNotify(db, toIsoSeconds(todayStart), SETLIST_AUDITS_PER_ISSUE);
  if (rows.length === 0) return;
  const url = await createIssue(budget, token, repo, buildSetlistAuditIssue(rows, now));
  console.log(`setlist audit issue created: ${url}`);
  await writeBatch(db, markSetlistAuditsNotifiedStmts(db, rows.map((r) => r.video_id), toIsoSeconds(now)));
}

/**
 * 再生リストの同期。一覧はチャンネルごとに 1 日 1 回取り直し、本数が変わった(または新しい)再生リストだけ
 * 中身を最初から読み直す。中身はページ単位で次回の実行に持ち越せる
 */
async function syncPlaylists(db: D1Database, yt: YouTubeClient, budget: RequestBudget, channels: ChannelRow[]) {
  const now = new Date();
  const stamp = toIsoSeconds(now);

  // 一覧の取り直し: 1 回の実行で 1 チャンネルまで(YouTube 1 回 + D1 2 回)
  const due = channels.find(
    (c) => !c.playlists_synced_at || now.getTime() - Date.parse(c.playlists_synced_at) >= PLAYLISTS_REFRESH_MS,
  );
  if (due && budget.remaining >= 5) {
    const lists = await yt.listChannelPlaylists(due.id);
    const known = await listPlaylistIds(db, due.id);
    const current = new Set(lists.map((p) => p.id));
    await writeBatch(db, [
      ...lists.map((p) => upsertPlaylistStmt(db, due.id, p, stamp)),
      deletePlaylistsStmt(db, known.filter((id) => !current.has(id))),
      markPlaylistsSyncedStmt(db, due.id, stamp),
    ]);
  }

  // 中身の読み込み: 読む必要がある再生リストを 1 つずつ、ページ単位で進める
  let pages = 0;
  while (pages < PLAYLIST_PAGES_PER_RUN && budget.remaining >= 4) {
    const target = await findPendingPlaylist(db);
    if (!target) return;
    let token = target.items_page_token ?? undefined;
    do {
      const page = await yt.listPlaylistItems(target.id, token);
      await writeBatch(db, playlistItemsPageStmts(db, target.id, page, !token, stamp));
      pages++;
      token = page?.nextPageToken;
    } while (token && pages < PLAYLIST_PAGES_PER_RUN && budget.remaining >= 3);
  }
}
