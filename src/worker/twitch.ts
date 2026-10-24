import { type RequestBudget, budgetedFetch } from './budget';

const API_BASE = 'https://api.twitch.tv/helix';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
/** サムネイルの URL に入れる大きさ(16:9) */
const THUMBNAIL_SIZE = '640x360';

/** 配信中のライブ */
export interface TwStream {
  /** 配信(stream)の ID。アーカイブの streamId と同じ */
  id: string;
  userLogin: string;
  title: string;
  startedAt: string;
  thumbnailUrl: string | null;
}

/** 過去の配信のアーカイブ */
export interface TwArchive {
  /** 動画の ID */
  id: string;
  /** 元の配信(stream)の ID */
  streamId: string | null;
  title: string;
  createdAt: string;
  /** 配信中はまだ用意されていないので null */
  thumbnailUrl: string | null;
  durationSec: number | null;
}

/** 視聴者などが作ったクリップ */
export interface TwClip {
  id: string;
  /** 元のアーカイブの動画 ID。アーカイブが無い(保存されていない・公開が終わった)場合は空 */
  videoId: string;
  title: string;
  creatorName: string | null;
  viewCount: number;
  durationSec: number | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

export class TwitchApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Twitch API(Helix)へのリクエストをまとめて行い、予算に数える。公開情報だけを読むので、アプリ用のトークンを使う */
export class TwitchClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly budget: RequestBudget;
  private token: string | null = null;

  constructor(clientId: string, clientSecret: string, budget: RequestBudget) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.budget = budget;
  }

  setToken(token: string) {
    this.token = token;
  }

  private request(input: string | URL, init?: RequestInit): Promise<Response> {
    return budgetedFetch(this.budget, input, init);
  }

  /** アプリ用のアクセストークンを取り直す(このクライアントにも設定する) */
  async fetchAppToken(): Promise<{ accessToken: string; expiresInSec: number }> {
    const res = await this.request(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    if (!res.ok) throw new TwitchApiError(res.status, `Twitch token failed: ${res.status} ${await res.text()}`);
    const data = await res.json<{ access_token: string; expires_in: number }>();
    this.token = data.access_token;
    return { accessToken: data.access_token, expiresInSec: data.expires_in };
  }

  private async get<T>(resource: string, params: [string, string][]): Promise<T> {
    if (!this.token) throw new Error('Twitch token is not set');
    const url = new URL(`${API_BASE}/${resource}`);
    for (const [key, value] of params) url.searchParams.append(key, value);
    const res = await this.request(url, {
      headers: { 'Client-Id': this.clientId, Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new TwitchApiError(res.status, `Twitch ${resource} failed: ${res.status} ${await res.text()}`);
    return res.json<T>();
  }

  /** 配信中のライブ。全チャンネル分を 1 回で取る(100 チャンネルまで) */
  async getStreams(logins: string[]): Promise<TwStream[]> {
    const data = await this.get<{
      data: { id: string; user_login: string; title: string; started_at: string; thumbnail_url: string; type: string }[];
    }>('streams', [...logins.map((l): [string, string] => ['user_login', l]), ['first', '100']]);
    return data.data
      .filter((s) => s.type === 'live')
      .map((s) => ({
        id: s.id,
        userLogin: s.user_login.toLowerCase(),
        title: s.title,
        startedAt: s.started_at,
        thumbnailUrl: s.thumbnail_url ? s.thumbnail_url.replace('{width}x{height}', THUMBNAIL_SIZE) : null,
      }));
  }

  /** ログイン名からユーザー ID を調べる。見つからなければ null */
  async getUserId(login: string): Promise<string | null> {
    const data = await this.get<{ data: { id: string }[] }>('users', [['login', login]]);
    return data.data[0]?.id ?? null;
  }

  async getFollowerCount(userId: string): Promise<number> {
    const data = await this.get<{ total: number }>('channels/followers', [
      ['broadcaster_id', userId],
      ['first', '1'],
    ]);
    return data.total;
  }

  /** 過去の配信のアーカイブを新しい順に。hasMore は、まだ続きがあるかどうか */
  async listArchives(userId: string, first: number): Promise<{ archives: TwArchive[]; hasMore: boolean }> {
    const data = await this.get<{
      data: {
        id: string;
        stream_id: string | null;
        title: string;
        created_at: string;
        thumbnail_url: string;
        duration: string;
      }[];
      pagination?: { cursor?: string };
    }>('videos', [
      ['user_id', userId],
      ['type', 'archive'],
      ['first', String(first)],
    ]);
    return {
      archives: data.data.map((v) => ({
        id: v.id,
        streamId: v.stream_id,
        title: v.title,
        createdAt: v.created_at,
        // 配信中は空か、処理中を表す画像(_404)が返る
        thumbnailUrl:
          v.thumbnail_url && !v.thumbnail_url.includes('_404')
            ? v.thumbnail_url.replace('%{width}x%{height}', THUMBNAIL_SIZE)
            : null,
        durationSec: parseTwitchDuration(v.duration),
      })),
      // 最後のページでも続きの印(cursor)が返ることがあるので、求めた数だけ返ってきたときだけ「続きあり」とみなす
      hasMore: !!data.pagination?.cursor && data.data.length >= first,
    };
  }

  /** 渡したクリップのうち、今もあるものの ID(削除されたクリップは返ってこない)。100 件まで */
  async getExistingClipIds(ids: string[]): Promise<Set<string>> {
    const data = await this.get<{ data: { id: string }[] }>('clips', [
      ...ids.map((id): [string, string] => ['id', id]),
      ['first', '100'],
    ]);
    return new Set(data.data.map((c) => c.id));
  }

  /**
   * クリップを再生数の多い順に 100 件。startedAt を渡すと、その日時から 1 週間に作られたものだけ、
   * 渡さなければ全期間。cursor は続きを取るときに after に渡す値(最後なら null)
   */
  async listClips(
    userId: string,
    options: { startedAt?: string; after?: string },
  ): Promise<{ clips: TwClip[]; cursor: string | null }> {
    const params: [string, string][] = [
      ['broadcaster_id', userId],
      ['first', '100'],
    ];
    if (options.startedAt) params.push(['started_at', options.startedAt]);
    if (options.after) params.push(['after', options.after]);
    const data = await this.get<{
      data: {
        id: string;
        video_id: string;
        title: string;
        creator_name: string;
        view_count: number;
        duration: number;
        thumbnail_url: string;
        created_at: string;
      }[];
      pagination?: { cursor?: string };
    }>('clips', params);
    return {
      clips: data.data.map((c) => ({
        id: c.id,
        videoId: c.video_id ?? '',
        title: c.title,
        creatorName: c.creator_name || null,
        viewCount: c.view_count,
        durationSec: c.duration ?? null,
        thumbnailUrl: c.thumbnail_url || null,
        createdAt: c.created_at,
      })),
      cursor: data.pagination?.cursor ?? null,
    };
  }
}

/** Twitch の長さ(3h8m33s)を秒に変換 */
export function parseTwitchDuration(value: string | undefined): number | null {
  const m = value?.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !value) return null;
  const [, h = '0', min = '0', s = '0'] = m;
  return Number(h) * 3600 + Number(min) * 60 + Number(s);
}
