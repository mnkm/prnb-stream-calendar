import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { CalendarEvent } from '../../shared/types';

const WEEK_OPTIONS = { weekStartsOn: 0 } as const; // 日曜始まり

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

/** 月表示グリッド(前後の週を含む 5〜6 週)の日付と、取得範囲 [start, end) */
export function monthGrid(month: Date) {
  const start = startOfWeek(startOfMonth(month), WEEK_OPTIONS);
  const last = endOfWeek(endOfMonth(month), WEEK_OPTIONS);
  return {
    days: eachDayOfInterval({ start, end: last }),
    start,
    end: addDays(startOfDay(last), 1),
  };
}

export const dayKey = (date: Date) => format(date, 'yyyy-MM-dd');

export function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dayKey(new Date(event.eventAt));
    const list = map.get(key);
    if (list) list.push(event);
    else map.set(key, [event]);
  }
  return map;
}

export function parseMonthParam(value: string | null): Date | null {
  if (!value) return null;
  const date = parse(value, 'yyyy-MM', new Date());
  return isValid(date) ? startOfMonth(date) : null;
}
