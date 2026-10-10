import type { RequestBudget } from './budget';

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
  status?: { privacyStatus?: 'public' | 'unlisted' | 'private' };
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

interface YtCommentThread {
  snippet: { topLevelComment: { id: string; snippet: { authorDisplayName: string; textDisplay: string } } };
}

export interface YtComment {
  id: string;
  author: string;
  text: string;
}

export interface YtPlaylist {
  id: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string | null;
  itemCount: number;
}

export interface YtPlaylistItemsPage {
  items: { videoId: string; position: number; addedAt: string }[];
  nextPageToken?: string;
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

/** 1 回の実行で使えるサブリクエストの予算を使い切った */
export class RequestBudgetExceededError extends Error {}

/**
 * YouTube への外部リクエスト(API・RSS・/shorts の確認)をまとめて行い、予算に数える。
 * Workers は 1 回の実行で出せるサブリクエスト数に上限があるため、予算を超えるリクエストはエラーにする
 */
export class YouTubeClient {
  private readonly apiKey: string;
  private readonly budget: RequestBudget;

  constructor(apiKey: string, budget: RequestBudget) {
    this.apiKey = apiKey;
    this.budget = budget;
  }

  private async request(input: string | URL, init?: RequestInit): Promise<Response> {
    if (this.budget.remaining <= 0) throw new RequestBudgetExceededError('request budget exceeded');
    this.budget.take();
    return fetch(input, init);
  }

  private async get<T>(resource: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}/${resource}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('key', this.apiKey);

    const res = await this.request(url);
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
  /** チャンネルの公開の再生リスト(全ページ)。1 unit / 50 件 */
  async listChannelPlaylists(channelId: string): Promise<YtPlaylist[]> {
    const lists: YtPlaylist[] = [];
    let pageToken: string | undefined;
    do {
      const data = await this.get<{
        items?: {
          id: string;
          snippet: { title: string; publishedAt: string; thumbnails: Partial<Record<'medium' | 'default', YtThumbnail>> };
          contentDetails: { itemCount: number };
        }[];
        nextPageToken?: string;
      }>('playlists', {
        part: 'snippet,contentDetails',
        channelId,
        maxResults: '50',
        ...(pageToken ? { pageToken } : {}),
      });
      for (const p of data.items ?? []) {
        lists.push({
          id: p.id,
          title: p.snippet.title,
          publishedAt: p.snippet.publishedAt,
          thumbnailUrl: p.snippet.thumbnails.medium?.url ?? p.snippet.thumbnails.default?.url ?? null,
          itemCount: p.contentDetails.itemCount,
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    return lists;
  }

  /** 再生リストの中身の 1 ページ(並び順と追加日時つき)。1 unit / 50 件。再生リストが無ければ null */
  async listPlaylistItems(playlistId: string, pageToken?: string): Promise<YtPlaylistItemsPage | null> {
    try {
      const data = await this.get<{
        items?: { snippet: { position: number; publishedAt: string }; contentDetails: { videoId: string } }[];
        nextPageToken?: string;
      }>('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId,
        maxResults: '50',
        ...(pageToken ? { pageToken } : {}),
      });
      return {
        items: (data.items ?? []).map((i) => ({
          videoId: i.contentDetails.videoId,
          position: i.snippet.position,
          addedAt: i.snippet.publishedAt,
        })),
        nextPageToken: data.nextPageToken,
      };
    } catch (err) {
      // 再生リストが消えた・非公開になった場合は中身なしとして扱う(同じ再生リストで失敗し続けないように)。
      // クォータ超過の 403 だけは、次回に読み直す
      const gone =
        err instanceof YouTubeApiError &&
        (err.status === 404 || (err.status === 403 && !err.message.includes('quotaExceeded')));
      if (gone) return null;
      throw err;
    }
  }

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

  /**
   * 関連性順のコメント(返信は含まない)。1 unit。固定コメントがあれば先頭に来る。
   * コメントが無効・動画が見つからない場合は null
   */
  async getTopComments(videoId: string, max: number): Promise<YtComment[] | null> {
    try {
      const data = await this.get<{ items?: YtCommentThread[] }>('commentThreads', {
        part: 'snippet',
        videoId,
        order: 'relevance',
        maxResults: String(max),
        textFormat: 'plainText',
      });
      return (data.items ?? []).map((t) => ({
        id: t.snippet.topLevelComment.id,
        author: t.snippet.topLevelComment.snippet.authorDisplayName,
        text: t.snippet.topLevelComment.snippet.textDisplay,
      }));
    } catch (err) {
      // 403 はクォータ超過などでも返るので、コメントが無効な場合(commentsDisabled)だけを見分ける
      const disabled = err instanceof YouTubeApiError && err.status === 403 && err.message.includes('commentsDisabled');
      if (disabled || (err instanceof YouTubeApiError && err.status === 404)) return null;
      throw err;
    }
  }

  /** 1 unit / 50 件。非公開・削除済みの動画は結果に含まれない */
  async getVideos(ids: string[]): Promise<YtVideo[]> {
    const videos: YtVideo[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const data = await this.get<{ items?: YtVideo[] }>('videos', {
        part: 'snippet,contentDetails,liveStreamingDetails,status',
        id: ids.slice(i, i + 50).join(','),
        maxResults: '50',
      });
      videos.push(...(data.items ?? []));
    }
    return videos;
  }

  /** RSS フィードから最新 15 件の動画 ID を取得(クォータ消費なし) */
  async fetchRssVideoIds(channelId: string): Promise<string[]> {
    const res = await this.request(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
    const xml = await res.text();
    return [...xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].map((m) => m[1]);
  }

  /** UUSH プレイリストが使えない場合のフォールバック。/shorts/{id} がリダイレクトされなければショート */
  async isShortByUrl(videoId: string): Promise<boolean> {
    const res = await this.request(`https://www.youtube.com/shorts/${videoId}`, {
      method: 'HEAD',
      redirect: 'manual',
    });
    return res.status === 200;
  }
}

/** ISO 8601 の duration (PT1H2M3S) を秒に変換 */
export function parseDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, d = '0', h = '0', min = '0', s = '0'] = m;
  return Number(d) * 86400 + Number(h) * 3600 + Number(min) * 60 + Number(s);
}
