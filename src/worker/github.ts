import type { SetlistProblem } from '../shared/setlist-audit';
import type { RequestBudget } from './budget';
import type { SetlistAuditToNotify } from './db';

/** セトリの点検の Issue に付けるラベル */
export const SETLIST_AUDIT_LABEL = 'setlist-check';
/** Issue に載せる元のコメントの長さの上限(Issue の本文は 65,536 文字まで) */
const COMMENT_EXCERPT_CHARS = 2000;

/** GitHub に Issue を作る。作った Issue の URL を返す。サブリクエストの予算に 1 回分数える */
export async function createIssue(
  budget: RequestBudget,
  token: string,
  repo: string,
  issue: { title: string; body: string; labels: string[] },
): Promise<string> {
  budget.take();
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
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
  new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

/** セトリの点検の Issue(タイトルと本文)を作る */
export function buildSetlistAuditIssue(rows: SetlistAuditToNotify[], now: Date) {
  const today = toJst(now.toISOString()).slice(0, 10);
  const sections = rows.map((row, i) => {
    const problems: SetlistProblem[] = JSON.parse(row.problems);
    const lines = [
      `### ${i + 1}. ${row.title}`,
      `${row.channel_title} ・ ${toJst(row.event_at)} 配信 ・ [YouTube で開く](https://www.youtube.com/watch?v=${row.video_id}) ・ \`${row.video_id}\``,
      '',
      ...problems.flatMap((p) => [`- **${p.message}**`, ...p.songs.slice(0, 10).map((s) => `  - \`${s}\``), ...(p.songs.length > 10 ? [`  - ほか ${p.songs.length - 10} 曲`] : [])]),
    ];
    if (row.text) {
      const excerpt = row.text.length > COMMENT_EXCERPT_CHARS ? `${row.text.slice(0, COMMENT_EXCERPT_CHARS)}\n…(以下略)` : row.text;
      lines.push(
        '',
        `<details><summary>元のコメント(${row.author ?? '不明'} さん)</summary>`,
        '',
        '````text',
        excerpt.replace(/````/g, '```'),
        '````',
        '',
        '</details>',
      );
    }
    return lines.join('\n');
  });

  return {
    title: `セトリの点検: ${rows.length} 本(${today})`,
    body: [
      `新しく取得したセトリを、サイトの表示と同じ読み取りで点検したところ、正しく表示されていない可能性があるものが **${rows.length} 本** 見つかりました。`,
      '',
      '- 読み取りの規則(`src/shared/setlist.ts`)を直す必要があれば対応してください。直すと、その歌枠は次の点検で問題なしになります',
      '- 元のコメントの書き方どおりで問題がなければ、この Issue を閉じてください。同じ内容は二度と通知しません',
      '',
      '---',
      '',
      sections.join('\n\n---\n\n'),
    ].join('\n'),
    labels: [SETLIST_AUDIT_LABEL],
  };
}
