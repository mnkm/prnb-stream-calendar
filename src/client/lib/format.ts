import { format, isSameDay, roundToNearestMinutes } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { CalendarEvent, Channel } from '../../shared/types';

/** 月表示・リスト表示用。配信は予定より数分遅れて始まることが多いので、5 分単位で切り捨てて見やすくする */
export const formatTime = (iso: string) =>
  format(roundToNearestMinutes(new Date(iso), { nearestTo: 5, roundingMethod: 'floor' }), 'HH:mm');

export const formatDayHeading = (date: Date) => format(date, 'M月d日 (E)', { locale: ja });

/** ライブは「開始 – 終了」、それ以外は公開日時 */
export function formatEventWhen(event: CalendarEvent): string {
  const start = new Date(event.eventAt);
  const base = format(start, 'yyyy年M月d日 (E) HH:mm', { locale: ja });
  if (!event.endedAt) return base;
  const end = new Date(event.endedAt);
  return `${base} – ${format(end, isSameDay(start, end) ? 'HH:mm' : 'M月d日 HH:mm', { locale: ja })}`;
}

export function formatDuration(totalSec: number | null): string | null {
  if (!totalSec) return null;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export const twitchChannelUrl = (login: string) => `https://www.twitch.tv/${encodeURIComponent(login)}`;

/** Twitch は、配信中ならチャンネル、終わっていればアーカイブを開く(アーカイブが無ければチャンネル) */
export function watchUrl(event: CalendarEvent, channel?: Channel): string {
  if (event.platform === 'twitch') {
    if (event.twitchVideoId && event.liveStatus !== 'live') return `https://www.twitch.tv/videos/${event.twitchVideoId}`;
    return twitchChannelUrl(channel?.twitchLogin ?? '');
  }
  return event.type === 'short'
    ? `https://www.youtube.com/shorts/${event.id}`
    : `https://www.youtube.com/watch?v=${event.id}`;
}
