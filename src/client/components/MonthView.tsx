import clsx from 'clsx';
import { format, getDay, isSameMonth, isToday } from 'date-fns';
import { Crown } from 'lucide-react';
import type { CalendarEvent, Channel } from '../../shared/types';
import { WEEKDAY_LABELS, dayKey } from '../lib/calendar';
import { formatDayHeading, formatTime } from '../lib/format';
import { TYPE_META } from '../lib/meta';
import { LiveDot } from './Badges';

const MAX_CHIPS = 3;
const MAX_DOTS = 4;

interface Props {
  month: Date;
  days: Date[];
  byDay: Map<string, CalendarEvent[]>;
  channelMap: Map<string, Channel>;
  showChannelColor: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDay: (date: Date, events: CalendarEvent[]) => void;
}

const weekdayTone = (weekday: number) => (weekday === 0 ? 'text-sun' : weekday === 6 ? 'text-sat' : '');

export function MonthView({ month, days, byDay, channelMap, showChannelColor, onSelectEvent, onSelectDay }: Props) {
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface/80 shadow-[0_1px_0_var(--line),0_24px_48px_-24px_rgb(0_0_0/0.18)] backdrop-blur">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={label} className={clsx('py-3 text-center text-xs font-medium text-muted', weekdayTone(i))}>
            {label}
          </div>
        ))}
      </div>

      <div className="grid auto-rows-[minmax(4.5rem,1fr)] grid-cols-7 md:auto-rows-[minmax(8rem,1fr)]">
        {days.map((day) => {
          const events = byDay.get(dayKey(day)) ?? [];
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const hidden = events.length - MAX_CHIPS;

          return (
            <div
              key={day.toISOString()}
              className={clsx(
                'relative flex min-w-0 flex-col gap-1 border-r border-b border-line p-1.5 [&:nth-child(7n)]:border-r-0 md:p-2',
                !inMonth && 'bg-ink/[0.025]',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={clsx(
                    'grid size-7 place-items-center rounded-full text-xs font-medium tabular-nums',
                    today ? 'bg-ink text-canvas' : weekdayTone(getDay(day)),
                    !inMonth && !today && 'opacity-40',
                  )}
                >
                  {format(day, 'd')}
                </span>
              </div>

              {/* モバイル: 色の点のみ。セル全体をタップで日別リスト */}
              {events.length > 0 && (
                <button
                  className="absolute inset-0 md:hidden"
                  aria-label={`${formatDayHeading(day)} の ${events.length} 件を表示`}
                  onClick={() => onSelectDay(day, events)}
                />
              )}
              <div className="flex flex-wrap gap-1 px-1 md:hidden" aria-hidden>
                {events.slice(0, MAX_DOTS).map((e) => (
                  <span key={e.id} className={clsx('size-1.5 rounded-full', TYPE_META[e.type].dot)} />
                ))}
              </div>

              {/* デスクトップ: チップ */}
              <div className={clsx('hidden min-w-0 flex-col gap-1 md:flex', !inMonth && 'opacity-60')}>
                {events.slice(0, MAX_CHIPS).map((event) => (
                  <EventChip
                    key={event.id}
                    event={event}
                    channelColor={showChannelColor ? channelMap.get(event.channelId)?.color : undefined}
                    onClick={() => onSelectEvent(event)}
                  />
                ))}
                {hidden > 0 && (
                  <button
                    onClick={() => onSelectDay(day, events)}
                    className="rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-muted transition hover:bg-ink/5 hover:text-ink"
                  >
                    +{hidden} 件
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventChip({
  event,
  channelColor,
  onClick,
}: {
  event: CalendarEvent;
  channelColor?: string;
  onClick: () => void;
}) {
  const meta = TYPE_META[event.type];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      title={event.title}
      style={channelColor ? { boxShadow: `inset 3px 0 0 ${channelColor}` } : undefined}
      className={clsx(
        'flex w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-[11px] leading-tight transition',
        meta.chip,
        event.liveStatus === 'upcoming' && 'border border-dashed border-live/50 bg-transparent',
        event.liveStatus === 'live' && 'ring-1 ring-live',
      )}
    >
      {event.liveStatus === 'live' ? <LiveDot /> : <Icon className="size-3 shrink-0" aria-hidden />}
      <span className="shrink-0 tabular-nums opacity-75">{formatTime(event.eventAt)}</span>
      {event.membersOnly && <Crown className="size-3 shrink-0 text-member" aria-label="メンバー限定" />}
      <span className="truncate font-medium text-ink/85">{event.title}</span>
    </button>
  );
}
