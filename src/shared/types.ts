export type VideoType = 'video' | 'short' | 'live';
export type LiveStatus = 'upcoming' | 'live' | 'ended';

export const VIDEO_TYPES: readonly VideoType[] = ['live', 'video', 'short'];

export interface Channel {
  id: string;
  title: string;
  /** 表示・非表示を切り替えるボタンに出す短いラベル(「公式」「💖💫」など)。null ならチャンネル名を出す */
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
}

export interface CalendarEvent {
  id: string;
  channelId: string;
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
}

/** キーワード検索の 1 ページ分(新しい順) */
export interface SearchPage {
  events: CalendarEvent[];
  /** 次のページを取るときに cursor に渡す値。最後のページなら null */
  nextCursor: string | null;
  /** 種別ごとの一致件数(種別の絞り込み前)。最初のページだけに入る */
  counts?: Record<VideoType, number>;
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
