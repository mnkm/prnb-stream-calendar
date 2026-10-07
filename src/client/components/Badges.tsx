import clsx from 'clsx';
import { Crown } from 'lucide-react';
import type { CalendarEvent } from '../../shared/types';
import { LIVE_STATUS_LABEL, TYPE_META } from '../lib/meta';

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
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', meta.badge)}>
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  );
}

export function MembersOnlyBadge({ event }: { event: CalendarEvent }) {
  if (!event.membersOnly) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-member/12 px-2 py-0.5 text-[11px] font-medium text-member">
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
