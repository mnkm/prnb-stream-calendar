import type { LiveStatus } from '../shared/types';
import {
  type ChannelRow,
  type VideoRow,
  deleteVideos,
  findActiveLiveIds,
  findExistingVideoIds,
  listEnabledChannels,
  markChannelSynced,
  markPremieres,
  markShorts,
  saveBackfillProgress,
  savePremieresScanProgress,
  updateChannelProfile,
  upsertVideos,
} from './db';
import { toIsoSeconds } from './time';
import {
  SHORTS_MAX_DURATION_SEC,
  type YtVideo,
  YouTubeClient,
  fetchRssVideoIds,
  isShortByUrl,
  parseDuration,
  shortsPlaylistId,
  uploadsPlaylistId,
  videosPlaylistId,
} from './youtube';

/**
 * 1 回の実行で過去分を取得するページ数(1 ページ = 50 件)。
 * Workers の 1 回あたりのサブリクエスト上限に収まるよう、残りは次回の Cron に持ち越す。
 */
const BACKFILL_PAGES_PER_RUN = 8;

export interface SyncEnv {
  DB: D1Database;
  YOUTUBE_API_KEY: string;
}

export interface ChannelSyncResult {
  channelId: string;
  mode: 'backfill' | 'incremental';
  upserted: number;
  removed: number;
  backfillStage?: string;
  error?: string;
}

export async function syncAll(env: SyncEnv): Promise<ChannelSyncResult[]> {
  const yt = new YouTubeClient(env.YOUTUBE_API_KEY);
  const channels = await listEnabledChannels(env.DB);
  const results: ChannelSyncResult[] = [];

  for (const channel of channels) {
    const mode = channel.backfill_stage === 'done' ? 'incremental' : 'backfill';
    try {
      await ensureChannelProfile(env.DB, yt, channel);
      results.push(
        mode === 'backfill' ? await backfillStep(env.DB, yt, channel) : await incrementalSync(env.DB, yt, channel),
      );
    } catch (err) {
      console.error(`sync failed for ${channel.id}`, err);
      results.push({ channelId: channel.id, mode, upserted: 0, removed: 0, error: String(err) });
    }
  }
  return results;
}

async function ensureChannelProfile(db: D1Database, yt: YouTubeClient, channel: ChannelRow) {
  if (channel.title && channel.icon_url) return;
  const info = await yt.getChannel(channel.id);
  if (!info) throw new Error(`channel not found: ${channel.id}`);
  const icon = info.snippet.thumbnails.medium?.url ?? info.snippet.thumbnails.default?.url ?? null;
  await updateChannelProfile(db, channel.id, info.snippet.title, icon);
}

/** 過去分の取得。uploads を全件 → UUSH でショートを判定、の順に数回の Cron に分けて進める */
async function backfillStep(db: D1Database, yt: YouTubeClient, channel: ChannelRow): Promise<ChannelSyncResult> {
  let stage = channel.backfill_stage;
  let pageToken = channel.backfill_page_token ?? undefined;
  let upserted = 0;

  for (let i = 0; i < BACKFILL_PAGES_PER_RUN && stage !== 'done'; i++) {
    if (stage === 'uploads') {
      const page = await yt.listPlaylistPage(uploadsPlaylistId(channel.id), pageToken);
      if (page) {
        const rows = (await yt.getVideos(page.ids)).map((v) => toVideoRow(v, false, false));
        await upsertVideos(db, rows, nowIso());
        upserted += rows.length;
      }
      pageToken = page?.nextPageToken;
      if (!pageToken) stage = 'shorts';
    } else {
      const page = await yt.listPlaylistPage(shortsPlaylistId(channel.id), pageToken);
      if (page) await markShorts(db, page.ids);
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
    latestIds = await fetchRssVideoIds(channel.id);
  } catch (err) {
    console.warn(`RSS unavailable for ${channel.id}, falling back to playlistItems`, err);
    latestIds = (await yt.listPlaylistPage(uploadsPlaylistId(channel.id)))?.ids ?? [];
  }

  const known = await findExistingVideoIds(db, latestIds);
  const newIds = latestIds.filter((id) => !known.has(id));
  const activeLiveIds = await findActiveLiveIds(db, channel.id);
  const targetIds = [...new Set([...newIds, ...activeLiveIds])];

  const shortsPage = await yt.listPlaylistPage(shortsPlaylistId(channel.id));
  const shortIds = new Set(shortsPage?.ids ?? []);
  const videosPage = await yt.listPlaylistPage(videosPlaylistId(channel.id));
  const premiereIds = new Set(videosPage?.ids ?? []);
  const videos = targetIds.length > 0 ? await yt.getVideos(targetIds) : [];

  if (!shortsPage) {
    for (const v of videos) {
      const duration = parseDuration(v.contentDetails?.duration);
      const maybeShort = !v.liveStreamingDetails && duration !== null && duration <= SHORTS_MAX_DURATION_SEC;
      if (maybeShort && (await isShortByUrl(v.id))) shortIds.add(v.id);
    }
  }

  const now = nowIso();
  await upsertVideos(db, videos.map((v) => toVideoRow(v, shortIds.has(v.id), premiereIds.has(v.id))), now);
  // UUSH / UULF への反映が遅れて誤った種別で登録されたものを後から補正する
  if (shortsPage) await markShorts(db, shortsPage.ids);
  if (videosPage) await markPremieres(db, videosPage.ids);
  if (!channel.premieres_scanned_at) await scanPremieres(db, yt, channel);

  // 予定枠が削除・非公開化された場合は videos.list に返ってこないので、カレンダーからも消す
  const returned = new Set(videos.map((v) => v.id));
  const removedIds = activeLiveIds.filter((id) => !returned.has(id));
  await deleteVideos(db, removedIds);

  await markChannelSynced(db, channel.id, now);
  return { channelId: channel.id, mode: 'incremental', upserted: videos.length, removed: removedIds.length };
}

/**
 * 過去分の取り込み後に 1 回だけ、UULF を最後まで見てプレミア公開を動画に分類し直す。
 * ページ数が多い場合は次回の Cron に持ち越す
 */
async function scanPremieres(db: D1Database, yt: YouTubeClient, channel: ChannelRow) {
  let pageToken = channel.premieres_page_token ?? undefined;
  for (let i = 0; i < BACKFILL_PAGES_PER_RUN; i++) {
    const page = await yt.listPlaylistPage(videosPlaylistId(channel.id), pageToken);
    if (page) await markPremieres(db, page.ids);
    pageToken = page?.nextPageToken;
    if (!pageToken) break;
  }
  await savePremieresScanProgress(db, channel.id, pageToken ?? null, nowIso());
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
