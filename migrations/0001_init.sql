-- チャンネル。id を 1 行追加するだけで同期対象が増える
CREATE TABLE channels (
  id                  TEXT PRIMARY KEY,               -- UCxxxxxxxx
  title               TEXT NOT NULL DEFAULT '',       -- 空なら同期時に API から補完
  icon_url            TEXT,
  color               TEXT NOT NULL DEFAULT '#6366f1',-- 複数チャンネル表示時の識別色
  enabled             INTEGER NOT NULL DEFAULT 1,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  backfill_stage      TEXT NOT NULL DEFAULT 'uploads' -- 'uploads' -> 'shorts' -> 'done'
                      CHECK (backfill_stage IN ('uploads', 'shorts', 'done')),
  backfill_page_token TEXT,                           -- 過去分取得の再開位置
  backfilled_at       TEXT,
  synced_at           TEXT
);

CREATE TABLE videos (
  id            TEXT PRIMARY KEY,                     -- videoId
  channel_id    TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('video', 'short', 'live')),
  live_status   TEXT CHECK (live_status IN ('upcoming', 'live', 'ended')),
  title         TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_sec  INTEGER,
  event_at      TEXT NOT NULL,                        -- カレンダー配置日時 (UTC, ISO 8601)
  ended_at      TEXT,                                 -- ライブ終了日時
  published_at  TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX idx_videos_event_at ON videos (event_at);
CREATE INDEX idx_videos_active_live ON videos (channel_id, live_status)
  WHERE live_status IN ('upcoming', 'live');
