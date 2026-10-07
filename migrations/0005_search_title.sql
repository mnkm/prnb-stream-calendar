-- 全角・半角を区別せずに検索するための、正規化したタイトル(src/shared/search.ts の normalizeForSearch)。
-- SQL では正規化できないので、登録済みの行は同期処理が後から埋める。空のあいだは title で検索する
ALTER TABLE videos ADD COLUMN search_title TEXT;
