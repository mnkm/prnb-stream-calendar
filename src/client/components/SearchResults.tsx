import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { LoaderCircle, SearchX } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { type CalendarEvent, type Channel, VIDEO_TYPES, type VideoType } from '../../shared/types';
import { dayKey } from '../lib/calendar';
import { EventRow } from './EventRow';
import { TypeFilters } from './Toolbar';

/** リストの最後がこの距離まで近づいたら、続きを読み込み始める */
const LOAD_MORE_MARGIN = '800px';

interface Props {
  query: string;
  terms: string[];
  /** ここまでに読み込んだ結果(種別・チャンネルの絞り込み済み、新しい順) */
  events: CalendarEvent[];
  /** 種別ごとの一致件数(種別の絞り込み前)。読み込み前は undefined */
  counts?: Record<VideoType, number>;
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  types: ReadonlySet<VideoType>;
  onToggleType: (type: VideoType) => void;
  channelMap: Map<string, Channel>;
  showChannelColor: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
}

/**
 * キーワード検索の結果。期間をまたぐので、年付きの日付ごとに新しい順で並べる。
 * 一致した全件をたどれるよう、下までスクロールすると続きを読み込む
 */
export function SearchResults({
  query,
  terms,
  events,
  counts,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  types,
  onToggleType,
  channelMap,
  showChannelColor,
  onSelectEvent,
}: Props) {
  const total = counts ? VIDEO_TYPES.reduce((sum, t) => sum + (types.has(t) ? counts[t] : 0), 0) : null;

  const days = useMemo(() => {
    const groups: { key: string; date: Date; events: CalendarEvent[] }[] = [];
    for (const event of events) {
      const date = new Date(event.eventAt);
      const key = dayKey(date);
      const last = groups.at(-1);
      if (last?.key === key) last.events.push(event);
      else groups.push({ key, date, events: [event] });
    }
    return groups;
  }, [events]);

  // リストの最後の目印が見えてきたら続きを読み込む
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMore = hasNextPage && !isFetchingNextPage && !isLoading;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canLoadMore) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onLoadMore(), {
      rootMargin: LOAD_MORE_MARGIN,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [canLoadMore, onLoadMore]);

  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium tracking-widest text-muted">SEARCH</p>
          <h1 className="mt-1 text-2xl leading-snug font-semibold break-all sm:text-3xl">「{query}」の検索結果</h1>
          <p className="mt-1 text-sm text-muted tabular-nums">
            {isLoading || total === null ? '検索中…' : `${total.toLocaleString()} 件`}
          </p>
        </div>
        <TypeFilters types={types} counts={counts ?? { live: 0, video: 0, short: 0 }} onToggle={onToggleType} />
      </div>

      {isError && (
        <p className="rounded-2xl border border-live/30 bg-live/10 px-4 py-3 text-sm text-live">
          検索できませんでした。時間をおいて再度お試しください。
        </p>
      )}

      {!isLoading && !isError && days.length === 0 && (
        <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-line py-24 text-muted">
          <SearchX className="size-8" aria-hidden />
          <p className="text-sm">
            {types.size === 0 ? '表示する種別を選んでください' : '一致する動画・配信はありません'}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-8">
        {days.map(({ key, date, events: dayEvents }) => (
          <section key={key}>
            <h2 className="mb-3 text-sm font-semibold">{format(date, 'yyyy年M月d日 (E)', { locale: ja })}</h2>
            <div className="grid gap-2.5 lg:grid-cols-2">
              {dayEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  highlight={terms}
                  channelColor={showChannelColor ? channelMap.get(event.channelId)?.color : undefined}
                  onClick={() => onSelectEvent(event)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {hasNextPage && !isLoading && (
        <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-4 text-sm text-muted">
          {isFetchingNextPage ? (
            <span className="flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              読み込み中…
            </span>
          ) : (
            <button
              onClick={onLoadMore}
              className="rounded-full border border-line bg-surface/80 px-5 py-2 font-medium text-ink transition hover:bg-surface"
            >
              さらに読み込む({events.length.toLocaleString()} / {total?.toLocaleString()} 件)
            </button>
          )}
        </div>
      )}
      {!hasNextPage && !isLoading && events.length > 0 && (
        <p className="py-4 text-center text-xs text-muted">すべての結果を表示しました</p>
      )}
    </div>
  );
}
