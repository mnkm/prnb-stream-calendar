-- 歌枠のセトリ。配信のコメント(関連性順の上位)から、タイムスタンプを多く含むものを保存する。
-- 読み取り(曲名・アーティスト・時刻への分解)は表示のときに行うので、ここには原文を残す
CREATE TABLE setlists (
  video_id      TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  comment_id    TEXT,
  author        TEXT,
  text          TEXT,          -- コメントの原文。まだ見つかっていなければ NULL
  checked_at    TEXT NOT NULL, -- 最後に確認した日時
  next_check_at TEXT           -- 次に確認する日時。見つかった、または配信終了から 7 日を過ぎたら NULL
);

CREATE INDEX idx_setlists_next_check ON setlists (next_check_at) WHERE next_check_at IS NOT NULL;
