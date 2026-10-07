import { normalizeForSearch } from '../shared/search';
import type { CalendarEvent, Channel, LiveStatus, SearchPage, VideoType } from '../shared/types';

export type BackfillStage = 'uploads' | 'shorts' | 'done';

export interface ChannelRow {
  id: string;
  title: string;
  icon_url: string | null;
  color: string;
  enabled: number;
  sort_order: number;
  backfill_stage: BackfillStage;
  backfill_page_token: string | null;
  backfilled_at: string | null;
  description: string | null;
  custom_url: string | null;
  banner_url: string | null;
  subscriber_count: number | null;
  video_count: number | null;
  profile_updated_at: string | null;
  premieres_page_token: string | null;
  premieres_scanned_at: string | null;
  members_page_token: string | null;
  members_scanned_at: string | null;
  synced_at: string | null;
}

export interface VideoRow {
  id: string;
  channel_id: string;
  type: VideoType;
  live_status: LiveStatus | null;
  title: string;
  thumbnail_url: string | null;
  duration_sec: number | null;
  event_at: string;
  ended_at: string | null;
  published_at: string;
}

/** DB から読み出した行。members_only は markMembersOnly でだけ立てるので、書き込み用の VideoRow には含めない */
interface StoredVideoRow extends VideoRow {
  members_only: number;
}

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

export function toChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    title: row.title,
    iconUrl: row.icon_url,
    color: row.color,
    description: row.description,
    customUrl: row.custom_url,
    bannerUrl: row.banner_url,
    subscriberCount: row.subscriber_count,
    videoCount: row.video_count,
  };
}

function toEvent(row: StoredVideoRow): CalendarEvent {
  // プレミア公開は type = 'video' のまま live_status で状態を追跡している。画面には通常の動画として返す
  const isLive = row.type === 'live';
  return {
    id: row.id,
    channelId: row.channel_id,
    type: row.type,
    liveStatus: isLive ? row.live_status : null,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    durationSec: row.duration_sec,
    eventAt: row.event_at,
    endedAt: isLive ? row.ended_at : null,
    publishedAt: row.published_at,
    membersOnly: row.members_only === 1,
  };
}

export async function listEnabledChannels(db: D1Database): Promise<ChannelRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM channels WHERE enabled = 1 ORDER BY sort_order, id')
    .all<ChannelRow>();
  return results;
}

export interface ChannelProfile {
  title: string;
  iconUrl: string | null;
  description: string | null;
  customUrl: string | null;
  bannerUrl: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
}

export async function updateChannelProfile(db: D1Database, id: string, p: ChannelProfile, now: string) {
  await db
    .prepare(
      `UPDATE channels
          SET title = ?, icon_url = ?, description = ?, custom_url = ?, banner_url = ?,
              subscriber_count = ?, video_count = ?, profile_updated_at = ?
        WHERE id = ?`,
    )
    .bind(p.title, p.iconUrl, p.description, p.customUrl, p.bannerUrl, p.subscriberCount, p.videoCount, now, id)
    .run();
}

export async function saveBackfillProgress(
  db: D1Database,
  id: string,
  stage: BackfillStage,
  pageToken: string | null,
  now: string,
) {
  await db
    .prepare(
      `UPDATE channels
          SET backfill_stage = ?, backfill_page_token = ?, synced_at = ?,
              backfilled_at = CASE WHEN ? = 'done' THEN ? ELSE backfilled_at END
        WHERE id = ?`,
    )
    .bind(stage, pageToken, now, stage, now, id)
    .run();
}

export async function savePremieresScanProgress(db: D1Database, id: string, pageToken: string | null, now: string) {
  await db
    .prepare(
      `UPDATE channels
          SET premieres_page_token = ?,
              premieres_scanned_at = CASE WHEN ? IS NULL THEN ? ELSE premieres_scanned_at END
        WHERE id = ?`,
    )
    .bind(pageToken, pageToken, now, id)
    .run();
}

export async function saveMembersScanProgress(db: D1Database, id: string, pageToken: string | null, now: string) {
  await db
    .prepare(
      `UPDATE channels
          SET members_page_token = ?,
              members_scanned_at = CASE WHEN ? IS NULL THEN ? ELSE members_scanned_at END
        WHERE id = ?`,
    )
    .bind(pageToken, pageToken, now, id)
    .run();
}

export async function markChannelSynced(db: D1Database, id: string, now: string) {
  await db.prepare('UPDATE channels SET synced_at = ? WHERE id = ?').bind(now, id).run();
}

export async function findExistingVideoIds(db: D1Database, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { results } = await db
    .prepare(`SELECT id FROM videos WHERE id IN (${placeholders(ids.length)})`)
    .bind(...ids)
    .all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}

/** 状態が変わりうるライブ(予定・配信中)の ID */
export async function findActiveLiveIds(db: D1Database, channelId: string): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT id FROM videos WHERE channel_id = ? AND live_status IN ('upcoming', 'live')`)
    .bind(channelId)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

export async function upsertVideos(db: D1Database, rows: VideoRow[], now: string) {
  if (rows.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO videos (id, channel_id, type, live_status, title, search_title, thumbnail_url, duration_sec,
                         event_at, ended_at, published_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       -- UUSH で判定済みのショートは、通常の再取得で 'video' に戻さない。
       -- プレミア公開(type = 'video' かつ live_status あり)も、公開後の再取得で 'live' に戻さない
       type          = CASE
                         WHEN videos.type = 'short' AND excluded.type = 'video' THEN 'short'
                         WHEN videos.type = 'video' AND videos.live_status IS NOT NULL AND excluded.type = 'live' THEN 'video'
                         ELSE excluded.type
                       END,
       live_status   = excluded.live_status,
       title         = excluded.title,
       search_title  = excluded.search_title,
       thumbnail_url = excluded.thumbnail_url,
       duration_sec  = excluded.duration_sec,
       event_at      = excluded.event_at,
       ended_at      = excluded.ended_at,
       published_at  = excluded.published_at,
       updated_at    = excluded.updated_at`,
  );
  await db.batch(
    rows.map((r) =>
      stmt.bind(
        r.id, r.channel_id, r.type, r.live_status, r.title, normalizeForSearch(r.title), r.thumbnail_url,
        r.duration_sec, r.event_at, r.ended_at, r.published_at, now,
      ),
    ),
  );
}

/** search_title が空の行(列を追加する前に登録したもの)を埋める。1 回あたり limit 件まで */
export async function fillSearchTitles(db: D1Database, limit: number): Promise<number> {
  const { results } = await db
    .prepare('SELECT id, title FROM videos WHERE search_title IS NULL LIMIT ?')
    .bind(limit)
    .all<{ id: string; title: string }>();
  if (results.length === 0) return 0;
  // { id: 正規化したタイトル } を JSON で渡し、1 つの UPDATE 文でまとめて書き込む
  const values = JSON.stringify(Object.fromEntries(results.map((r) => [r.id, normalizeForSearch(r.title)])));
  await db
    .prepare(
      `UPDATE videos SET search_title = (SELECT value FROM json_each(?1) WHERE key = videos.id)
        WHERE id IN (SELECT key FROM json_each(?1))`,
    )
    .bind(values)
    .run();
  return results.length;
}

export async function markShorts(db: D1Database, ids: string[]) {
  if (ids.length === 0) return;
  await db
    .prepare(`UPDATE videos SET type = 'short' WHERE type = 'video' AND id IN (${placeholders(ids.length)})`)
    .bind(...ids)
    .run();
}

/** UULF に含まれるライブ扱いの動画はプレミア公開なので、動画に分類し直す */
export async function markPremieres(db: D1Database, ids: string[]) {
  if (ids.length === 0) return;
  await db
    .prepare(`UPDATE videos SET type = 'video' WHERE type = 'live' AND id IN (${placeholders(ids.length)})`)
    .bind(...ids)
    .run();
}

export async function markMembersOnly(db: D1Database, ids: string[]) {
  if (ids.length === 0) return;
  await db
    .prepare(`UPDATE videos SET members_only = 1 WHERE members_only = 0 AND id IN (${placeholders(ids.length)})`)
    .bind(...ids)
    .run();
}

export async function deleteVideos(db: D1Database, ids: string[]) {
  if (ids.length === 0) return;
  await db.prepare(`DELETE FROM videos WHERE id IN (${placeholders(ids.length)})`).bind(...ids).run();
}

export interface EventQuery {
  from: string;
  to: string;
  channelIds: string[];
  types: VideoType[];
}

export async function queryEvents(db: D1Database, q: EventQuery): Promise<CalendarEvent[]> {
  const where = ['event_at >= ?', 'event_at < ?'];
  const params: string[] = [q.from, q.to];
  if (q.channelIds.length > 0) {
    where.push(`channel_id IN (${placeholders(q.channelIds.length)})`);
    params.push(...q.channelIds);
  }
  if (q.types.length > 0) {
    where.push(`type IN (${placeholders(q.types.length)})`);
    params.push(...q.types);
  }
  const { results } = await db
    .prepare(`SELECT * FROM videos WHERE ${where.join(' AND ')} ORDER BY event_at LIMIT 2000`)
    .bind(...params)
    .all<StoredVideoRow>();
  return results.map(toEvent);
}

export interface SearchQuery {
  terms: string[];
  channelIds: string[];
  types: VideoType[];
  /** 前のページの nextCursor。最初のページなら null */
  cursor: string | null;
  limit: number;
}

// ページの区切り。event_at は固定長の ISO 8601、動画 ID に ~ は含まれない
const encodeCursor = (row: VideoRow) => `${row.event_at}~${row.id}`;
function decodeCursor(cursor: string): { eventAt: string; id: string } | null {
  const at = cursor.indexOf('~');
  return at > 0 ? { eventAt: cursor.slice(0, at), id: cursor.slice(at + 1) } : null;
}

/**
 * タイトルに全てのキーワード(splitSearchTerms で正規化済み)を含むものを、新しい順に 1 ページ分返す。
 * 最初のページでは、種別ごとの件数(種別の絞り込み前)も数える
 */
export async function searchEvents(db: D1Database, q: SearchQuery): Promise<SearchPage> {
  // 入力した % と _ はワイルドカードではなく文字として扱う(エスケープ文字は !)
  const escapeLike = (s: string) => s.replace(/[!%_]/g, (c) => `!${c}`);
  // search_title がまだ空の行は、元のタイトルで探す
  const match = q.terms.map(() => `COALESCE(search_title, title) LIKE '%' || ? || '%' ESCAPE '!'`);
  const matchParams: string[] = q.terms.map(escapeLike);
  if (q.channelIds.length > 0) {
    match.push(`channel_id IN (${placeholders(q.channelIds.length)})`);
    matchParams.push(...q.channelIds);
  }

  const where = [...match];
  const params: (string | number)[] = [...matchParams];
  if (q.types.length > 0) {
    where.push(`type IN (${placeholders(q.types.length)})`);
    params.push(...q.types);
  }
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  if (cursor) {
    where.push('(event_at < ? OR (event_at = ? AND id < ?))');
    params.push(cursor.eventAt, cursor.eventAt, cursor.id);
  }

  const pageStmt = db
    .prepare(`SELECT * FROM videos WHERE ${where.join(' AND ')} ORDER BY event_at DESC, id DESC LIMIT ?`)
    .bind(...params, q.limit + 1);
  const countStmt = db
    .prepare(`SELECT type, COUNT(*) AS n FROM videos WHERE ${match.join(' AND ')} GROUP BY type`)
    .bind(...matchParams);

  const [page, countRows] = await Promise.all([
    pageStmt.all<StoredVideoRow>(),
    q.cursor ? null : countStmt.all<{ type: VideoType; n: number }>(),
  ]);

  const rows = page.results.slice(0, q.limit);
  const hasMore = page.results.length > q.limit;
  let counts: Record<VideoType, number> | undefined;
  if (countRows) {
    counts = { live: 0, video: 0, short: 0 };
    for (const { type, n } of countRows.results) counts[type] = n;
  }
  return { events: rows.map(toEvent), nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]) : null, counts };
}
