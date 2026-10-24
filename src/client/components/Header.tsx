import clsx from 'clsx';
import { Calendar1, CalendarDays, CalendarRange, List, Moon, Search, Sun, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ViewMode } from '../lib/calendar';
import { type Theme, useTheme } from '../lib/theme';
import { YouTubeIcon } from './Badges';

const VIEW_OPTIONS: { value: ViewMode; label: string; icon: typeof List }[] = [
  { value: 'month', label: '月', icon: CalendarDays },
  { value: 'week', label: '週', icon: CalendarRange },
  { value: 'day', label: '日', icon: Calendar1 },
  { value: 'list', label: 'リスト', icon: List },
];

const THEME_META: Record<Theme, { label: string; icon: typeof Sun }> = {
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
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  search: SearchProps;
  /** YouTube ボタンを押したとき(チャンネル一覧を開く) */
  onOpenChannelList: () => void;
}

export function Header({ view, onViewChange, search, onOpenChannelList }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/70 backdrop-blur-xl">
      <div className="relative mx-auto flex max-w-7xl items-center gap-1.5 px-4 py-3 sm:gap-3 sm:px-6">
        <SiteIcon />
        <h1 className="hidden min-w-0 flex-1 sm:block">
          {['PROJECT NEBULA', 'Stream Calendar'].map((line) => (
            <span key={line} className="block truncate text-[11px] font-medium tracking-[0.18em] text-muted uppercase">
              {line}
            </span>
          ))}
        </h1>

        <div className="flex-1 sm:hidden" />
        <button
          onClick={search.open ? search.onClose : search.onOpen}
          aria-label={search.open ? '検索を閉じる' : '配信タイトルや曲名・アーティスト名で検索'}
          aria-expanded={search.open}
          className={clsx(
            'grid size-8 sm:size-9 shrink-0 place-items-center rounded-full border border-line transition',
            search.open ? 'bg-ink text-canvas' : 'bg-surface/80 text-muted hover:text-ink',
          )}
        >
          <Search className="size-4" aria-hidden />
        </button>
        <ThemeToggle />

        <ViewTabs view={view} onViewChange={onViewChange} />
        <button
          onClick={onOpenChannelList}
          aria-label="チャンネル一覧"
          title="チャンネル一覧"
          className="grid size-8 sm:size-9 shrink-0 place-items-center rounded-full border border-line bg-surface/80 text-muted transition hover:text-ink"
        >
          <YouTubeIcon className="size-4" />
        </button>
        <SiteAbout />
      </div>

      {search.open && <SearchBar {...search} />}
    </header>
  );
}

/** ライトとダークを切り替える。最初は OS の設定に合わせたテーマを表示する */
function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const { label, icon: Icon } = THEME_META[theme];
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      onClick={toggle}
      aria-label={`テーマ: ${label}(押すと${THEME_META[next].label}に切り替え)`}
      title={`テーマ: ${label}`}
      // 幅 360px 未満の小さな画面では、ヘッダーに入りきらないので隠す(テーマは OS の設定か、前に選んだもので表示される)
      className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface/80 text-muted transition hover:text-ink max-[359px]:hidden sm:size-9"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/**
 * サイトの説明を開閉するボタン。閉じていても説明文が HTML に残るよう、details で作る(検索エンジンに、
 * サイトの内容を文章で伝えるため)。説明文は、ヘッダーの中身の幅を基準にボタンの下へ重ねて出す(レイアウトは動かさない)。
 * アイコンは MingCute Icons の information_line(Apache License 2.0)の形を使い、色は currentColor
 */
function SiteAbout() {
  return (
    <details className="group shrink-0">
      <summary
        aria-label="このサイトについて"
        title="このサイトについて"
        className="grid size-8 cursor-pointer list-none place-items-center rounded-full border border-line bg-surface/80 text-muted transition group-open:bg-ink group-open:text-canvas hover:text-ink group-open:hover:text-canvas sm:size-9 [&::-webkit-details-marker]:hidden"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden>
          <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2m0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16m-.01 6c.558 0 1.01.452 1.01 1.01v5.124A1 1 0 0 1 12.5 18h-.49A1.01 1.01 0 0 1 11 16.99V12a1 1 0 1 1 0-2zM12 7a1 1 0 1 1 0 2 1 1 0 0 1 0-2" />
        </svg>
      </summary>
      <p className="absolute top-full right-4 left-4 mt-2 rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-ink shadow-xl sm:right-6 sm:left-auto sm:w-96">
        VTuber事務所「PROJECT NEBULA（ぷろねぶ）」所属タレント（桃瀬にな・碓氷ゆら・鈴莉れん・菜鳥ひなた・紫雨るか）のYouTubeチャンネルで公開されている動画・ショート・ライブ配信およびTwitchで公開されている配信・クリップをカレンダーで表示するWebアプリです。
      </p>
    </details>
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
          placeholder="配信タイトルや曲名・アーティスト名で検索(スペースで絞り込み)"
          aria-label="配信タイトルや曲名・アーティスト名で検索"
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
            'relative flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:px-3',
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

/**
 * 左端のアイコン(表示だけ)。favicon と同じ画像(public/favicon.svg)を使う。
 * サブパスで配信されても読めるよう、ページからの相対指定にする(vite.config.ts の base)
 */
function SiteIcon() {
  return <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8 shrink-0 sm:size-9" />;
}
