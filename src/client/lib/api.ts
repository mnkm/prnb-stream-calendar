import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
  type CalendarEvent,
  type Channel,
  type Clip,
  type ClipPage,
  type ClipSort,
  type Playlist,
  type PlaylistDetail,
  type SearchPage,
  type Setlist,
  VIDEO_TYPES,
  type VideoType,
} from '../../shared/types';

/*
 * API のパスは、先頭に「/」を付けず、ページからの相対指定にする(「api/…」)。
 * このサイトはサブパス(https://mnkm.page/prnb-stream-calendar/)で配信されるので、「/api/…」だと
 * サイトのルートを指してしまう。理由は vite.config.ts の base を参照
 */
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export const channelsQuery = queryOptions({
  queryKey: ['channels'],
  queryFn: () => getJson<Channel[]>('api/channels'),
  staleTime: 60_000,
});

export const eventsQuery = (from: Date, to: Date) =>
  queryOptions({
    queryKey: ['events', from.toISOString(), to.toISOString()],
    queryFn: () =>
      getJson<CalendarEvent[]>(
        `api/events?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`,
      ),
    staleTime: 30_000,
  });

/** キーワード検索。50 件ずつ取り、続きは前のページの nextCursor で取る */
export const searchQuery = (q: string, types: VideoType[], channelIds: string[], includeTwitch: boolean) =>
  infiniteQueryOptions({
    queryKey: ['search', q, types, channelIds, includeTwitch],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ q });
      // 全種別・全チャンネルのときは絞り込まない
      if (types.length < VIDEO_TYPES.length) params.set('types', types.join(','));
      if (!includeTwitch) params.set('twitch', '0');
      if (channelIds.length > 0) params.set('channels', channelIds.join(','));
      if (pageParam) params.set('cursor', pageParam);
      return getJson<SearchPage>(`api/search?${params}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 60_000,
  });

/** 歌枠のセトリ。まだ見つかっていなければ null */
export const setlistQuery = (videoId: string) =>
  queryOptions({
    queryKey: ['setlist', videoId],
    queryFn: async () => {
      const res = await fetch(`api/setlist/${encodeURIComponent(videoId)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`api/setlist → ${res.status}`);
      return (await res.json()) as Setlist;
    },
    staleTime: 60_000,
    // 開いたままのタブに戻ったときに、あとから見つかったセトリが出るように
    refetchOnWindowFocus: true,
  });

const enc = encodeURIComponent;

/** チャンネルの再生リスト(おすすめが先頭) */
export const channelPlaylistsQuery = (channelId: string) =>
  queryOptions({
    queryKey: ['channel-playlists', channelId],
    queryFn: () => getJson<Playlist[]>(`api/channels/${enc(channelId)}/playlists`),
    staleTime: 60_000,
  });

/** 再生リストの中身 */
export const playlistQuery = (playlistId: string) =>
  queryOptions({
    queryKey: ['playlist', playlistId],
    queryFn: () => getJson<PlaylistDetail>(`api/playlists/${enc(playlistId)}`),
    staleTime: 60_000,
  });

/** Twitch の配信に結び付いたクリップ(再生数の多い順) */
export const eventClipsQuery = (eventId: string) =>
  queryOptions({
    queryKey: ['event-clips', eventId],
    queryFn: () => getJson<Clip[]>(`api/videos/${enc(eventId)}/clips`),
    staleTime: 60_000,
  });

/** チャンネルの Twitch のクリップ。30 件ずつ取り、続きは前のページの nextOffset で取る */
export const channelClipsQuery = (channelId: string, sort: ClipSort) =>
  infiniteQueryOptions({
    queryKey: ['channel-clips', channelId, sort],
    queryFn: ({ pageParam }) =>
      getJson<ClipPage>(`api/channels/${enc(channelId)}/clips?${new URLSearchParams({ sort, offset: String(pageParam) })}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 60_000,
  });

/** 動画が入っている再生リスト */
export const videoPlaylistsQuery = (videoId: string) =>
  queryOptions({
    queryKey: ['video-playlists', videoId],
    queryFn: () => getJson<Playlist[]>(`api/videos/${enc(videoId)}/playlists`),
    staleTime: 60_000,
  });
