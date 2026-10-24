import type { SetlistProblem } from '../shared/setlist-audit';
import { type RequestBudget, budgetedFetch } from './budget';
import type { SetlistAuditToNotify } from './db';
import { JST_OFFSET_MS } from './time';

/** セトリの点検の Issue に付けるラベル */
export const SETLIST_AUDIT_LABEL = 'setlist-check';
/** Issue に載せる元のコメントの長さの上限(Issue の本文は 65,536 文字まで) */
const COMMENT_EXCERPT_CHARS = 2000;
/** Issue に載せる曲 1 つの長さの上限 */
const SONG_LABEL_CHARS = 120;
/** Issue の本文の長さの上限(GitHub の上限 65,536 文字に対して、余裕を持たせる) */
const ISSUE_BODY_CHARS = 60_000;
/** 歌枠ごとの節の区切り */
const SECTION_SEPARATOR = '\n\n---\n\n';

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

/**
 * 相手のいないサロゲート(絵文字などを表す 2 つ組の片方だけ)を「?」に置き換える。長さで切ると、絵文字の途中で
 * 切れて片方だけが残ることがあり、そのまま送ると GitHub に断られるおそれがある
 */
function wellFormed(s: string) {
  const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
  const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;
  let out = '';
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (isHigh(code) && isLow(s.charCodeAt(i + 1))) i++;
    else if (isHigh(code) || isLow(code)) {
      out += `${s.slice(from, i)}?`;
      from = i + 1;
    }
  }
  return out + s.slice(from);
}

/** GitHub に Issue を作る。作った Issue の URL を返す。サブリクエストの予算に 1 回分数える(使い切っていれば送らない) */
export async function createIssue(
  budget: RequestBudget,
  token: string,
  repo: string,
  issue: { title: string; body: string; labels: string[] },
): Promise<string> {
  const res = await budgetedFetch(budget, `https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'prnb-youtube-calendar',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(issue),
  });
  if (!res.ok) throw new Error(`GitHub issue failed: ${res.status} ${await res.text()}`);
  return (await res.json<{ html_url: string }>()).html_url;
}

/** UTC の ISO 8601 を「2026-10-09 21:00」(JST)に */
const toJst = (iso: string) =>
  new Date(Date.parse(iso) + JST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');

/*
 * Issue に載せる文字列のうち、動画のタイトル・チャンネル名・コメントの書き手・コメントの本文と、そこから読み取った曲は、
 * 外部の人が決められる。Markdown として解釈されたり、メンション(@名前)や他の Issue への参照(#123)になったり
 * しないよう、載せる場所に合わせて次のどれかを通す
 */

/** いちばん長い「`」の連続の長さ */
const longestBackticks = (s: string) => Math.max(0, ...(s.match(/`+/g) ?? []).map((m) => m.length));

/** 1 行にする(改行で段落や HTML のブロックが切れると、その先が Markdown として解釈される) */
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** ゼロ幅スペース(見えない文字なので、ソースには文字そのものを書かない) */
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

/** 地の文に載せる。記号はすべて「\」で打ち消し、「@」「#」は後ろにゼロ幅スペースを入れてメンション・参照にしない */
const escapeMarkdown = (s: string) =>
  oneLine(s)
    .replace(/[!-/:-@[-`{-~]/g, '\\$&')
    .replace(/[@#]/g, `$&${ZERO_WIDTH_SPACE}`);

/** コードとして載せる(中の「`」より長い「`」で囲む) */
function inlineCode(s: string) {
  const text = oneLine(s);
  const fence = '`'.repeat(longestBackticks(text) + 1);
  return `${fence} ${text} ${fence}`;
}

/** HTML のタグの中に載せる。<code> の中はメンションにならない */
const htmlCode = (s: string) =>
  `<code>${oneLine(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`;

/** コードブロックとして載せる(中の「`」より長い「`」の行で囲むので、中からは閉じられない) */
function codeBlock(s: string) {
  const fence = '`'.repeat(Math.max(3, longestBackticks(s) + 1));
  return [`${fence}text`, s, fence];
}

/**
 * セトリの点検の Issue(タイトルと本文)を作る。本文が上限を超えるときは、収まるところまでの歌枠だけを載せる
 * (上限を超えた Issue は GitHub に断られ、同じ歌枠で毎回失敗して、通知が止まったままになる)。
 * videoIds は載せた歌枠。載せられなかった分は、次の日の Issue に回す
 */
export function buildSetlistAuditIssue(rows: SetlistAuditToNotify[], now: Date) {
  const today = toJst(now.toISOString()).slice(0, 10);
  const sections = rows.map((row, i) => {
    const problems: SetlistProblem[] = JSON.parse(row.problems);
    const lines = [
      `### ${i + 1}. ${escapeMarkdown(row.title)}`,
      `${escapeMarkdown(row.channel_title)} ・ ${toJst(row.event_at)} 配信 ・ [YouTube で開く](https://www.youtube.com/watch?v=${encodeURIComponent(row.video_id)}) ・ ${inlineCode(row.video_id)}`,
      '',
      ...problems.flatMap((p) => [`- **${p.message}**`, ...p.songs.slice(0, 10).map((s) => `  - ${inlineCode(truncate(s, SONG_LABEL_CHARS))}`), ...(p.songs.length > 10 ? [`  - ほか ${p.songs.length - 10} 曲`] : [])]),
    ];
    if (row.text) {
      const excerpt = row.text.length > COMMENT_EXCERPT_CHARS ? `${row.text.slice(0, COMMENT_EXCERPT_CHARS)}\n…(以下略)` : row.text;
      lines.push(
        '',
        `<details><summary>元のコメント(${row.author ? htmlCode(row.author) : '不明'} さん)</summary>`,
        '',
        ...codeBlock(excerpt.replace(/\r/g, '')),
        '',
        '</details>',
      );
    }
    return lines.join('\n');
  });

  // 1 本目は必ず載せる(1 本分は、曲とコメントの長さの上限から、本文の上限よりずっと短い)
  let count = 0;
  for (let chars = 0; count < sections.length; count++) {
    chars += sections[count].length + SECTION_SEPARATOR.length;
    if (count > 0 && chars > ISSUE_BODY_CHARS) break;
  }
  const issue = {
    title: `セトリの点検: ${count} 本(${today})`,
    body: [
      `新しく取得したセトリを、サイトの表示と同じ読み取りで点検したところ、正しく表示されていない可能性があるものが **${count} 本** 見つかりました。`,
      '',
      '- 読み取りの規則(`src/shared/setlist.ts`)を直す必要があれば対応してください。直すと、その歌枠は次の点検で問題なしになります',
      '- 元のコメントの書き方どおりで問題がなければ、この Issue を閉じてください。同じ内容は二度と通知しません',
      '',
      '---',
      '',
      wellFormed(sections.slice(0, count).join(SECTION_SEPARATOR)),
    ].join('\n'),
    labels: [SETLIST_AUDIT_LABEL],
  };
  return { issue, videoIds: rows.slice(0, count).map((r) => r.video_id) };
}
