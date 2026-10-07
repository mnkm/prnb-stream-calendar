/** 文字列の中の terms に一致する部分を強調する。大文字・小文字は区別しない(検索 API の LIKE と同じ) */
export function Highlight({ text, terms }: { text: string; terms?: string[] }) {
  if (!terms || terms.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const lowerTerms = terms.map((t) => t.toLowerCase());
  return (
    <>
      {text.split(pattern).map((part, i) =>
        lowerTerms.includes(part.toLowerCase()) ? (
          <mark key={i} className="rounded-sm bg-short/30 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
