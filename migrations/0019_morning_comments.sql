-- 朝活の配信(タイトルに「朝活」があるもの)のコメントのうち、ボイスや今日の質問のタイムスタンプを含むもの。
-- ファンのタイムスタンプのコメントに「01:49:23 ゆられんデートボイス🎤」のような行で書かれる。
-- 選び方は src/shared/morning.ts の hasMorningStamp。確認のたびに、その配信の分を入れ替える
CREATE TABLE morning_comments (
  comment_id        TEXT PRIMARY KEY,
  video_id          TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  author            TEXT NOT NULL,  -- 書いた人の表示名(@ から始まるハンドル)
  author_channel_id TEXT,
  text              TEXT NOT NULL,  -- コメントの原文
  like_count        INTEGER NOT NULL DEFAULT 0,
  position          INTEGER NOT NULL -- 関連性順で何番目だったか(0 から)。同じ配信の中の並び順に使う
);

CREATE INDEX idx_morning_comments_video ON morning_comments (video_id);

-- 朝活の配信のコメントを確認した記録。行が無い配信は、まだ一度も確認していない(過去の配信もこれで取り込む)
CREATE TABLE morning_checks (
  video_id      TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  checked_at    TEXT NOT NULL,
  next_check_at TEXT           -- 次に確認する日時。確認の予定が終わったら NULL
);

CREATE INDEX idx_morning_checks_next_check ON morning_checks (next_check_at) WHERE next_check_at IS NOT NULL;
