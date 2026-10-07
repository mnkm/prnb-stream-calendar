-- プレミア公開の判定のため、UULF(「動画」タブ)を 1 回だけ最後まで確認する。その進み具合
ALTER TABLE channels ADD COLUMN premieres_page_token TEXT;
ALTER TABLE channels ADD COLUMN premieres_scanned_at TEXT;
