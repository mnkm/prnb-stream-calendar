import { ArrowLeft, Clock, ExternalLink, Play, Timer, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { CalendarEvent, Channel } from '../../shared/types';
import { formatDayHeading, formatDuration, formatEventWhen, watchUrl } from '../lib/format';
import { LiveStatusBadge, TypeBadge } from './Badges';
import { EventRow } from './EventRow';
import { Thumbnail } from './Thumbnail';

export type DialogState =
  | { kind: 'event'; event: CalendarEvent; day?: { date: Date; events: CalendarEvent[] } }
  | { kind: 'day'; date: Date; events: CalendarEvent[] };

interface Props {
  state: DialogState | null;
  channelMap: Map<string, Channel>;
  showChannelColor: boolean;
  onChange: (state: DialogState | null) => void;
}

export function EventDialog({ state, channelMap, showChannelColor, onChange }: Props) {
  const open = state !== null;
  const close = () => onChange(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onChange(null);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onChange]);

  return (
    <AnimatePresence>
      {state && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface shadow-2xl sm:max-w-xl sm:rounded-3xl"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }}
          >
            <button
              autoFocus
              aria-label="閉じる"
              onClick={close}
              className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
            >
              <X className="size-4" />
            </button>

            {state.kind === 'event' ? (
              <EventDetail
                key={state.event.id}
                event={state.event}
                onBack={state.day ? () => onChange({ kind: 'day', ...state.day! }) : undefined}
              />
            ) : (
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
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function EventDetail({ event, onBack }: { event: CalendarEvent; onBack?: () => void }) {
  const [playing, setPlaying] = useState(false);
  const duration = formatDuration(event.durationSec);

  return (
    <div>
      <div className="relative aspect-video bg-black">
        {playing ? (
          <iframe
            className="size-full"
            src={`https://www.youtube-nocookie.com/embed/${event.id}?autoplay=1`}
            title={event.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button className="group size-full" onClick={() => setPlaying(true)} aria-label="ここで再生">
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
      </div>
    </div>
  );
}
