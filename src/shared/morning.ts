/**
 * 朝活の配信のコメントから、ボイス(ボイスマロ)や今日の質問のタイムスタンプを含むものを選ぶ。
 * ファンのタイムスタンプのコメントには、次のような行で書かれている。
 *
 *   01:43:59 💌ボイスタイム
 *      01:49:23 ゆられんデートボイス🎤
 *   01:57:18 💬今日の質問(納豆の豆の大きさは何派？)
 *
 * 長いタイムスタンプは、書き手が自分のコメントへの返信に続きを書く(「◇ 最後まで ◇」など)。2024 年のボイスは返信の中にしか
 * 無い回が多いので、同じ書き手の返信をつなげてから選ぶ(mergeMorningReplies)。
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
 * つなげたコメントの長さの上限(読む範囲の上限でもある)。YouTube のコメントは 1 件 10,000 文字まで書け、返信も合わせると
 * もっと長くなる。誰でも書けるので、細工された長いコメントでも時間がかからず、保存する大きさも抑えられるよう、上限を設ける
 * (実際のタイムスタンプは、返信を合わせて 100 行・5,000 文字ほど)
 */
export const MORNING_MAX_CHARS = 20_000;
/** 「1:23」「01:23:45」。「2026:10」のような桁の多い数字や、時刻の続きは当てない */
const TIME = /(?<![\d:])\d{1,2}:\d{2}(?::\d{2})?(?![\d:])/;

export function hasMorningStamp(text: string): boolean {
  const timed = text
    .slice(0, MORNING_MAX_CHARS)
    .split('\n')
    .filter((line) => TIME.test(line));
  return timed.length >= MORNING_MIN_TIMES && timed.some((line) => MORNING_KEYWORDS.some((k) => line.includes(k)));
}

/** 時刻の行があるか(返信を取り足すかどうかの目安) */
export const hasTimes = (text: string) => text.slice(0, MORNING_MAX_CHARS).split('\n').some((line) => TIME.test(line));

/**
 * コメントに、同じ書き手が返信で続きを書いていれば、書いた順につなげる(空行をはさむ)。
 * ほかの人の返信は入れない。長さが MORNING_MAX_CHARS を超える返信からは入れない(行や絵文字の途中で切らない)
 */
export function mergeMorningReplies(
  comment: { text: string; authorChannelId: string | null },
  replies: { text: string; authorChannelId: string | null; publishedAt: string }[],
): string {
  if (comment.authorChannelId === null) return comment.text;
  const own = replies
    .filter((r) => r.authorChannelId === comment.authorChannelId)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? -1 : a.publishedAt > b.publishedAt ? 1 : 0));
  let text = comment.text;
  for (const reply of own) {
    if (text.length + 2 + reply.text.length > MORNING_MAX_CHARS) break;
    text += `\n\n${reply.text}`;
  }
  return text;
}
