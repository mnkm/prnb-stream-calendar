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
 *
 * コメントは誰でも書けるので、長い空白・記号・絵文字の連続を書かれても読み取りに時間がかからないようにしている。
 * 読む範囲に上限を設け(SETLIST_MAX_CHARS など)、連続に当てる正規表現は「(?<!\s)\s+」のように連続の先頭からだけ試す
 * (連続の途中から何度も試し直すと、連続の長さの 2 乗の時間がかかる)。規則を足すときも、この形を守る。
 */

export interface SetlistSong {
  /** セトリに書かれた番号。書かれていない・番号が飛んだり重なったりしているときは 1 から振り直す */
  no: number;
  title: string;
  artist: string | null;
  /** 曲の開始位置(秒) */
  time: number;
}

/**
 * 読み取る範囲の上限。YouTube のコメントは 10,000 文字まで書けるが、実際のセトリは、1 つのコメントに収まるもので
 * 60 行・1,500 文字ほど、返信に分けて書かれた 100 曲のもの(つなげて保存する)で 140 行・4,000 文字ほど。
 * 読み取りは、閲覧者のブラウザでも動く(画面でセトリを開いたとき)。読み取りの時間は主に文字数に比例するので、
 * 細工された長いコメントでも時間がかからないよう、文字数で切る。
 * 行数は、空行の多い書き方でも切れないよう、余裕を持たせる。
 * 上限を超えたコメントは途中までしか読まないので、点検(setlist-audit.ts)で知らせる
 */
export const SETLIST_MAX_CHARS = 6000;
export const SETLIST_MAX_LINES = 250;
/** これより長い行は、曲の行ではないので読まない(空行として扱う) */
const MAX_LINE_CHARS = 300;
/** 次の行への折り返しをつなげる回数と、つなげた行の長さの上限(実際の折り返しは 1 回で、合わせて 50 文字ほど) */
const MAX_FOLDS = 3;
const MAX_FOLDED_CHARS = 150;

const TIME_SOURCE = String.raw`(?<![\d:])(\d{1,2}):(\d{2})(?::(\d{2}))?(?![\d:])`;
const TIME_GLOBAL = new RegExp(TIME_SOURCE, 'g');
const TIME_ONCE = new RegExp(TIME_SOURCE);

/** 曲番号: 「No.16 」「No.01 /」「01.」「01．」「【01】」「M3 」 */
const NUMBER = /^(?:No\.?|M)\s*(\d{1,3})(?:\s*[.．:：)）/／]\s*|\s+)|^(\d{1,3})\s*[.．:：)）]\s*|^【(\d{1,3})】\s*/i;
/** 曲名とアーティストの区切り。コメントの中で多く使われているものから試す */
const SEPARATORS = [/／/g, /(?<!\s)\s+\/+\s*/g, /\//g, /(?<!\s)\s+[-‐‑–—―]+\s*/g];
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

/**
 * コメントにタイムスタンプが min 個以上あるか。セトリの候補を選ぶときは、コメントを何十件も見るので、
 * 全部は数えない(読み取りが読む範囲だけを見て、min 個見つけたところでやめる)
 */
export function hasTimestamps(text: string, min: number): boolean {
  const head = text.slice(0, SETLIST_MAX_CHARS);
  const time = new RegExp(TIME_SOURCE, 'g');
  for (let found = 0; time.exec(head); ) if (++found >= min) return true;
  return false;
}

/**
 * 行に分ける。改行のほか、行の区切りとして扱われる文字(U+2028・U+2029)でも分ける。
 * この 2 つが行の中に残ると、正規表現の「.」と「$」が改行と同じに扱い、行の途中で読み取りが切れる
 */
const LINE_SEPARATORS = new RegExp(`\r\n?|[${String.fromCharCode(0x2028, 0x2029)}]`, 'g');
const splitLines = (text: string) => text.replace(LINE_SEPARATORS, '\n').split('\n');

/** 「※」より前(「※」が無ければ全体) */
function beforeNote(text: string) {
  const at = text.indexOf('※');
  return at < 0 ? text : text.slice(0, at);
}

/** セトリとみなすコメントに含まれるタイムスタンプの数 */
const SETLIST_MIN_TIMESTAMPS = 3;

/** セトリとみなすコメントから読み取れる曲の数 */
const SETLIST_MIN_SONGS = 3;
/**
 * コメント(関連性順)から、セトリとして使うものを選ぶ。タイムスタンプを多く含むコメントを候補にし、
 * 配信者本人のもの → 高評価の多いもの → 関連性順で上のもの、の順に並べる。その上から順に読み取ってみて、
 * 曲として SETLIST_MIN_SONGS 曲以上読めた最初のものを選ぶ。
 * コメントは誰でも書けるので、最初に見つかったものをそのまま使わず、信頼できそうなものを選ぶ。
 * 曲として読めるかを見るのは、時刻つきの感想(「12:30 ここ好き」)のように、時刻はあってもセトリではない
 * コメントを選ばないため。読めるものが見つかるまで、候補を全部確かめる(感想が何件も上に並んでいても、
 * その下にあるセトリを選べるように)。
 *
 * どの候補も読めないときは、並べた先頭の候補を、確かめられなかったもの(verified: false)として返す。
 * 読み取りの規則に合わない新しい書き方のセトリを捨てずに保存し、点検(setlist-audit.ts)で気づけるようにするため。
 * ただし確かめられなかった候補は、すでに保存してあるセトリを置き換えるのには使わない(呼び出し側で見分ける)
 */
export function pickSetlistComment<T extends { text: string; authorChannelId: string | null; likeCount: number }>(
  comments: T[],
  channelId: string,
): { comment: T; verified: boolean } | null {
  const own = (c: T) => (c.authorChannelId === channelId ? 1 : 0);
  // 並べ替えは安定なので、本人どうし・高評価が同じものどうしは、関連性順のまま
  const candidates = comments
    .filter((c) => hasTimestamps(c.text, SETLIST_MIN_TIMESTAMPS))
    .sort((a, b) => own(b) - own(a) || b.likeCount - a.likeCount);
  for (const candidate of candidates) {
    if (parseSetlist(candidate.text).length >= SETLIST_MIN_SONGS) return { comment: candidate, verified: true };
  }
  return candidates.length > 0 ? { comment: candidates[0], verified: false } : null;
}

/** 歌の印(🎵・♪ など、「(歌)」) */
const SINGING_MARK = /[🎵🎶♪♫]|[(（]歌[)）]/u;

/**
 * セトリらしい書き方をしているか。「セトリ」の見出しがある、または曲番号(【01】・01.・M01・No.01)のある時刻の行と、
 * 歌の印のある行が、合わせて SETLIST_MIN_SONGS 行以上ある。
 * タイトルに「歌枠」が無い配信のコメントを選ぶときに使う。曲として読めるか(parseSetlist)だけでは、
 * ゲームの章立て(「Chapter1 - 森の村」)や雑談の目次(「近況 / 引っ越しの話」)もセトリとして読めてしまうため
 */
export function hasSetlistMarks(text: string): boolean {
  let marked = 0;
  for (const line of splitLines(text.slice(0, SETLIST_MAX_CHARS)).slice(0, SETLIST_MAX_LINES)) {
    if (line.length > MAX_LINE_CHARS) continue;
    if (SETLIST_HEADING.test(line)) return true;
    // 歌の印は、時刻と別の行に書かれることもある(「▶05:52〜10:48」の次の行に「🎵1.ミラクル /miwa」)
    if (SINGING_MARK.test(line)) {
      if (++marked >= SETLIST_MIN_SONGS) return true;
      continue;
    }
    if (!TIME_ONCE.test(line)) continue;
    // 曲番号は、行頭(時刻より前。「M01 00:08:23 …」)か、時刻を除いた残りの先頭(「0:20:33 【01】…」)にある。
    // 時刻で始まる行の行頭は見ない(「00:09:46」の「00:」を番号と取り違える)
    const head = line.replace(LEADING, '');
    const rest = line.replace(TIME_GLOBAL, ' ').replace(LEADING, '');
    const numbered = (TIME_ONCE.exec(head)?.index !== 0 && NUMBER.test(head)) || NUMBER.test(rest);
    if (numbered && ++marked >= SETLIST_MIN_SONGS) return true;
  }
  return false;
}

/**
 * タイトルに「歌枠」が無い配信(お知らせ・雑談のあとに歌った配信など)で、セトリとして使うコメントを選ぶ。
 * セトリらしい書き方のコメント(hasSetlistMarks)だけを候補にして pickSetlistComment で選び、曲として読めると
 * 確かめられたもの(verified)だけを返す。歌の配信かどうかがタイトルから分からないので、確かめられなかった候補は使わない
 */
export function pickMarkedSetlistComment<T extends { text: string; authorChannelId: string | null; likeCount: number }>(
  comments: T[],
  channelId: string,
): T | null {
  const picked = pickSetlistComment(comments.filter((c) => hasSetlistMarks(c.text)), channelId);
  return picked?.verified ? picked.comment : null;
}

const toSeconds = (h: string, m: string, s?: string) =>
  s === undefined ? Number(h) * 60 + Number(m) : Number(h) * 3600 + Number(m) * 60 + Number(s);

/** 対応表そのものに書いた曲だけを見る(「constructor」「__proto__」のような曲名で、Object から受け継いだものを返さない) */
const knownArtist = (title: string) => {
  const key = title.toLowerCase();
  return Object.hasOwn(KNOWN_ARTISTS, key) ? KNOWN_ARTISTS[key] : null;
};

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
  let t = beforeNote(text) //「※1番のみ」「※Piano Ver.」などの補足
    .trimEnd()
    .replace(/(?<=[\s)）])[@＠][^\s@＠]+(?:\s*さん)?\s*$/u, '') // リクエストした人(曲名の「star?@Formo」は残す)
    .replace(/(?<![\s,，、])[\s,，、]+$/u, '')
    // 末尾の括弧に時刻が書かれた補足(「(01:07:15 PON)」)
    .replace(TRAILING_PAREN, (all, inner: string) => (TIME_ONCE.test(inner) ? '' : all));
  const date =/[（(]\d{4}[/／.]\d{1,2}[/／.]\d{1,2}[)）]\s*$/;
  if (date.test(t)) {
    t = t.replace(date, '').trim();
    t = t.replace(/（[^（）]+）\s*$/, '').trim(); // 発売日の前の(作品名)
  }
  return t.replace(/【[^【】]+】\s*$/, '').trim();
}

/** 演奏の補足(「(少しアカペラ)」「（アルペジオverを少し）」など)。アーティストの補足(「(sana×CHiCO)」)は残す */
const TRAILING_PAREN = /(?<!\s)\s*[（(]([^（）()]*)[)）]\s*$/;
const PERFORMANCE_WORD =
  /アカペラ|アルペジオ|少し|ちょっと|ショート|(?<![a-z])short|(?<![a-z])ver|サビ|1番|一番|フル|試験|リベンジ|途中|練習/i;
/** 末尾の括弧を先に取り出してから、中の語を見る */
const stripPerformanceNote = (s: string) =>
  s.replace(TRAILING_PAREN, (all, inner: string) => (PERFORMANCE_WORD.test(inner) ? '' : all));
/** 末尾の絵文字(「米津玄師🆕」) */
const TAIL_CHAR = String.raw`[\s\p{Emoji_Presentation}‍️]`;
const TRAILING_EMOJI = new RegExp(`(?<!${TAIL_CHAR})${TAIL_CHAR}+$`, 'u');

const cleanTail = (s: string) => stripPerformanceNote(s.replace(TRAILING_EMOJI, '')).replace(TRAILING_EMOJI, '').trim();

/** アーティストのあとに「,」で続く補足(「スピッツ,  ピアノ伴奏」「, New」)。「鏡音リン, 鏡音レン」のような連名は残す */
const COMMA_NOTE_WORD = /伴奏|お試し|choice|ワンコーラス|弾き語り|のみ|アカペラ|替え歌|(?<![a-z])ver|音量|達成|登録|※/iu;
/** 語が無くても補足とみなすもの(「New」・数字だけ・記号だけ) */
const COMMA_NOTE_OTHER = /^(?:new|\d+|[^\p{L}\p{N}]*)$/iu;

/** 最後の「,」のあとが補足なら外す、を繰り返す */
function stripCommaNotes(artist: string) {
  let a = artist.trim();
  for (;;) {
    const at = Math.max(a.lastIndexOf(','), a.lastIndexOf('，'));
    if (at < 0) return a;
    const note = a.slice(at + 1).trim();
    if (!COMMA_NOTE_WORD.test(note) && !COMMA_NOTE_OTHER.test(note)) return a;
    a = a.slice(0, at).trim();
  }
}

/**
 * 「日本語 / 英語」の 2 か国語で書かれ、曲名とアーティストを「,」で区切ったセトリ
 * (「スタートライン!,アイカツスターズ / Start Line!, Aikatsu Stars!」)。
 * 最初の「/」の前が「曲名,アーティスト」(「,」の前後に 1 文字以上)で、後ろも「曲名,」で始まるもの
 */
function isBilingualComma(text: string) {
  const slash = text.search(/[/／]/);
  if (slash < 2) return false;
  return /[,，]/.test(text.slice(1, slash - 1)) && text.slice(slash + 1).search(/[,，]/) >= 1;
}

function readCommaSong(text: string) {
  // 最初の「/」の前(日本語の側)を「,」で分け、1 つ目を曲名、2 つ目をアーティストにする。
  // 「\s*[,，]\s*」のような正規表現で分けると、長い空白の連続で時間がかかるので、区切りの文字だけで分けて前後の空白を外す
  const slash = text.search(/[/／]/);
  const parts = (slash < 0 ? text : text.slice(0, slash)).trimEnd().split(/[,，]/);
  const title = parts[0].trimEnd();
  const artist = parts.length > 1 ? parts[1].trim() : undefined;
  if (!title || NOT_SONG.test(title)) return null;
  return { title: cleanTail(title), artist: artist ? cleanTail(artist) : knownArtist(title) };
}

/** 時刻のあとの文字列を曲として読む。曲名とアーティストの形になっていなければ null(曲以外) */
const readSong = (rest: string, separators: RegExp[], commaMode: boolean) => readSongText(stripNotes(rest), separators, commaMode);

/** readSong の、補足を外したあと(stripNotes を通した文字列)から読む部分 */
function readSongText(text: string, separators: RegExp[], commaMode: boolean): { title: string; artist: string | null } | null {
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
  const trailing = text.match(/^(.+?)(?<!\s)\s*(?:[-‐‑–—―／]|\s\/)\s*$/);
  if (trailing && !NOT_SONG.test(trailing[1].trim())) {
    const title = trailing[1].trim();
    return { title, artist: knownArtist(title) };
  }
  return null;
}

function separatorsFor(lines: Line[]) {
  // 時刻のあとの部分で数える(「No.01  /  00:12:37  ～  00:16:16  /  曲名」の時刻の間の「/」は数えない)
  const counts = SEPARATORS.map((_, i) => lines.filter((l) => l.timed?.separators[i]).length);
  return [...SEPARATORS].sort((a, b) => counts[SEPARATORS.indexOf(b)] - counts[SEPARATORS.indexOf(a)]);
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
  /** 時刻のあとの部分(行頭の記号は除く)に、SEPARATORS のそれぞれがあるか(区切りを数えるのに使う) */
  separators: boolean[];
  /** rest から読んだ曲番号と、その残り(stripLead) */
  no: number | null;
  body: string;
  /** 曲番号を「No.1」の形から読んだか(時刻より前の番号は含まない)。曲名の「No.1」と見分けるのに使う */
  numberedByNo: boolean;
  /** rest から行頭の記号だけを外したもの(番号を外す前)。「No.1」が曲名だったときに、ここから読み直す */
  unnumbered: string;
  /** body から補足を外したもの(stripNotes)。曲として読む文字列 */
  songText: string;
  /** 「日本語 / 英語」を「,」で区切った書き方の行か(isBilingualComma) */
  commaShaped: boolean;
  /** 曲として読んだ結果(区切りの優先順と「,」区切りの読み方ごと)。同じ行を、見出しの下と全体とで 2 回読むことがある */
  songs: Map<string, { title: string; artist: string | null } | null>;
}

/**
 * 1 行分の下読み。同じ行を、見出しの下・全体・曲名だけ、と読み方を変えて何度も読むので、
 * 読み方によらない部分(時刻・曲番号・補足を外す)は、行ごとに 1 回だけ行う
 */
interface Line {
  text: string;
  /** 時刻のある行なら、その読み取り結果 */
  timed: TimedLine | null;
  /** 行のどこかに時刻があるか(「※」のあとの時刻も含む。timed は「※」のあとを見ない) */
  hasTime: boolean;
  /** 「セトリ」の見出しの形か */
  heading: boolean;
}

function readLine(text: string): Line {
  return { text, timed: text ? readTimedLine(text) : null, hasTime: TIME_ONCE.test(text), heading: SETLIST_HEADING.test(text) };
}

/** 時刻と時刻のあいだが、範囲や並びを表す記号だけか(「05:52〜10:48」「00:08:23  /  00:09:18  ～  00:14:44」) */
const TIME_GAP = /^[\s/／～~〜\-‐‑–—―>＞→]*$/;

/** 時刻のある行を読む。曲紹介・開始・終了の 3 つが並ぶ行は、2 つ目(曲の開始)を使う */
function readTimedLine(line: string): TimedLine | null {
  const text = beforeNote(line); // 「※語り( 02:00:39 )」のような補足の中の時刻は使わない
  const times = [...text.matchAll(TIME_GLOBAL)];
  if (times.length === 0) return null;
  // 続けて並んだ時刻(範囲や、曲紹介・開始・終了)の数。曲名のあとの補足に書かれた時刻
  // (「アイドル/YOASOBI (01:07:15 PON)」)は並びに入れず、曲名の側に残す
  let chain = 1;
  while (chain < times.length) {
    const before = times[chain - 1];
    if (!TIME_GAP.test(text.slice((before.index ?? 0) + before[0].length, times[chain].index))) break;
    chain++;
  }
  const pick = chain >= 3 ? times[1] : times[0];
  const lastTime = times[chain - 1];
  const prefix = text.slice(0, times[0].index).replace(/^[└├┗┣]\s*/, '').trim();
  // 時刻より前の曲番号。「M01」「No.01 /」のほか、「79.6:55:51 ～」のような番号だけのもの
  const prefixNo = prefix.match(/^(?:(?:M|No\.?)\s*(\d{1,3})\b|(\d{1,3})\s*[.．:：)）]?$)/i);
  const rest = text.slice((lastTime.index ?? 0) + lastTime[0].length);
  const afterLeading = rest.replace(LEADING, '');
  // 時刻より前に番号があれば、時刻のあとは番号として読まない(「79.6:55:51 ～ No.1／mona」の「No.1」は曲名)
  const lead = prefixNo ? { no: null, rest: afterLeading } : stripLead(rest);
  return {
    time: toSeconds(pick[1], pick[2], pick[3]),
    prefixNo: prefixNo ? Number(prefixNo[1] ?? prefixNo[2]) : null,
    rest,
    separators: SEPARATORS.map((sep) => afterLeading.search(sep) >= 0),
    no: lead.no,
    body: lead.rest,
    numberedByNo: lead.no !== null && /^No/i.test(afterLeading),
    unnumbered: afterLeading,
    songText: stripNotes(lead.rest),
    commaShaped: isBilingualComma(rest.trim()),
    songs: new Map(),
  };
}

/** セトリとは別の、雑談も含む全体のタイムスタンプ(目次)の見出し */
const OTHER_HEADING = /タイムスタンプ|目次|雑談|トーク|配信内容|time\s*stamps?|chat/i;

/**
 * 「セトリ」の見出しから、次の見出し(「タイムスタンプ」など)の手前までの行。見出しが無ければ null。
 * セトリと目次の両方に曲が書かれているときは、セトリの方だけを読むために使う
 */
function setlistSection(lines: Line[]): Line[] | null {
  const start = lines.findIndex((l) => l.heading && !l.hasTime);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.text && !l.hasTime && OTHER_HEADING.test(l.text) && !l.heading);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * 「No.1」のような曲名を、曲番号として読んでしまった行を直す(「0:10 No.1 / 西野カナ」は、そのままだと番号 1 の
 * 「西野カナ」になり、曲名とアーティストの形にならずに落ちる)。「No.」で番号を振っているセトリは、ほとんどの行が
 * その形になるので、その形の行が時刻のある行の半分に満たないときは、番号ではなく曲名として読み直す
 */
function keepNoTitles(lines: Line[]) {
  const timed = lines.flatMap((l) => (l.timed ? [l.timed] : []));
  const byNo = timed.filter((t) => t.numberedByNo);
  if (byNo.length === 0 || byNo.length * 2 >= timed.length) return;
  for (const t of byNo) {
    t.no = null;
    t.body = t.unnumbered;
    t.songText = stripNotes(t.unnumbered);
  }
}

/**
 * 読み取りの規則の版。検索用に、読み取った曲を DB に保存している(setlists.songs)ので、
 * 読み取りの結果が変わるように規則を直したときは、この数を 1 つ増やす(同期のときに全部を読み取り直す)
 */
export const SETLIST_PARSER_VERSION = 2;

/** 行が、文字より先に時刻で始まるか(「101.9:01:00 ～ 曲/A」「▶05:52〜」。「ありがとう! 0:59 ここ」は違う) */
const STARTS_WITH_TIME = /^[^\p{L}]*\d{1,2}:\d{2}/u;

/**
 * 返信が、セトリの続きに見えるか。時刻が SETLIST_MIN_TIMESTAMPS 個以上あるもの。それより少なくても、
 * 最初の行が「セトリ」の見出しか、時刻で始まるものは続きとみなす(最後の返信は、曲が 1〜2 曲だけのことがある)。
 * 時刻に触れただけの雑談の返信(「ありがとう! 0:59 ここ / 最高」)は入れない
 */
function isContinuation(text: string): boolean {
  if (hasTimestamps(text, SETLIST_MIN_TIMESTAMPS)) return true;
  if (!hasTimestamps(text, 1)) return false;
  const first = splitLines(text.slice(0, SETLIST_MAX_CHARS)).find((l) => l.trim() !== '')?.trim().slice(0, MAX_LINE_CHARS) ?? '';
  return SETLIST_HEADING.test(first) || STARTS_WITH_TIME.test(first);
}

/** つなげたセトリの長さの上限(YouTube のコメント 1 つ分。保存する大きさを、コメント 1 つのときと同じに抑える) */
const MERGED_MAX_CHARS = 10_000;

/**
 * セトリのコメントに、同じ書き手が返信で続きを書いていれば、書いた順につなげる。
 * 曲の多い歌枠では、セトリが 1 つのコメントに収まらず「セトリ①」「セトリ②」と返信に分けて書かれることがある。
 * つなげるのは、コメントと同じ書き手の、セトリの続きに見える返信だけ(isContinuation)。
 * ほかの人の返信や、お礼などの返信は入れない
 */
export function mergeSetlistReplies(
  comment: { text: string; authorChannelId: string | null },
  replies: { text: string; authorChannelId: string | null; publishedAt: string }[],
): string {
  if (comment.authorChannelId === null) return comment.text;
  const parts = [comment.text];
  let chars = comment.text.length;
  const own = replies
    .filter((r) => r.authorChannelId === comment.authorChannelId && isContinuation(r.text))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? -1 : a.publishedAt > b.publishedAt ? 1 : 0));
  for (const reply of own) {
    if (chars + reply.text.length + 1 > MERGED_MAX_CHARS) break;
    parts.push(reply.text);
    chars += reply.text.length + 1;
  }
  return parts.join('\n');
}

/** コメントが読み取りの上限を超えていて、途中までしか読まれないか */
export function isSetlistTruncated(raw: string): boolean {
  return raw.length > SETLIST_MAX_CHARS || setlistLineCount(raw) > SETLIST_MAX_LINES;
}

/** コメントの行数(読み取りと同じ分け方で数える) */
export const setlistLineCount = (raw: string) => splitLines(raw.slice(0, MERGED_MAX_CHARS)).length;

export function parseSetlist(raw: string): SetlistSong[] {
  const lines = splitLines(raw.slice(0, SETLIST_MAX_CHARS))
    .slice(0, SETLIST_MAX_LINES)
    .map((l) => l.trim())
    .map((l) => readLine(l.length > MAX_LINE_CHARS ? '' : l));
  keepNoTitles(lines);
  const section = setlistSection(lines);
  const fromSection = section ? readLines(section) : [];
  // 見出しの下で 3 曲以上読めればセトリの部分だけを使う。読めなければ(見出しだけ・見出しの外に曲)全体を読む
  const songs = fromSection.length >= 3 ? fromSection : readLines(lines);
  return finish(songs.length > 0 ? songs : readTitleOnly(lines));
}

function readLines(lines: Line[]): Found[] {
  const separators = separatorsFor(lines);
  const commaMode = lines.filter((l) => l.timed?.commaShaped).length >= 3;
  // この読み方(区切りの優先順と「,」区切りかどうか)の目印。同じ読み方で読んだ行は、結果を使い回す
  const mode = `${commaMode}${separators.map((sep) => SEPARATORS.indexOf(sep)).join('')}`;
  const songs: Found[] = [];
  // 直前の時刻の行(次の行への折り返しや、次の行に書かれた曲をつなげるため)
  let last: {
    line: TimedLine;
    rest: string;
    no: number | null;
    songIndex: number | null;
    awaiting: boolean;
    /** 次の行をつなげた回数 */
    folds: number;
  } | null = null;

  lines.forEach(({ text, timed }) => {
    if (!text) return;

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
      } else if (/^[(（]/.test(text) && last.folds < MAX_FOLDS && last.rest.length + text.length < MAX_FOLDED_CHARS) {
        // 「(Kaijuu no Hanauta) - Vaundy」のような折り返し。つなげるたびに行を読み直すので、回数と長さを抑える
        last.folds++;
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

    const { no, body: rest } = timed;
    let song = timed.songs.get(mode);
    if (song === undefined) {
      song = readSongText(timed.songText, separators, commaMode);
      timed.songs.set(mode, song);
    }
    if (song) songs.push({ no: no ?? timed.prefixNo, time: timed.time, ...song });
    last = {
      line: timed,
      rest,
      no: no ?? timed.prefixNo,
      songIndex: song ? songs.length - 1 : null,
      // 時刻のあとに何も書かれていない行は、次の行に曲が書かれていることがある
      awaiting: !song && rest.replace(/[～~〜\s]/g, '') === '',
      folds: 0,
    };
  });

  return songs;
}

/**
 * 曲名とアーティストの区切りが無いセトリ。「セトリ」の見出しより後の時刻の行と、「(歌)」の印が付いた行を、
 * 曲名だけの曲として読む(区切りで 1 曲も読めなかったときだけ使う)
 */
function readTitleOnly(lines: Line[]): Found[] {
  const marked = lines.some((l) => /[(（]歌[)）]/.test(l.text));
  const heading = lines.findIndex((l) => l.heading && !l.hasTime);
  if (!marked && heading < 0) return [];
  const songs: Found[] = [];
  let ended = false;
  lines.forEach(({ text, timed }, index) => {
    if (ended) return;
    // 見出しのセトリは、曲のあとの区切り(空行や、時刻の無い行。雑談の目次などの見出し)までで読み終える
    if (!timed && !marked && index > heading && songs.length > 0) ended = true;
    if (!timed || (!marked && index < heading)) return;
    if (/^[└├┗┣]/.test(text)) return;
    const { no } = timed;
    let title = timed.songText;
    if (marked) {
      if (!/[(（]歌[)）]\s*$/.test(title)) return;
      title = title.replace(/(?<!\s)\s*[(（]歌[)）]\s*$/, '');
    }
    if (!title || NOT_SONG.test(title) || GREETING.test(title)) return;
    songs.push({ no: no ?? timed.prefixNo, time: timed.time, title, artist: knownArtist(title) });
  });
  return songs;
}

/** 同じ曲かどうかを見るための文字列。先頭の SONG_KEY_CHARS 文字ずつで見る(正規化で何倍にも伸びる文字を長く並べられても、時間がかからないように) */
const SONG_KEY_CHARS = 30;
const songKey = (s: Found) =>
  `${s.title.slice(0, SONG_KEY_CHARS)}|${(s.artist ?? '').slice(0, SONG_KEY_CHARS)}`.normalize('NFKC').toLowerCase().replace(/[\s'"’「」『』]/g, '');

/**
 * 同じ曲の重複を除き、番号が無い・飛んだり重なったりしているときは 1 から振り直す。
 * 重複とみなすのは、開始時刻がまったく同じもの(日本語と英語でセトリを 2 回書いたもの)と、
 * 曲名とアーティストが同じもの(セトリと目次の両方に書かれた曲)。ただし両方にセトリの番号が付いていれば、
 * 書き手が別の曲として数えている(歌い直し)ので残す
 */
function finish(found: Found[]): SetlistSong[] {
  const kept: Found[] = [];
  const times = new Set<number>();
  // 曲名とアーティストごとに、残した曲の番号(番号なしは null)
  const numbers = new Map<string, Set<number | null>>();
  for (const s of found) {
    if (times.has(s.time)) continue;
    const key = songKey(s);
    const same = numbers.get(key);
    if (same !== undefined && (s.no === null || same.has(null) || same.has(s.no))) continue;
    kept.push(s);
    times.add(s.time);
    if (same) same.add(s.no);
    else numbers.set(key, new Set([s.no]));
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
