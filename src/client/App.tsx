import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { addMonths, format, isSameMonth, startOfMonth } from 'date-fns';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { VIDEO_TYPES, type VideoType } from '../shared/types';
import { EventDialog, type DialogState } from './components/EventDialog';
import { Header, type ViewMode } from './components/Header';
import { ListView } from './components/ListView';
import { MonthView } from './components/MonthView';
import { Toolbar } from './components/Toolbar';
import { channelsQuery, eventsQuery } from './lib/api';
import { groupByDay, monthGrid, parseMonthParam } from './lib/calendar';

const LIVE_REFRESH_MS = 5 * 60_000;

function initialMonth() {
  return parseMonthParam(new URLSearchParams(location.search).get('month')) ?? startOfMonth(new Date());
}

function initialView(): ViewMode {
  return window.matchMedia('(min-width: 768px)').matches ? 'month' : 'list';
}

const toggle = <T,>(set: ReadonlySet<T>, value: T) => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
};

export default function App() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(initialMonth);
  const [direction, setDirection] = useState(0);
  const [view, setView] = useState(initialView);
  const [types, setTypes] = useState<ReadonlySet<VideoType>>(() => new Set(VIDEO_TYPES));
  const [hiddenChannels, setHiddenChannels] = useState<ReadonlySet<string>>(() => new Set());
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const grid = useMemo(() => monthGrid(month), [month]);
  const { data: channels = [] } = useQuery(channelsQuery);
  const eventsResult = useQuery({
    ...eventsQuery(grid.start, grid.end),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS,
  });
  const allEvents = useMemo(() => eventsResult.data ?? [], [eventsResult.data]);

  // 前後の月を先読みして切り替えを即時にする
  useEffect(() => {
    for (const m of [addMonths(month, -1), addMonths(month, 1)]) {
      const g = monthGrid(m);
      void queryClient.prefetchQuery(eventsQuery(g.start, g.end));
    }
  }, [month, queryClient]);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('month', format(month, 'yyyy-MM'));
    history.replaceState(null, '', url);
  }, [month]);

  const channelMap = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);
  const showChannelColor = channels.length > 1;

  const channelVisible = useMemo(
    () => allEvents.filter((e) => !hiddenChannels.has(e.channelId)),
    [allEvents, hiddenChannels],
  );
  const counts = useMemo(() => {
    const result: Record<VideoType, number> = { live: 0, video: 0, short: 0 };
    for (const e of channelVisible) if (isSameMonth(new Date(e.eventAt), month)) result[e.type]++;
    return result;
  }, [channelVisible, month]);
  const byDay = useMemo(
    () => groupByDay(channelVisible.filter((e) => types.has(e.type))),
    [channelVisible, types],
  );

  const shiftMonth = (delta: number) => {
    setDirection(delta);
    setMonth((m) => addMonths(m, delta));
  };
  const goToday = () => {
    const target = startOfMonth(new Date());
    setDirection(Math.sign(target.getTime() - month.getTime()));
    setMonth(target);
  };

  return (
    <div className="min-h-dvh">
      <div className="app-backdrop" aria-hidden />
      <Header channels={channels} view={view} onViewChange={setView} />

      <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <Toolbar
          month={month}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
          onToday={goToday}
          isFetching={eventsResult.isFetching}
          types={types}
          counts={counts}
          onToggleType={(t) => setTypes((s) => toggle(s, t))}
          channels={channels}
          hiddenChannels={hiddenChannels}
          onToggleChannel={(id) => setHiddenChannels((s) => toggle(s, id))}
        />

        {eventsResult.isError && (
          <p className="mb-4 rounded-2xl border border-live/30 bg-live/10 px-4 py-3 text-sm text-live">
            データを取得できませんでした。時間をおいて再度お試しください。
          </p>
        )}

        <motion.div
          key={`${view}-${month.toISOString()}`}
          initial={{ opacity: 0, x: direction * 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          {view === 'month' ? (
            <MonthView
              month={month}
              days={grid.days}
              byDay={byDay}
              channelMap={channelMap}
              showChannelColor={showChannelColor}
              onSelectEvent={(event) => setDialog({ kind: 'event', event })}
              onSelectDay={(date, events) => setDialog({ kind: 'day', date, events })}
            />
          ) : (
            <ListView
              month={month}
              byDay={byDay}
              channelMap={channelMap}
              showChannelColor={showChannelColor}
              onSelectEvent={(event) => setDialog({ kind: 'event', event })}
            />
          )}
        </motion.div>
      </main>

      <EventDialog state={dialog} channelMap={channelMap} showChannelColor={showChannelColor} onChange={setDialog} />
    </div>
  );
}
