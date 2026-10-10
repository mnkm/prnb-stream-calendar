-- 取り込んだあとに再生できなくなった(非公開・削除・公開終了)動画や配信を、記録を残したまま見分ける

-- 再生できなくなったと確認した日時。再生できるあいだは NULL(再び公開されたら NULL に戻す)
ALTER TABLE videos ADD COLUMN unavailable_at TEXT;
-- YouTube の確認で、続けて返ってこなかった回数。一時的な取りこぼしで印を付けないよう、2 回続いたら再生できないとみなす
ALTER TABLE videos ADD COLUMN missing_count INTEGER NOT NULL DEFAULT 0;
-- YouTube で限定公開になっていれば 1
ALTER TABLE videos ADD COLUMN unlisted INTEGER NOT NULL DEFAULT 0;
-- 最後に確認した日時(1 日 1 回、古いものから順に確認する)
ALTER TABLE videos ADD COLUMN availability_checked_at TEXT;

CREATE INDEX idx_videos_availability ON videos (availability_checked_at) WHERE platform = 'youtube';

-- Twitch のクリップも 1 日 1 回確認し、2 回続けて返ってこなければ一覧から外す(行を消す)
ALTER TABLE twitch_clips ADD COLUMN missing_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE twitch_clips ADD COLUMN checked_at TEXT;

CREATE INDEX idx_twitch_clips_checked ON twitch_clips (checked_at);
