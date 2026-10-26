/**
 * 朝活の配信のコメントから、ボイス(ボイスマロ)や今日の質問のタイムスタンプを含むものを選ぶ。
 * ファンのタイムスタンプのコメントには、次のような行で書かれている。
 *
 *   01:43:59 💌ボイスタイム
 *      01:49:23 ゆられんデートボイス🎤
 *   01:57:18 💬今日の質問(納豆の豆の大きさは何派？)
 *
 * 時刻と同じ行に MORNING_KEYWORDS のどれかがあり、時刻の行が MORNING_MIN_TIMES 行以上あるコメントを選ぶ。
 * 時刻の無い感想(「デートシチュボイスかと思いきや」)は選ばない。コメントは誰でも書けて、選んだものは公開 API で
 * 原文のまま返すので、「0:00 マロ」の 1 行だけを入れた宣伝などを拾わないよう、タイムスタンプのコメントらしいものに絞る
 */

/** 時刻の行に含まれていれば選ぶ語 */
export const MORNING_KEYWORDS = ['ボイス', 'マロ', '🎤', '今日の質問'];

/** 時刻の行の数の下限(実際のタイムスタンプのコメントは 40 行ほど。ボイスと今日の質問だけを書いた短いものも拾う) */
export const MORNING_MIN_TIMES = 2;

/**
 * 読む範囲の上限。YouTube のコメントは 10,000 文字まで書ける。誰でも書けるので、細工された長いコメントでも
 * 時間がかからないよう、上限を設ける(実際のタイムスタンプのコメントは 50 行・2,000 文字ほど)
 */
const MAX_CHARS = 10_000;
/** 「1:23」「01:23:45」。「2026:10」のような桁の多い数字や、時刻の続きは当てない */
const TIME = /(?<![\d:])\d{1,2}:\d{2}(?::\d{2})?(?![\d:])/;

export function hasMorningStamp(text: string): boolean {
  const timed = text
    .slice(0, MAX_CHARS)
    .split('\n')
    .filter((line) => TIME.test(line));
  return timed.length >= MORNING_MIN_TIMES && timed.some((line) => MORNING_KEYWORDS.some((k) => line.includes(k)));
}
