import clsx from 'clsx';
import { format, isSameMonth, isToday, parseISO, startOfDay } from 'date-fns';
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

  // 今月を開いたときにスクロールする先: 今日、今日に予定が無ければ今日より後の最初の日(無ければ最後の日)
  const now = new Date();
  const anchorIndex = isSameMonth(month, now)
    ? (() => {
        const i = days.findIndex(({ date }) => date >= startOfDay(now));
        return i === -1 ? days.length - 1 : i;
      })()
    : -1;
  const anchorKey = anchorIndex >= 0 ? format(days[anchorIndex].date, 'yyyy-MM-dd') : null;

  // 今月を開いたときは今日の位置までスクロールする。予定は表示のあとに届くので、スクロール先の日が
  // 描画されたときに 1 回だけ行う(同じ月で読み込み直しても、もう一度は動かさない)。
  // ページを開いた直後はスクロールした状態から見せたいので、最初の 1 回はアニメーションしない
  const scrolledFor = useRef<string | null>(null);
  const firstScroll = useRef(true);
  useEffect(() => {
    const monthKey = format(month, 'yyyy-MM');
    if (!anchorKey || scrolledFor.current === monthKey || !todayRef.current) return;
    scrolledFor.current = monthKey;
    todayRef.current.scrollIntoView({ block: 'start', behavior: firstScroll.current ? 'auto' : 'smooth' });
    firstScroll.current = false;
  }, [month, anchorKey]);

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
      {days.map(({ date, events }, i) => {
        const today = isToday(date);
        return (
          <section key={date.toISOString()} ref={i === anchorIndex ? todayRef : undefined} className="scroll-mt-20">
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
