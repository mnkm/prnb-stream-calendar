import clsx from 'clsx';
import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type Channel, VIDEO_TYPES, type VideoType } from '../../shared/types';
import type { ViewMode } from '../lib/calendar';
import { TYPE_META } from '../lib/meta';

interface Props {
  month: Date;
  view: ViewMode;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isFetching: boolean;
  types: ReadonlySet<VideoType>;
  counts: Record<VideoType, number>;
  onToggleType: (type: VideoType) => void;
  channels: Channel[];
  hiddenChannels: ReadonlySet<string>;
  onToggleChannel: (id: string) => void;
}

const UNIT_LABEL: Record<ViewMode, string> = { month: '月', week: '週', day: '日', list: '月' };

export function Toolbar(props: Props) {
  const { month, channels } = props;
  const unit = UNIT_LABEL[props.view];

  return (
    <div className="flex flex-col gap-5 py-6 sm:py-8 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex items-end gap-4">
        <div>
          {/* w-0 で幅の計算から外し、月名の長さでボタンの位置がずれないようにする(文字ははみ出して表示される) */}
          <p className="w-0 text-sm font-medium tracking-widest whitespace-nowrap text-muted tabular-nums">
            {format(month, 'yyyy')}
            <span className="ml-2 font-normal">{format(month, 'MMMM')}</span>
          </p>
          {/* 幅を常に「12月」に合わせ、1 桁の月でもボタンの位置を変えない */}
          <h1 className="grid leading-none font-semibold tracking-tight">
            <MonthNumber value="12" placeholder />
            <MonthNumber value={format(month, 'M')} />
          </h1>
        </div>
        <div className="mb-1 flex items-center gap-1">
          <IconButton label={`前の${unit}`} onClick={props.onPrev}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <button
            onClick={props.onToday}
            className="h-9 rounded-full border border-line bg-surface/80 px-4 text-xs font-medium whitespace-nowrap transition hover:bg-surface"
          >
            今日
          </button>
          <IconButton label={`次の${unit}`} onClick={props.onNext}>
            <ChevronRight className="size-4" />
          </IconButton>
          <span
            className={clsx(
              'ml-2 size-1.5 rounded-full bg-muted transition-opacity',
              props.isFetching ? 'animate-pulse opacity-100' : 'opacity-0',
            )}
            aria-hidden
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:items-end">
        <TypeFilters types={props.types} counts={props.counts} onToggle={props.onToggleType} />

        {/* 2 チャンネル目を登録すると自動で表示される */}
        {channels.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {channels.map((ch) => {
              const on = !props.hiddenChannels.has(ch.id);
              return (
                <button
                  key={ch.id}
                  aria-pressed={on}
                  aria-label={`${ch.title}を${on ? '表示中' : '非表示'}`}
                  title={ch.title}
                  onClick={() => props.onToggleChannel(ch.id)}
                  className={clsx(
                    'relative flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs transition',
                    on ? 'bg-surface' : 'text-muted opacity-60',
                  )}
                >
                  <span className="size-2 rounded-full" style={{ background: ch.color }} />
                  <span className="max-w-40 truncate">{ch.label ?? ch.title}</span>
                  {!on && <OffSlash />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** 種別ごとの表示切り替え(件数付き)。検索結果でも使う */
export function TypeFilters({
  types,
  counts,
  onToggle,
}: {
  types: ReadonlySet<VideoType>;
  counts: Record<VideoType, number>;
  onToggle: (type: VideoType) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {VIDEO_TYPES.map((type) => {
        const meta = TYPE_META[type];
        const on = types.has(type);
        const Icon = meta.icon;
        return (
          <button
            key={type}
            aria-pressed={on}
            onClick={() => onToggle(type)}
            className={clsx(
              'relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
              on ? meta.toggleOn : 'border-line text-muted hover:text-ink',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {meta.label}
            <span className="tabular-nums opacity-70">{counts[type]}</span>
            {!on && <OffSlash />}
          </button>
        );
      })}
    </div>
  );
}

/** 表示・非表示ボタンが「非表示」のときに、ボタン全体に引く斜線(取り消し線より目立ち、絵文字にも引けるように) */
function OffSlash() {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" preserveAspectRatio="none" aria-hidden>
      <line
        x1="10%"
        y1="85%"
        x2="90%"
        y2="15%"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MonthNumber({ value, placeholder = false }: { value: string; placeholder?: boolean }) {
  return (
    <span
      className={clsx('col-start-1 row-start-1 flex items-baseline gap-2', placeholder && 'invisible')}
      aria-hidden={placeholder || undefined}
    >
      <span className="text-6xl tabular-nums sm:text-7xl">{value}</span>
      <span className="text-2xl">月</span>
    </span>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full border border-line bg-surface/80 transition hover:bg-surface"
    >
      {children}
    </button>
  );
}
