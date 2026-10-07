/**
 * 検索用に文字をそろえる。NFKC で全角英数字・記号を半角に、半角カタカナを全角にし、英字は小文字にする。
 * サーバー(search_title の保存と検索語)と画面(強調表示)で同じ規則を使う
 */
export const normalizeForSearch = (s: string) => s.normalize('NFKC').toLowerCase();

/** 検索語を空白(全角も含む)で分け、検索用にそろえる */
export const splitSearchTerms = (q: string) =>
  normalizeForSearch(q)
    .split(/\s+/)
    .filter(Boolean);
