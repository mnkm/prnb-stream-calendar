import clsx from 'clsx';
import { Calendar1, CalendarDays, CalendarRange, List, Monitor, Moon, Search, Sun, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
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
  /** チャンネルのアイコンを押したとき(プロフィールを開く) */
  onSelectChannel: (channel: Channel) => void;
  /** 「+N」を押したとき(チャンネル一覧を開く) */
  onOpenChannelList: () => void;
}

export function Header({ channels, view, onViewChange, search, onSelectChannel, onOpenChannelList }: Props) {
  // チャンネルアイコンは先頭の 1 つだけ並べ、残りは「+N」にまとめる(押すとチャンネル一覧)
  const first = channels[0];
  const more = channels.length - 1;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <div className="flex shrink-0 -space-x-2">
          {first && (
            <button
              onClick={() => onSelectChannel(first)}
              aria-label={`${first.title} のチャンネル情報`}
              title={first.title}
              className="relative rounded-full transition hover:z-10 hover:scale-105 focus-visible:z-10"
            >
              {first.iconUrl ? (
                <img src={first.iconUrl} alt="" className="size-9 rounded-full object-cover ring-2 ring-canvas" />
              ) : (
                <div className="size-9 rounded-full ring-2 ring-canvas" style={{ background: first.color }} />
              )}
            </button>
          )}
          {more > 0 && (
            <button
              onClick={onOpenChannelList}
              aria-label={`チャンネル一覧(全 ${channels.length} チャンネル)`}
              title="チャンネル一覧"
              className="relative grid size-9 place-items-center rounded-full bg-surface text-xs font-semibold text-muted ring-2 ring-canvas transition tabular-nums hover:z-10 hover:scale-105 hover:text-ink"
            >
              +{more}
            </button>
          )}
        </div>
        <div className="hidden min-w-0 flex-1 sm:block">
          {['PROJECT NEBULA', 'Stream Calendar'].map((line) => (
            <p key={line} className="truncate text-[11px] font-medium tracking-[0.18em] text-muted uppercase">
              {line}
            </p>
          ))}
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

        <ViewTabs view={view} onViewChange={onViewChange} />
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

/**
 * 表示切り替えのタブ。選択中の背景は、タブの並びを基準にボタンの位置と幅を測って横に動かす。
 * (以前は layoutId で動かしていたが、表示の切り替えでページの長さとスクロール位置が変わると、
 *  固定表示のヘッダーの中でも背景が画面の下から飛び込んでくる動きになっていた)
 */
function ViewTabs({ view, onViewChange }: { view: ViewMode; onViewChange: (view: ViewMode) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<ViewMode, HTMLButtonElement>());
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);

  // 選択が変わったとき、と画面幅でボタンの幅が変わったとき(アイコンの表示の有無)に測り直す
  useLayoutEffect(() => {
    const measure = () => {
      const tab = tabRefs.current.get(view);
      if (tab) setPill({ x: tab.offsetLeft, width: tab.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (listRef.current) observer.observe(listRef.current);
    return () => observer.disconnect();
  }, [view]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="表示切替"
      className="relative flex rounded-full border border-line bg-surface/80 p-1"
    >
      {pill && (
        <motion.span
          aria-hidden
          className="absolute inset-y-1 left-0 rounded-full bg-ink"
          initial={false}
          animate={{ x: pill.x, width: pill.width }}
          transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
        />
      )}
      {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          ref={(el) => {
            if (el) tabRefs.current.set(value, el);
            else tabRefs.current.delete(value);
          }}
          role="tab"
          aria-selected={view === value}
          onClick={() => onViewChange(value)}
          className={clsx(
            'relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            view === value ? 'text-canvas' : 'text-muted hover:text-ink',
          )}
        >
          <Icon className="relative hidden size-3.5 sm:block" aria-hidden />
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );
}
