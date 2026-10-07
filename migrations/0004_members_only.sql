-- メンバー限定のコンテンツ。UU(全アップロード)や RSS には含まれないため、UUMO から別に取り込む
ALTER TABLE videos ADD COLUMN members_only INTEGER NOT NULL DEFAULT 0;
-- UUMO を 1 回だけ最後まで取り込むときの進み具合
ALTER TABLE channels ADD COLUMN members_page_token TEXT;
ALTER TABLE channels ADD COLUMN members_scanned_at TEXT;
