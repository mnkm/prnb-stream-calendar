/**
 * 検索用に文字をそろえる。NFKC で全角英数字・記号を半角に、半角カタカナを全角にし、英字は小文字にする。
 * サーバー(search_title の保存と検索語)と画面(強調表示)で同じ規則を使う
 */
export const normalizeForSearch = (s: string) => s.normalize('NFKC').toLowerCase();

/**
 * 歌唱履歴で、同じ曲をまとめるためのキー。曲名を検索用にそろえ(normalizeForSearch)、空白・記号・句読点を除く。
 * 楽曲リスト(prnb-songlist)でも同じ規則で曲名をそろえて突き合わせる(規則は docs/details.md)。
 * 除くと何も残らない曲名(記号だけの曲名)は、そろえただけのものをキーにする
 */
export const songKey = (title: string) => {
  const normalized = normalizeForSearch(title).trim();
  return normalized.replace(/[\s\p{P}\p{S}]/gu, '') || normalized;
};

/** 検索語を空白(全角も含む)で分け、検索用にそろえる */
export const splitSearchTerms = (q: string) =>
  normalizeForSearch(q)
    .split(/\s+/)
    .filter(Boolean);
