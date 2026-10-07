import { queryOptions } from '@tanstack/react-query';
import type { CalendarEvent, Channel, SearchResult } from '../../shared/types';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export const channelsQuery = queryOptions({
  queryKey: ['channels'],
  queryFn: () => getJson<Channel[]>('/api/channels'),
  staleTime: 5 * 60_000,
});

export const eventsQuery = (from: Date, to: Date) =>
  queryOptions({
    queryKey: ['events', from.toISOString(), to.toISOString()],
    queryFn: () =>
      getJson<CalendarEvent[]>(
        `/api/events?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`,
      ),
    staleTime: 60_000,
  });

export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ['search', q],
    queryFn: () => getJson<SearchResult>(`/api/search?${new URLSearchParams({ q })}`),
    staleTime: 60_000,
  });

/** 検索語をサーバーと同じ規則(空白・全角空白区切り)で分ける。結果の強調表示に使う */
export const splitSearchTerms = (q: string) => q.split(/[\s　]+/).filter(Boolean);
