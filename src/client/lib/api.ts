import { queryOptions } from '@tanstack/react-query';
import type { CalendarEvent, Channel } from '../../shared/types';

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
