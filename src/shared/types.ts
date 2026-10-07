export type VideoType = 'video' | 'short' | 'live';
export type LiveStatus = 'upcoming' | 'live' | 'ended';

export const VIDEO_TYPES: readonly VideoType[] = ['live', 'video', 'short'];

export interface Channel {
  id: string;
  title: string;
  iconUrl: string | null;
  color: string;
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
