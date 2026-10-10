import { normalizeForSearch } from '../shared/search';
import { isRecommendedPlaylist } from '../shared/playlist';
import type {
  CalendarEvent,
  Clip,
  ClipPage,
  ClipSort,
  Channel,
  LiveStatus,
  Platform,
  Playlist,
  PlaylistDetail,
  SearchPage,
  Setlist,
  VideoType,
} from '../shared/types';

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
  label: string | null;
  profile_updated_at: string | null;
  playlists_synced_at: string | null;
  premieres_page_token: string | null;
  premieres_scanned_at: string | null;
  members_page_token: string | null;
  members_scanned_at: string | null;
  synced_at: string | null;
  twitch_login: string | null;
  twitch_user_id: string | null;
  twitch_follower_count: number | null;
  twitch_profile_updated_at: string | null;
  twitch_synced_at: string | null;
  twitch_clips_synced_at: string | null;
  twitch_clips_cursor: string | null;
  twitch_clips_backfilled_at: string | null;
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
  platform: Platform;
  twitch_video_id: string | null;
}

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

export function toChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    title: row.title,
    label: row.label,
    iconUrl: row.icon_url,
    color: row.color,
    description: row.description,
    customUrl: row.custom_url,
    bannerUrl: row.banner_url,
    subscriberCount: row.subscriber_count,
    videoCount: row.video_count,
    twitchLogin: row.twitch_login,
    twitchFollowerCount: row.twitch_follower_count,
  };
}

function toEvent(row: StoredVideoRow): CalendarEvent {
  // プレミア公開は type = 'video' のまま live_status で状態を追跡している。画面には通常の動画として返す
  const isLive = row.type === 'live';
  return {
    id: row.id,
    channelId: row.channel_id,
    platform: row.platform,
    twitchVideoId: row.twitch_video_id,
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

/**
 * 書き込みをまとめて 1 回の batch() で行う(null は飛ばす)。
 * Workers 無料プランでは D1 の呼び出し回数も 1 回の実行あたりの上限に数えられるため、書き込みはできるだけまとめる
 */
export async function writeBatch(db: D1Database, stmts: (D1PreparedStatement | null)[]) {
  const list = stmts.filter((s): s is D1PreparedStatement => s !== null);
  if (list.length > 0) await db.batch(list);
}

export function markChannelSyncedStmt(db: D1Database, id: string, now: string) {
  return db.prepare('UPDATE channels SET synced_at = ? WHERE id = ?').bind(now, id);
}

export async function findExistingVideoIds(db: D1Database, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { results } = await db
    .prepare(`SELECT id FROM videos WHERE id IN (${placeholders(ids.length)})`)
    .bind(...ids)
    .all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}

/** 状態が変わりうる YouTube のライブ(予定・配信中)の ID。Twitch の配信は videos.list に返ってこないので含めない */
export async function findActiveLiveIds(db: D1Database, channelId: string): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT id FROM videos WHERE channel_id = ? AND platform = 'youtube' AND live_status IN ('upcoming', 'live')`)
    .bind(channelId)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

export function upsertVideoStmts(db: D1Database, rows: VideoRow[], now: string): D1PreparedStatement[] {
  if (rows.length === 0) return [];
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
  return rows.map((r) =>
    stmt.bind(
      r.id, r.channel_id, r.type, r.live_status, r.title, normalizeForSearch(r.title), r.thumbnail_url,
      r.duration_sec, r.event_at, r.ended_at, r.published_at, now,
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

export function markShortsStmt(db: D1Database, ids: string[]) {
  if (ids.length === 0) return null;
  return db
    .prepare(`UPDATE videos SET type = 'short' WHERE type = 'video' AND id IN (${placeholders(ids.length)})`)
    .bind(...ids);
}

/** UULF に含まれるライブ扱いの動画はプレミア公開なので、動画に分類し直す */
export function markPremieresStmt(db: D1Database, ids: string[]) {
  if (ids.length === 0) return null;
  return db
    .prepare(`UPDATE videos SET type = 'video' WHERE type = 'live' AND id IN (${placeholders(ids.length)})`)
    .bind(...ids);
}

export function markMembersOnlyStmt(db: D1Database, ids: string[]) {
  if (ids.length === 0) return null;
  return db
    .prepare(`UPDATE videos SET members_only = 1 WHERE members_only = 0 AND id IN (${placeholders(ids.length)})`)
    .bind(...ids);
}

export function deleteVideosStmt(db: D1Database, ids: string[]) {
  if (ids.length === 0) return null;
  return db.prepare(`DELETE FROM videos WHERE id IN (${placeholders(ids.length)})`).bind(...ids);
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

/** セトリを確認する歌枠。まだ確認していないもの、または次に確認する日時を過ぎたものを、新しい順に */
export async function findSetlistTargets(db: D1Database, now: string, notBefore: string, limit: number) {
  const { results } = await db
    .prepare(
      `SELECT v.id, v.ended_at
         FROM videos v LEFT JOIN setlists s ON s.video_id = v.id
        WHERE v.platform = 'youtube' AND v.type = 'live' AND v.live_status = 'ended' AND v.members_only = 0
          AND v.title LIKE '%歌枠%' AND v.ended_at IS NOT NULL AND v.ended_at <= ?
          AND (s.video_id IS NULL OR (s.text IS NULL AND s.next_check_at <= ?))
        ORDER BY v.ended_at DESC
        LIMIT ?`,
    )
    .bind(notBefore, now, limit)
    .all<{ id: string; ended_at: string }>();
  return results;
}

export interface SetlistResult {
  videoId: string;
  comment: { id: string; author: string; text: string } | null;
  checkedAt: string;
  nextCheckAt: string | null;
}

export function saveSetlistStmt(db: D1Database, r: SetlistResult) {
  return db
    .prepare(
      `INSERT INTO setlists (video_id, comment_id, author, text, checked_at, next_check_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (video_id) DO UPDATE SET
         comment_id = excluded.comment_id, author = excluded.author, text = excluded.text,
         checked_at = excluded.checked_at, next_check_at = excluded.next_check_at`,
    )
    .bind(r.videoId, r.comment?.id ?? null, r.comment?.author ?? null, r.comment?.text ?? null, r.checkedAt, r.nextCheckAt);
}

export async function getSetlist(db: D1Database, videoId: string): Promise<Setlist | null> {
  const row = await db
    .prepare('SELECT author, text FROM setlists WHERE video_id = ? AND text IS NOT NULL')
    .bind(videoId)
    .first<{ author: string; text: string }>();
  return row ? { author: row.author, text: row.text } : null;
}

// ---------- セトリの点検 ----------

export interface SetlistToAudit {
  video_id: string;
  comment_id: string | null;
  text: string | null;
  checked_at: string;
  duration_sec: number | null;
}

/**
 * 点検するセトリ。見つかったセトリと、あきらめた(7 日たっても見つからない)ものを、取得・確認してから
 * まだ点検していない順に。まだ確認を続けているもの(見つかっていない・次の確認がある)は点検しない
 */
export async function findSetlistsToAudit(db: D1Database, limit: number) {
  const { results } = await db
    .prepare(
      `SELECT s.video_id, s.comment_id, s.text, s.checked_at, v.duration_sec
         FROM setlists s JOIN videos v ON v.id = s.video_id
        WHERE (s.audited_at IS NULL OR s.audited_at < s.checked_at)
          AND (s.text IS NOT NULL OR s.next_check_at IS NULL)
        ORDER BY s.checked_at
        LIMIT ?`,
    )
    .bind(limit)
    .all<SetlistToAudit>();
  return results;
}

/** 点検の結果を残す。問題が無ければ行を消し、同じ問題(目印が同じ)なら、知らせた日時はそのまま残す */
export function saveSetlistAuditStmts(
  db: D1Database,
  r: { videoId: string; problems: unknown[]; signature: string; checkedAt: string; now: string },
) {
  const audited = db.prepare('UPDATE setlists SET audited_at = ? WHERE video_id = ?').bind(r.checkedAt, r.videoId);
  if (r.problems.length === 0) {
    return [db.prepare('DELETE FROM setlist_audits WHERE video_id = ?').bind(r.videoId), audited];
  }
  return [
    db
      .prepare(
        `INSERT INTO setlist_audits (video_id, problems, signature, found_at, notified_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT (video_id) DO UPDATE SET
           problems = excluded.problems,
           signature = excluded.signature,
           found_at = CASE WHEN signature = excluded.signature THEN found_at ELSE excluded.found_at END,
           notified_at = CASE WHEN signature = excluded.signature THEN notified_at ELSE NULL END`,
      )
      .bind(r.videoId, JSON.stringify(r.problems), r.signature, r.now),
    audited,
  ];
}

export interface SetlistAuditToNotify {
  video_id: string;
  problems: string;
  title: string;
  channel_title: string;
  event_at: string;
  author: string | null;
  text: string | null;
}

/** まだ知らせていない問題。since 以降にすでに知らせていれば(1 日 1 回まで)、何も返さない */
export async function findSetlistAuditsToNotify(db: D1Database, since: string, limit: number) {
  const { results } = await db
    .prepare(
      `SELECT a.video_id, a.problems, v.title, c.title AS channel_title, v.event_at, s.author, s.text
         FROM setlist_audits a
         JOIN videos v ON v.id = a.video_id
         JOIN channels c ON c.id = v.channel_id
         LEFT JOIN setlists s ON s.video_id = a.video_id
        WHERE a.notified_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM setlist_audits WHERE notified_at >= ?)
        ORDER BY v.event_at
        LIMIT ?`,
    )
    .bind(since, limit)
    .all<SetlistAuditToNotify>();
  return results;
}

export function markSetlistAuditsNotifiedStmts(db: D1Database, videoIds: string[], now: string) {
  return videoIds.map((id) => db.prepare('UPDATE setlist_audits SET notified_at = ? WHERE video_id = ?').bind(now, id));
}

// ---------- 再生リスト ----------

interface PlaylistRow {
  id: string;
  channel_id: string;
  title: string;
  thumbnail_url: string | null;
  item_count: number;
}

const toPlaylist = (row: PlaylistRow): Playlist => ({
  id: row.id,
  channelId: row.channel_id,
  title: row.title,
  thumbnailUrl: row.thumbnail_url,
  itemCount: row.item_count,
  recommended: isRecommendedPlaylist(row.title),
});

/** おすすめを先頭に、残りは最後に動画が追加された順 */
const sortPlaylists = (lists: (Playlist & { lastAddedAt: string | null })[]) =>
  lists
    .sort(
      (a, b) =>
        Number(b.recommended) - Number(a.recommended) || (b.lastAddedAt ?? '').localeCompare(a.lastAddedAt ?? ''),
    )
    .map(({ lastAddedAt: _, ...p }) => p);

export async function listChannelPlaylists(db: D1Database, channelId: string): Promise<Playlist[]> {
  const { results } = await db
    .prepare('SELECT * FROM playlists WHERE channel_id = ? AND item_count > 0')
    .bind(channelId)
    .all<PlaylistRow & { last_added_at: string | null; published_at: string | null }>();
  return sortPlaylists(results.map((r) => ({ ...toPlaylist(r), lastAddedAt: r.last_added_at ?? r.published_at })));
}

export async function getPlaylistDetail(db: D1Database, playlistId: string): Promise<PlaylistDetail | null> {
  const [playlist, videos] = await Promise.all([
    db.prepare('SELECT * FROM playlists WHERE id = ?').bind(playlistId).first<PlaylistRow>(),
    db
      .prepare(
        `SELECT v.* FROM playlist_items i JOIN videos v ON v.id = i.video_id
          WHERE i.playlist_id = ? ORDER BY i.position`,
      )
      .bind(playlistId)
      .all<StoredVideoRow>(),
  ]);
  return playlist ? { playlist: toPlaylist(playlist), events: videos.results.map(toEvent) } : null;
}

/** 動画が入っている再生リスト */
export async function listVideoPlaylists(db: D1Database, videoId: string): Promise<Playlist[]> {
  const { results } = await db
    .prepare(
      `SELECT p.* FROM playlist_items i JOIN playlists p ON p.id = i.playlist_id
        WHERE i.video_id = ?`,
    )
    .bind(videoId)
    .all<PlaylistRow & { last_added_at: string | null; published_at: string | null }>();
  return sortPlaylists(results.map((r) => ({ ...toPlaylist(r), lastAddedAt: r.last_added_at ?? r.published_at })));
}

export async function listPlaylistIds(db: D1Database, channelId: string): Promise<string[]> {
  const { results } = await db.prepare('SELECT id FROM playlists WHERE channel_id = ?').bind(channelId).all<{ id: string }>();
  return results.map((r) => r.id);
}

/**
 * 再生リストを保存する。本数が変わったものだけ、中身を読み直す(items_synced_at を NULL にする)
 */
export function upsertPlaylistStmt(
  db: D1Database,
  channelId: string,
  p: { id: string; title: string; thumbnailUrl: string | null; itemCount: number; publishedAt: string },
  now: string,
) {
  return db
    .prepare(
      `INSERT INTO playlists (id, channel_id, title, thumbnail_url, item_count, published_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         title = excluded.title,
         thumbnail_url = excluded.thumbnail_url,
         published_at = excluded.published_at,
         updated_at = excluded.updated_at,
         items_synced_at  = CASE WHEN playlists.item_count = excluded.item_count THEN playlists.items_synced_at ELSE NULL END,
         items_page_token = CASE WHEN playlists.item_count = excluded.item_count THEN playlists.items_page_token ELSE NULL END,
         item_count = excluded.item_count`,
    )
    .bind(p.id, channelId, p.title, p.thumbnailUrl, p.itemCount, p.publishedAt, now);
}

export function deletePlaylistsStmt(db: D1Database, ids: string[]) {
  if (ids.length === 0) return null;
  return db.prepare(`DELETE FROM playlists WHERE id IN (${placeholders(ids.length)})`).bind(...ids);
}

export function markPlaylistsSyncedStmt(db: D1Database, channelId: string, now: string) {
  return db.prepare('UPDATE channels SET playlists_synced_at = ? WHERE id = ?').bind(now, channelId);
}

/** 中身を読む必要がある再生リスト(1 件) */
export async function findPendingPlaylist(db: D1Database) {
  return db
    .prepare('SELECT id, items_page_token FROM playlists WHERE items_synced_at IS NULL ORDER BY channel_id, id LIMIT 1')
    .first<{ id: string; items_page_token: string | null }>();
}

/**
 * 再生リストの中身の 1 ページ分を書き込む文。最初のページでは古い中身を消し、最後のページでは読み終わった印を付ける
 */
export function playlistItemsPageStmts(
  db: D1Database,
  playlistId: string,
  page: { items: { videoId: string; position: number; addedAt: string }[]; nextPageToken?: string } | null,
  firstPage: boolean,
  now: string,
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  if (firstPage) stmts.push(db.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').bind(playlistId));
  const insert = db.prepare(
    'INSERT OR REPLACE INTO playlist_items (playlist_id, video_id, position, added_at) VALUES (?, ?, ?, ?)',
  );
  for (const i of page?.items ?? []) stmts.push(insert.bind(playlistId, i.videoId, i.position, i.addedAt));
  if (page?.nextPageToken) {
    stmts.push(db.prepare('UPDATE playlists SET items_page_token = ? WHERE id = ?').bind(page.nextPageToken, playlistId));
  } else {
    stmts.push(
      db
        .prepare(
          `UPDATE playlists SET items_page_token = NULL, items_synced_at = ?,
             last_added_at = (SELECT MAX(added_at) FROM playlist_items WHERE playlist_id = ?)
           WHERE id = ?`,
        )
        .bind(now, playlistId, playlistId),
    );
  }
  return stmts;
}

// ---------- Twitch ----------

/** Twitch の行の ID。配信(stream)の ID から作り、配信中の行とアーカイブの行を同じものにする */
export const twitchEventId = (streamId: string) => `twitch:${streamId}`;

export interface TwitchState {
  /** 保存してあるアクセストークン。無ければ null */
  token: { access_token: string; expires_at: string } | null;
  /** 配信中として登録されている Twitch の配信 */
  activeLives: { id: string; channel_id: string }[];
}

/** Twitch の同期の前に必要なものを 1 回の batch で読む */
export async function readTwitchState(db: D1Database): Promise<TwitchState> {
  const [token, lives] = await db.batch<Record<string, string>>([
    db.prepare('SELECT access_token, expires_at FROM twitch_auth WHERE id = 1'),
    db.prepare(`SELECT id, channel_id FROM videos WHERE platform = 'twitch' AND live_status = 'live'`),
  ]);
  return {
    token: (token.results[0] as TwitchState['token'] | undefined) ?? null,
    activeLives: lives.results as TwitchState['activeLives'],
  };
}

export function saveTwitchTokenStmt(db: D1Database, accessToken: string, expiresAt: string) {
  return db
    .prepare(
      `INSERT INTO twitch_auth (id, access_token, expires_at) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET access_token = excluded.access_token, expires_at = excluded.expires_at`,
    )
    .bind(accessToken, expiresAt);
}

/** トークンが使えなくなったとき(401)に消す。次の実行で取り直す */
export async function clearTwitchToken(db: D1Database) {
  await db.prepare('DELETE FROM twitch_auth').run();
}

export interface TwitchLiveRow {
  streamId: string;
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
  startedAt: string;
}

/** 配信中のライブを保存する。配信中のあいだは何度も呼ばれるので、変わったときだけ書き込む */
export function upsertTwitchLiveStmts(db: D1Database, rows: TwitchLiveRow[], now: string): D1PreparedStatement[] {
  if (rows.length === 0) return [];
  const stmt = db.prepare(
    `INSERT INTO videos (id, channel_id, platform, type, live_status, title, search_title, thumbnail_url,
                         event_at, published_at, updated_at)
     VALUES (?, ?, 'twitch', 'live', 'live', ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       live_status   = 'live',
       title         = excluded.title,
       search_title  = excluded.search_title,
       thumbnail_url = excluded.thumbnail_url,
       duration_sec  = NULL,
       ended_at      = NULL,
       updated_at    = excluded.updated_at
     WHERE videos.live_status IS NOT 'live' OR videos.title IS NOT excluded.title`,
  );
  return rows.map((r) =>
    stmt.bind(
      twitchEventId(r.streamId), r.channelId, r.title, normalizeForSearch(r.title), r.thumbnailUrl,
      r.startedAt, r.startedAt, now,
    ),
  );
}

/** 配信中の一覧から消えた配信を、配信済みにする。終了日時は、アーカイブがあればその長さで後から直す */
export function endTwitchLivesStmt(db: D1Database, ids: string[], now: string) {
  if (ids.length === 0) return null;
  return db
    .prepare(
      `UPDATE videos SET live_status = 'ended', ended_at = ?, updated_at = ?
        WHERE live_status = 'live' AND id IN (${placeholders(ids.length)})`,
    )
    .bind(now, now, ...ids);
}

/** 配信中の配信に、作られたアーカイブの動画 ID を結び付ける(タイトルなどは配信中の情報を優先する) */
export function linkTwitchArchiveStmt(db: D1Database, streamId: string, videoId: string) {
  return db
    .prepare('UPDATE videos SET twitch_video_id = ?1 WHERE id = ?2 AND twitch_video_id IS NOT ?1')
    .bind(videoId, twitchEventId(streamId));
}

export interface TwitchArchiveRow {
  /** 行の ID(twitchEventId) */
  id: string;
  channelId: string;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  startedAt: string;
  endedAt: string | null;
}

/**
 * 配信が終わったアーカイブを保存する。配信中に登録した行があれば、開始日時はそのまま残す。
 * 同じ一覧を何度も読むので、変わったときだけ書き込む
 */
export function upsertTwitchArchiveStmts(db: D1Database, rows: TwitchArchiveRow[], now: string): D1PreparedStatement[] {
  if (rows.length === 0) return [];
  const stmt = db.prepare(
    `INSERT INTO videos (id, channel_id, platform, type, live_status, title, search_title, thumbnail_url, duration_sec,
                         event_at, ended_at, published_at, twitch_video_id, updated_at)
     VALUES (?, ?, 'twitch', 'live', 'ended', ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       live_status     = 'ended',
       title           = excluded.title,
       search_title    = excluded.search_title,
       thumbnail_url   = COALESCE(excluded.thumbnail_url, videos.thumbnail_url),
       duration_sec    = excluded.duration_sec,
       ended_at        = excluded.ended_at,
       twitch_video_id = excluded.twitch_video_id,
       updated_at      = excluded.updated_at
     WHERE videos.live_status IS NOT 'ended'
        OR videos.title IS NOT excluded.title
        OR videos.duration_sec IS NOT excluded.duration_sec
        OR videos.twitch_video_id IS NOT excluded.twitch_video_id
        OR (excluded.thumbnail_url IS NOT NULL AND videos.thumbnail_url IS NOT excluded.thumbnail_url)`,
  );
  return rows.map((r) =>
    stmt.bind(
      r.id, r.channelId, r.title, normalizeForSearch(r.title), r.thumbnailUrl, r.durationSec,
      r.startedAt, r.endedAt, r.startedAt, r.videoId, now,
    ),
  );
}

/** 公開が終わった(一覧から消えた)アーカイブの動画 ID を外す。カレンダーの記録は残す */
export function clearExpiredTwitchArchivesStmt(db: D1Database, channelId: string, currentVideoIds: string[]) {
  const notCurrent =
    currentVideoIds.length > 0 ? `AND twitch_video_id NOT IN (${placeholders(currentVideoIds.length)})` : '';
  return db
    .prepare(
      `UPDATE videos SET twitch_video_id = NULL
        WHERE channel_id = ? AND platform = 'twitch' AND twitch_video_id IS NOT NULL ${notCurrent}`,
    )
    .bind(channelId, ...currentVideoIds);
}

/** Twitch のチャンネルの同期の結果を残す。profile は 1 日 1 回の確認をしたときだけ渡す */
export function markTwitchSyncedStmt(
  db: D1Database,
  channelId: string,
  profile: { userId: string; followerCount: number | null } | null,
  now: string,
) {
  if (!profile) return db.prepare('UPDATE channels SET twitch_synced_at = ? WHERE id = ?').bind(now, channelId);
  return db
    .prepare(
      `UPDATE channels
          SET twitch_user_id = ?, twitch_follower_count = COALESCE(?, twitch_follower_count),
              twitch_profile_updated_at = ?, twitch_synced_at = ?
        WHERE id = ?`,
    )
    .bind(profile.userId, profile.followerCount, now, now, channelId);
}

// ---------- Twitch のクリップ ----------

export interface TwitchClipRow {
  id: string;
  /** 元のアーカイブの動画 ID。無ければ空 */
  videoId: string;
  title: string;
  creatorName: string | null;
  viewCount: number;
  durationSec: number | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

/**
 * クリップを保存し、元の配信に結び付ける。アーカイブの動画 ID があればそれで、無ければ(アーカイブが無い配信)、
 * クリップを作った時刻が配信の開始〜終了に入っている配信に結び付ける。一度結び付いたものは外さない。
 * 同じクリップを何度も読むので、変わったときだけ書き込む
 */
export function upsertTwitchClipStmts(
  db: D1Database,
  channelId: string,
  clips: TwitchClipRow[],
  now: string,
): D1PreparedStatement[] {
  if (clips.length === 0) return [];
  const stmt = db.prepare(
    `INSERT INTO twitch_clips (id, channel_id, event_id, title, creator_name, view_count, duration_sec,
                               thumbnail_url, created_at, updated_at)
     VALUES (?1, ?2,
             CASE WHEN ?3 != ''
               THEN (SELECT id FROM videos WHERE platform = 'twitch' AND twitch_video_id = ?3)
               ELSE (SELECT id FROM videos
                      WHERE platform = 'twitch' AND channel_id = ?2 AND event_at <= ?9
                        AND (ended_at >= ?9 OR live_status = 'live')
                      ORDER BY event_at DESC LIMIT 1)
             END,
             ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     ON CONFLICT (id) DO UPDATE SET
       event_id      = COALESCE(excluded.event_id, twitch_clips.event_id),
       title         = excluded.title,
       view_count    = excluded.view_count,
       thumbnail_url = excluded.thumbnail_url,
       updated_at    = excluded.updated_at
     WHERE twitch_clips.view_count IS NOT excluded.view_count
        OR twitch_clips.title IS NOT excluded.title
        OR (excluded.event_id IS NOT NULL AND twitch_clips.event_id IS NOT excluded.event_id)`,
  );
  return clips.map((c) =>
    stmt.bind(
      c.id, channelId, c.videoId, c.title, c.creatorName, c.viewCount, c.durationSec, c.thumbnailUrl, c.createdAt, now,
    ),
  );
}

/** 最近のクリップを確認した印を付ける */
export function markTwitchClipsSyncedStmt(db: D1Database, channelId: string, now: string) {
  return db.prepare('UPDATE channels SET twitch_clips_synced_at = ? WHERE id = ?').bind(now, channelId);
}

/** 全期間のクリップの読み込みの進み具合を残す。cursor が null なら最後まで読んだ */
export function saveTwitchClipsBackfillStmt(db: D1Database, channelId: string, cursor: string | null, now: string) {
  return db
    .prepare(
      `UPDATE channels
          SET twitch_clips_cursor = ?1,
              twitch_clips_backfilled_at = CASE WHEN ?1 IS NULL THEN ?2 ELSE twitch_clips_backfilled_at END
        WHERE id = ?3`,
    )
    .bind(cursor, now, channelId);
}

interface StoredClipRow {
  id: string;
  channel_id: string;
  event_id: string | null;
  title: string;
  creator_name: string | null;
  view_count: number;
  duration_sec: number | null;
  thumbnail_url: string | null;
  created_at: string;
}

const toClip = (row: StoredClipRow): Clip => ({
  id: row.id,
  channelId: row.channel_id,
  eventId: row.event_id,
  title: row.title,
  creatorName: row.creator_name,
  viewCount: row.view_count,
  durationSec: row.duration_sec,
  thumbnailUrl: row.thumbnail_url,
  createdAt: row.created_at,
});

/** 配信に結び付いたクリップ(再生数の多い順) */
export async function listEventClips(db: D1Database, eventId: string, limit: number): Promise<Clip[]> {
  const { results } = await db
    .prepare('SELECT * FROM twitch_clips WHERE event_id = ? ORDER BY view_count DESC, id LIMIT ?')
    .bind(eventId, limit)
    .all<StoredClipRow>();
  return results.map(toClip);
}

/** チャンネルのクリップの 1 ページ分(配信に結び付いていないものも含む) */
export async function listChannelClips(
  db: D1Database,
  channelId: string,
  sort: ClipSort,
  offset: number,
  limit: number,
): Promise<ClipPage> {
  const order = sort === 'new' ? 'created_at DESC, id' : 'view_count DESC, id';
  const { results } = await db
    .prepare(`SELECT * FROM twitch_clips WHERE channel_id = ? ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(channelId, limit + 1, offset)
    .all<StoredClipRow>();
  return {
    clips: results.slice(0, limit).map(toClip),
    nextOffset: results.length > limit ? offset + limit : null,
  };
}
