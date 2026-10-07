const API_BASE = 'https://www.googleapis.com/youtube/v3';

/** ショート判定に使う時間の上限(2024 年 10 月以降、ショートは最大 3 分) */
export const SHORTS_MAX_DURATION_SEC = 180;

export interface YtThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface YtVideo {
  id: string;
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    liveBroadcastContent: 'live' | 'upcoming' | 'none';
    thumbnails: Partial<Record<'default' | 'medium' | 'high' | 'standard' | 'maxres', YtThumbnail>>;
  };
  contentDetails?: { duration?: string };
  liveStreamingDetails?: {
    scheduledStartTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
  };
}

export interface YtChannel {
  id: string;
  snippet: {
    title: string;
    description?: string;
    customUrl?: string;
    thumbnails: Partial<Record<'default' | 'medium' | 'high', YtThumbnail>>;
  };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
  brandingSettings?: { image?: { bannerExternalUrl?: string } };
}

export interface PlaylistPage {
  ids: string[];
  nextPageToken?: string;
}

export class YouTubeApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// チャンネル ID (UCxxxx) から各種システムプレイリスト ID を導出する。
// UU = 全アップロード(公式。メンバー限定は含まない)。UUSH = ショートのみ、
// UULF = 「動画」タブ(プレミア公開を含み、ライブは含まない)、UUMO = メンバー限定のすべて、
// UUMF = メンバー限定の動画(プレミア公開を含む)。UU 以外は非公式だが広く使われている。
export const uploadsPlaylistId = (channelId: string) => `UU${channelId.slice(2)}`;
export const shortsPlaylistId = (channelId: string) => `UUSH${channelId.slice(2)}`;
export const videosPlaylistId = (channelId: string) => `UULF${channelId.slice(2)}`;
export const membersPlaylistId = (channelId: string) => `UUMO${channelId.slice(2)}`;
export const membersVideosPlaylistId = (channelId: string) => `UUMF${channelId.slice(2)}`;

export class YouTubeClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async get<T>(resource: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}/${resource}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('key', this.apiKey);

    const res = await fetch(url);
    if (!res.ok) {
      throw new YouTubeApiError(res.status, `YouTube ${resource} failed: ${res.status} ${await res.text()}`);
    }
    return res.json<T>();
  }

  /** 1 unit */
  async getChannel(channelId: string): Promise<YtChannel | null> {
    const data = await this.get<{ items?: YtChannel[] }>('channels', {
      part: 'snippet,statistics,brandingSettings',
      id: channelId,
    });
    return data.items?.[0] ?? null;
  }

  /** 1 unit / ページ (最大 50 件)。プレイリストが存在しなければ null */
  async listPlaylistPage(playlistId: string, pageToken?: string): Promise<PlaylistPage | null> {
    try {
      const data = await this.get<{
        items?: { contentDetails: { videoId: string } }[];
        nextPageToken?: string;
      }>('playlistItems', {
        part: 'contentDetails',
        playlistId,
        maxResults: '50',
        ...(pageToken ? { pageToken } : {}),
      });
      return {
        ids: (data.items ?? []).map((item) => item.contentDetails.videoId),
        nextPageToken: data.nextPageToken,
      };
    } catch (err) {
      if (err instanceof YouTubeApiError && err.status === 404) return null;
      throw err;
    }
  }

  /** 1 unit / 50 件。非公開・削除済みの動画は結果に含まれない */
  async getVideos(ids: string[]): Promise<YtVideo[]> {
    const videos: YtVideo[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const data = await this.get<{ items?: YtVideo[] }>('videos', {
        part: 'snippet,contentDetails,liveStreamingDetails',
        id: ids.slice(i, i + 50).join(','),
        maxResults: '50',
      });
      videos.push(...(data.items ?? []));
    }
    return videos;
  }
}

/** RSS フィードから最新 15 件の動画 ID を取得(クォータ消費なし) */
export async function fetchRssVideoIds(channelId: string): Promise<string[]> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].map((m) => m[1]);
}

/** UUSH プレイリストが使えない場合のフォールバック。/shorts/{id} がリダイレクトされなければショート */
export async function isShortByUrl(videoId: string): Promise<boolean> {
  const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, { method: 'HEAD', redirect: 'manual' });
  return res.status === 200;
}

/** ISO 8601 の duration (PT1H2M3S) を秒に変換 */
export function parseDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, d = '0', h = '0', min = '0', s = '0'] = m;
  return Number(d) * 86400 + Number(h) * 3600 + Number(min) * 60 + Number(s);
}
