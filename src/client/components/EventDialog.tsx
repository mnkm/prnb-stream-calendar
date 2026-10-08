import { ArrowLeft, Clock, Crown, ExternalLink, Play, Timer } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type { CalendarEvent, Channel, Playlist } from '../../shared/types';
import type { ChannelDialogState } from './ChannelDialog';
import { formatDayHeading, formatDuration, formatEventWhen, watchUrl } from '../lib/format';
import { LiveStatusBadge, MembersOnlyBadge, TypeBadge } from './Badges';
import { EventRow } from './EventRow';
import { Modal } from './Modal';
import { VideoPlaylists } from './Playlists';
import { SetlistSection } from './SetlistSection';
import { Thumbnail } from './Thumbnail';

export type DialogState =
  | {
      kind: 'event';
      event: CalendarEvent;
      /** 日別の一覧から開いたとき(戻れる) */
      day?: { date: Date; events: CalendarEvent[] };
      /** 再生リストの中身から開いたとき(戻れる) */
      playlist?: ChannelDialogState;
    }
  | { kind: 'day'; date: Date; events: CalendarEvent[] };

interface Props {
  state: DialogState | null;
  channelMap: Map<string, Channel>;
  showChannelColor: boolean;
  onChange: (state: DialogState | null) => void;
  /** 「この動画が入っている再生リスト」を押したとき */
  onOpenPlaylist: (playlist: Playlist, from: CalendarEvent) => void;
  /** 再生リストから開いた動画で「戻る」を押したとき */
  onBackToPlaylist: (state: ChannelDialogState) => void;
}

export function EventDialog({ state, channelMap, showChannelColor, onChange, onOpenPlaylist, onBackToPlaylist }: Props) {
  const close = useCallback(() => onChange(null), [onChange]);

  return (
    <Modal open={state !== null} onClose={close}>
      {state?.kind === 'event' ? (
        <EventDetail
          key={state.event.id}
          event={state.event}
          onBack={
            state.day
              ? () => onChange({ kind: 'day', ...state.day! })
              : state.playlist
                ? () => onBackToPlaylist(state.playlist!)
                : undefined
          }
          onOpenPlaylist={(p) => onOpenPlaylist(p, state.event)}
        />
      ) : state?.kind === 'day' ? (
        <div className="p-5 pt-6">
          <h2 className="mb-4 pr-10 text-lg font-semibold">{formatDayHeading(state.date)}</h2>
          <div className="flex flex-col gap-2.5">
            {state.events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                channelColor={showChannelColor ? channelMap.get(event.channelId)?.color : undefined}
                onClick={() => onChange({ kind: 'event', event, day: { date: state.date, events: state.events } })}
              />
            ))}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

/** セトリを表示する配信: 配信が終わった歌枠(メンバー限定はコメントを読めないので除く) */
const hasSetlist = (event: CalendarEvent) =>
  event.type === 'live' && event.liveStatus === 'ended' && !event.membersOnly && event.title.includes('歌枠');

function EventDetail({
  event,
  onBack,
  onOpenPlaylist,
}: {
  event: CalendarEvent;
  onBack?: () => void;
  onOpenPlaylist: (playlist: Playlist) => void;
}) {
  // 再生を始める位置(秒)。null なら再生前(サムネイルを表示)
  const [start, setStart] = useState<number | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const duration = formatDuration(event.durationSec);

  // セトリの時刻を押したら、その位置から再生し、プレーヤーが見えるところまで戻る
  const seek = (seconds: number) => {
    setStart(seconds);
    playerRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <div>
      <div ref={playerRef} className="relative aspect-video bg-black">
        {event.membersOnly ? (
          // メンバー以外は埋め込み再生できないので、サムネイルだけ表示して YouTube に誘導する
          <div className="size-full">
            <Thumbnail event={event} hd className="size-full" />
            <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-4 pt-8 pb-3 text-xs font-medium text-white">
              <Crown className="size-3.5" aria-hidden />
              メンバー限定のため、YouTube で視聴してください
            </span>
          </div>
        ) : start !== null ? (
          <iframe
            key={start}
            className="size-full"
            src={`https://www.youtube-nocookie.com/embed/${event.id}?autoplay=1&start=${start}`}
            title={event.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button className="group size-full" onClick={() => setStart(0)} aria-label="ここで再生">
            <Thumbnail event={event} hd className="size-full" />
            <span className="absolute inset-0 grid place-items-center bg-gradient-to-t from-black/50 via-transparent to-transparent">
              <span className="grid size-16 place-items-center rounded-full bg-white/90 text-black shadow-xl transition group-hover:scale-110">
                <Play className="ml-1 size-7 fill-current" />
              </span>
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeBadge event={event} />
          <LiveStatusBadge event={event} />
          <MembersOnlyBadge event={event} />
        </div>
        <h2 className="text-lg leading-snug font-semibold">{event.title}</h2>
        <dl className="grid gap-2 text-sm text-muted">
          <div className="flex items-center gap-2">
            <Clock className="size-4 shrink-0" aria-hidden />
            <dt className="sr-only">日時</dt>
            <dd>{formatEventWhen(event)}</dd>
          </div>
          {duration && (
            <div className="flex items-center gap-2">
              <Timer className="size-4 shrink-0" aria-hidden />
              <dt className="sr-only">長さ</dt>
              <dd className="tabular-nums">{duration}</dd>
            </div>
          )}
        </dl>
        <div className="flex gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-sm font-medium transition hover:bg-ink/5"
            >
              <ArrowLeft className="size-4" />
              戻る
            </button>
          )}
          <a
            href={watchUrl(event)}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-canvas transition hover:opacity-90"
          >
            YouTube で開く
            <ExternalLink className="size-4" />
          </a>
        </div>
        <VideoPlaylists videoId={event.id} onOpen={onOpenPlaylist} />
        {hasSetlist(event) && <SetlistSection videoId={event.id} onSeek={seek} />}
      </div>
    </div>
  );
}
