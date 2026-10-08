import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { formatSetlistTime, parseSetlist } from '../../shared/setlist';
import { setlistQuery } from '../lib/api';

/**
 * 歌枠のセトリ。番号・曲名・アーティスト・時刻だけのシンプルな一覧で、最初から開いた状態で表示する。
 * まだ見つかっていない、または曲が読み取れないときは何も表示しない
 */
export function SetlistSection({ videoId, onSeek }: { videoId: string; onSeek: (seconds: number) => void }) {
  const { data } = useQuery(setlistQuery(videoId));
  const songs = useMemo(() => (data ? parseSetlist(data.text) : []), [data]);
  if (!data || songs.length === 0) return null;

  return (
    <section aria-label="セットリスト" className="rounded-2xl border border-line bg-raised px-3 pt-3 pb-2">
      <div className="mb-1 flex items-baseline justify-between px-1">
        <h3 className="text-sm font-semibold">セットリスト</h3>
        <span className="text-xs text-muted tabular-nums">全 {songs.length} 曲</span>
      </div>
      <ol>
        {songs.map((song, i) => (
          <li key={i} className="flex items-center gap-3 border-t border-line px-1 py-2">
            <span className="w-5 shrink-0 text-xs text-muted tabular-nums">{String(song.no).padStart(2, '0')}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm leading-snug font-semibold break-words">{song.title}</span>
              {song.artist && <span className="text-xs leading-snug break-words text-muted">{song.artist}</span>}
            </span>
            <button
              onClick={() => onSeek(song.time)}
              aria-label={`${song.title} を ${formatSetlistTime(song.time)} から再生`}
              className="shrink-0 rounded-full border border-line px-2.5 py-1 font-mono text-xs tabular-nums transition hover:bg-ink/5"
            >
              {formatSetlistTime(song.time)}
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-1 px-1 text-right text-[11px] text-muted">{data.author} さんのコメントより</p>
    </section>
  );
}
