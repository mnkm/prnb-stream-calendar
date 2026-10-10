-- Twitch の配信(配信中のライブと、過去の配信のアーカイブ)もカレンダーに表示する

-- Twitch にもチャンネルがある場合のログイン名(twitch.tv/◯◯ の部分)。入れると同期の対象になる
ALTER TABLE channels ADD COLUMN twitch_login TEXT;
ALTER TABLE channels ADD COLUMN twitch_user_id TEXT;            -- ログイン名から同期のときに調べる
ALTER TABLE channels ADD COLUMN twitch_follower_count INTEGER;
ALTER TABLE channels ADD COLUMN twitch_profile_updated_at TEXT; -- ユーザー ID・フォロワー数・全アーカイブを最後に確認した日時(1 日 1 回)
ALTER TABLE channels ADD COLUMN twitch_synced_at TEXT;          -- アーカイブの一覧を最後に確認した日時

UPDATE channels SET twitch_login = 'momose_nina' WHERE id = 'UCGCNass-jSHshAHA4ufX3Ng';
UPDATE channels SET twitch_login = 'shigureruka' WHERE id = 'UCIYk01c-wq6Ex9sjsDBEl0g';

-- どちらの配信か。Twitch の行の id は 'twitch:' + 配信(stream)の ID
ALTER TABLE videos ADD COLUMN platform TEXT NOT NULL DEFAULT 'youtube';
-- Twitch のアーカイブ(動画)の ID。配信中でまだ無い・保存されていない・公開が終わった場合は NULL
ALTER TABLE videos ADD COLUMN twitch_video_id TEXT;

-- Twitch API のアプリ用アクセストークン(約 60 日有効)。実行のたびに取り直さないよう保存しておく
CREATE TABLE twitch_auth (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  access_token TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);
