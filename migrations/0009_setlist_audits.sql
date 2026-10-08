-- セトリの点検。新しく取得したセトリを表示と同じ読み取りにかけ、正しく表示されていない可能性があるものを残し、
-- 1 日 1 回 GitHub の Issue で知らせる

-- 最後に点検した日時。checked_at(セトリを取得・確認した日時)より古ければ、もう一度点検する
ALTER TABLE setlists ADD COLUMN audited_at TEXT;
-- 2026-10-09 に全セトリを目で点検し、報告済みなので、今あるセトリは点検済みとする
UPDATE setlists SET audited_at = checked_at;

-- 問題が見つかった歌枠。問題が無くなれば(読み取りを直した、など)行を消す
CREATE TABLE setlist_audits (
  video_id    TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  problems    TEXT NOT NULL, -- 見つかった問題(JSON。SetlistProblem の配列)
  signature   TEXT NOT NULL, -- 同じ問題を何度も知らせないための目印(コメントと問題の内容)
  found_at    TEXT NOT NULL, -- 今の問題が最初に見つかった日時
  notified_at TEXT           -- Issue で知らせた日時。まだなら NULL
);

CREATE INDEX idx_setlist_audits_pending ON setlist_audits (found_at) WHERE notified_at IS NULL;
