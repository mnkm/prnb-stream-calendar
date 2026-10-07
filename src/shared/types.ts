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
}
