-- 動画の一覧(/api/videos)用。1 つのチャンネルの YouTube の動画を、新しい順にたどる。
-- event_at だけのインデックスでは、ほかのチャンネルの行を読み飛ばしながらたどることになるため
CREATE INDEX idx_videos_youtube_channel ON videos (channel_id, event_at) WHERE platform = 'youtube';
