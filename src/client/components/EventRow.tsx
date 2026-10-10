import clsx from 'clsx';
import { Music } from 'lucide-react';
import type { CalendarEvent, MatchedSong } from '../../shared/types';
import { formatDuration, formatTime } from '../lib/format';
import { Highlight } from './Highlight';
import { AvailabilityBadge, LiveStatusBadge, MembersOnlyBadge, PlatformBadge, TypeBadge } from './Badges';
import { Thumbnail } from './Thumbnail';

/** 検索結果で、1 件に出す「当たった曲」の数(残りは「ほか N 曲」) */
const MAX_MATCHED_SONGS = 3;

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
        {event.matchedSongs && <MatchedSongs songs={event.matchedSongs} terms={highlight} />}
      </div>
    </button>
  );
}

/** 検索語がセトリの曲に当たったときに、タイトルの下に出す曲の一覧 */
function MatchedSongs({ songs, terms }: { songs: MatchedSong[]; terms?: string[] }) {
  const rest = songs.length - MAX_MATCHED_SONGS;
  return (
    <ul className="flex flex-col gap-0.5 text-xs leading-snug text-muted">
      {songs.slice(0, MAX_MATCHED_SONGS).map((song, i) => (
        <li key={i} className="flex min-w-0 items-baseline gap-1">
          <Music className="size-3 shrink-0 translate-y-0.5" aria-hidden />
          <span className="min-w-0 truncate">
            <span className="font-medium text-ink/80">
              <Highlight text={song.title} terms={terms} />
            </span>
            {song.artist && (
              <>
                {' / '}
                <Highlight text={song.artist} terms={terms} />
              </>
            )}
          </span>
        </li>
      ))}
      {rest > 0 && <li className="pl-4">ほか {rest} 曲</li>}
    </ul>
  );
}
