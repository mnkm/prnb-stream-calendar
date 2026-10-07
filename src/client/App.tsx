import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { addMonths, format, startOfDay, startOfMonth } from 'date-fns';
import { type PanInfo, motion, useDragControls } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { VIDEO_TYPES, type VideoType } from '../shared/types';
import { ChannelDialog, type ChannelDialogState } from './components/ChannelDialog';
import { EventDialog, type DialogState } from './components/EventDialog';
import { Header } from './components/Header';
import { ListView } from './components/ListView';
import { MonthView } from './components/MonthView';
import { SearchResults } from './components/SearchResults';
import { TimeGridView } from './components/TimeGridView';
import { Toolbar } from './components/Toolbar';
import { splitSearchTerms } from '../shared/search';
import { channelsQuery, eventsQuery, searchQuery } from './lib/api';
import {
  type ViewMode,
  groupByDay,
  monthGrid,
  parseDateParam,
  parseViewParam,
  periodRange,
  shiftPeriod,
  weekDays,
} from './lib/calendar';

const LIVE_REFRESH_MS = 5 * 60_000;
/** スワイプで前後に移動する距離(px)と速さ(px/秒)のしきい値 */
const SWIPE_DISTANCE_PX = 80;
const SWIPE_MIN_DISTANCE_PX = 30;
const SWIPE_VELOCITY = 500;
/** 入力が止まってから検索するまでの待ち時間 */
const SEARCH_DEBOUNCE_MS = 300;

function initialDate() {
  return parseDateParam(new URLSearchParams(location.search)) ?? startOfDay(new Date());
}

function initialView(): ViewMode {
  const fromUrl = parseViewParam(new URLSearchParams(location.search).get('view'));
  return fromUrl ?? 'week';
}

const initialQuery = () => new URLSearchParams(location.search).get('q') ?? '';

/** value が delay の間変わらなかったら、その値を返す */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const toggle = <T,>(set: ReadonlySet<T>, value: T) => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
};

export default function App() {
  const queryClient = useQueryClient();
  // 表示中の日付。月表示・リスト表示ではその月、週表示ではその週、日表示ではその日を表示する
  const [date, setDate] = useState(initialDate);
  const [direction, setDirection] = useState(0);
  const [view, setView] = useState(initialView);
  const month = useMemo(() => startOfMonth(date), [date]);
  const period = useMemo(() => periodRange(view, date), [view, date]);
  const days = useMemo(() => (view === 'week' ? weekDays(date) : [startOfDay(date)]), [view, date]);
  const [types, setTypes] = useState<ReadonlySet<VideoType>>(() => new Set(VIDEO_TYPES));
  const [hiddenChannels, setHiddenChannels] = useState<ReadonlySet<string>>(() => new Set());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [channelDialog, setChannelDialog] = useState<ChannelDialogState | null>(null);

  const { data: channels = [] } = useQuery(channelsQuery);

  // キーワード検索。検索欄が開いていて語が入っているあいだは、カレンダーの代わりに検索結果を表示する
  const [searchOpen, setSearchOpen] = useState(() => initialQuery() !== '');
  const [searchInput, setSearchInput] = useState(initialQuery);
  const searchTerm = useDebounced(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  const searching = searchOpen && searchTerm !== '';
  // 種別・チャンネルの絞り込みはサーバー側で行い、絞り込んだ結果を全件たどれるようにする
  const searchTypes = useMemo(() => VIDEO_TYPES.filter((t) => types.has(t)), [types]);
  const searchChannels = useMemo(
    () => (hiddenChannels.size > 0 ? channels.filter((c) => !hiddenChannels.has(c.id)).map((c) => c.id) : []),
    [channels, hiddenChannels],
  );
  const searchResult = useInfiniteQuery({
    ...searchQuery(searchTerm, searchTypes, searchChannels),
    enabled: searching && searchTypes.length > 0,
    placeholderData: keepPreviousData,
  });
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchInput('');
  };

  const grid = useMemo(() => monthGrid(month), [month]);
  const eventsResult = useQuery({
    ...eventsQuery(grid.start, grid.end),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS,
  });
  const allEvents = useMemo(() => eventsResult.data ?? [], [eventsResult.data]);

  // 週・日表示も、その日を含む月グリッド(前後の週を含む)のデータで表示する。
  // 前後の月を先読みして切り替えを即時にする
  useEffect(() => {
    for (const m of [addMonths(month, -1), addMonths(month, 1)]) {
      const g = monthGrid(m);
      void queryClient.prefetchQuery(eventsQuery(g.start, g.end));
    }
  }, [month, queryClient]);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.delete('month');
    url.searchParams.set('view', view);
    url.searchParams.set('date', format(date, 'yyyy-MM-dd'));
    if (searching) url.searchParams.set('q', searchTerm);
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);
  }, [view, date, searching, searchTerm]);

  const channelMap = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);
  const showChannelColor = channels.length > 1;

  const channelVisible = useMemo(
    () => allEvents.filter((e) => !hiddenChannels.has(e.channelId)),
    [allEvents, hiddenChannels],
  );
  const counts = useMemo(() => {
    const result: Record<VideoType, number> = { live: 0, video: 0, short: 0 };
    for (const e of channelVisible) {
      const at = new Date(e.eventAt);
      if (at >= period.start && at < period.end) result[e.type]++;
    }
    return result;
  }, [channelVisible, period]);
  const visible = useMemo(() => channelVisible.filter((e) => types.has(e.type)), [channelVisible, types]);
  const byDay = useMemo(() => groupByDay(visible), [visible]);
  const searchEvents = useMemo(
    () => (searchTypes.length > 0 ? (searchResult.data?.pages.flatMap((p) => p.events) ?? []) : []),
    [searchResult.data, searchTypes],
  );

  const shift = (delta: number) => {
    setDirection(delta);
    setDate((d) => shiftPeriod(view, d, delta));
  };
  const goToday = () => {
    const target = startOfDay(new Date());
    const current = periodRange(view, date).start;
    setDirection(Math.sign(periodRange(view, target).start.getTime() - current.getTime()));
    setDate(target);
  };
  // カレンダーを左右にスワイプして前後の月・週・日に移動する(タッチ操作のみ)
  const dragControls = useDragControls();
  const swiping = useRef(false);
  const onSwipeEnd = (_: PointerEvent, { offset, velocity }: PanInfo) => {
    // 指を離したときの click がカレンダー上の予定に届かないよう、イベント処理が終わってから戻す
    setTimeout(() => {
      swiping.current = false;
    });
    if (Math.abs(offset.x) < Math.abs(offset.y)) return;
    const far = Math.abs(offset.x) > SWIPE_DISTANCE_PX;
    const flick = Math.abs(offset.x) > SWIPE_MIN_DISTANCE_PX && Math.abs(velocity.x) > SWIPE_VELOCITY;
    if (far || flick) shift(offset.x < 0 ? 1 : -1);
  };

  const openDay = (day: Date) => {
    setDirection(0);
    setView('day');
    setDate(day);
  };

  return (
    <div className="min-h-dvh">
      <div className="app-backdrop" aria-hidden />
      <Header
        channels={channels}
        view={view}
        onViewChange={(v) => {
          // 表示を切り替えたら検索をやめてカレンダーに戻る
          closeSearch();
          setView(v);
        }}
        search={{
          open: searchOpen,
          value: searchInput,
          onChange: setSearchInput,
          onOpen: () => setSearchOpen(true),
          onClose: closeSearch,
        }}
        onSelectChannel={(channel) => setChannelDialog({ kind: 'channel', channel })}
        onOpenChannelList={() => setChannelDialog({ kind: 'list' })}
      />

      <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        {searching ? (
          <SearchResults
            query={searchTerm}
            terms={splitSearchTerms(searchTerm)}
            events={searchEvents}
            counts={searchResult.data?.pages[0]?.counts}
            isLoading={searchTypes.length > 0 && (searchResult.isPending || searchResult.isPlaceholderData)}
            isError={searchResult.isError}
            hasNextPage={searchResult.hasNextPage}
            isFetchingNextPage={searchResult.isFetchingNextPage}
            onLoadMore={() => void searchResult.fetchNextPage()}
            types={types}
            onToggleType={(t) => setTypes((s) => toggle(s, t))}
            channelMap={channelMap}
            showChannelColor={showChannelColor}
            onSelectEvent={(event) => setDialog({ kind: 'event', event })}
          />
        ) : (
          <>
            <Toolbar
              month={month}
              view={view}
              onPrev={() => shift(-1)}
              onNext={() => shift(1)}
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
              key={`${view}-${period.start.toISOString()}`}
              initial={{ opacity: 0, x: direction * 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              drag="x"
              dragListener={false}
              dragControls={dragControls}
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.3}
              dragSnapToOrigin
              // 縦方向のスクロールはブラウザに任せる
              style={{ touchAction: 'pan-y' }}
              onPointerDown={(e) => {
                if (e.pointerType === 'touch') dragControls.start(e);
              }}
              onDragStart={() => {
                swiping.current = true;
              }}
              onDragEnd={onSwipeEnd}
              onClickCapture={(e) => {
                if (!swiping.current) return;
                e.stopPropagation();
                e.preventDefault();
              }}
            >
              {view === 'week' || view === 'day' ? (
                <TimeGridView
                  days={days}
                  events={visible}
                  channelMap={channelMap}
                  showChannelColor={showChannelColor}
                  onSelectEvent={(event) => setDialog({ kind: 'event', event })}
                  onSelectDay={view === 'week' ? openDay : undefined}
                />
              ) : view === 'month' ? (
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
          </>
        )}
      </main>

      <EventDialog state={dialog} channelMap={channelMap} showChannelColor={showChannelColor} onChange={setDialog} />
      <ChannelDialog state={channelDialog} channels={channels} onChange={setChannelDialog} />
    </div>
  );
}
