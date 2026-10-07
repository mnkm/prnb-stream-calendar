-- チャンネルのプロフィール(ヘッダーのアイコンから開くダイアログに表示する)。同期のときに 1 日 1 回更新する
ALTER TABLE channels ADD COLUMN description TEXT;
ALTER TABLE channels ADD COLUMN custom_url TEXT;        -- @ハンドル
ALTER TABLE channels ADD COLUMN banner_url TEXT;
ALTER TABLE channels ADD COLUMN subscriber_count INTEGER; -- 非公開なら NULL
ALTER TABLE channels ADD COLUMN video_count INTEGER;
ALTER TABLE channels ADD COLUMN profile_updated_at TEXT;
