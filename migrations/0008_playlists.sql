-- チャンネルが作った再生リスト(公開のもの)。一覧は 1 日 1 回取り直す
CREATE TABLE playlists (
  id               TEXT PRIMARY KEY,
  channel_id       TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  thumbnail_url    TEXT,
  item_count       INTEGER NOT NULL DEFAULT 0, -- YouTube 上の本数(非公開・メン限なども含む)
  published_at     TEXT,
  last_added_at    TEXT,                       -- 中の動画が最後に追加された日時(並び順に使う)
  items_page_token TEXT,                       -- 中身の読み込みの続き
  items_synced_at  TEXT,                       -- 中身を最後まで読んだ日時。NULL なら読み直しが必要
  updated_at       TEXT NOT NULL
);

CREATE INDEX idx_playlists_channel ON playlists (channel_id);
CREATE INDEX idx_playlists_pending ON playlists (channel_id) WHERE items_synced_at IS NULL;

-- 再生リストの中身(どの動画がどの再生リストの何番目に入っているか)
CREATE TABLE playlist_items (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  video_id    TEXT NOT NULL,
  position    INTEGER NOT NULL,
  added_at    TEXT,
  PRIMARY KEY (playlist_id, video_id)
);

CREATE INDEX idx_playlist_items_video ON playlist_items (video_id);

-- 再生リストの一覧を最後に取り直した日時
ALTER TABLE channels ADD COLUMN playlists_synced_at TEXT;
