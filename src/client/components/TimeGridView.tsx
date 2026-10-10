import clsx from 'clsx';
import { addDays, format, getDay, isToday } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Crown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarEvent, Channel } from '../../shared/types';
import { formatTime } from '../lib/format';
import { TYPE_META } from '../lib/meta';
import { LiveDot, TwitchMark } from './Badges';
import { Thumbnail } from './Thumbnail';

const HOUR_PX = 52;
const MINUTE_MS = 60_000;
const DAY_MIN = 24 * 60;
/** 日付をまたぐ配信のために伸ばす時刻の上限(48 時 = 翌日の 24 時) */
const MAX_GRID_MIN = 48 * 60;
/** 動画・ショートは数分しかないので、ブロックが読める最小の長さ */
const MIN_BLOCK_MIN = 25;
/** 日表示はサムネイルを入れるので、最小の長さを大きくする */
const DAY_VIEW_MIN_BLOCK_MIN = 60;
/** 終了時刻が分からない配信予定の仮の長さ */
const UPCOMING_LIVE_MIN = 60;

interface Props {
  days: Date[];
  events: CalendarEvent[];
  channelMap: Map<string, Channel>;
  showChannelColor: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
  /** 週表示で日付の見出しを押したとき(日表示に切り替える) */
  onSelectDay?: (date: Date) => void;
}

interface Placed {
  event: CalendarEvent;
  /** その日の 0 時からの分 */
  top: number;
  height: number;
  col: number;
  cols: number;
}

const weekdayTone = (weekday: number) => (weekday === 0 ? 'text-sun' : weekday === 6 ? 'text-sat' : '');

/**
 * 週表示・日表示。0〜23 時を縦スクロールで表示し、予定を時刻の位置に置く。
 * 予定は配信を始めた日の列にだけ置き、日付をまたぐ配信があれば 24 時以降(25:00 など)まで表示を伸ばす
 */
export function TimeGridView({ days, events, channelMap, showChannelColor, onSelectEvent, onSelectDay }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = useNow();
  const isDayView = days.length === 1;
  const minBlock = isDayView ? DAY_VIEW_MIN_BLOCK_MIN : MIN_BLOCK_MIN;
  const columns = useMemo(
    () => days.map((day) => layoutDay(day, events, now, minBlock)),
    [days, events, now, minBlock],
  );
  const showsToday = days.some((d) => isToday(d));
  const firstTop = Math.min(...columns.flatMap((c) => c.map((p) => p.top)));
  // 表示する時刻の範囲。日付をまたぐ配信があれば、その終わりの時刻(1 時間単位に切り上げ)まで伸ばす
  const gridMin = Math.max(DAY_MIN, ...columns.flatMap((c) => c.map((p) => Math.ceil((p.top + p.height) / 60) * 60)));
  const hours = Array.from({ length: gridMin / 60 }, (_, h) => h);
  // 利用者が自分でスクロールしたら、それ以降は自動で動かさない
  const userScrolled = useRef(false);
  const markUserScrolled = () => {
    userScrolled.current = true;
  };

  // 今日を含むなら現在時刻の少し前、それ以外は最初の予定の少し前までスクロールする。
  // データは表示のあとに届くので、最初の予定の位置が決まったときにも合わせ直す
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || userScrolled.current) return;
    const minute = showsToday ? minutesOfDay(new Date()) : Number.isFinite(firstTop) ? firstTop : 8 * 60;
    el.scrollTop = Math.max(0, (minute / 60 - 1) * HOUR_PX);
  }, [showsToday, firstTop]);

  const gridCols = { gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` };

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface/80 shadow-[0_1px_0_var(--line),0_24px_48px_-24px_rgb(0_0_0/0.18)] backdrop-blur">
      <div
        ref={scrollRef}
        onWheel={markUserScrolled}
        onTouchStart={markUserScrolled}
        onPointerDown={markUserScrolled}
        onKeyDown={markUserScrolled}
        // 横方向のタッチ操作はスクロールに使わず、カレンダーのスワイプ(前後の週・日へ移動)に回す
        className="h-[min(70dvh,52rem)] touch-pan-y overflow-y-auto overscroll-contain"
      >
        {/* 見出しはスクロール領域の中で固定し、スクロールバーの幅で列がずれないようにする */}
        <div className="sticky top-0 z-20 grid border-b border-line bg-surface/95 backdrop-blur" style={gridCols}>
          <div />
          {days.map((day) => {
            const today = isToday(day);
            const label = (
              <>
                <span className={clsx('text-[11px] font-medium text-muted', weekdayTone(getDay(day)))}>
                  {format(day, 'E', { locale: ja })}
                </span>
                <span
                  className={clsx(
                    'grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                    today ? 'bg-ink text-canvas' : weekdayTone(getDay(day)),
                  )}
                >
                  {format(day, 'M/d')}
                </span>
              </>
            );
            return onSelectDay ? (
              <button
                key={day.getTime()}
                onClick={() => onSelectDay(day)}
                aria-label={`${format(day, 'M月d日 (E)', { locale: ja })} を日表示で開く`}
                className="flex flex-col items-center gap-0.5 py-2 transition hover:bg-ink/5"
              >
                {label}
              </button>
            ) : (
              <div key={day.getTime()} className="flex flex-col items-center gap-0.5 py-2">
                {label}
              </div>
            );
          })}
        </div>

        <div className="relative grid" style={{ ...gridCols, height: (gridMin / 60) * HOUR_PX }}>
          {/* 時刻の目盛り(24 時以降は 24:00, 25:00 … と続ける) */}
          <div className="relative">
            {hours.map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted tabular-nums"
                style={{ top: h * HOUR_PX }}
              >
                {h === 0 ? '' : `${h}:00`}
              </span>
            ))}
          </div>

          {days.map((day, i) => {
            const today = isToday(day);
            // 現在時刻の線。今日の列のほか、前の日の列の 24 時以降(配信を続けている時間帯)にも引く
            const nowMin = (now.getTime() - day.getTime()) / MINUTE_MS;
            return (
              <div key={day.getTime()} className={clsx('relative border-l border-line', today && 'bg-ink/[0.02]')}>
                {gridMin > DAY_MIN && (
                  // 24 時以降(翌日の時間帯)は少し色を付けて、日付が変わったことがわかるようにする
                  <div
                    className="absolute inset-x-0 bottom-0 border-t border-ink/20 bg-ink/[0.035]"
                    style={{ top: 24 * HOUR_PX }}
                    aria-hidden
                  />
                )}
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line" style={{ top: h * HOUR_PX }} />
                ))}
                {columns[i].map((placed) => (
                  <EventBlock
                    key={placed.event.id}
                    placed={placed}
                    dayView={isDayView}
                    channelColor={showChannelColor ? channelMap.get(placed.event.channelId)?.color : undefined}
                    onClick={() => onSelectEvent(placed.event)}
                  />
                ))}
                {nowMin >= 0 && nowMin < gridMin && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                    style={{ top: (nowMin / 60) * HOUR_PX }}
                    aria-hidden
                  >
                    <span className="-ml-1 size-2 rounded-full bg-live" />
                    <span className="h-px flex-1 bg-live" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventBlock({
  placed,
  dayView,
  channelColor,
  onClick,
}: {
  placed: Placed;
  /** 日表示ではサムネイルを付ける。週表示のスマホでは列が狭いので時刻を省き、タイトルを優先する */
  dayView: boolean;
  channelColor?: string;
  onClick: () => void;
}) {
  const { event, top, height, col, cols } = placed;
  const meta = TYPE_META[event.type];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      title={event.title}
      className="absolute overflow-hidden rounded-lg bg-surface text-left text-[11px] leading-tight transition hover:z-10"
      style={{
        top: (top / 60) * HOUR_PX + 1,
        height: (height / 60) * HOUR_PX - 2,
        left: `calc(${(col / cols) * 100}% + 2px)`,
        width: `calc(${100 / cols}% - 4px)`,
      }}
    >
      <div
        style={channelColor ? { boxShadow: `inset 3px 0 0 ${channelColor}` } : undefined}
        className={clsx(
          'flex size-full gap-2 rounded-lg px-1.5 py-1',
          meta.chip,
          event.liveStatus === 'upcoming' && 'border border-dashed border-live/50',
          event.liveStatus === 'live' && 'ring-1 ring-live ring-inset',
        )}
      >
        {dayView && <Thumbnail event={event} className="aspect-video h-full max-h-28 max-w-[40%] shrink-0 rounded-md" />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1">
            {event.liveStatus === 'live' ? <LiveDot /> : <Icon className="size-3 shrink-0" aria-hidden />}
            <span className={clsx('shrink-0 tabular-nums opacity-75', !dayView && 'hidden sm:inline')}>
              {formatTime(event.eventAt)}
            </span>
            {event.platform === 'twitch' && <TwitchMark />}
            {event.membersOnly && <Crown className="size-3 shrink-0 text-member" aria-label="メンバー限定" />}
          </div>
          <p className={clsx('font-medium break-all text-ink/85', dayView ? 'line-clamp-2 text-xs' : 'line-clamp-3')}>
            {event.title}
          </p>
        </div>
      </div>
    </button>
  );
}

/**
 * 予定の開始・終了。配信は実際の長さ、動画は動画の長さを使い、短すぎるものは最小の長さにそろえる(end)。
 * rawEnd はそろえる前の終わり(日付をまたぐかどうかの判定に使う)
 */
function eventSpan(event: CalendarEvent, now: Date, minBlock: number): { start: number; end: number; rawEnd: number } {
  const start = new Date(event.eventAt).getTime();
  let end: number;
  if (event.endedAt) end = new Date(event.endedAt).getTime();
  else if (event.liveStatus === 'live') end = Math.max(now.getTime(), start);
  else if (event.liveStatus === 'upcoming') end = start + UPCOMING_LIVE_MIN * MINUTE_MS;
  else end = start + (event.durationSec ?? 0) * 1000;
  return { start, end: Math.max(end, start + minBlock * MINUTE_MS), rawEnd: end };
}

/**
 * 1 日分の予定を配置する。その日に始まった予定だけを置き、日付をまたぐ配信は 24 時以降まで伸ばす。
 * 重なる予定は横に並べる
 */
function layoutDay(day: Date, events: CalendarEvent[], now: Date, minBlock: number): Placed[] {
  const dayStart = day.getTime();
  const dayEnd = addDays(day, 1).getTime();

  const items = events
    .map((event) => ({ event, ...eventSpan(event, now, minBlock) }))
    .filter(({ start }) => start >= dayStart && start < dayEnd)
    .map(({ event, start, end, rawEnd }) => {
      const from = (start - dayStart) / MINUTE_MS;
      // 本当に日付をまたぐものだけ 24 時以降に伸ばす。23 時台の短い動画は、最小の高さのぶん上にずらして 24 時までに収める
      const limit = rawEnd > dayEnd ? MAX_GRID_MIN : DAY_MIN;
      const to = Math.min((end - dayStart) / MINUTE_MS, limit);
      const height = Math.max(to - from, minBlock);
      return { event, top: Math.min(from, limit - height), height };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);

  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    for (const p of cluster) p.cols = colEnds.length;
    cluster = [];
    colEnds = [];
  };

  for (const item of items) {
    if (item.top >= clusterEnd) closeCluster();
    let col = colEnds.findIndex((end) => end <= item.top);
    if (col === -1) col = colEnds.push(0) - 1;
    colEnds[col] = item.top + item.height;
    clusterEnd = Math.max(clusterEnd, item.top + item.height);
    const p: Placed = { ...item, col, cols: 1 };
    cluster.push(p);
    placed.push(p);
  }
  closeCluster();
  return placed;
}

const minutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

/** 現在時刻の線と配信中のブロックの長さを 1 分ごとに更新する */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}
