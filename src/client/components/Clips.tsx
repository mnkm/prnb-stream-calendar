import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ExternalLink, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Clip, ClipSort } from '../../shared/types';
import { channelClipsQuery, eventClipsQuery } from '../lib/api';
import { formatDuration } from '../lib/format';

/** 配信の詳細で最初に見せるクリップの数(残りは「すべて見る」で開く) */
const INITIAL_EVENT_CLIPS = 4;
/** 一覧の最後がこの距離まで近づいたら、続きを読み込む(検索結果と同じ) */
const LOAD_MORE_MARGIN = '800px';

const SORT_OPTIONS: { value: ClipSort; label: string }[] = [
  { value: 'popular', label: '人気順' },
  { value: 'new', label: '新しい順' },
];

const compactNumber = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 });

const clipUrl = (id: string) => `https://clips.twitch.tv/${encodeURIComponent(id)}`;

/** クリップの埋め込みプレーヤーの URL(埋め込む側のホスト名を parent で渡す必要がある) */
export const clipEmbedUrl = (id: string) =>
  `https://clips.twitch.tv/embed?${new URLSearchParams({ clip: id, parent: location.hostname, autoplay: 'true' })}`;

/** いちばん近い縦スクロールの親(ダイアログの中身)。無ければ null(画面全体) */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  }
  return null;
}

function ClipCard({ clip, playing, onPlay }: { clip: Clip; playing: boolean; onPlay: () => void }) {
  const duration = formatDuration(clip.durationSec === null ? null : Math.round(clip.durationSec));
  return (
    <button onClick={onPlay} aria-pressed={playing} className="group flex w-full flex-col gap-1.5 text-left">
      <span
        className={clsx(
          'relative block aspect-video overflow-hidden rounded-xl bg-ink/5',
          playing && 'ring-2 ring-twitch ring-offset-2 ring-offset-surface',
        )}
      >
        {clip.thumbnailUrl && (
          <img src={clip.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-105" />
        )}
        {playing ? (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-twitch px-2 py-0.5 text-[10px] font-bold text-white">
            再生中
          </span>
        ) : (
          <span className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
            <span className="grid size-9 place-items-center rounded-full bg-white/90 text-black shadow">
              <Play className="ml-0.5 size-4 fill-current" aria-hidden />
            </span>
          </span>
        )}
        {duration && (
          <span className="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1 py-px text-[10px] font-medium text-white tabular-nums">
            {duration}
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-xs leading-snug font-semibold text-ink/90 group-hover:text-ink">{clip.title}</span>
      <span className="text-[11px] leading-snug text-muted tabular-nums">
        {compactNumber.format(clip.viewCount)} 回視聴・{format(new Date(clip.createdAt), 'yyyy/MM/dd')}
        {clip.creatorName && <span className="block truncate">{clip.creatorName} さん作成</span>}
      </span>
    </button>
  );
}

/**
 * ① 配信の詳細に出す「この配信のクリップ」(再生数の多い順)。押すとダイアログ内のプレーヤーで再生する。
 * クリップが無ければ何も表示しない
 */
export function EventClips({
  eventId,
  playingId,
  onPlay,
  onStop,
}: {
  eventId: string;
  /** プレーヤーで再生中のクリップ */
  playingId: string | null;
  onPlay: (clip: Clip) => void;
  /** クリップの再生をやめて、配信の表示に戻す */
  onStop: () => void;
}) {
  const { data: clips } = useQuery(eventClipsQuery(eventId));
  const [showAll, setShowAll] = useState(false);
  if (!clips || clips.length === 0) return null;

  const visible = showAll ? clips : clips.slice(0, INITIAL_EVENT_CLIPS);
  return (
    <section aria-label="この配信のクリップ" className="flex flex-col gap-3 rounded-2xl border border-line bg-raised p-3">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 className="text-sm font-semibold">この配信のクリップ</h3>
        {playingId ? (
          <button onClick={onStop} className="text-xs font-medium text-twitch underline-offset-2 hover:underline">
            配信の表示に戻る
          </button>
        ) : (
          <span className="text-xs text-muted tabular-nums">{clips.length} 本</span>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4">
        {visible.map((clip) => (
          <li key={clip.id}>
            <ClipCard clip={clip} playing={clip.id === playingId} onPlay={() => onPlay(clip)} />
          </li>
        ))}
      </ul>
      {!showAll && clips.length > INITIAL_EVENT_CLIPS && (
        <button
          onClick={() => setShowAll(true)}
          className="rounded-full border border-line py-2 text-sm font-medium transition hover:bg-ink/5"
        >
          すべてのクリップ({clips.length})を見る
        </button>
      )}
    </section>
  );
}

/**
 * ② チャンネル情報の「クリップ」タブ。カレンダーに無い配信のクリップも含めて、人気順・新しい順で並べる。
 * 押すと一覧の上のプレーヤーで再生する
 */
export function ChannelClips({ channelId }: { channelId: string }) {
  const [sort, setSort] = useState<ClipSort>('popular');
  const [playing, setPlaying] = useState<Clip | null>(null);
  const { data, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(
    channelClipsQuery(channelId, sort),
  );
  const clips = data?.pages.flatMap((p) => p.clips) ?? [];

  const playerRef = useRef<HTMLDivElement>(null);
  const play = (clip: Clip) => {
    setPlaying(clip);
    // プレーヤーは押したあとに描かれるので、描かれてから見えるところまで戻る
    requestAnimationFrame(() => playerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  // 一覧の最後の目印が見えてきたら続きを読み込む
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMore = hasNextPage && !isFetchingNextPage;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canLoadMore) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && fetchNextPage(), {
      root: scrollParent(el),
      rootMargin: LOAD_MORE_MARGIN,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [canLoadMore, fetchNextPage]);

  // 並び順を変えて読み込み直しているあいだも、プレーヤーと並び順の切り替えは残す
  const status = isPending
    ? '読み込み中…'
    : isError
      ? 'クリップを読み込めませんでした'
      : clips.length === 0
        ? 'クリップはありません'
        : null;
  if (status && !playing && sort === 'popular') return <p className="py-6 text-center text-sm text-muted">{status}</p>;

  return (
    <div className="flex flex-col gap-3">
      {playing && (
        <div ref={playerRef} className="flex scroll-mt-4 flex-col gap-2">
          <div className="aspect-video overflow-hidden rounded-xl bg-black">
            <iframe
              key={playing.id}
              className="size-full"
              src={clipEmbedUrl(playing.id)}
              title={playing.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-sm leading-snug font-semibold break-words">{playing.title}</p>
            <a
              href={clipUrl(playing.id)}
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center gap-1 text-xs font-medium whitespace-nowrap text-twitch underline-offset-2 hover:underline"
            >
              Twitch で開く
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>
      )}

      <div role="radiogroup" aria-label="並び順" className="flex w-fit gap-1 self-end rounded-full border border-line p-1">
        {SORT_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            role="radio"
            aria-checked={sort === value}
            onClick={() => setSort(value)}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition',
              sort === value ? 'bg-ink text-canvas' : 'text-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {status && <p className="py-6 text-center text-sm text-muted">{status}</p>}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4">
        {clips.map((clip) => (
          <li key={clip.id}>
            <ClipCard clip={clip} playing={clip.id === playing?.id} onPlay={() => play(clip)} />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <div ref={sentinelRef} className="py-3 text-center text-xs text-muted">
          読み込み中…
        </div>
      )}
    </div>
  );
}
