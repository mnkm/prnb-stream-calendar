import {
  SETLIST_MAX_CHARS,
  SETLIST_MAX_LINES,
  type SetlistSong,
  countTimestamps,
  formatSetlistTime,
  isSetlistTruncated,
  setlistLineCount,
  parseSetlist,
} from './setlist';

/**
 * セトリの点検。表示と同じ読み取り(parseSetlist)にかけ、正しく表示されていない可能性があるものを見つける。
 * 書き手が変わって、読み取りの規則に合わない書き方のセトリが出てきたことに気づくために使う
 */

export type SetlistProblemKind =
  | 'not_found'
  | 'no_songs'
  | 'few_songs'
  | 'not_song'
  | 'leftover'
  | 'backwards'
  | 'over_duration'
  | 'no_artist'
  | 'too_long'
  | 'truncated'
  | 'error';

export interface SetlistProblem {
  kind: SetlistProblemKind;
  /** 理由(Issue に載せる文) */
  message: string;
  /** 該当する曲(「03 曲名 / アーティスト」の形) */
  songs: string[];
}

/** 曲以外の時刻(開始・挨拶・告知など)が曲名になっていないか */
const NOT_SONG_WORDS =
  /^(?:開始|配信開始|配信終了|告知|宣伝|エンディング|ED|OP|オープニング|雑談|挨拶|こん|おつ|乾杯|休憩|トーク|キリバン|登録者|お知らせ|スパチャ|締め|まとめ|stream\s*(?:start|end))/i;
/**
 * 曲名・アーティストに残った時刻・区切り記号・補足の印。「20-CRY-」「-Piano Ver.-」「DISH//」のように
 * 記号が曲名の一部のものは数えないよう、区切りは空白をはさむもの・記号だけのものに限る。
 * 「@」は「cosMo@暴走P」「THE IDOLM@STER」など名前に使われるので見ない
 */
const LEFTOVER_TIME = /\d{1,2}:\d{2}/;
const LEFTOVER_EDGE = /^[/／\-‐–—:：,，]\s|\s[/／\-‐–—,，]$|^[/／\-‐–—:：,，\s]+$/;
const LEFTOVER_MARK = /※/;

const label = (s: SetlistSong) => `${String(s.no).padStart(2, '0')} ${formatSetlistTime(s.time)} ${s.title} / ${s.artist ?? '(なし)'}`;

/**
 * 点検する。text が null はセトリのコメントが見つからなかった(あきらめた)歌枠。
 * durationSec は配信の長さ(わかれば、時刻が長さを超えていないかも見る)
 */
export function auditSetlist(text: string | null, durationSec: number | null): SetlistProblem[] {
  if (text === null) {
    return [{ kind: 'not_found', message: '配信終了から 7 日たっても、セトリのコメントが見つからない', songs: [] }];
  }
  const songs = parseSetlist(text);
  // 読み取りの上限を超えたコメントは、上限より先に書かれた曲が出ない
  const problems: SetlistProblem[] = isSetlistTruncated(text)
    ? [
        {
          kind: 'truncated',
          message: `コメントが長く、途中までしか読んでいない(読むのは ${SETLIST_MAX_LINES} 行・${SETLIST_MAX_CHARS} 文字まで。このコメントは ${setlistLineCount(text)} 行・${text.length} 文字)`,
          songs: [],
        },
      ]
    : [];
  if (songs.length === 0) {
    return [
      ...problems,
      {
        kind: 'no_songs',
        message: `コメントに時刻が ${countTimestamps(text)} 個あるのに、曲が 1 曲も読み取れない(セトリ欄が出ない)`,
        songs: [],
      },
    ];
  }

  const add = (kind: SetlistProblemKind, message: string, list: SetlistSong[]) => {
    if (list.length > 0) problems.push({ kind, message, songs: list.map(label) });
  };
  if (songs.length <= 2) add('few_songs', `曲が ${songs.length} 曲しか読み取れない`, songs);
  add('not_song', '曲以外(開始・挨拶・告知など)が曲として出ている疑い', songs.filter((s) => NOT_SONG_WORDS.test(s.title)));
  add(
    'leftover',
    '曲名・アーティストに時刻・区切り記号・「※」が残っている',
    songs.filter((s) =>
      [s.title, s.artist ?? ''].some((v) => LEFTOVER_TIME.test(v) || LEFTOVER_EDGE.test(v) || LEFTOVER_MARK.test(v)),
    ),
  );
  add('backwards', '時刻が前の曲より前になっている', songs.filter((s, i) => i > 0 && s.time < songs[i - 1].time));
  if (durationSec) add('over_duration', '時刻が配信の長さを超えている', songs.filter((s) => s.time > durationSec));
  add('no_artist', 'アーティストが空', songs.filter((s) => !s.artist));
  add('too_long', '曲名・アーティストが長すぎる', songs.filter((s) => s.title.length > 40 || (s.artist?.length ?? 0) > 50));
  return problems;
}

/**
 * 同じ問題を何度も知らせないための目印。コメントと問題の種類・該当の曲が同じなら、同じ目印になる
 * (読み取りの規則を直して結果が変わったり、別のコメントに変わったりしたときだけ、もう一度知らせる)
 */
export const problemSignature = (commentId: string | null, problems: SetlistProblem[]) =>
  [commentId ?? '', ...problems.map((p) => `${p.kind}:${p.songs.join('|')}`)].join('\n');
