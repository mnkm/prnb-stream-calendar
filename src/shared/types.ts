export type VideoType = 'video' | 'short' | 'live';
export type LiveStatus = 'upcoming' | 'live' | 'ended';

export type Platform = 'youtube' | 'twitch';

export const VIDEO_TYPES: readonly VideoType[] = ['live', 'video', 'short'];

/**
 * 画面の表示・非表示の切り替えの単位。種別に加えて、Twitch の配信を別に切り替えられる。
 * Twitch の配信は種別では「ライブ」なので、ライブを非表示にすると Twitch も表示されない。
 * 件数は、live が YouTube のライブ、twitch が Twitch の配信(重ねて数えない)
 */
export type EventFilter = VideoType | 'twitch';

export const EVENT_FILTERS: readonly EventFilter[] = [...VIDEO_TYPES, 'twitch'];

/** その切り替えが、実際に表示される状態か(Twitch は、ライブも表示しているときだけ) */
export const isFilterOn = (filters: ReadonlySet<EventFilter>, key: EventFilter) =>
  filters.has(key) && (key !== 'twitch' || filters.has('live'));

/** 予定が属する切り替えの単位 */
export const filterOf = (event: { type: VideoType; platform: Platform }): EventFilter =>
  event.platform === 'twitch' ? 'twitch' : event.type;

export interface Channel {
  id: string;
  title: string;
  /** 表示・非表示を切り替えるボタンに出す短いラベル(「公式」「桃瀬にな」など)。null ならチャンネル名を出す */
  label: string | null;
  iconUrl: string | null;
  color: string;
  description: string | null;
  /** @ハンドル(例: @yurausui) */
  customUrl: string | null;
  bannerUrl: string | null;
  /** 登録者数。非公開なら null */
  subscriberCount: number | null;
  videoCount: number | null;
  /** Twitch にもチャンネルがある場合のログイン名(twitch.tv/◯◯ の部分) */
  twitchLogin: string | null;
  twitchFollowerCount: number | null;
  /** タレント別の楽曲リストのサイトで、このチャンネルを表示する talent パラメータの値。無ければ null */
  songlistTalent: string | null;
}

export interface CalendarEvent {
  /** YouTube は動画 ID、Twitch は 'twitch:' + 配信の ID */
  id: string;
  channelId: string;
  platform: Platform;
  /** Twitch のアーカイブの動画 ID。配信中でまだ無い・保存されていない・公開が終わった場合は null */
  twitchVideoId: string | null;
  /** 取り込んだあとに再生できなくなった(非公開・削除・公開終了)と確認した日時。再生できるなら null */
  unavailableAt: string | null;
  /** YouTube で限定公開になっている */
  unlisted: boolean;
  type: VideoType;
  liveStatus: LiveStatus | null;
  title: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  /** カレンダー上の配置日時 (UTC ISO 8601)。ライブとプレミア公開は開始(予定)時刻、それ以外は公開日時 */
  eventAt: string;
  endedAt: string | null;
  publishedAt: string;
  /** メンバー限定。メンバー以外は埋め込み再生できない */
  membersOnly: boolean;
  /** キーワード検索の結果だけに入る。セトリの中で、検索語に当たった曲(セトリの順) */
  matchedSongs?: MatchedSong[];
}

/** 検索語に当たった、セトリの中の曲 */
export interface MatchedSong {
  title: string;
  artist: string | null;
}

/** Twitch のクリップ(視聴者などが配信から切り出した短い動画) */
export interface Clip {
  id: string;
  channelId: string;
  /** 元の配信(CalendarEvent の id)。カレンダーに無い配信のクリップは null */
  eventId: string | null;
  title: string;
  /** クリップを作った人 */
  creatorName: string | null;
  viewCount: number;
  durationSec: number | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

export type ClipSort = 'popular' | 'new';

/** チャンネルのクリップの 1 ページ分 */
export interface ClipPage {
  clips: Clip[];
  /** 次のページを取るときに offset に渡す値。最後のページなら null */
  nextOffset: number | null;
}

/** キーワード検索の 1 ページ分(新しい順) */
export interface SearchPage {
  events: CalendarEvent[];
  /** 次のページを取るときに cursor に渡す値。最後のページなら null */
  nextCursor: string | null;
  /** 切り替えの単位ごとの一致件数(種別・Twitch の絞り込み前)。最初のページだけに入る */
  counts?: Record<EventFilter, number>;
}

/** 動画の一覧での、メンバー限定の絞り込み。all はすべて、only はメンバー限定だけ、exclude はメンバー限定を除く */
export type MembersFilter = 'all' | 'only' | 'exclude';

/** 動画の一覧の件数(種別ごとと、メンバー限定)。種別・メンバー限定・before・cursor の絞り込み前に数える */
export interface VideoListCounts {
  live: number;
  video: number;
  short: number;
  members: number;
}

/** 動画の一覧の 1 ページ分(新しい順)。YouTube の、配信が終わったものと公開済みのものだけで、再生できないもの・限定公開は含まない */
export interface VideoListPage {
  events: CalendarEvent[];
  /** 次のページを取るときに cursor に渡す値。最後のページなら null */
  nextCursor: string | null;
  /** 最初のページ(cursor が無いとき)だけに入る */
  counts?: VideoListCounts;
}

/** 歌枠のセトリ(コメントの原文)。読み取りは src/shared/setlist.ts の parseSetlist で行う */
export interface Setlist {
  /** コメントを書いた人の表示名(@ から始まるハンドル) */
  author: string;
  text: string;
}

/** チャンネルが作った再生リスト */
export interface Playlist {
  id: string;
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
  /** YouTube 上の本数(このカレンダーに無い非公開・削除済みの動画も含む) */
  itemCount: number;
  /** 初めて見る人向けのおすすめ(一覧の先頭に固定する) */
  recommended: boolean;
}

/** 再生リストの中身。events はこのカレンダーに登録済みの動画だけ(再生リストの並び順) */
export interface PlaylistDetail {
  playlist: Playlist;
  events: CalendarEvent[];
}

/** 朝活の配信のコメントのうち、ボイスや今日の質問のタイムスタンプを含むもの(選び方は src/shared/morning.ts) */
export interface MorningComment {
  id: string;
  /** コメントを書いた人の表示名(@ から始まるハンドル) */
  author: string;
  authorChannelId: string | null;
  text: string;
  likeCount: number;
}

/** 朝活の配信 1 本分 */
export interface MorningVideo {
  videoId: string;
  channelId: string;
  title: string;
  /** 配信の開始日時(UTC、ISO 8601。CalendarEvent の eventAt と同じ) */
  eventAt: string;
  /** 配信の終了日時 */
  endedAt: string;
  /** 関連性順(YouTube の並び) */
  comments: MorningComment[];
}

/** /api/morning-comments の 1 ページ */
export interface MorningCommentPage {
  videos: MorningVideo[];
  /** 次のページを取るときに cursor に渡す値。最後のページなら null */
  nextCursor: string | null;
}
