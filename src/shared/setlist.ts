/**
 * 歌枠のセトリ(ファンがコメントに書いたタイムスタンプ付きの曲目)を読み取る。
 * 書き方は書き手ごとに違うので、次のような形をまとめて扱う。
 *
 *   00:09:46 🎶01. ケセラセラ／Mrs. GREEN APPLE
 *   0:20:33 【01】I wanna see you/阿部真央
 *   M01  00:08:23  /  00:09:18  ～  00:14:44  /  楓  -  スピッツ,  ピアノ伴奏   (曲紹介・開始・終了)
 *   No.01  /  00:12:37  ～  00:16:16  /  いかないで  -  想太
 *   0:06:04　01．プライド革命／CHiCO with HoneyWorks【銀魂゜】（2015/08/05）
 *   01:20:58 怪獣の花唄                                                    (次の行に続く)
 *   (Kaijuu no Hanauta) - Vaundy
 *   ▶05:52〜10:48                                                          (時刻と曲が別の行)
 *   🎵1.ミラクル  /miwa
 *   00:01:55 あの夏に咲け                                                   (「セトリ」の見出しの下に曲名だけ)
 *   13:40 welcome to my fanclub's night(歌)                                 (「(歌)」の印)
 *
 * 曲だけを取り出し、開始・告知・キリバンなど曲以外の時刻や、補足(伴奏・作品名・発売日・リクエストした人)は捨てる。
 * 「セトリ」の見出しがあれば、その下(次の「タイムスタンプ」などの見出しの手前まで)だけを読み、
 * セトリと目次(雑談も含む全体のタイムスタンプ)の両方に曲が書かれていても、セトリの方だけを出す。
 * 読み取りは表示するときに行うので、規則を直しても YouTube からコメントを取り直す必要はない。
 */

export interface SetlistSong {
  /** セトリに書かれた番号。書かれていない・番号が飛んだり重なったりしているときは 1 から振り直す */
  no: number;
  title: string;
  artist: string | null;
  /** 曲の開始位置(秒) */
  time: number;
}

const TIME_SOURCE = String.raw`(?<![\d:])(\d{1,2}):(\d{2})(?::(\d{2}))?(?![\d:])`;
const TIME_GLOBAL = new RegExp(TIME_SOURCE, 'g');
const TIME_ONCE = new RegExp(TIME_SOURCE);

/** 曲番号: 「No.16 」「No.01 /」「01.」「01．」「【01】」 */
const NUMBER = /^No\.?\s*(\d{1,3})(?:\s*[.．:：)）/／]\s*|\s+)|^(\d{1,3})\s*[.．:：)）]\s*|^【(\d{1,3})】\s*/i;
/** 曲名とアーティストの区切り。コメントの中で多く使われているものから試す */
const SEPARATORS = [/／/g, /\s+\/\s*/g, /\//g, /\s+[-‐‑–—―]\s*/g];
/** 曲名の前後に付く記号(行頭の区切り・矢印・絵文字など) */
const LEADING = /^(?:[\s　]|[/／～~\-‐)）▶►・=＝]|[\p{Extended_Pictographic}‍️♪♫])+/u;
/** 曲以外の時刻なのに「曲名/英語」の形で書かれやすいもの */
const NOT_SONG = /^(?:配信開始|配信終了|開始|終了|告知|宣伝|告知・宣伝|エンディング|オープニング|OP|ED|自己紹介|乾杯|休憩)$/i;
/** セトリの見出し(曲名だけのセトリを読むときの目印)。文中の「セトリ」ではなく、行の先頭にあるものだけ */
const SETLIST_HEADING = /^[^\p{L}\p{N}]*(?:セトリ|セットリスト|set\s*list|songs?\s*list)/iu;
/** 曲名だけのセトリで除く挨拶(「こんにな～」「おつひな」「せーの!」など) */
const GREETING = /^(?:こん|おつ|おは|せーの|ばいばい)/;
/** セトリにアーティストが書かれていないときに補う曲(オリジナル曲など)。曲名は大文字・小文字を区別しない */
const KNOWN_ARTISTS: Record<string, string> = { 'swing days!': '碓氷ゆら' };

/** コメントに含まれるタイムスタンプの数(セトリのコメントを見分けるのに使う) */
export const countTimestamps = (text: string) => text.match(TIME_GLOBAL)?.length ?? 0;

const toSeconds = (h: string, m: string, s?: string) =>
  s === undefined ? Number(h) * 60 + Number(m) : Number(h) * 3600 + Number(m) * 60 + Number(s);

const knownArtist = (title: string) => KNOWN_ARTISTS[title.toLowerCase()] ?? null;

/** 曲名とアーティストに分ける。「3/30」「12／28」のように数字にはさまれた区切りは日付なので使わない */
function splitTitleArtist(text: string, separators: RegExp[]) {
  for (const sep of separators) {
    for (const m of text.matchAll(sep)) {
      const at = m.index ?? 0;
      const end = at + m[0].length;
      if (at === 0 || end >= text.length) continue;
      if (/\d/.test(text[at - 1]) && /\d/.test(text[end])) continue;
      return { title: text.slice(0, at).trim(), artist: text.slice(end).trim() };
    }
  }
  return null;
}

/** 行頭の記号と曲番号を外す */
function stripLead(text: string): { no: number | null; rest: string } {
  let rest = text.replace(LEADING, '');
  const n = rest.match(NUMBER);
  if (!n) return { no: null, rest };
  rest = rest.slice(n[0].length).replace(LEADING, '');
  return { no: Number(n[1] ?? n[2] ?? n[3]), rest };
}

/** 補足(リクエストした人・発売日・作品名)を外す */
function stripNotes(text: string) {
  let t = text
    .replace(/\s*※.*$/u, '') // 「※1番のみ」「※Piano Ver.」などの補足
    .replace(/(?<=[\s)）])[@＠][^\s@＠]+(?:\s*さん)?\s*$/u, '') // リクエストした人(曲名の「star?@Formo」は残す)
    .replace(/[\s,，、]+$/u, '');
  const date = /[（(]\d{4}[/／.]\d{1,2}[/／.]\d{1,2}[)）]\s*$/;
  if (date.test(t)) {
    t = t.replace(date, '').trim();
    t = t.replace(/（[^（）]+）\s*$/, '').trim(); // 発売日の前の(作品名)
  }
  return t.replace(/【[^】]+】\s*$/, '').trim();
}

/** 演奏の補足(「(少しアカペラ)」「（アルペジオverを少し）」など)。アーティストの補足(「(sana×CHiCO)」)は残す */
const PERFORMANCE_NOTE =
  /\s*[（(][^（）()]*(?:アカペラ|アルペジオ|少し|ちょっと|ショート|(?<![a-z])short|(?<![a-z])ver|サビ|1番|一番|フル|試験|リベンジ|途中|練習)[^（）()]*[)）]\s*$/i;
/** 末尾の絵文字(「米津玄師🆕」) */
const TRAILING_EMOJI = /[\s\p{Emoji_Presentation}‍️]+$/u;

const cleanTail = (s: string) => s.replace(TRAILING_EMOJI, '').replace(PERFORMANCE_NOTE, '').replace(TRAILING_EMOJI, '').trim();

/** アーティストのあとに「,」で続く補足(「スピッツ,  ピアノ伴奏」「, New」)。「鏡音リン, 鏡音レン」のような連名は残す */
const COMMA_NOTE =
  /[,，]\s*(?:[^,，]*(?:伴奏|お試し|choice|ワンコーラス|弾き語り|のみ|アカペラ|替え歌|(?<![a-z])ver|音量|達成|登録|※)[^,，]*|new|\d+|[^\p{L}\p{N},，]*)\s*$/iu;

function stripCommaNotes(artist: string) {
  let a = artist;
  for (let prev = ''; prev !== a; ) {
    prev = a;
    a = a.replace(COMMA_NOTE, '').trim();
  }
  return a;
}

/**
 * 「日本語 / 英語」の 2 か国語で書かれ、曲名とアーティストを「,」で区切ったセトリ
 * (「スタートライン!,アイカツスターズ / Start Line!, Aikatsu Stars!」)
 */
const BILINGUAL_COMMA = /^[^/／]+[,，][^/／]+\s*[/／]\s*[^,，]+[,，]/;

function readCommaSong(text: string) {
  const ja = text.split(/\s*[/／]\s*/)[0];
  const [title, artist] = ja.split(/\s*[,，]\s*/);
  if (!title || NOT_SONG.test(title)) return null;
  return { title: cleanTail(title), artist: artist ? cleanTail(artist) : knownArtist(title) };
}

/** 時刻のあとの文字列を曲として読む。曲名とアーティストの形になっていなければ null(曲以外) */
function readSong(rest: string, separators: RegExp[], commaMode = false): { title: string; artist: string | null } | null {
  const text = stripNotes(rest);
  if (!text || /^\d+番手/.test(text)) return null; // 歌枠リレーの出演順
  if (commaMode && /[,，]/.test(text)) return readCommaSong(text);
  const pair = splitTitleArtist(text, separators);
  if (pair) {
    const title = cleanTail(pair.title);
    if (!title || NOT_SONG.test(title)) return null;
    const artist = cleanTail(stripCommaNotes(pair.artist));
    return { title, artist: artist || knownArtist(title) };
  }
  // 「Swing Days!  -」のように区切りのあとが空(オリジナル曲など)
  const trailing = text.match(/^(.+?)\s*(?:[-‐‑–—―／]|\s\/)\s*$/);
  if (trailing && !NOT_SONG.test(trailing[1].trim())) {
    const title = trailing[1].trim();
    return { title, artist: knownArtist(title) };
  }
  return null;
}

function separatorsFor(lines: string[]) {
  const timed = lines.filter((l) => TIME_ONCE.test(l));
  const count = (sep: RegExp) => timed.filter((l) => l.match(sep)).length;
  return [...SEPARATORS].sort((a, b) => count(b) - count(a));
}

interface Found {
  no: number | null;
  title: string;
  artist: string | null;
  time: number;
}

interface TimedLine {
  time: number;
  /** 時刻より前にある曲番号(M01 / No.01) */
  prefixNo: number | null;
  /** 時刻のあとの文字列 */
  rest: string;
  index: number;
}

/** 時刻のある行を読む。曲紹介・開始・終了の 3 つが並ぶ行は、2 つ目(曲の開始)を使う */
function readTimedLine(line: string, index: number): TimedLine | null {
  const text = line.replace(/※.*$/u, ''); // 「※語り( 02:00:39 )」のような補足の中の時刻は使わない
  const times = [...text.matchAll(TIME_GLOBAL)];
  if (times.length === 0) return null;
  const pick = times.length >= 3 ? times[1] : times[0];
  const lastTime = times[times.length - 1];
  const prefix = text.slice(0, times[0].index).replace(/^[└├┗┣]\s*/, '').trim();
  const prefixNo = prefix.match(/^(?:M|No\.?)\s*(\d{1,3})\b/i);
  return {
    time: toSeconds(pick[1], pick[2], pick[3]),
    prefixNo: prefixNo ? Number(prefixNo[1]) : null,
    rest: text.slice((lastTime.index ?? 0) + lastTime[0].length),
    index,
  };
}

/** セトリとは別の、雑談も含む全体のタイムスタンプ(目次)の見出し */
const OTHER_HEADING = /タイムスタンプ|目次|雑談|トーク|配信内容|time\s*stamps?|chat/i;

/**
 * 「セトリ」の見出しから、次の見出し(「タイムスタンプ」など)の手前までの行。見出しが無ければ null。
 * セトリと目次の両方に曲が書かれているときは、セトリの方だけを読むために使う
 */
function setlistSection(lines: string[]): string[] | null {
  const start = lines.findIndex((l) => SETLIST_HEADING.test(l) && !TIME_ONCE.test(l));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l && !TIME_ONCE.test(l) && OTHER_HEADING.test(l) && !SETLIST_HEADING.test(l));
  return end < 0 ? rest : rest.slice(0, end);
}

export function parseSetlist(raw: string): SetlistSong[] {
  const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const section = setlistSection(lines);
  const fromSection = section ? readLines(section) : [];
  // 見出しの下で 3 曲以上読めればセトリの部分だけを使う。読めなければ(見出しだけ・見出しの外に曲)全体を読む
  const songs = fromSection.length >= 3 ? fromSection : readLines(lines);
  return finish(songs.length > 0 ? songs : readTitleOnly(lines));
}

function readLines(lines: string[]): Found[] {
  const separators = separatorsFor(lines);
  const timedRests = lines.filter((l) => TIME_ONCE.test(l)).map((l) => readTimedLine(l, 0)?.rest.trim() ?? '');
  const commaMode = timedRests.filter((r) => BILINGUAL_COMMA.test(r)).length >= 3;
  const songs: Found[] = [];
  // 直前の時刻の行(次の行への折り返しや、次の行に書かれた曲をつなげるため)
  let last: { line: TimedLine; rest: string; no: number | null; songIndex: number | null; awaiting: boolean } | null =
    null;

  lines.forEach((text, index) => {
    if (!text) return;
    const timed = readTimedLine(text, index);

    if (!timed) {
      if (!last) return;
      if (last.awaiting) {
        // 「▶05:52〜10:48」の次の行に「🎵1.ミラクル /miwa」
        last.awaiting = false;
        const { no, rest } = stripLead(text);
        const song = readSong(rest, separators, commaMode);
        if (song) {
          songs.push({ no: no ?? last.no, time: last.line.time, ...song });
          last.songIndex = songs.length - 1;
        }
      } else if (/^[(（]/.test(text)) {
        // 「(Kaijuu no Hanauta) - Vaundy」のような折り返し
        last.rest = `${last.rest} ${text}`;
        const song = readSong(last.rest, separators, commaMode);
        if (song && last.songIndex !== null) songs[last.songIndex] = { ...songs[last.songIndex], ...song };
        else if (song) {
          songs.push({ no: last.no, time: last.line.time, ...song });
          last.songIndex = songs.length - 1;
        }
      }
      return;
    }

    const { no, rest } = stripLead(timed.rest);
    const song = readSong(rest, separators, commaMode);
    if (song) songs.push({ no: no ?? timed.prefixNo, time: timed.time, ...song });
    last = {
      line: timed,
      rest,
      no: no ?? timed.prefixNo,
      songIndex: song ? songs.length - 1 : null,
      // 時刻のあとに何も書かれていない行は、次の行に曲が書かれていることがある
      awaiting: !song && rest.replace(/[～~〜\s]/g, '') === '',
    };
  });

  return songs;
}

/**
 * 曲名とアーティストの区切りが無いセトリ。「セトリ」の見出しより後の時刻の行と、「(歌)」の印が付いた行を、
 * 曲名だけの曲として読む(区切りで 1 曲も読めなかったときだけ使う)
 */
function readTitleOnly(lines: string[]): Found[] {
  const marked = lines.some((l) => /[(（]歌[)）]/.test(l));
  const heading = lines.findIndex((l) => SETLIST_HEADING.test(l) && !TIME_ONCE.test(l));
  if (!marked && heading < 0) return [];
  const songs: Found[] = [];
  let ended = false;
  lines.forEach((text, index) => {
    if (ended) return;
    const timed = readTimedLine(text, index);
    // 見出しのセトリは、曲のあとの区切り(空行や、時刻の無い行。雑談の目次などの見出し)までで読み終える
    if (!timed && !marked && index > heading && songs.length > 0) ended = true;
    if (!timed || (!marked && index < heading)) return;
    if (/^[└├┗┣]/.test(text)) return;
    const { no, rest } = stripLead(timed.rest);
    let title = stripNotes(rest);
    if (marked) {
      if (!/[(（]歌[)）]\s*$/.test(title)) return;
      title = title.replace(/\s*[(（]歌[)）]\s*$/, '');
    }
    if (!title || NOT_SONG.test(title) || GREETING.test(title)) return;
    songs.push({ no: no ?? timed.prefixNo, time: timed.time, title, artist: knownArtist(title) });
  });
  return songs;
}

const songKey = (s: Found) =>
  `${s.title}|${s.artist ?? ''}`.normalize('NFKC').toLowerCase().replace(/[\s'"’「」『』]/g, '');

/**
 * 同じ曲の重複を除き、番号が無い・飛んだり重なったりしているときは 1 から振り直す。
 * 重複とみなすのは、開始時刻がまったく同じもの(日本語と英語でセトリを 2 回書いたもの)と、
 * 曲名とアーティストが同じもの(セトリと目次の両方に書かれた曲)。ただし両方にセトリの番号が付いていれば、
 * 書き手が別の曲として数えている(歌い直し)ので残す
 */
function finish(found: Found[]): SetlistSong[] {
  const kept: Found[] = [];
  for (const s of found) {
    const key = songKey(s);
    const duplicate = kept.some(
      (k) => k.time === s.time || (songKey(k) === key && (k.no === null || s.no === null || k.no === s.no)),
    );
    if (!duplicate) kept.push(s);
  }
  const songs = kept;
  const numbered = songs.every((s, i) => s.no !== null && (i === 0 || s.no > (songs[i - 1].no ?? 0)));
  return songs.map((s, i) => ({ no: numbered ? (s.no as number) : i + 1, title: s.title, artist: s.artist, time: s.time }));
}

/** 曲の一覧に表示する時刻(hh:mm:ss) */
export const formatSetlistTime = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
