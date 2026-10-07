import type { CalendarEvent, Channel, LiveStatus, VideoType } from '../shared/types';

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
  return { id: row.id, title: row.title, iconUrl: row.icon_url, color: row.color };
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

export async function updateChannelProfile(db: D1Database, id: string, title: string, iconUrl: string | null) {
  await db.prepare('UPDATE channels SET title = ?, icon_url = ? WHERE id = ?').bind(title, iconUrl, id).run();
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
    `INSERT INTO videos (id, channel_id, type, live_status, title, thumbnail_url, duration_sec,
                         event_at, ended_at, published_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        r.id, r.channel_id, r.type, r.live_status, r.title, r.thumbnail_url, r.duration_sec,
        r.event_at, r.ended_at, r.published_at, now,
      ),
    ),
  );
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
