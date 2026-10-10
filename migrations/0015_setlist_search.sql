-- キーワード検索で、歌枠のセトリ(曲名・アーティスト)も探せるようにする。
-- セトリは原文のまま保存しているので、表示と同じ読み取り(parseSetlist)の結果を、同期のときに保存しておく

-- 読み取った曲(JSON。[{ "title": 曲名, "artist": アーティスト または null }] の配列)。検索結果に当たった曲を出すのに使う
ALTER TABLE setlists ADD COLUMN songs TEXT;
-- 検索用にそろえた曲名とアーティスト(1 曲 1 行、曲名とアーティストはタブ区切り)。videos.search_title と同じ規則
ALTER TABLE setlists ADD COLUMN search_songs TEXT;
-- 読み取りに使った規則の版(SETLIST_PARSER_VERSION)。NULL や古い版の行は、同期のときに読み取り直す
ALTER TABLE setlists ADD COLUMN songs_version INTEGER;
