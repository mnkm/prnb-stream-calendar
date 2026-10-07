import clsx from 'clsx';
import { Calendar1, CalendarDays, CalendarRange, List, Monitor, Moon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import type { Channel } from '../../shared/types';
import type { ViewMode } from '../lib/calendar';
import { THEME_ORDER, type ThemePreference, useThemePreference } from '../lib/theme';

const VIEW_OPTIONS: { value: ViewMode; label: string; icon: typeof List }[] = [
  { value: 'month', label: '月', icon: CalendarDays },
  { value: 'week', label: '週', icon: CalendarRange },
  { value: 'day', label: '日', icon: Calendar1 },
  { value: 'list', label: 'リスト', icon: List },
];

const THEME_META: Record<ThemePreference, { label: string; icon: typeof Sun }> = {
  system: { label: '自動(OS の設定)', icon: Monitor },
  light: { label: 'ライト', icon: Sun },
  dark: { label: 'ダーク', icon: Moon },
};

interface Props {
  channels: Channel[];
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function Header({ channels, view, onViewChange }: Props) {
  const primary = channels[0];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex -space-x-2">
          {channels.slice(0, 4).map((ch) =>
            ch.iconUrl ? (
              <img
                key={ch.id}
                src={ch.iconUrl}
                alt=""
                className="size-9 rounded-full object-cover ring-2 ring-canvas"
              />
            ) : (
              <div key={ch.id} className="size-9 rounded-full ring-2 ring-canvas" style={{ background: ch.color }} />
            ),
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium tracking-[0.18em] text-muted uppercase">Stream Calendar</p>
          <p className="truncate text-sm font-semibold">
            {channels.length > 1 ? `${channels.length} チャンネル` : (primary?.title ?? '読み込み中…')}
          </p>
        </div>

        <ThemeToggle />

        <div role="tablist" aria-label="表示切替" className="flex rounded-full border border-line bg-surface/80 p-1">
          {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              role="tab"
              aria-selected={view === value}
              onClick={() => onViewChange(value)}
              className={clsx(
                'relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                view === value ? 'text-canvas' : 'text-muted hover:text-ink',
              )}
            >
              {view === value && (
                <motion.span
                  layoutId="view-pill"
                  className="absolute inset-0 rounded-full bg-ink"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
                />
              )}
              <Icon className="relative hidden size-3.5 sm:block" aria-hidden />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

/** 押すたびに 自動 → ライト → ダーク の順に切り替える */
function ThemeToggle() {
  const [pref, setPref] = useThemePreference();
  const { label, icon: Icon } = THEME_META[pref];
  const next = THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length];
  return (
    <button
      onClick={() => setPref(next)}
      aria-label={`テーマ: ${label}(押すと${THEME_META[next].label}に切り替え)`}
      title={`テーマ: ${label}`}
      className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface/80 text-muted transition hover:text-ink"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
