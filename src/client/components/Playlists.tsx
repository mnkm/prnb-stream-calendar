import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Crown, ExternalLink, ListVideo, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CalendarEvent, Playlist } from '../../shared/types';
import { channelPlaylistsQuery, playlistQuery, videoPlaylistsQuery } from '../lib/api';
import { Thumbnail } from './Thumbnail';

/** チャンネル情報で最初に見せる再生リストの数(残りは「すべて見る」で開く) */
const INITIAL_PLAYLISTS = 8;
/** 再生リストの中身で、一度に見せる動画の数 */
const ITEMS_PER_PAGE = 50;
/** 一覧の最後がこの距離まで近づいたら、続きを表示する(検索結果と同じ) */
const LOAD_MORE_MARGIN = '800px';

/** いちばん近い縦スクロールの親(ダイアログの中身)。無ければ null(画面全体) */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  }
  return null;
}

const playlistUrl = (id: string) => `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;

/** ① チャンネル情報の「再生リスト」タブ。おすすめを先頭に、2 列のカードで並べる */
export function PlaylistGrid({ channelId, onOpen }: { channelId: string; onOpen: (playlist: Playlist) => void }) {
  const { data: lists, isPending } = useQuery(channelPlaylistsQuery(channelId));
  const [showAll, setShowAll] = useState(false);

  if (isPending) return <p className="py-6 text-center text-sm text-muted">読み込み中…</p>;
  if (!lists || lists.length === 0) return <p className="py-6 text-center text-sm text-muted">再生リストはありません</p>;

  const visible = showAll ? lists : lists.slice(0, INITIAL_PLAYLISTS);
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4">
        {visible.map((p) => (
          <li key={p.id}>
            <button onClick={() => onOpen(p)} className="group flex w-full flex-col gap-1.5 text-left">
              <span className="relative block aspect-video overflow-hidden rounded-xl bg-ink/5">
                {p.thumbnailUrl && (
                  <img src={p.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-105" />
                )}
                {p.recommended && (
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-sat px-2 py-0.5 text-[10px] font-bold text-white">
                    はじめての方へ
                  </span>
                )}
                <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded bg-black/75 px-1.5 py-px text-[10px] font-medium text-white tabular-nums">
                  <ListVideo className="size-3" aria-hidden />
                  {p.itemCount}本
                </span>
              </span>
              <span className="line-clamp-2 text-xs leading-snug font-semibold text-ink/90 group-hover:text-ink">
                {p.title}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!showAll && lists.length > INITIAL_PLAYLISTS && (
        <button
          onClick={() => setShowAll(true)}
          className="rounded-full border border-line py-2 text-sm font-medium transition hover:bg-ink/5"
        >
          すべての再生リスト({lists.length})を見る
        </button>
      )}
    </div>
  );
}

/** ② 再生リストの中身。動画を押すと詳細ダイアログを開く */
export function PlaylistDetailView({
  playlistId,
  backLabel,
  onBack,
  onOpenEvent,
}: {
  playlistId: string;
  backLabel: string;
  onBack: () => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const { data, isPending, isError } = useQuery(playlistQuery(playlistId));
  const [shown, setShown] = useState(ITEMS_PER_PAGE);

  // 一覧の最後の目印が見えてきたら、続きを表示する(中身はまとめて読み込み済みなので、表示する数を増やすだけ)
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = !!data && data.events.length > shown;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && setShown((n) => n + ITEMS_PER_PAGE),
      { root: scrollParent(el), rootMargin: LOAD_MORE_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, shown]);

  return (
    <div className="flex flex-col gap-4 p-5 pt-5">
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-1 pr-10 text-xs font-medium text-muted transition hover:text-ink"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        {backLabel}
      </button>

      {isPending ? (
        <p className="py-6 text-center text-sm text-muted">読み込み中…</p>
      ) : isError || !data ? (
        <p className="py-6 text-center text-sm text-muted">再生リストを読み込めませんでした</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="block aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-ink/5">
              {data.playlist.thumbnailUrl && <img src={data.playlist.thumbnailUrl} alt="" className="size-full object-cover" />}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-muted">再生リスト</p>
              <h2 className="text-base leading-snug font-semibold break-words">{data.playlist.title}</h2>
              <p className="text-xs text-muted tabular-nums">
                {data.playlist.itemCount}本
                {data.events.length < data.playlist.itemCount && `(このカレンダーにある ${data.events.length}本を表示)`}
              </p>
            </div>
          </div>
          <a
            href={playlistUrl(data.playlist.id)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-canvas transition hover:opacity-90"
          >
            YouTube で再生リストを開く
            <ExternalLink className="size-4" />
          </a>
          <ol className="flex flex-col">
            {data.events.slice(0, shown).map((event, i) => (
              <li key={event.id} className="border-t border-line">
                <button
                  onClick={() => onOpenEvent(event)}
                  className="group flex w-full items-center gap-3 py-2 text-left transition hover:bg-ink/5"
                >
                  <span className="w-6 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                  <Thumbnail event={event} className="aspect-video w-24 shrink-0 rounded-lg" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="line-clamp-2 text-xs leading-snug font-semibold text-ink/90 group-hover:text-ink">
                      {event.title}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-muted tabular-nums">
                      {format(new Date(event.eventAt), 'yyyy/MM/dd')}
                      {event.membersOnly && <Crown className="size-3 text-member" aria-label="メンバー限定" />}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {hasMore && (
            <div ref={sentinelRef} className="py-3 text-center text-xs text-muted tabular-nums">
              読み込み中…({shown} / {data.events.length}本)
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** ③ 動画の詳細に出す「この動画が入っている再生リスト」。無ければ何も表示しない */
export function VideoPlaylists({ videoId, onOpen }: { videoId: string; onOpen: (playlist: Playlist) => void }) {
  const { data: lists } = useQuery(videoPlaylistsQuery(videoId));
  if (!lists || lists.length === 0) return null;
  return (
    <section aria-label="この動画が入っている再生リスト" className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted">この動画が入っている再生リスト</h3>
      <div className="flex flex-wrap gap-2">
        {lists.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpen(p)}
            className="flex max-w-full items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium transition hover:bg-ink/5"
          >
            <Play className="size-3 shrink-0 fill-current" aria-hidden />
            <span className="truncate">{p.title}</span>
            <span className="shrink-0 text-muted tabular-nums">{p.itemCount}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
