import clsx from 'clsx';
import { Calendar1, CalendarDays, CalendarRange, List, Monitor, Moon, Search, Sun, X } from 'lucide-react';
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

interface SearchProps {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onOpen: () => void;
  /** 検索欄を閉じて入力も消す(カレンダーに戻る) */
  onClose: () => void;
}

interface Props {
  channels: Channel[];
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  search: SearchProps;
}

export function Header({ channels, view, onViewChange, search }: Props) {
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
        <div className="hidden min-w-0 flex-1 sm:block">
          <p className="truncate text-[11px] font-medium tracking-[0.18em] text-muted uppercase">Stream Calendar</p>
          <p className="truncate text-sm font-semibold">
            {channels.length > 1 ? `${channels.length} チャンネル` : (primary?.title ?? '読み込み中…')}
          </p>
        </div>

        <div className="flex-1 sm:hidden" />
        <button
          onClick={search.open ? search.onClose : search.onOpen}
          aria-label={search.open ? '検索を閉じる' : 'キーワードで検索'}
          aria-expanded={search.open}
          className={clsx(
            'grid size-9 shrink-0 place-items-center rounded-full border border-line transition',
            search.open ? 'bg-ink text-canvas' : 'bg-surface/80 text-muted hover:text-ink',
          )}
        >
          <Search className="size-4" aria-hidden />
        </button>
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

      {search.open && <SearchBar {...search} />}
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

function SearchBar({ value, onChange, onClose }: SearchProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-3 sm:px-6">
      <div className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:border-ink/30">
        <Search className="size-4 shrink-0 text-muted" aria-hidden />
        <input
          autoFocus
          type="search"
          enterKeyHint="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder="タイトルで検索(スペースで区切ると絞り込み)"
          aria-label="タイトルで検索"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            aria-label="入力を消す"
            className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition hover:bg-ink/5 hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
