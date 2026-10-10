-- Twitch のクリップ。配信の詳細(その配信のクリップ)と、チャンネル情報の「クリップ」タブに表示する
CREATE TABLE twitch_clips (
  id            TEXT PRIMARY KEY,
  channel_id    TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  event_id      TEXT,                        -- 元の配信(videos.id)。カレンダーに無い配信のクリップは NULL
  title         TEXT NOT NULL,
  creator_name  TEXT,                        -- クリップを作った人
  view_count    INTEGER NOT NULL DEFAULT 0,
  duration_sec  REAL,
  thumbnail_url TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX idx_twitch_clips_event ON twitch_clips (event_id, view_count DESC) WHERE event_id IS NOT NULL;
CREATE INDEX idx_twitch_clips_popular ON twitch_clips (channel_id, view_count DESC);
CREATE INDEX idx_twitch_clips_new ON twitch_clips (channel_id, created_at DESC);

-- クリップを元の配信に結び付けるときに使う(アーカイブの動画 ID、または作成時刻から探す)
CREATE INDEX idx_videos_twitch_video ON videos (twitch_video_id) WHERE twitch_video_id IS NOT NULL;
CREATE INDEX idx_videos_twitch_channel ON videos (channel_id, event_at) WHERE platform = 'twitch';

ALTER TABLE channels ADD COLUMN twitch_clips_synced_at TEXT;     -- 最近 1 週間のクリップを最後に確認した日時(1 時間ごと)
ALTER TABLE channels ADD COLUMN twitch_clips_cursor TEXT;        -- 全期間のクリップの読み込みの続き
ALTER TABLE channels ADD COLUMN twitch_clips_backfilled_at TEXT; -- 全期間のクリップを最後まで読んだ日時(1 週間ごとに読み直す)
