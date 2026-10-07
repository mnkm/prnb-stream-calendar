import { normalizeForSearch } from '../../shared/search';

/**
 * 文字列の中の terms(splitSearchTerms で正規化済み)に一致する部分を強調する。
 * 検索 API と同じく、全角・半角、英字の大文字・小文字は区別しない
 */
export function Highlight({ text, terms }: { text: string; terms?: string[] }) {
  if (!terms || terms.length === 0) return <>{text}</>;

  // 1 文字ずつ正規化し、正規化後の位置から元の文字の位置に戻せるようにする
  const chars = Array.from(text);
  let normalized = '';
  const origin: number[] = [];
  chars.forEach((ch, i) => {
    const n = normalizeForSearch(ch);
    normalized += n;
    for (let k = 0; k < n.length; k++) origin.push(i);
  });

  const marked = new Array<boolean>(chars.length).fill(false);
  for (const term of terms) {
    for (let at = normalized.indexOf(term); at !== -1; at = normalized.indexOf(term, at + term.length)) {
      for (let k = at; k < at + term.length; k++) marked[origin[k]] = true;
    }
  }

  // 強調する文字・しない文字の連続ごとにまとめる
  const parts: { text: string; mark: boolean }[] = [];
  chars.forEach((ch, i) => {
    const last = parts.at(-1);
    if (last && last.mark === marked[i]) last.text += ch;
    else parts.push({ text: ch, mark: marked[i] });
  });

  return (
    <>
      {parts.map((part, i) =>
        part.mark ? (
          <mark key={i} className="rounded-sm bg-short/30 px-0.5 text-inherit">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
