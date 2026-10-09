import clsx from 'clsx';
import { isSameMonth, isToday, parseISO } from 'date-fns';
import { CalendarX2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { CalendarEvent, Channel } from '../../shared/types';
import { formatDayHeading } from '../lib/format';
import { EventRow } from './EventRow';

interface Props {
  month: Date;
  byDay: Map<string, CalendarEvent[]>;
  channelMap: Map<string, Channel>;
  showChannelColor: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
}

export function ListView({ month, byDay, channelMap, showChannelColor, onSelectEvent }: Props) {
  const todayRef = useRef<HTMLElement>(null);
  const days = [...byDay.entries()]
    .map(([key, events]) => ({ date: parseISO(key), events }))
    .filter(({ date }) => isSameMonth(date, month))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // 今月を開いたときは今日の位置までスクロール
  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [month]);

  if (days.length === 0) {
    return (
      <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-line py-24 text-muted">
        <CalendarX2 className="size-8" aria-hidden />
        <p className="text-sm">この月の動画・配信はありません</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {days.map(({ date, events }) => {
        const today = isToday(date);
        return (
          <section key={date.toISOString()} ref={today ? todayRef : undefined} className="scroll-mt-20">
            <h2 className="sticky top-[61px] z-10 -mx-1 mb-3 flex items-center gap-2 bg-canvas/80 px-1 py-2 text-sm font-semibold backdrop-blur">
              <span className={clsx(today && 'rounded-full bg-ink px-2.5 py-0.5 text-canvas')}>
                {formatDayHeading(date)}
              </span>
              {today && <span className="text-xs font-medium text-muted">今日</span>}
              <span className="ml-auto text-xs font-normal text-muted tabular-nums">{events.length} 件</span>
            </h2>
            <div className="grid gap-2.5 lg:grid-cols-2">
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  channelColor={showChannelColor ? channelMap.get(event.channelId)?.color : undefined}
                  onClick={() => onSelectEvent(event)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
