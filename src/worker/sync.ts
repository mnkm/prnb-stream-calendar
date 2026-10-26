import {
  SETLIST_MAX_CHARS,
  SETLIST_PARSER_VERSION,
  mergeSetlistReplies,
  parseSetlist,
  pickMarkedSetlistComment,
  pickSetlistComment,
} from '../shared/setlist';
import { hasMorningStamp } from '../shared/morning';
import { type SetlistProblem, auditSetlist, problemSignature } from '../shared/setlist-audit';
import type { LiveStatus } from '../shared/types';
import { RequestBudget, RequestBudgetExceededError, countD1 } from './budget';
import {
  type ChannelProfile,
  type ChannelRow,
  type TwitchArchiveRow,
  type VideoWriteRow,
  availabilityStmts,
  clearExpiredTwitchArchivesStmt,
  clearTwitchToken,
  deletePlaylistsStmt,
  deleteVideosStmt,
  endTwitchLivesStmt,
  fillSearchTitles,
  findActiveLives,
  findLivesToWatch,
  MORNING_MAX_PER_VIDEO,
  findMorningTargets,
  hasRecentUpload,
  findAvailabilityTargets,
  findPendingPlaylist,
  findSetlistAuditsToNotify,
  findSetlistTargets,
  findSetlistsToAudit,
  findSetlistsToParse,
  findExistingVideoIds,
  linkTwitchArchiveStmt,
  listEnabledChannels,
  listPlaylistIds,
  markChannelSyncedStmt,
  markMembersOnlyStmt,
  markPlaylistsSyncedStmt,
  markPremieresStmt,
  markSetlistAuditsNotifiedStmts,
  markShortsStmt,
  markTwitchClipsSyncedStmt,
  markTwitchSyncedStmt,
  markVanishedLivesStmt,
  playlistItemsPageStmts,
  readTwitchState,
  saveBackfillProgress,
  saveMorningCheckStmts,
  saveScanProgress,
  saveSetlistAuditStmts,
  saveSetlistSongsStmt,
  saveSetlistStmt,
  saveTwitchClipsBackfillStmt,
  saveTwitchTokenStmt,
  twitchClipCheckStmts,
  twitchEventId,
  updateChannelProfile,
  upsertPlaylistStmt,
  upsertTwitchArchiveStmts,
  upsertTwitchClipStmts,
  upsertTwitchLiveStmts,
  upsertVideoStmts,
  writeBatch,
} from './db';
import { buildSetlistAuditIssue, createIssue } from './github';
import { JST_OFFSET_MS, isDue, isoBefore, toIsoSeconds } from './time';
import { type TwClip, TwitchApiError, TwitchClient } from './twitch';
import {
  SHORTS_MAX_DURATION_SEC,
  type YtChannel,
  type YtComment,
  type YtVideo,
  ResponseTooLargeError,
  YouTubeApiError,
  YouTubeClient,
  membersPlaylistId,
  membersVideosPlaylistId,
  parseDuration,
  shortsPlaylistId,
  uploadsPlaylistId,
  videosPlaylistId,
} from './youtube';

/**
 * 1 回の実行で使うサブリクエスト(YouTube への fetch + D1 の呼び出し)の予算。暴走の歯止め。
 * Workers Paid の上限(サブリクエスト 10,000、D1 の問い合わせ 1,000)に対して、十分小さい値にしている。
 * 足りなくなったときは、後ろの処理(セトリ → 再生リスト → 再生できるかの確認)から次の実行に回る
 */
const REQUEST_BUDGET = 300;
/** 全体の同期(syncAll)の間隔。Cron は毎分で、この間隔の回だけ全体の同期を行う(src/worker/index.ts) */
export const FULL_SYNC_INTERVAL_MS = 5 * 60_000;
/**
 * 差分同期 1 チャンネル分に必要なサブリクエスト数の上限。
 * YouTube 5 回(RSS・UUMO・UUSH・UULF・videos.list)+ D1 4 回(読み取り 3・書き込み 1)+ プロフィール 2 回
 */
const INCREMENTAL_REQUESTS = 11;
/**
 * 差分同期で、種別の一覧(UUSH = ショート、UULF = 動画タブ)を、新しい動画が無くても確かめ直す間隔(全体の同期の回数)。
 * 12 回 = 1 時間に 1 回。どの回に確かめるかは、時刻とチャンネルの並び順から決める(チャンネルごとに回をずらす)。
 * 実行が 1 回抜けると、そのチャンネルの確かめ直しは次の 1 時間後になる
 */
const TYPE_CHECK_EVERY_RUNS = 12;
/** 公開からこの時間のあいだは、差分同期のたびに種別の一覧を確かめ直す(一覧に載るのが遅れたショートを直すため) */
const RECENT_UPLOAD_MS = 60 * 60_000;
/** 開始・終了だけを見る軽い確認(syncLiveStatus)で使うサブリクエストの予算(D1 2 回 + videos.list 1 回で足りる) */
const LIVE_STATUS_REQUEST_BUDGET = 6;
/** 軽い確認で見る配信予定の範囲。開始の予定が、この時間だけ前から、この時間だけ先までのもの */
const LIVE_STATUS_PAST_MS = 6 * 60 * 60_000;
const LIVE_STATUS_AHEAD_MS = 10 * 60_000;
/** 軽い確認で 1 回に見る配信の数(videos.list は 50 本で 1 unit) */
const LIVE_STATUS_MAX_VIDEOS = 50;
/** 過去分の取得やメンバー限定の取り込みを 1 ページ進めるのに必要な数(playlistItems + videos.list + D1 書き込み) */
const PAGE_REQUESTS = 3;
/**
 * 1 回の実行で過去分を取得するページ数の上限(1 ページ = 50 件)。
 * 実際には REQUEST_BUDGET の残りの範囲で進め、続きは次回の Cron に持ち越す
 */
const BACKFILL_PAGES_PER_RUN = 8;
/** 1 回の実行で search_title を埋める件数 */
const SEARCH_TITLE_FILL_PER_RUN = 1000;
/** 1 回の実行でセトリを確認する配信の数 */
const SETLIST_CHECKS_PER_RUN = 10;
/**
 * セトリを確認する時刻(配信終了からの時間)。セトリのコメントは終了後しばらくして書かれることが多い。
 * 見つかったあとも最後の時刻までは確認を続け、より良いコメント(配信者本人・高評価の多いもの)があれば差し替える
 * (コメントは誰でも書けるので、最初に見つけたものを確定にすると、先に書かれた別の内容が残り続ける)。
 * 早い時刻の確認では、書きかけのセトリや時刻つきの感想が先に保存されることがある(あとの確認で置き換わる)
 */
const SETLIST_CHECK_HOURS = [0.25, 0.5, 1, 6, 24, 72, 168];
/**
 * タイトルに「歌枠」が無い配信を確認する時刻。歌った配信は一部なので、確認の回数を減らす
 * (歌のあとにも雑談が続くことが多く、終了直後にセトリが書かれていることは少ない)。最後の時刻は歌枠と同じにする
 */
const SETLIST_CHECK_HOURS_OTHER = [1, 6, 24, 72, 168];
/** 関連性順で確認するコメントの数(固定コメントは先頭に来るが、固定されていないセトリも拾うため) */
const SETLIST_COMMENTS = 20;
/** セトリの続きを探す返信の数(古い順。comments.list で 1 回に取れる上限) */
const SETLIST_REPLIES = 100;
/** 1 回の実行で、検索用に曲を読み取って保存するセトリの数の上限 */
const SETLIST_PARSES_PER_RUN = 50;
/** 1 回の実行で点検するセトリの数の上限 */
const SETLIST_AUDITS_PER_RUN = 50;
/** セトリの点検の Issue を作る時刻(JST)。この時刻を過ぎた最初の実行で、1 日 1 回まで作る */
const SETLIST_AUDIT_NOTIFY_HOUR_JST = 9;
/** 1 つの Issue に載せる歌枠の数の上限(残りは次の日に回す) */
const SETLIST_AUDITS_PER_ISSUE = 20;
/**
 * 1 回の実行でコメントを確認する朝活の配信の数。まだ確認していない過去の配信も、これで少しずつ取り込む
 * (1 時間に 60 本ほど)
 */
const MORNING_CHECKS_PER_RUN = 5;
/**
 * 朝活の配信のコメントを確認する時刻(配信終了からの時間)。タイムスタンプのコメントは、配信の翌日以降に書かれたり
 * 書き足されたりすることもあるので、30 日後まで確認する。過去の配信は、最初の確認で予定が終わる
 */
const MORNING_CHECK_HOURS = [3, 24, 72, 168, 720];
/**
 * 関連性順で確認するコメントの数(1 回に取れる上限)。朝活のコメントは多くても数十件なので、ふつうは全部を見られる。
 * これより多い配信では、見られなかった分に前に選んだコメントがあるかもしれないので、保存済みを消さない
 */
const MORNING_COMMENTS = 100;
/** 再生リストの一覧を取り直す間隔 */
const PLAYLISTS_REFRESH_MS = 24 * 60 * 60 * 1000;
/** 1 回の実行で読む再生リストの中身のページ数(1 ページ = 50 件) */
const PLAYLIST_PAGES_PER_RUN = 8;
/** チャンネルのプロフィール(説明・登録者数など)を取り直す間隔 */
const PROFILE_REFRESH_MS = 24 * 60 * 60 * 1000;
/**
 * Twitch の同期に必要なサブリクエスト数の上限。
 * D1 2 回(読み取り 1・書き込み 1)+ Twitch 7 回(トークン・配信中・ユーザー ID・フォロワー数・アーカイブ・クリップ・クリップの確認)
 */
const TWITCH_REQUESTS = 9;
/** 1 回の実行で、今もあるかを確認するクリップの数(ID を URL に並べるので、長くなりすぎない数にする) */
const TWITCH_CLIP_CHECKS_PER_RUN = 50;
/** クリップが今もあるかを確認し直す間隔 */
const TWITCH_CLIP_CHECK_REFRESH_MS = 24 * 60 * 60 * 1000;
/** 1 回の実行で、今も再生できるかを確認する YouTube の動画の数(videos.list の 1 回分) */
const AVAILABILITY_CHECKS_PER_RUN = 50;
/** YouTube の動画が今も再生できるかを確認し直す間隔 */
const AVAILABILITY_REFRESH_MS = 24 * 60 * 60 * 1000;
/** 最近のクリップを確認し直す間隔(チャンネルごと) */
const TWITCH_CLIPS_REFRESH_MS = 60 * 60 * 1000;
/** 最近のクリップとして確認する期間。この期間に作られたクリップは、再生数も新しくなる */
const TWITCH_CLIPS_RECENT_MS = 7 * 24 * 60 * 60 * 1000;
/** 全期間のクリップを読み直す間隔(古いクリップの再生数を新しくするため) */
const TWITCH_CLIPS_BACKFILL_MS = 7 * 24 * 60 * 60 * 1000;
/** ふだん確認するアーカイブの数(新しい順)。配信が終わった直後のものが入っていればよい */
const TWITCH_ARCHIVES_RECENT = 20;
/** 1 日 1 回、まとめて確認するアーカイブの数(1 回で取れる上限)。公開が終わったものもここで見つける */
const TWITCH_ARCHIVES_FULL = 100;
/** Twitch のユーザー ID・フォロワー数・全アーカイブを確認し直す間隔 */
const TWITCH_PROFILE_REFRESH_MS = 24 * 60 * 60 * 1000;
/** トークンの期限がこれより近ければ取り直す */
const TWITCH_TOKEN_MARGIN_MS = 24 * 60 * 60 * 1000;

export interface SyncEnv {
  DB: D1Database;
  YOUTUBE_API_KEY: string;
  /** Twitch のアプリの Client ID と Client Secret。無ければ Twitch は同期しない */
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
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
 * 5 分ごとの、全体の同期。リクエスト数の予算を、まず取り込み済みチャンネルの差分同期(新着・配信状況)に使い、
 * 残りで過去分の取得と一度だけの補正を進める。チャンネルが増えても新着の反映が遅れないようにするため
 */
export async function syncAll(env: SyncEnv): Promise<ChannelSyncResult[]> {
  // この実行が何回目の全体の同期にあたるか(種別の一覧を確かめ直す回を決めるのに使う。時刻は最初に 1 回だけ取る)
  const run = Math.floor(Date.now() / FULL_SYNC_INTERVAL_MS);
  const budget = new RequestBudget(REQUEST_BUDGET);
  const db = countD1(env.DB, budget);
  const yt = new YouTubeClient(env.YOUTUBE_API_KEY, budget);
  const channels = await listEnabledChannels(db);
  const results: ChannelSyncResult[] = [];

  // 1. 取り込み済みチャンネルの差分同期(全チャンネル)。予算が足りなくなったときに同じチャンネルばかり
  //    後回しにならないよう、最後に同期してから時間がたったものから行う
  const due = channels
    .filter((c) => c.backfill_stage === 'done')
    .sort((a, b) => (a.synced_at ?? '').localeCompare(b.synced_at ?? ''));
  for (const channel of due) {
    if (budget.remaining < INCREMENTAL_REQUESTS) {
      results.push(skipped(channel, 'incremental'));
      continue;
    }
    results.push(
      await runSafely(channel, 'incremental', async () => {
        await ensureChannelProfile(db, yt, channel);
        // 種別の一覧を確かめ直す回か(チャンネルの並び順で回をずらし、1 回の実行に集中させない)
        const typeCheckRun = (run + channels.indexOf(channel)) % TYPE_CHECK_EVERY_RUNS === 0;
        return incrementalSync(db, yt, channel, typeCheckRun);
      }),
    );
  }

  // 2. Twitch にもチャンネルがあるものは、配信中のライブと過去の配信のアーカイブを取り込む(毎回、全チャンネル分)
  try {
    await syncTwitch(db, budget, env, channels);
  } catch (err) {
    console.error('syncTwitch failed', err);
  }

  // 3・4. 残りの予算で、過去分の取得と一度だけの補正を sort_order の順に進める
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

  // 5・6. 残りの予算で、セトリの処理をする(確認・曲の読み取り・点検・通知)
  await runSetlistStages(db, yt, budget, env);

  // 6-2. 残りの予算で、朝活の配信のコメントから、ボイスや今日の質問のタイムスタンプを含むものを取り込む
  try {
    await checkMorningComments(db, yt, budget);
  } catch (err) {
    console.error('checkMorningComments failed', err);
  }

  // 7. 残りの予算で、再生リストの一覧(1 日 1 回)と、本数が変わった再生リストの中身を読む
  try {
    await syncPlaylists(db, yt, budget, channels);
  } catch (err) {
    console.error('syncPlaylists failed', err);
  }

  // 8. 残りの予算で、取り込み済みの YouTube の動画が今も再生できるかを、古いものから順に確認する
  try {
    await checkAvailability(db, yt, budget);
  } catch (err) {
    console.error('checkAvailability failed', err);
  }

  // 検索用の列を追加する前に登録した行を埋める(全部埋まっていれば読み取り 1 回だけ)
  try {
    await fillSearchTitles(db, SEARCH_TITLE_FILL_PER_RUN);
  } catch (err) {
    console.error('fillSearchTitles failed', err);
  }
  return results;
}

/**
 * セトリの処理。確認 → 曲の読み取り → 点検 → 通知 の順に行う(確認で見つかったセトリの曲が、同じ実行の中で
 * 検索に入る)。それぞれ、1 回の実行で扱う本数に上限がある。
 * セトリのもとになるコメントは誰でも書けるので、1 件あたりの大きさには上限を設けている(読み取りは
 * SETLIST_MAX_CHARS 文字まで、応答は youtube.ts の COMMENTS_MAX_BYTES まで)。上限いっぱいに細工された入力が
 * 本数の上限まで並んでも、1 回の実行は 1〜2 秒ほどで(開発機での見積もり)、Workers Paid の CPU 時間の上限(30 秒)に収まる
 */
async function runSetlistStages(db: D1Database, yt: YouTubeClient, budget: RequestBudget, env: SyncEnv) {
  // 配信が終わった歌枠のセトリを確認する
  try {
    await checkSetlists(db, yt, budget);
  } catch (err) {
    console.error('checkSetlists failed', err);
  }

  // 検索で曲名・アーティストも探せるよう、セトリから曲を読み取って保存する(新しく見つかったもの、読み取りの規則が変わったもの)
  try {
    await parseSetlistSongs(db, budget);
  } catch (err) {
    console.error('parseSetlistSongs failed', err);
  }

  // 取得したセトリを点検し、問題があれば 1 日 1 回 GitHub の Issue で知らせる
  try {
    await auditSetlists(db, budget);
    if (env.GITHUB_TOKEN && env.GITHUB_REPO) await notifySetlistAudits(db, budget, env.GITHUB_TOKEN, env.GITHUB_REPO);
  } catch (err) {
    console.error('setlist audit failed', err);
  }
}

/**
 * 配信の開始・終了だけを見る軽い確認。全体の同期(5 分ごと)の合間に、毎分行う。
 * 配信中のものと、開始の予定が近い配信予定(全チャンネル)を、まとめて videos.list で取り直す(50 本まで 1 unit)。
 * 見る配信が無ければ、YouTube には問い合わせない。
 * 新しい配信予定の検知や、消えた配信(削除・非公開)の扱いは、全体の同期に任せる
 */
export async function syncLiveStatus(env: SyncEnv): Promise<{ watched: number; updated: number }> {
  const budget = new RequestBudget(LIVE_STATUS_REQUEST_BUDGET);
  const db = countD1(env.DB, budget);
  const now = Date.now();
  const ids = await findLivesToWatch(db, isoBefore(now, LIVE_STATUS_PAST_MS), isoBefore(now, -LIVE_STATUS_AHEAD_MS), LIVE_STATUS_MAX_VIDEOS);
  if (ids.length === 0) return { watched: 0, updated: 0 };
  const videos = await new YouTubeClient(env.YOUTUBE_API_KEY, budget).getVideos(ids);
  // 配信はショートではない。プレミア公開かどうかは、公開中は長さから決まり、公開後は保存済みの種別が保たれる
  // (upsertVideoStmts)ので、種別の一覧(UUSH・UULF)は見なくてよい
  await writeBatch(db, upsertVideoStmts(db, videos.map((v) => toVideoRow(v, false, false)), nowIso()));
  return { watched: ids.length, updated: videos.length };
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
  if (hasBasics && !isDue(channel.profile_updated_at, PROFILE_REFRESH_MS)) return;
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
async function incrementalSync(
  db: D1Database,
  yt: YouTubeClient,
  channel: ChannelRow,
  typeCheckRun: boolean,
): Promise<ChannelSyncResult> {
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
  const activeLives = await findActiveLives(db, channel.id);
  const activeLiveIds = activeLives.map((r) => r.id);
  const targetIds = [...new Set([...newIds, ...activeLiveIds])];

  // 種別の一覧(UUSH = ショート、UULF = 動画タブ)は、新しい動画があったとき、公開されたばかりの動画があるあいだ、
  // 1 時間に 1 回の確かめ直しの回、にだけ取る(毎回取ると、チャンネルごとに 2 unit ずつ使う)。
  // undefined は「今回は取りに行かなかった」、null は「取りに行ったが、一覧が無かった」
  const recentUpload = await hasRecentUpload(db, channel.id, isoBefore(Date.now(), RECENT_UPLOAD_MS));
  const checkTypes = typeCheckRun || newIds.length > 0 || recentUpload;
  const shortsPage = checkTypes ? await yt.listPlaylistPage(shortsPlaylistId(channel.id)) : undefined;
  const shortIds = new Set(shortsPage?.ids ?? []);
  const videosPage = checkTypes ? await yt.listPlaylistPage(videosPlaylistId(channel.id)) : undefined;
  const premiereIds = new Set(videosPage?.ids ?? []);
  const videos = targetIds.length > 0 ? await yt.getVideos(targetIds) : [];

  // ショートの一覧が無いチャンネルでは、URL で 1 本ずつ確かめる(取りに行かなかった回には、やらない)
  if (shortsPage === null) {
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

  // 削除・非公開化されたものは videos.list に返ってこない。始まらないまま消えた予定枠は、中止された予定なので
  // カレンダーからも消す。配信中に消えたもの(配信のあとすぐ非公開にされた配信)は、記録を残して再生できないものにする
  const returned = new Set(videos.map((v) => v.id));
  const vanished = activeLives.filter((r) => !returned.has(r.id));
  const removedIds = vanished.filter((r) => r.live_status === 'upcoming').map((r) => r.id);
  const hiddenIds = vanished.filter((r) => r.live_status === 'live').map((r) => r.id);

  // 書き込みは 1 回の batch にまとめる。UUSH / UULF / UUMO の先頭ページで、
  // 反映が遅れて誤った種別で登録されたものも後から補正する
  const now = nowIso();
  await writeBatch(db, [
    ...upsertVideoStmts(db, videos.map((v) => toVideoRow(v, shortIds.has(v.id), premiereIds.has(v.id))), now),
    markShortsStmt(db, shortsPage?.ids ?? []),
    markPremieresStmt(db, videosPage?.ids ?? []),
    markMembersOnlyStmt(db, membersPage?.ids ?? []),
    deleteVideosStmt(db, removedIds),
    markVanishedLivesStmt(db, hiddenIds, now),
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
  await saveScanProgress(db, channel.id, 'premieres', pageToken ?? null, nowIso());
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
  await saveScanProgress(db, channel.id, 'members', pageToken ?? null, nowIso());
  return upserted;
}

function toVideoRow(v: YtVideo, isShort: boolean, inVideosTab: boolean): VideoWriteRow {
  const live = v.liveStreamingDetails;
  const broadcast = v.snippet.liveBroadcastContent;
  const liveStatus: LiveStatus | null = live ? (broadcast === 'none' ? 'ended' : broadcast) : null;
  const eventAt = live?.actualStartTime ?? live?.scheduledStartTime ?? v.snippet.publishedAt;
  const thumbs = v.snippet.thumbnails;
  const duration = parseDuration(v.contentDetails?.duration);
  // プレミア公開も liveStreamingDetails を持つ。公開前・公開中は動画がアップロード済みなので長さがあり、
  // 長さ 0 のライブ配信と区別できる。公開後は UULF に含まれるかどうかで判定する。
  // ライブ配信も、終わった直後は liveBroadcastContent が 'live' のまま長さ(終了 − 開始)が入ることがあるので、
  // 終了時刻(actualEndTime)が入ったものは長さでは判定しない
  const isPremiere = !!live && (inVideosTab || (broadcast !== 'none' && !!duration && !live.actualEndTime));

  return {
    listed_premiere: !!live && inVideosTab,
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
 * 取り込み済みの YouTube の動画が今も再生できるかを確認する(1 回の実行で 50 本、1 unit)。
 * 非公開・削除された動画は videos.list に返ってこないので、2 回続けて返ってこなければ再生できないものとして印を付け、
 * 再び返ってくるようになれば元に戻す。限定公開になったかどうかも残す。各動画を 1 日 1 回確認する
 */
async function checkAvailability(db: D1Database, yt: YouTubeClient, budget: RequestBudget) {
  // 対象の読み取り 1 回 + videos.list 1 回 + 書き込み 1 回
  if (budget.remaining < 3) return;
  const now = new Date();
  const targets = await findAvailabilityTargets(db, isoBefore(now, AVAILABILITY_REFRESH_MS), AVAILABILITY_CHECKS_PER_RUN);
  if (targets.length === 0) return;

  // 取得に失敗したとき(クォータ超過など)は例外になるので、返ってこなかったことにはならない
  const videos = await yt.getVideos(targets.map((t) => t.id));
  const found = new Map(videos.map((v) => [v.id, v]));
  const stamp = toIsoSeconds(now);
  const isUnlisted = (v: YtVideo) => v.status?.privacyStatus === 'unlisted';
  // 再び公開されたものは、配信の状態や長さも取り直す
  const restored = targets.flatMap((t) => (t.unavailable_at && found.has(t.id) ? [found.get(t.id)!] : []));
  await writeBatch(db, [
    ...upsertVideoStmts(db, restored.map((v) => toVideoRow(v, false, false)), stamp),
    ...availabilityStmts(
      db,
      {
        publicIds: videos.filter((v) => !isUnlisted(v)).map((v) => v.id),
        unlistedIds: videos.filter(isUnlisted).map((v) => v.id),
        missingIds: targets.filter((t) => !found.has(t.id)).map((t) => t.id),
      },
      stamp,
    ),
  ]);
}

/**
 * Twitch の同期。配信中のライブは全チャンネル分を 1 回で確認し、アーカイブは 1 回の実行で 1 チャンネルずつ確認する
 * (配信が終わったばかりのチャンネルを先に、あとは最後に確認してから時間がたった順)。
 * Twitch には待機所が無いので、配信予定は取り込まない
 */
async function syncTwitch(db: D1Database, budget: RequestBudget, env: SyncEnv, channels: ChannelRow[]) {
  const targets = channels.filter((c) => c.twitch_login);
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET || targets.length === 0) return;
  if (budget.remaining < TWITCH_REQUESTS) return;

  const tw = new TwitchClient(env.TWITCH_CLIENT_ID, env.TWITCH_CLIENT_SECRET, budget);
  const now = new Date();
  const stamp = toIsoSeconds(now);
  const state = await readTwitchState(db, isoBefore(now, TWITCH_CLIP_CHECK_REFRESH_MS), TWITCH_CLIP_CHECKS_PER_RUN);
  const stmts: (D1PreparedStatement | null)[] = [];

  if (state.token && Date.parse(state.token.expires_at) - now.getTime() > TWITCH_TOKEN_MARGIN_MS) {
    tw.setToken(state.token.access_token);
  } else {
    const token = await tw.fetchAppToken();
    stmts.push(saveTwitchTokenStmt(db, token.accessToken, isoBefore(now, -token.expiresInSec * 1000)));
  }

  try {
    // 配信中のライブ。一覧から消えた配信は、配信済みにする
    const byLogin = new Map(targets.map((c) => [c.twitch_login!.toLowerCase(), c]));
    const streams = await tw.getStreams([...byLogin.keys()]);
    const liveStreamIds = new Set(streams.map((s) => s.id));
    const liveEventIds = new Set(streams.map((s) => twitchEventId(s.id)));
    const ended = state.activeLives.filter((r) => !liveEventIds.has(r.id));
    stmts.push(
      ...upsertTwitchLiveStmts(
        db,
        streams.flatMap((s) => {
          const channel = byLogin.get(s.userLogin);
          return channel
            ? [{ streamId: s.id, channelId: channel.id, title: s.title, thumbnailUrl: s.thumbnailUrl, startedAt: toIsoSeconds(s.startedAt) }]
            : [];
        }),
        stamp,
      ),
      endTwitchLivesStmt(db, ended.map((r) => r.id), stamp),
    );

    // アーカイブ。配信が終わったばかりのチャンネルを先に確認し、長さとアーカイブの動画を早く反映する
    const justEnded = new Set(ended.map((r) => r.channel_id));
    const [channel] = [...targets].sort(
      (a, b) =>
        Number(justEnded.has(b.id)) - Number(justEnded.has(a.id)) ||
        (a.twitch_synced_at ?? '').localeCompare(b.twitch_synced_at ?? ''),
    );
    stmts.push(...(await twitchArchiveStmts(db, tw, channel, liveStreamIds, now)));

    // クリップ。取れなくても、配信とアーカイブの結果は保存する
    try {
      stmts.push(...(await twitchClipStmts(db, tw, targets, now)));
    } catch (err) {
      if (err instanceof TwitchApiError && err.status === 401) throw err;
      console.warn('twitch clips failed', err);
    }

    // 取り込み済みのクリップが今もあるかを確認し、削除されたものを一覧から外す
    if (state.clipIdsToCheck.length > 0) {
      try {
        const existing = await tw.getExistingClipIds(state.clipIdsToCheck);
        const missing = state.clipIdsToCheck.filter((id) => !existing.has(id));
        stmts.push(...twitchClipCheckStmts(db, [...existing], missing, stamp));
      } catch (err) {
        if (err instanceof TwitchApiError && err.status === 401) throw err;
        console.warn('twitch clip check failed', err);
      }
    }
  } catch (err) {
    // トークンが取り消されていたら消して、次の実行で取り直す
    if (err instanceof TwitchApiError && err.status === 401) await clearTwitchToken(db);
    throw err;
  } finally {
    // 途中で失敗しても、そこまでの結果(取り直したトークンや、配信中のライブ)は保存する
    await writeBatch(db, stmts);
  }
}

/**
 * クリップを 1 回の実行で 1 チャンネル・100 件ずつ確認して、書き込む文を返す。
 * 最近 1 週間のクリップ(1 時間ごと)を先に確認し、その必要が無いときは全期間のクリップ(再生数の多い順)を
 * 1 ページずつ読み進める。全期間は 1 週間ごとに読み直す
 */
async function twitchClipStmts(
  db: D1Database,
  tw: TwitchClient,
  targets: ChannelRow[],
  now: Date,
): Promise<D1PreparedStatement[]> {
  const stamp = toIsoSeconds(now);
  const ready = targets.filter((c) => c.twitch_user_id);

  const [recent] = ready
    .filter((c) => isDue(c.twitch_clips_synced_at, TWITCH_CLIPS_REFRESH_MS, now))
    .sort((a, b) => (a.twitch_clips_synced_at ?? '').localeCompare(b.twitch_clips_synced_at ?? ''));
  if (recent) {
    const startedAt = isoBefore(now, TWITCH_CLIPS_RECENT_MS);
    const { clips } = await tw.listClips(recent.twitch_user_id!, { startedAt });
    return [...clipStmts(db, recent.id, clips, stamp), markTwitchClipsSyncedStmt(db, recent.id, stamp)];
  }

  const backfill = ready.find(
    (c) => c.twitch_clips_cursor || isDue(c.twitch_clips_backfilled_at, TWITCH_CLIPS_BACKFILL_MS, now),
  );
  if (!backfill) return [];
  const after = backfill.twitch_clips_cursor ?? undefined;
  let page: Awaited<ReturnType<TwitchClient['listClips']>>;
  try {
    page = await tw.listClips(backfill.twitch_user_id!, { after });
  } catch (err) {
    // 続きの位置が使えなくなっていたら、そこで読み終わったことにする(次は 1 週間後に最初から読み直す)
    if (!(after && err instanceof TwitchApiError && err.status === 400)) throw err;
    page = { clips: [], cursor: null };
  }
  // 続きがあるのに 1 件も返らないときは、同じ位置で止まらないよう、読み終わったことにする
  const cursor = page.clips.length > 0 ? page.cursor : null;
  return [...clipStmts(db, backfill.id, page.clips, stamp), saveTwitchClipsBackfillStmt(db, backfill.id, cursor, stamp)];
}

const clipStmts = (db: D1Database, channelId: string, clips: TwClip[], stamp: string) =>
  upsertTwitchClipStmts(db, channelId, clips.map((c) => ({ ...c, createdAt: toIsoSeconds(c.createdAt) })), stamp);

/** 1 チャンネル分のアーカイブを確認して、書き込む文を返す。1 日 1 回はユーザー ID・フォロワー数も確認し、全アーカイブを見る */
async function twitchArchiveStmts(
  db: D1Database,
  tw: TwitchClient,
  channel: ChannelRow,
  liveStreamIds: Set<string>,
  now: Date,
): Promise<(D1PreparedStatement | null)[]> {
  const stamp = toIsoSeconds(now);
  const full = !channel.twitch_user_id || isDue(channel.twitch_profile_updated_at, TWITCH_PROFILE_REFRESH_MS, now);

  let userId = channel.twitch_user_id;
  let followerCount: number | null = null;
  if (full) {
    userId = await tw.getUserId(channel.twitch_login!);
    if (!userId) {
      console.warn(`twitch user not found: ${channel.twitch_login}`);
      return [markTwitchSyncedStmt(db, channel.id, null, stamp)];
    }
    try {
      followerCount = await tw.getFollowerCount(userId);
    } catch (err) {
      // フォロワー数が取れなくても、アーカイブの確認は続ける
      if (err instanceof RequestBudgetExceededError || (err instanceof TwitchApiError && err.status === 401)) throw err;
      console.warn(`twitch follower count failed for ${channel.twitch_login}`, err);
    }
  }

  const { archives, hasMore } = await tw.listArchives(userId!, full ? TWITCH_ARCHIVES_FULL : TWITCH_ARCHIVES_RECENT);
  const stmts: (D1PreparedStatement | null)[] = [];
  const rows: TwitchArchiveRow[] = [];
  for (const a of archives) {
    if (a.streamId && liveStreamIds.has(a.streamId)) {
      // 配信中のアーカイブは長さもサムネイルもまだ途中なので、動画 ID だけ結び付ける
      stmts.push(linkTwitchArchiveStmt(db, a.streamId, a.id));
      continue;
    }
    const startedMs = Date.parse(a.createdAt);
    rows.push({
      // 元の配信がわからないアーカイブは、動画 ID から行の ID を作る
      id: twitchEventId(a.streamId ?? `v${a.id}`),
      channelId: channel.id,
      videoId: a.id,
      title: a.title,
      thumbnailUrl: a.thumbnailUrl,
      durationSec: a.durationSec,
      startedAt: toIsoSeconds(a.createdAt),
      endedAt: a.durationSec ? toIsoSeconds(new Date(startedMs + a.durationSec * 1000)) : null,
    });
  }
  stmts.push(...upsertTwitchArchiveStmts(db, rows, stamp));
  // 全部見られたときだけ、一覧に無いアーカイブを「公開が終わった」とみなす
  if (full && !hasMore) stmts.push(clearExpiredTwitchArchivesStmt(db, channel.id, archives.map((a) => a.id), stamp));
  stmts.push(markTwitchSyncedStmt(db, channel.id, full ? { userId: userId!, followerCount } : null, stamp));
  return stmts;
}

/**
 * 配信のセトリを確認する。関連性順の上位コメントから、タイムスタンプを多く含むものをセトリとして保存する
 * (選び方は pickSetlistComment)。同じ書き手が返信で続きを書いていれば、つなげて保存する(mergeSetlistReplies)。
 * 歌枠は、配信終了の 15 分後・30 分後、1・6・24 時間後、3・7 日後に確認し(SETLIST_CHECK_HOURS)、見つかったあとも 7 日後までは
 * 確認し直して、より良いコメントがあれば差し替える。7 日を過ぎたら確認をやめる(見つかっていなければあきらめる)。
 * タイトルに「歌枠」が無い配信は、終了から 7 日以内のものだけを、回数を減らして確認し(SETLIST_CHECK_HOURS_OTHER)、
 * セトリらしい書き方で曲として読めるコメントだけを保存する(pickMarkedSetlistComment)
 */
async function checkSetlists(db: D1Database, yt: YouTubeClient, budget: RequestBudget) {
  // 対象の読み取り 1 回 + 書き込み 1 回 + 1 本以上の確認が入らなければ、次回に回す
  if (budget.remaining < 4) return;
  const now = new Date();
  const hoursAgo = (hours: number) => isoBefore(now, hours * 3600_000);
  const targets = await findSetlistTargets(db, {
    now: toIsoSeconds(now),
    notBefore: hoursAgo(SETLIST_CHECK_HOURS[0]),
    otherNotBefore: hoursAgo(SETLIST_CHECK_HOURS_OTHER[0]),
    recentSince: hoursAgo(SETLIST_CHECK_HOURS_OTHER[SETLIST_CHECK_HOURS_OTHER.length - 1]),
    limit: SETLIST_CHECKS_PER_RUN,
  });

  const stmts: D1PreparedStatement[] = [];
  for (const target of targets) {
    if (budget.remaining <= 1) break; // 最後の書き込みの分を残す
    const checkHours = target.is_utawaku ? SETLIST_CHECK_HOURS : SETLIST_CHECK_HOURS_OTHER;
    let comments: YtComment[] | null;
    let found: YtComment | null = null;
    try {
      comments = await yt.getTopComments(target.id, SETLIST_COMMENTS);
      if (comments && target.is_utawaku) {
        const picked = pickSetlistComment(comments, target.channel_id);
        // 曲として読めると確かめられなかった候補では、すでに保存してあるセトリを置き換えない
        // (時刻つきの感想が上位に並んだだけで、前に取れた正しいセトリが消えないように)
        found = picked && (picked.verified || !target.has_setlist) ? picked.comment : null;
      } else if (comments) {
        // 歌枠でない配信は、雑談の目次やゲームの章立てを取らないよう、セトリらしい書き方のものだけ
        found = pickMarkedSetlistComment(comments, target.channel_id);
      }
      if (found && found.replyCount > 0) {
        // セトリが返信に分けて続けられていれば、つなげる
        if (budget.remaining <= 1) break; // 最後の書き込みの分を残す(この歌枠は次回に確認する)
        try {
          const replies = await yt.getReplies(found.id, SETLIST_REPLIES);
          found = { ...found, text: mergeSetlistReplies(found, replies) };
        } catch (err) {
          // 返信を読めなかった(大きすぎる、そのコメントの返信だけが取れない)ときは、最初のコメントだけで考える
          if (!isReplySpecificError(err)) throw err;
          console.warn(`setlist replies unreadable for ${target.id}`, err);
          if (!replacesSavedWithoutReplies(target, found)) found = null;
        }
      }
    } catch (err) {
      console.warn(`setlist check failed for ${target.id}`, err);
      // 予算切れ・クォータ超過・YouTube 側の一時的な不調など、ほかの動画でも同じように失敗するときは、
      // ここまでの結果だけ保存する
      if (!isVideoSpecificError(err)) break;
      // この動画だけの失敗(非公開になったなど)は、次の確認日時まで後回しにして先へ進む
      // (何も書かないと、毎回この動画で止まり、これより古い歌枠が確認されなくなる)
      stmts.push(
        saveSetlistStmt(db, {
          videoId: target.id,
          comment: null,
          checkedAt: toIsoSeconds(now),
          nextCheckAt: nextSetlistCheck(target.ended_at, now, checkHours),
        }),
      );
      continue;
    }
    stmts.push(
      saveSetlistStmt(db, {
        videoId: target.id,
        comment: found,
        checkedAt: toIsoSeconds(now),
        // コメントが無効な配信は、もう確認しない
        nextCheckAt: comments === null ? null : nextSetlistCheck(target.ended_at, now, checkHours),
      }),
    );
  }
  await writeBatch(db, stmts);
}

/**
 * 朝活の配信(タイトルに「朝活」があるもの)のコメントを確認し、ボイスや今日の質問のタイムスタンプを含むもの
 * (hasMorningStamp)を保存する。配信終了から MORNING_CHECK_HOURS の時刻に確認し、コメントを全部見られたときは
 * 今回選んだものに入れ替える(見られなかったときは書き足すだけにする。saveMorningCheckStmts)。
 * まだ一度も確認していない過去の配信は、新しいものから順に 1 回ずつ確認する
 */
async function checkMorningComments(db: D1Database, yt: YouTubeClient, budget: RequestBudget) {
  // 対象の読み取り 1 回 + 書き込み 1 回 + 1 本以上の確認が入らなければ、次回に回す
  if (budget.remaining < 3) return;
  const now = new Date();
  const targets = await findMorningTargets(db, {
    now: toIsoSeconds(now),
    firstBefore: isoBefore(now, MORNING_CHECK_HOURS[0] * 3600_000),
    limit: MORNING_CHECKS_PER_RUN,
  });

  const stmts: D1PreparedStatement[] = [];
  for (const target of targets) {
    if (budget.remaining <= 1) break; // 最後の書き込みの分を残す
    const checkedAt = toIsoSeconds(now);
    let comments: YtComment[] | null;
    try {
      comments = await yt.getTopComments(target.id, MORNING_COMMENTS);
    } catch (err) {
      console.warn(`morning comments check failed for ${target.id}`, err);
      // ほかの動画でも同じように失敗するときは、ここまでの結果だけ保存する
      if (!isVideoSpecificError(err)) break;
      // この動画だけの失敗は、保存済みのものを残して、次の確認日時まで後回しにする
      stmts.push(
        ...saveMorningCheckStmts(db, {
          videoId: target.id,
          comments: null,
          complete: false,
          checkedAt,
          nextCheckAt: nextSetlistCheck(target.ended_at, now, MORNING_CHECK_HOURS),
        }),
      );
      continue;
    }
    const picked = comments?.filter((c) => hasMorningStamp(c.text));
    stmts.push(
      ...saveMorningCheckStmts(db, {
        videoId: target.id,
        // コメントが無効・動画が見つからない(null)ときは、保存済みのものを残す(一時的に非公開になっただけかもしれない)。
        // 確認は予定どおり続ける(回数が決まっているので、続けてもクォータはほとんど増えない)
        comments: picked ? picked.slice(0, MORNING_MAX_PER_VIDEO) : null,
        complete: comments !== null && comments.length < MORNING_COMMENTS && picked!.length <= MORNING_MAX_PER_VIDEO,
        checkedAt,
        nextCheckAt: nextSetlistCheck(target.ended_at, now, MORNING_CHECK_HOURS),
      }),
    );
  }
  await writeBatch(db, stmts);
}

/**
 * 返信の取得の失敗が、そのコメントの返信だけのものか(応答が大きすぎる、返信が取れない 4xx)。
 * コメントの一覧は直前に取れているので、クォータ超過・回数制限・サーバー側のエラー以外は、ほかの歌枠には関係しない。
 * 何も書かずに止めると、その歌枠が毎回先頭に来て、同じところで止まり続ける
 */
function isReplySpecificError(err: unknown) {
  if (err instanceof ResponseTooLargeError) return true;
  if (!(err instanceof YouTubeApiError) || err.status < 400 || err.status >= 500 || err.status === 429) return false;
  return !/quotaExceeded|rateLimitExceeded|dailyLimitExceeded/i.test(err.message);
}

/**
 * 返信を読めなかったときに、最初のコメントだけで保存してよいか。
 * - まだ何も保存されていなければ、保存する(何も無いよりよい。次の確認で返信が読めれば、つなげたものに置き換わる)
 * - 保存済みと同じコメントなら、保存しない(保存済みは返信をつなげたものかもしれず、最初のコメントだけに縮めてしまう。
 *   誰でも長い返信を書けるので、それだけで保存済みのセトリを短くされないように)
 * - 保存済みと違うコメントなら、保存済みより長いときだけ保存する(保存済みが、確かめられずに保存された感想などの
 *   こともあるので、いつまでも残さない。短いもので置き換えて、つなげたセトリを縮めることもしない)
 */
function replacesSavedWithoutReplies(
  target: { has_setlist: number; saved_comment_id: string | null; saved_chars: number | null },
  comment: { id: string; text: string },
): boolean {
  if (!target.has_setlist) return true;
  if (target.saved_comment_id === comment.id) return false;
  // saved_chars は SQLite の length(コードポイントの数)なので、同じ数え方で比べる
  return Array.from(comment.text).length > (target.saved_chars ?? 0);
}

/**
 * YouTube が、その動画についてだけ返す失敗か。403 のうち理由が forbidden のもの(非公開の動画のコメントなど)だけを
 * そう扱う。クォータ超過や API キーの問題も 403 で返るが、それらはほかの動画でも同じように失敗する
 */
function isVideoSpecificError(err: unknown) {
  // 応答が大きすぎる歌枠(長いコメントを何件も書かれたもの)も、その歌枠だけの失敗として後回しにする
  if (err instanceof ResponseTooLargeError) return true;
  return err instanceof YouTubeApiError && err.status === 403 && /"reason":\s*"forbidden"/.test(err.message);
}

/** 次にセトリ(または朝活のコメント)を確認する日時。checkHours の最後の時刻を過ぎていれば null(確認をやめる) */
function nextSetlistCheck(endedAt: string, now: Date, checkHours: number[]): string | null {
  const ended = Date.parse(endedAt);
  const next = checkHours.map((h) => ended + h * 3600_000).find((t) => t > now.getTime());
  return next === undefined ? null : toIsoSeconds(new Date(next));
}

/**
 * セトリから曲(曲名・アーティスト)を読み取って保存する。表示と同じ読み取り(parseSetlist)を使うので、
 * 検索に当たるのは画面に出るセトリと同じ内容になる(読み取り 1 回 + 書き込み 1 回)
 */
async function parseSetlistSongs(db: D1Database, budget: RequestBudget) {
  if (budget.remaining < 2) return;
  const rows = await findSetlistsToParse(db, SETLIST_PARSER_VERSION, SETLIST_PARSES_PER_RUN, SETLIST_MAX_CHARS);
  await writeBatch(
    db,
    rows.map((row) => {
      let songs: { title: string; artist: string | null }[] = [];
      try {
        songs = parseSetlist(row.text).map(({ title, artist }) => ({ title, artist }));
      } catch (err) {
        // 読み取れないセトリが 1 本あっても、同じ行で毎回止まらないよう、曲なしで保存して先へ進む
        console.error(`parseSetlist failed for ${row.video_id}`, err);
      }
      return saveSetlistSongsStmt(db, row.video_id, songs, SETLIST_PARSER_VERSION);
    }),
  );
}

/** 取得・確認してからまだ点検していないセトリを、表示と同じ読み取りで点検する(読み取り 1 回 + 書き込み 1 回) */
async function auditSetlists(db: D1Database, budget: RequestBudget) {
  if (budget.remaining < 2) return;
  const rows = await findSetlistsToAudit(db, SETLIST_AUDITS_PER_RUN);
  const now = toIsoSeconds(new Date());
  const stmts = rows.flatMap((row) => {
    let problems: SetlistProblem[];
    try {
      // タイトルに「歌枠」が無い配信は、歌っていないことの方が多いので、見つからなかったことは問題にしない
      // (問題なしとして点検済みにする。点検しないままにすると、毎回の点検で読み直すことになる)
      problems = row.text === null && !row.is_utawaku ? [] : auditSetlist(row.text, row.duration_sec);
    } catch (err) {
      // 点検できないセトリが 1 本あっても、同じ行で毎回止まらないよう、問題として残して先へ進む
      console.error(`auditSetlist failed for ${row.video_id}`, err);
      problems = [{ kind: 'error', message: '読み取りの途中でエラーになった', songs: [] }];
    }
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
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  if (jst.getUTCHours() < SETLIST_AUDIT_NOTIFY_HOUR_JST || budget.remaining < 3) return;
  // JST の今日の 0 時(UTC で表す)
  const todayStart = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - JST_OFFSET_MS);
  const rows = await findSetlistAuditsToNotify(db, toIsoSeconds(todayStart), SETLIST_AUDITS_PER_ISSUE);
  if (rows.length === 0) return;
  // 本文の長さの上限に収まらなかった分は、印を付けずに次の日に回す
  const { issue, videoIds } = buildSetlistAuditIssue(rows, now);
  const url = await createIssue(budget, token, repo, issue);
  console.log(`setlist audit issue created: ${url}`);
  await writeBatch(db, markSetlistAuditsNotifiedStmts(db, videoIds, toIsoSeconds(now)));
}

/**
 * 再生リストの同期。一覧はチャンネルごとに 1 日 1 回取り直し、本数が変わった(または新しい)再生リストだけ
 * 中身を最初から読み直す。中身はページ単位で次回の実行に持ち越せる
 */
async function syncPlaylists(db: D1Database, yt: YouTubeClient, budget: RequestBudget, channels: ChannelRow[]) {
  const now = new Date();
  const stamp = toIsoSeconds(now);

  // 一覧の取り直し: 1 回の実行で 1 チャンネルまで(YouTube 1 回 + D1 2 回)
  const due = channels.find((c) => isDue(c.playlists_synced_at, PLAYLISTS_REFRESH_MS, now));
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
