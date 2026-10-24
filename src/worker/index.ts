import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';
import { splitSearchTerms } from '../shared/search';
import { type ClipSort, VIDEO_TYPES, type VideoType } from '../shared/types';
import {
  type EventQuery,
  type SearchQuery,
  type VideoListQuery,
  getPlaylistDetail,
  getSetlist,
  listChannelClips,
  listChannelPlaylists,
  listEventClips,
  listEnabledChannels,
  listVideoPlaylists,
  listVideos,
  queryEvents,
  searchEvents,
  toChannel,
} from './db';
import { FULL_SYNC_INTERVAL_MS, syncAll, syncLiveStatus } from './sync';
import { toIsoSeconds } from './time';

type Bindings = Env & {
  YOUTUBE_API_KEY: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  ADMIN_TOKEN?: string;
  GITHUB_TOKEN?: string;
};

const MAX_RANGE_MS = 100 * 24 * 60 * 60 * 1000;
const RANGE_STEP_MS = 15 * 60 * 1000;
const MAX_CHANNEL_FILTER = 20;
/** 絞り込みに渡せるチャンネル ID の長さの上限(YouTube のチャンネル ID は 24 文字) */
const MAX_ID_LENGTH = 64;
const SEARCH_PAGE_SIZE = 50;
/** 動画の一覧の 1 ページの件数(既定で、limit の上限でもある) */
const VIDEO_LIST_PAGE_SIZE = 50;
const MAX_SEARCH_TERMS = 5;
const MAX_SEARCH_TERM_LENGTH = 50;
/** 検索語に分ける前の長さの上限(MAX_SEARCH_TERMS 個の語と、あいだの空白が入る長さ) */
const MAX_SEARCH_QUERY_LENGTH = 300;
/** cursor の形(db.ts の encodeCursor が作る「日時~ID」)。これ以外は、最初のページとして扱う */
const CURSOR_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z~[\w:-]{1,64}$/;
const EVENT_CLIPS_LIMIT = 50;
const CLIPS_PAGE_SIZE = 30;
/** クリップの一覧でさかのぼれる位置の上限(データベースが読む行数は offset に比例するので、際限なく大きくさせない) */
const MAX_CLIPS_OFFSET = 3000;

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

/**
 * レート制限で数える単位。IPv4 はアドレスごと、IPv6 は 1 つの回線に割り当てられる /64 ごと
 * (アドレスごとに数えると、1 つの回線からアドレスを変えるだけで制限を抜けられる)
 */
function clientKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  // IPv4 を IPv6 の形で書いたもの(::ffff:1.2.3.4)は、IPv4 のアドレスごとに数える
  // (/64 にまとめると、この形のアドレスがすべて同じ「0:0:0:0」として数えられてしまう)
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  const [head, tail] = ip.split('::');
  const first = head ? head.split(':') : [];
  const last = tail ? tail.split(':') : [];
  const groups = tail === undefined ? first : [...first, ...Array(Math.max(0, 8 - first.length - last.length)).fill('0'), ...last];
  return groups
    .slice(0, 4)
    .map((g) => (Number.parseInt(g, 16) || 0).toString(16))
    .join(':');
}

/**
 * 1 つの IP から 1 分間に受け付ける回数を制限する(回数は wrangler.jsonc の ratelimits)。
 * バインディングが無い環境(プレビュー)では制限しない
 */
const rateLimit = (pick: (env: Bindings) => RateLimit | undefined): MiddlewareHandler<{ Bindings: Bindings }> =>
  async (c, next) => {
    const limiter = pick(c.env);
    if (limiter) {
      const { success } = await limiter.limit({ key: clientKey(c.req.header('CF-Connecting-IP')) });
      if (!success) return c.json({ error: 'too many requests' }, 429, { 'Retry-After': '60' });
    }
    await next();
  };

/**
 * 応答を Cloudflare のキャッシュに seconds 秒だけ置く。同じ内容の問い合わせは、Worker の中でも
 * データベースを読まずに返す。キーは問い合わせの内容をそろえたものだけで作り、URL の書き方やヘッダーは見ない
 * (順番を変える・ヘッダーを足すなど、内容が同じまま書き方だけを変えても、キャッシュを避けられない)。
 * 内容そのものを変えればキーは変わるので、キャッシュに無い問い合わせの回数はレート制限で抑える。
 *
 * 使うのは検索と動画の一覧だけ。検索はデータベースを全件読むので、同じ検索の繰り返しを安く防げる。検索結果が少し古くても、
 * 同期の結果が画面に出る速さには響きにくい。動画の一覧は、終わった配信と公開済みの動画だけを返すので、少し古くても困らない。
 * 予定やセトリなどは、反映が遅れないよう、ここには置かない。
 *
 * 応答の Cache-Control は、ルートではなくここで付ける(キャッシュに置く期間と、ブラウザが持つ期間を同じにする)。
 * キャッシュから返すときにも付け直す。独自ドメイン(mnkm.page)では、キャッシュから出てきた応答の Cache-Control が
 * 4 時間(ゾーンの設定のブラウザ キャッシュ TTL の既定値と思われる)に変わっていて、そのまま返すと、ブラウザが検索結果を
 * 4 時間使い回してしまう。Age は残すので、ブラウザが持つのは、キャッシュに置いてから数えて seconds 秒まで
 */
const cached = (seconds: number, key: (c: Context<{ Bindings: Bindings }>) => string): MiddlewareHandler<{ Bindings: Bindings }> =>
  async (c, next) => {
    const cacheControl = `public, max-age=${seconds}`;
    const cache = await caches.open('api');
    // パスは、書かれたままではなくルートの形(/api/setlist/:id など)を使う(「:」を「%3A」と書いても同じキーになる)
    const cacheKey = `${new URL(c.req.url).origin}${routePath(c)}?key=${encodeURIComponent(key(c))}`;
    const hit = await cache.match(cacheKey);
    if (hit) {
      // キャッシュから出てきた応答のヘッダーは書き換えられないので、作り直す
      const res = new Response(hit.body, hit);
      res.headers.set('Cache-Control', cacheControl);
      return res;
    }
    await next();
    if (c.res.status !== 200) return;
    c.res.headers.set('Cache-Control', cacheControl);
    c.executionCtx.waitUntil(cache.put(cacheKey, c.res.clone()));
  };

/** パスの ID の形(YouTube の動画・チャンネル・再生リストの ID と、Twitch の配信の「twitch:数字」) */
const ID_FORMAT = /^[\w:-]{1,64}$/;

/** パスの ID が ID の形でなければ、データベースを見ずに 404 を返す */
const validId: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  if (!ID_FORMAT.test(c.req.param('id') ?? '')) return c.json({ error: 'not found' }, 404);
  await next();
};

app.use('*', rateLimit((env) => env.API_LIMITER));

app.get('/channels', async (c) => {
  const rows = await listEnabledChannels(c.env.DB);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(rows.map(toChannel));
});

/** /events の問い合わせ。正しくなければ、返すエラーの文 */
function parseEventQuery(c: Context): EventQuery | string {
  const from = parseDate(c.req.query('from'));
  const to = parseDate(c.req.query('to'));
  if (!from || !to || to <= from) return 'from / to must be ISO 8601 dates with from < to';
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) return 'range must be 100 days or less';
  // 15 分単位に広げる(問い合わせの種類を増やしすぎないように)。画面が送るのは各地の 0 時で、
  // どのタイムゾーンでも UTC の 15 分単位になるので、画面からの問い合わせの結果は変わらない
  return {
    from: toIsoSeconds(new Date(Math.floor(from.getTime() / RANGE_STEP_MS) * RANGE_STEP_MS)),
    to: toIsoSeconds(new Date(Math.ceil(to.getTime() / RANGE_STEP_MS) * RANGE_STEP_MS)),
    channelIds: parseIdList(c.req.query('channels')),
    types: parseTypes(c.req.query('types')),
  };
}

app.get(
  '/events',
  async (c) => {
    const query = parseEventQuery(c);
    if (typeof query === 'string') return c.json({ error: query }, 400);
    const events = await queryEvents(c.env.DB, query);
    // 開いたままの画面は 1 分ごとに取り直す(src/client/App.tsx)。その取り直しがブラウザのキャッシュで済まされないよう、短くする
    c.header('Cache-Control', 'public, max-age=30');
    return c.json(events);
  },
);

/** /search の問い合わせ。検索語が無ければ null */
function parseSearchQuery(c: Context): SearchQuery | null {
  // 語は「すべて含む」で探すので、順番と重なりは結果に関係しない。そろえてから使う(同じ検索を同じキャッシュにまとめる)
  const terms = unique(
    splitSearchTerms((c.req.query('q') ?? '').slice(0, MAX_SEARCH_QUERY_LENGTH))
      .slice(0, MAX_SEARCH_TERMS)
      .map((t) => t.slice(0, MAX_SEARCH_TERM_LENGTH)),
  );
  if (terms.length === 0) return null;
  const cursor = c.req.query('cursor');
  return {
    terms,
    channelIds: parseIdList(c.req.query('channels')),
    types: parseTypes(c.req.query('types')),
    includeTwitch: c.req.query('twitch') !== '0',
    cursor: cursor && CURSOR_FORMAT.test(cursor) ? cursor : null,
    limit: SEARCH_PAGE_SIZE,
  };
}

/**
 * キーワード検索。スペース(全角も可)で区切った語をすべて含むタイトルを、期間に関係なく新しい順に返す。
 * 全角・半角、英字の大文字・小文字は区別しない。50 件ずつ返し、続きは cursor に nextCursor を渡して取る。
 * twitch=0 を付けると、Twitch の配信を除く。
 * 検索はデータベースを全件読むので、キャッシュに無い検索は、ほかの API より少ない回数に制限する
 */
app.get(
  '/search',
  cached(60, (c) => JSON.stringify(parseSearchQuery(c))),
  rateLimit((env) => env.SEARCH_LIMITER),
  async (c) => {
    const query = parseSearchQuery(c);
    if (!query) return c.json({ error: 'q is required' }, 400);
    // Cache-Control は cached が付ける
    return c.json(await searchEvents(c.env.DB, query));
  },
);

/**
 * /videos の問い合わせ。正しくない値は既定の値にそろえる(エラーにはしない。書き方だけが違う問い合わせを同じキャッシュにまとめる)。
 * before は丸めない(/events のように 15 分単位に広げると、「その日時より前」より新しいものまで返ってしまう)
 */
function parseVideoListQuery(c: Context): VideoListQuery {
  const members = c.req.query('members');
  const limit = Number(c.req.query('limit'));
  const before = parseDate(c.req.query('before'));
  const cursor = c.req.query('cursor');
  return {
    channelIds: parseIdList(c.req.query('channels')),
    types: parseTypes(c.req.query('types')),
    members: members === 'only' || members === 'exclude' ? members : 'all',
    before: before ? toIsoSeconds(before) : null,
    cursor: cursor && CURSOR_FORMAT.test(cursor) ? cursor : null,
    limit: Number.isInteger(limit) && limit >= 1 && limit <= VIDEO_LIST_PAGE_SIZE ? limit : VIDEO_LIST_PAGE_SIZE,
  };
}

/**
 * 動画の一覧。YouTube の、配信が終わったものと公開済みのものを、期間に関係なく新しい順に返す(キーワードは要らない)。
 * 配信予定・配信中と、再生できなくなったもの・限定公開は含めない。
 * channels・types で絞り込み、members=only / exclude でメンバー限定だけ / メンバー限定を除く。
 * before を付けると、その日時より前から返す。limit(1〜50、既定 50)件ずつ返し、続きは cursor に nextCursor を渡して取る
 */
app.get(
  '/videos',
  cached(60, (c) => JSON.stringify(parseVideoListQuery(c))),
  async (c) => {
    // Cache-Control は cached が付ける
    return c.json(await listVideos(c.env.DB, parseVideoListQuery(c)));
  },
);

/** 歌枠のセトリ(コメントの原文と書き手)。まだ見つかっていなければ 404 */
app.get('/setlist/:id', validId, async (c) => {
  const setlist = await getSetlist(c.env.DB, c.req.param('id'));
  if (!setlist) return c.json({ error: 'not found' }, 404);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(setlist);
});

/** チャンネルの再生リスト(おすすめを先頭に、残りは最後に動画が追加された順) */
app.get('/channels/:id/playlists', validId, async (c) => {
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(await listChannelPlaylists(c.env.DB, c.req.param('id')));
});

/** 再生リストの中身(このカレンダーに登録済みの動画だけ、再生リストの並び順) */
app.get('/playlists/:id', validId, async (c) => {
  const detail = await getPlaylistDetail(c.env.DB, c.req.param('id'));
  if (!detail) return c.json({ error: 'not found' }, 404);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(detail);
});

/** 動画が入っている再生リスト */
app.get('/videos/:id/playlists', validId, async (c) => {
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(await listVideoPlaylists(c.env.DB, c.req.param('id')));
});

/** Twitch の配信に結び付いたクリップ(再生数の多い順) */
app.get('/videos/:id/clips', validId, async (c) => {
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(await listEventClips(c.env.DB, c.req.param('id'), EVENT_CLIPS_LIMIT));
});

/** チャンネルの Twitch のクリップ。sort は popular(再生数の多い順)か new(新しい順)。続きは offset に nextOffset を渡して取る */
app.get('/channels/:id/clips', validId, async (c) => {
  const sort: ClipSort = c.req.query('sort') === 'new' ? 'new' : 'popular';
  const offset = Number(c.req.query('offset') ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_CLIPS_OFFSET) {
    return c.json({ error: `offset must be an integer from 0 to ${MAX_CLIPS_OFFSET}` }, 400);
  }
  const page = await listChannelClips(c.env.DB, c.req.param('id'), sort, offset, CLIPS_PAGE_SIZE);
  c.header('Cache-Control', 'public, max-age=60');
  // 上限より先は続きを出さない(画面が、受け付けない offset を問い合わせないように)
  return c.json(page.nextOffset !== null && page.nextOffset > MAX_CLIPS_OFFSET ? { ...page, nextOffset: null } : page);
});

/** 手動同期(初回の取り込みや動作確認用)。Authorization: Bearer <ADMIN_TOKEN> */
app.post('/admin/sync', async (c) => {
  const token = c.env.ADMIN_TOKEN;
  if (!token || !(await sameText(c.req.header('Authorization') ?? '', `Bearer ${token}`))) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return c.json(await syncAll(c.env));
});

/** 2 つの文字列が同じか。ハッシュにしてから、かかる時間が中身によらない比べ方をする(時間の差からトークンを推測されないように) */
async function sameText(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', encoder.encode(s))));
  return crypto.subtle.timingSafeEqual(x, y);
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseList(value: string | undefined): string[] {
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function isVideoType(value: string): value is VideoType {
  return (VIDEO_TYPES as readonly string[]).includes(value);
}

/** 重なりを除いて並べる(順番や重なりだけが違う問い合わせを、同じキャッシュにまとめる) */
const unique = <T extends string>(values: T[]) => [...new Set(values)].sort();

const parseIdList = (value: string | undefined) =>
  unique(parseList(value).filter((id) => id.length <= MAX_ID_LENGTH)).slice(0, MAX_CHANNEL_FILTER);
const parseTypes = (value: string | undefined) => unique(parseList(value).filter(isVideoType));

export default {
  fetch: app.fetch,
  /**
   * Cron は毎分。5 分に 1 回(FULL_SYNC_INTERVAL_MS)は全体の同期、それ以外の回は、配信の開始・終了だけを見る軽い確認。
   * 終わるまで待つ(waitUntil に渡すだけだと、戻ったあとの時間に上限がかかり、長い同期が途中で打ち切られうる)
   */
  async scheduled(controller, env) {
    const minute = Math.floor(controller.scheduledTime / 60_000);
    const full = minute % (FULL_SYNC_INTERVAL_MS / 60_000) === 0;
    console.log(JSON.stringify(full ? await syncAll(env) : await syncLiveStatus(env)));
  },
} satisfies ExportedHandler<Bindings>;
