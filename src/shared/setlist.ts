/**
 * 歌枠のセトリ(ファンがコメントに書いたタイムスタンプ付きの曲目)を読み取る。
 * 書き方は書き手ごとに違うので、次のような形をまとめて扱う。
 *
 *   00:09:46 🎶01. ケセラセラ／Mrs. GREEN APPLE
 *   0:20:33 【01】I wanna see you/阿部真央
 *   M01  00:08:23  /  00:09:18  ～  00:14:44  /  楓  -  スピッツ,  ピアノ伴奏   (曲紹介・開始・終了)
 *   0:06:04　01．プライド革命／CHiCO with HoneyWorks【銀魂゜】（2015/08/05）
 *   01:20:58 怪獣の花唄                                                    (次の行に続く)
 *   (Kaijuu no Hanauta) - Vaundy
 *
 * 曲だけを取り出し、開始・告知・キリバンなど曲以外の時刻や、補足(伴奏・作品名・発売日)は捨てる。
 * 読み取りは表示するときに行うので、規則を直しても YouTube からコメントを取り直す必要はない。
 */

export interface SetlistSong {
  /** セトリに書かれた番号。書かれていなければ 1 から順に振る */
  no: number;
  title: string;
  artist: string | null;
  /** 曲の開始位置(秒) */
  time: number;
}

const TIME_SOURCE = String.raw`(?<![\d:])(\d{1,2}):(\d{2})(?::(\d{2}))?(?![\d:])`;
const TIME_GLOBAL = new RegExp(TIME_SOURCE, 'g');
const TIME_ONCE = new RegExp(TIME_SOURCE);

/** 曲番号: 「01.」「01．」「【01】」「No.1」 */
const NUMBER = /^(?:No\.?\s*)?(\d{1,3})\s*[.．:：)）]\s*|^【(\d{1,3})】\s*/i;
/** 曲名とアーティストの区切り。コメントの中で多く使われているものから試す */
const SEPARATORS = [/／/, /\s+\/\s*/, /\//, /\s+[-–—]\s*/];
/** セトリにアーティストが書かれていないときに補う曲(オリジナル曲など) */
const KNOWN_ARTISTS: Record<string, string> = { 'Swing Days!': '碓氷ゆら' };

/** コメントに含まれるタイムスタンプの数(セトリのコメントを見分けるのに使う) */
export const countTimestamps = (text: string) => text.match(TIME_GLOBAL)?.length ?? 0;

const toSeconds = (h: string, m: string, s?: string) =>
  s === undefined ? Number(h) * 60 + Number(m) : Number(h) * 3600 + Number(m) * 60 + Number(s);

function splitTitleArtist(text: string, separators: RegExp[]) {
  for (const sep of separators) {
    const m = text.match(sep);
    if (m?.index && m.index + m[0].length < text.length) {
      return { title: text.slice(0, m.index).trim(), artist: text.slice(m.index + m[0].length).trim() };
    }
  }
  return null;
}

/** 時刻のあとの文字列を曲として読む。曲名とアーティストの形になっていなければ null(曲以外) */
function readSong(rest: string, separators: RegExp[]): { title: string; artist: string | null } | null {
  const text = rest
    .replace(/[（(]\d{4}\/\d{1,2}\/\d{1,2}[)）]\s*$/, '') // 発売日
    .replace(/【[^】]+】\s*$/, '') // 作品名
    .trim();
  if (/^\d+番手/.test(text)) return null; // 歌枠リレーの出演順
  const pair = splitTitleArtist(text, separators);
  if (pair) {
    const artist = pair.artist.replace(/,\s+.+$/, '').trim(); // 「スピッツ,  ピアノ伴奏」の補足
    return { title: pair.title, artist: artist || (KNOWN_ARTISTS[pair.title] ?? null) };
  }
  // 「Swing Days!  -」のように区切りのあとが空(オリジナル曲など)
  const trailing = text.match(/^(.+?)\s*(?:[-–—／]|\s\/)\s*$/);
  if (trailing) {
    const title = trailing[1].trim();
    return { title, artist: KNOWN_ARTISTS[title] ?? null };
  }
  return null;
}

function separatorsFor(lines: string[]) {
  const timed = lines.filter((l) => TIME_ONCE.test(l));
  const count = (sep: RegExp) => timed.filter((l) => sep.test(l)).length;
  return [...SEPARATORS].sort((a, b) => count(b) - count(a));
}

export function parseSetlist(raw: string): SetlistSong[] {
  const lines = raw.replace(/\r/g, '').split('\n');
  const separators = separatorsFor(lines);
  const songs: { no: number | null; title: string; artist: string | null; time: number }[] = [];
  // 直前の時刻の行(次の行への折り返しをつなげるため)
  let last: { time: number; no: number | null; rest: string; songIndex: number | null } | null = null;

  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    const times = [...text.matchAll(TIME_GLOBAL)];

    if (times.length === 0) {
      // 「(Kaijuu no Hanauta) - Vaundy」のような折り返し
      if (last && /^[(（]/.test(text)) {
        last.rest = `${last.rest} ${text}`;
        const song = readSong(last.rest, separators);
        if (song && last.songIndex !== null) songs[last.songIndex] = { ...songs[last.songIndex], ...song };
        else if (song) {
          songs.push({ no: last.no, time: last.time, ...song });
          last.songIndex = songs.length - 1;
        }
      }
      continue;
    }

    // 曲紹介・開始・終了の 3 つが並ぶ行は、2 つ目(曲の開始)を使う
    const pick = times.length >= 3 ? times[1] : times[0];
    const time = toSeconds(pick[1], pick[2], pick[3]);
    const lastTime = times[times.length - 1];
    const prefix = text.slice(0, times[0].index).replace(/^[└├┗┣]\s*/, '').trim();
    let rest = text
      .slice((lastTime.index ?? 0) + lastTime[0].length)
      .replace(/^[\s　]*(?:[/／～~-]\s*)?/, '')
      .replace(/^[🎶♪🎤🎵]+\s*/u, '')
      .trim();

    let no: number | null = null;
    const prefixNo = prefix.match(/^M(\d{1,3})$/i);
    if (prefixNo) no = Number(prefixNo[1]);
    const restNo = rest.match(NUMBER);
    if (restNo) {
      no = Number(restNo[1] ?? restNo[2]);
      rest = rest.slice(restNo[0].length).trim();
    }

    const song = readSong(rest, separators);
    if (song) songs.push({ no, time, ...song });
    last = { time, no, rest, songIndex: song ? songs.length - 1 : null };
  }

  return songs.map((s, i) => ({ ...s, no: s.no ?? i + 1 }));
}

/** 曲の一覧に表示する時刻(hh:mm:ss) */
export const formatSetlistTime = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
