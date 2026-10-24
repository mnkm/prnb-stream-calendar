import clsx from 'clsx';
import { Crown, EyeOff, Link2 } from 'lucide-react';
import type { CalendarEvent } from '../../shared/types';
import { LIVE_STATUS_LABEL, TYPE_META } from '../lib/meta';

/** バッジ(種別・状態などの丸い札)の共通の形 */
const BADGE = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium';

/** 配信中を示す脈打つ点 */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={clsx('relative inline-flex size-2 shrink-0', className)}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-live" />
    </span>
  );
}

export function TypeBadge({ event }: { event: CalendarEvent }) {
  const meta = TYPE_META[event.type];
  const Icon = meta.icon;
  return (
    <span className={clsx(BADGE, meta.badge)}>
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  );
}

/**
 * Twitch のアイコン。ほかのアイコン(lucide)と同じ線のアイコンにそろえる。
 * 今の lucide にはブランドのアイコンが無いため、以前の lucide の twitch アイコン(ISC ライセンス)の形を使う
 */
export function TwitchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7" />
    </svg>
  );
}

/**
 * YouTube のアイコン。ほかのボタン(lucide)と同じ線のアイコンにそろえる。
 * 今の lucide にはブランドのアイコンが無いため、以前の lucide の youtube アイコン(ISC ライセンス)の形を使う
 */
export function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  );
}

/** カレンダーのチップやブロックに付ける、Twitch の配信の小さな印 */
export function TwitchMark() {
  return (
    <span role="img" aria-label="Twitch" className="shrink-0 text-twitch">
      <TwitchIcon className="size-3" />
    </span>
  );
}

/** Twitch の配信に付ける印(YouTube には付けない) */
export function PlatformBadge({ event }: { event: CalendarEvent }) {
  if (event.platform !== 'twitch') return null;
  return (
    <span className={clsx(BADGE, 'bg-twitch/12 text-twitch')}>
      <TwitchIcon className="size-3" />
      Twitch
    </span>
  );
}

/** 取り込んだあとに再生できなくなった(非公開・削除・公開終了)もの、限定公開になったものに付ける印 */
export function AvailabilityBadge({ event }: { event: CalendarEvent }) {
  if (event.unavailableAt) {
    return (
      <span className={clsx(BADGE, 'bg-ink/10 text-muted')}>
        <EyeOff className="size-3" aria-hidden />
        再生不可
      </span>
    );
  }
  if (!event.unlisted) return null;
  return (
    <span className={clsx(BADGE, 'border border-line text-muted')}>
      <Link2 className="size-3" aria-hidden />
      限定公開
    </span>
  );
}

/** カレンダーのチップやブロックに付ける、再生不可・限定公開の小さな印 */
export function AvailabilityMark({ event }: { event: CalendarEvent }) {
  if (event.unavailableAt) return <EyeOff className="size-3 shrink-0 text-muted" aria-label="再生不可" />;
  if (event.unlisted) return <Link2 className="size-3 shrink-0 text-muted" aria-label="限定公開" />;
  return null;
}

/** タイトルの前に並べる小さな印(Twitch・メンバー限定・再生不可・限定公開)。当てはまるものだけを出す */
export function EventMarks({ event }: { event: CalendarEvent }) {
  return (
    <>
      {event.platform === 'twitch' && <TwitchMark />}
      {event.membersOnly && <Crown className="size-3 shrink-0 text-member" aria-label="メンバー限定" />}
      <AvailabilityMark event={event} />
    </>
  );
}

export function MembersOnlyBadge({ event }: { event: CalendarEvent }) {
  if (!event.membersOnly) return null;
  return (
    <span className={clsx(BADGE, 'bg-member/12 text-member')}>
      <Crown className="size-3" aria-hidden />
      メン限
    </span>
  );
}

export function LiveStatusBadge({ event }: { event: CalendarEvent }) {
  if (!event.liveStatus) return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
        event.liveStatus === 'live' && 'bg-live text-white',
        event.liveStatus === 'upcoming' && 'border border-dashed border-live/50 text-live',
        event.liveStatus === 'ended' && 'bg-ink/5 text-muted',
      )}
    >
      {event.liveStatus === 'live' && <span className="size-1.5 animate-pulse rounded-full bg-white" />}
      {LIVE_STATUS_LABEL[event.liveStatus]}
    </span>
  );
}
