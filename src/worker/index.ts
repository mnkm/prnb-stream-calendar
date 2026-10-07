import { Hono } from 'hono';
import { splitSearchTerms } from '../shared/search';
import { VIDEO_TYPES, type VideoType } from '../shared/types';
import { listEnabledChannels, queryEvents, searchEvents, toChannel } from './db';
import { syncAll } from './sync';
import { toIsoSeconds } from './time';

type Bindings = Env & {
  YOUTUBE_API_KEY: string;
  ADMIN_TOKEN?: string;
};

const MAX_RANGE_MS = 100 * 24 * 60 * 60 * 1000;
const MAX_CHANNEL_FILTER = 20;
const SEARCH_LIMIT = 200;
const MAX_SEARCH_TERMS = 5;
const MAX_SEARCH_TERM_LENGTH = 50;

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

app.get('/channels', async (c) => {
  const rows = await listEnabledChannels(c.env.DB);
  c.header('Cache-Control', 'public, max-age=300');
  return c.json(rows.map(toChannel));
});

app.get('/events', async (c) => {
  const from = parseDate(c.req.query('from'));
  const to = parseDate(c.req.query('to'));
  if (!from || !to || to <= from) {
    return c.json({ error: 'from / to must be ISO 8601 dates with from < to' }, 400);
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return c.json({ error: 'range must be 100 days or less' }, 400);
  }

  const events = await queryEvents(c.env.DB, {
    from: toIsoSeconds(from),
    to: toIsoSeconds(to),
    channelIds: parseList(c.req.query('channels')).slice(0, MAX_CHANNEL_FILTER),
    types: parseList(c.req.query('types')).filter(isVideoType),
  });
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(events);
});

/**
 * キーワード検索。スペース(全角も可)で区切った語をすべて含むタイトルを、期間に関係なく新しい順に返す。
 * 全角・半角、英字の大文字・小文字は区別しない
 */
app.get('/search', async (c) => {
  const terms = splitSearchTerms(c.req.query('q') ?? '')
    .slice(0, MAX_SEARCH_TERMS)
    .map((t) => t.slice(0, MAX_SEARCH_TERM_LENGTH));
  if (terms.length === 0) return c.json({ error: 'q is required' }, 400);

  const result = await searchEvents(c.env.DB, {
    terms,
    channelIds: parseList(c.req.query('channels')).slice(0, MAX_CHANNEL_FILTER),
    limit: SEARCH_LIMIT,
  });
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(result);
});

/** 手動同期(初回の取り込みや動作確認用)。Authorization: Bearer <ADMIN_TOKEN> */
app.post('/admin/sync', async (c) => {
  const token = c.env.ADMIN_TOKEN;
  if (!token || c.req.header('Authorization') !== `Bearer ${token}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return c.json(await syncAll(c.env));
});

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

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(syncAll(env).then((results) => console.log(JSON.stringify(results))));
  },
} satisfies ExportedHandler<Bindings>;
