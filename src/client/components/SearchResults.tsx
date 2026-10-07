import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { SearchX } from 'lucide-react';
import { useMemo } from 'react';
import type { CalendarEvent, Channel, VideoType } from '../../shared/types';
import { dayKey } from '../lib/calendar';
import { EventRow } from './EventRow';
import { TypeFilters } from './Toolbar';

interface Props {
  query: string;
  terms: string[];
  /** チャンネルの絞り込みを適用済みの検索結果(新しい順) */
  events: CalendarEvent[];
  hasMore: boolean;
  isLoading: boolean;
  isError: boolean;
  types: ReadonlySet<VideoType>;
  onToggleType: (type: VideoType) => void;
  channelMap: Map<string, Channel>;
  showChannelColor: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
}

/** キーワード検索の結果。期間をまたぐので、年付きの日付ごとに新しい順で並べる */
export function SearchResults({
  query,
  terms,
  events,
  hasMore,
  isLoading,
  isError,
  types,
  onToggleType,
  channelMap,
  showChannelColor,
  onSelectEvent,
}: Props) {
  const counts = useMemo(() => {
    const result: Record<VideoType, number> = { live: 0, video: 0, short: 0 };
    for (const e of events) result[e.type]++;
    return result;
  }, [events]);

  const days = useMemo(() => {
    const groups: { key: string; date: Date; events: CalendarEvent[] }[] = [];
    for (const event of events) {
      if (!types.has(event.type)) continue;
      const date = new Date(event.eventAt);
      const key = dayKey(date);
      const last = groups.at(-1);
      if (last?.key === key) last.events.push(event);
      else groups.push({ key, date, events: [event] });
    }
    return groups;
  }, [events, types]);

  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium tracking-widest text-muted">SEARCH</p>
          <h1 className="mt-1 text-2xl leading-snug font-semibold break-all sm:text-3xl">「{query}」の検索結果</h1>
          <p className="mt-1 text-sm text-muted tabular-nums">
            {isLoading ? '検索中…' : `${events.length} 件${hasMore ? '(新しいものから表示しています)' : ''}`}
          </p>
        </div>
        <TypeFilters types={types} counts={counts} onToggle={onToggleType} />
      </div>

      {isError && (
        <p className="rounded-2xl border border-live/30 bg-live/10 px-4 py-3 text-sm text-live">
          検索できませんでした。時間をおいて再度お試しください。
        </p>
      )}

      {!isLoading && !isError && days.length === 0 && (
        <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-line py-24 text-muted">
          <SearchX className="size-8" aria-hidden />
          <p className="text-sm">一致する動画・配信はありません</p>
        </div>
      )}

      <div className="flex flex-col gap-8">
        {days.map(({ key, date, events: dayEvents }) => (
          <section key={key}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              {format(date, 'yyyy年M月d日 (E)', { locale: ja })}
              <span className="ml-auto text-xs font-normal text-muted tabular-nums">{dayEvents.length} 件</span>
            </h2>
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
    </div>
  );
}
