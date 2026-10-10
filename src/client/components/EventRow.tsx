import clsx from 'clsx';
import type { CalendarEvent } from '../../shared/types';
import { formatDuration, formatTime } from '../lib/format';
import { Highlight } from './Highlight';
import { AvailabilityBadge, LiveStatusBadge, MembersOnlyBadge, PlatformBadge, TypeBadge } from './Badges';
import { Thumbnail } from './Thumbnail';

/** リスト表示・日別ダイアログで使う 1 行 */
export function EventRow({
  event,
  channelColor,
  highlight,
  onClick,
}: {
  event: CalendarEvent;
  channelColor?: string;
  /** 検索結果で強調する語 */
  highlight?: string[];
  onClick: () => void;
}) {
  const duration = formatDuration(event.durationSec);
  return (
    <button
      onClick={onClick}
      className={clsx(
        'group flex w-full gap-3 rounded-2xl border border-line bg-surface p-2.5 text-left transition sm:gap-4',
        'hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgb(0_0_0/0.25)]',
        event.liveStatus === 'live' && 'ring-1 ring-live/60',
      )}
    >
      <div className="relative w-32 shrink-0 sm:w-44">
        {/* 再生できなくなったものは、サムネイルとタイトルを薄くする */}
        <Thumbnail event={event} className={clsx('aspect-video rounded-xl', event.unavailableAt && 'opacity-50')} />
        {duration && (
          <span className="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1 py-px text-[10px] font-medium text-white tabular-nums">
            {duration}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold tabular-nums">{formatTime(event.eventAt)}</span>
          <TypeBadge event={event} />
          <LiveStatusBadge event={event} />
          <PlatformBadge event={event} />
          <MembersOnlyBadge event={event} />
          <AvailabilityBadge event={event} />
          {channelColor && <span className="size-2 rounded-full" style={{ background: channelColor }} />}
        </div>
        <p
          className={clsx(
            'line-clamp-2 text-sm leading-snug font-medium group-hover:text-ink',
            event.unavailableAt ? 'text-muted' : 'text-ink/90',
          )}
        >
          <Highlight text={event.title} terms={highlight} />
        </p>
      </div>
    </button>
  );
}
