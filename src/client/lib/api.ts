import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { type CalendarEvent, type Channel, type SearchPage, VIDEO_TYPES, type VideoType } from '../../shared/types';

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

/** キーワード検索。50 件ずつ取り、続きは前のページの nextCursor で取る */
export const searchQuery = (q: string, types: VideoType[], channelIds: string[]) =>
  infiniteQueryOptions({
    queryKey: ['search', q, types, channelIds],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ q });
      // 全種別・全チャンネルのときは絞り込まない
      if (types.length < VIDEO_TYPES.length) params.set('types', types.join(','));
      if (channelIds.length > 0) params.set('channels', channelIds.join(','));
      if (pageParam) params.set('cursor', pageParam);
      return getJson<SearchPage>(`/api/search?${params}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 60_000,
  });
