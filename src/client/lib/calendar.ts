import {
  addDays,
  addMonths,
  addWeeks,
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

export type ViewMode = 'month' | 'week' | 'day' | 'list';
export const VIEW_MODES: readonly ViewMode[] = ['month', 'week', 'day', 'list'];

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

/** 週表示の 7 日間 */
export function weekDays(date: Date): Date[] {
  const start = startOfWeek(date, WEEK_OPTIONS);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 表示中の期間 [start, end)。種別ごとの件数の集計に使う */
export function periodRange(view: ViewMode, date: Date): { start: Date; end: Date } {
  switch (view) {
    case 'week': {
      const start = startOfWeek(date, WEEK_OPTIONS);
      return { start, end: addDays(start, 7) };
    }
    case 'day': {
      const start = startOfDay(date);
      return { start, end: addDays(start, 1) };
    }
    default: {
      const start = startOfMonth(date);
      return { start, end: addMonths(start, 1) };
    }
  }
}

/** 前後ボタンで 1 単位(月・週・日)移動する */
export function shiftPeriod(view: ViewMode, date: Date, delta: number): Date {
  if (view === 'week') return addWeeks(date, delta);
  if (view === 'day') return addDays(date, delta);
  return addMonths(date, delta);
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

/** URL の date (yyyy-MM-dd)。以前の形式の month (yyyy-MM) も受け付ける */
export function parseDateParam(params: URLSearchParams): Date | null {
  for (const [key, pattern] of [['date', 'yyyy-MM-dd'], ['month', 'yyyy-MM']] as const) {
    const value = params.get(key);
    if (!value) continue;
    const date = parse(value, pattern, new Date());
    if (isValid(date)) return startOfDay(date);
  }
  return null;
}

export function parseViewParam(value: string | null): ViewMode | null {
  return VIEW_MODES.find((v) => v === value) ?? null;
}
