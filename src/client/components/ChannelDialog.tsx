import clsx from 'clsx';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import type { CalendarEvent, Channel } from '../../shared/types';
import { twitchChannelUrl } from '../lib/format';
import { TwitchIcon } from './Badges';
import { ChannelClips } from './Clips';
import { YouTubeIcon } from './Header';
import { Modal } from './Modal';
import { PlaylistDetailView, PlaylistGrid } from './Playlists';

/** タレント別の楽曲リスト(各チャンネルで歌われた曲を探せるサイト)。talent パラメータでチャンネルを選んだ状態で開く */
const SONGLIST_URL = 'https://mnkm.page/prnb-songlist/';

const compactNumber =new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 });

type ChannelState = { kind: 'channel'; channel: Channel; fromList?: boolean };

/**
 * list = チャンネル一覧、channel = 1 チャンネルのプロフィール(一覧から開いたときは戻れる)、
 * playlist = 再生リストの中身(戻り先はチャンネル、または開いていた動画の詳細)
 */
export type ChannelDialogState =
  | { kind: 'list' }
  | ChannelState
  | { kind: 'playlist'; playlistId: string; back: ChannelState | { kind: 'event'; event: CalendarEvent } };

interface Props {
  state: ChannelDialogState | null;
  channels: Channel[];
  onChange: (state: ChannelDialogState | null) => void;
  /** 再生リストの中の動画を押したとき(動画の詳細を開く。そこから再生リストに戻れるよう、今の状態も渡す) */
  onOpenEvent: (event: CalendarEvent, returnTo: ChannelDialogState) => void;
  /** 動画の詳細から開いた再生リストで「戻る」を押したとき */
  onReturnToEvent: (event: CalendarEvent) => void;
}

/** ヘッダーの YouTube ボタンから開く、チャンネルの一覧・プロフィール・再生リスト */
export function ChannelDialog({ state, channels, onChange, onOpenEvent, onReturnToEvent }: Props) {
  return (
    <Modal open={state !== null} onClose={() => onChange(null)}>
      {state?.kind === 'list' ? (
        <ChannelList channels={channels} onSelect={(channel) => onChange({ kind: 'channel', channel, fromList: true })} />
      ) : state?.kind === 'channel' ? (
        <ChannelProfile
          key={state.channel.id}
          channel={state.channel}
          onBack={state.fromList ? () => onChange({ kind: 'list' }) : undefined}
          onOpenPlaylist={(p) => onChange({ kind: 'playlist', playlistId: p.id, back: state })}
        />
      ) : state?.kind === 'playlist' ? (
        <PlaylistDetailView
          key={state.playlistId}
          playlistId={state.playlistId}
          backLabel={state.back.kind === 'channel' ? state.back.channel.title : '動画に戻る'}
          onBack={() => (state.back.kind === 'event' ? onReturnToEvent(state.back.event) : onChange(state.back))}
          onOpenEvent={(event) => onOpenEvent(event, state)}
        />
      ) : null}
    </Modal>
  );
}

function ChannelList({ channels, onSelect }: { channels: Channel[]; onSelect: (channel: Channel) => void }) {
  return (
    <div className="p-5 pt-6">
      <h2 className="mb-4 pr-10 text-lg font-semibold">チャンネル一覧</h2>
      <ul className="flex flex-col gap-1">
        {channels.map((ch) => (
          <li key={ch.id}>
            <button
              onClick={() => onSelect(ch)}
              className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-ink/5"
            >
              <ChannelIcon channel={ch} className="size-11" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{ch.title || ch.id}</span>
                <span className="block truncate text-xs text-muted">
                  {[ch.customUrl, ch.subscriberCount !== null && `登録者 ${compactNumber.format(ch.subscriberCount)}人`]
                    .filter(Boolean)
                    .join('  ')}
                </span>
              </span>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: ch.color }} aria-hidden />
              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChannelProfile({
  channel,
  onBack,
  onOpenPlaylist,
}: {
  channel: Channel;
  onBack?: () => void;
  onOpenPlaylist: (playlist: { id: string }) => void;
}) {
  // 先頭の「チャンネル情報」(説明文)を最初に開く
  const [tab, setTab] = useState<'about' | 'playlists' | 'clips'>('about');
  // 「クリップ」タブは、Twitch にもチャンネルがある場合だけ出す
  const tabs = [
    ['about', 'チャンネル情報'],
    ['playlists', '再生リスト'],
    ...(channel.twitchLogin ? ([['clips', 'クリップ']] as const) : []),
  ] as const;
  const channelUrl = channel.customUrl
    ? `https://www.youtube.com/${channel.customUrl}`
    : `https://www.youtube.com/channel/${channel.id}`;
  const stats = [
    channel.subscriberCount !== null && `登録者 ${compactNumber.format(channel.subscriberCount)}人`,
    channel.videoCount !== null && `動画 ${channel.videoCount.toLocaleString()}本`,
    channel.twitchFollowerCount !== null && `Twitch フォロワー ${compactNumber.format(channel.twitchFollowerCount)}人`,
  ].filter(Boolean);

  return (
    <div>
      {/* バナーが無いチャンネルは、チャンネルの色のグラデーションにする */}
      <div
        className="aspect-[6/1] min-h-20 w-full bg-cover bg-center"
        style={{
          backgroundImage: channel.bannerUrl
            ? `url("${channel.bannerUrl}")`
            : `linear-gradient(135deg, ${channel.color}, color-mix(in oklch, ${channel.color} 40%, transparent))`,
        }}
      />

      <div className="flex flex-col gap-4 px-5 pb-5">
        <div className="-mt-10 flex items-end gap-3">
          <ChannelIcon channel={channel} className="size-20 ring-4 ring-surface" />
          {onBack && (
            <button
              onClick={onBack}
              className="ml-auto flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm font-medium transition hover:bg-ink/5"
            >
              <ArrowLeft className="size-4" />
              一覧
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="text-lg leading-snug font-semibold">{channel.title}</h2>
          <p className="flex flex-wrap gap-x-3 text-sm text-muted">
            {channel.customUrl && <span>{channel.customUrl}</span>}
            {stats.map((s) => (
              <span key={String(s)} className="tabular-nums">
                {s}
              </span>
            ))}
          </p>
        </div>

        {/* 一覧が長くても押せるよう、タブの上に置く。2 つあるときは同じ幅で並べる */}
        <div className={clsx('grid gap-2', channel.twitchLogin && 'grid-cols-2')}>
          <a
            href={channelUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-full bg-ink px-3 py-2.5 text-sm font-medium whitespace-nowrap text-canvas transition hover:opacity-90"
          >
            <YouTubeIcon className="size-4 shrink-0" />
            YouTube で開く
          </a>
          {channel.twitchLogin && (
            <a
              href={twitchChannelUrl(channel.twitchLogin)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-full bg-twitch px-3 py-2.5 text-sm font-medium whitespace-nowrap text-white transition hover:opacity-90"
            >
              <TwitchIcon className="size-4 shrink-0" />
              Twitch で開く
            </a>
          )}
          {/* 配信サイトへのリンクと区別できるよう、チャンネルの色の薄いボタンにする(色の調整は index.css の .channel-tint) */}
          {channel.songlistTalent && (
            <a
              href={`${SONGLIST_URL}?${new URLSearchParams({ talent: channel.songlistTalent })}`}
              target="_blank"
              rel="noreferrer"
              style={{ '--channel-color': channel.color } as CSSProperties}
              className="channel-tint col-span-full flex items-center justify-center gap-1.5 rounded-full border px-3 py-2.5 text-sm font-medium whitespace-nowrap transition"
            >
              <SonglistIcon className="size-4 shrink-0" />
              楽曲リストを開く
            </a>
          )}
        </div>

        <div role="tablist" aria-label="チャンネルの表示" className="flex gap-1 border-b border-line">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={clsx(
                '-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition',
                tab === value ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'playlists' ? (
          <PlaylistGrid channelId={channel.id} onOpen={onOpenPlaylist} />
        ) : tab === 'clips' ? (
          <ChannelClips channelId={channel.id} />
        ) : channel.description ? (
          <p className="text-sm leading-relaxed break-words whitespace-pre-line text-ink/85">
            <Linkify text={channel.description} />
          </p>
        ) : (
          <p className="text-sm text-muted">チャンネルの説明はまだありません。</p>
        )}

      </div>
    </div>
  );
}

/**
 * 楽曲リストのサイトのアイコン。サイトの favicon(MingCute の playlist_fill、Apache-2.0)と同じ形。
 * favicon は画像ファイルではなく HTML に直接書かれていて読み込めないので、同じ形をここに持つ。
 * 色は、ダークテーマでも見えるよう、ボタンの文字色に合わせる(サイト側で favicon を変えたら、ここも差し替える)
 */
function SonglistIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="m17.33 4.055 2.986.996a1 1 0 0 1-.632 1.898L18 6.387V17.5a3.5 3.5 0 1 1-2-3.163V5.014c0-.69.675-1.177 1.33-.959M8 17a1 1 0 1 1 0 2H4a1 1 0 0 1 0-2zm2-6a1 1 0 1 1 0 2H4a1 1 0 0 1 0-2zm3-6a1 1 0 0 1 .117 1.993L13 7H4a1 1 0 0 1-.117-1.993L4 5z" />
    </svg>
  );
}

function ChannelIcon({ channel, className }: { channel: Channel; className: string }) {
  return channel.iconUrl ? (
    <img src={channel.iconUrl} alt="" className={`shrink-0 rounded-full object-cover ${className}`} />
  ) : (
    <div className={`shrink-0 rounded-full ${className}`} style={{ background: channel.color }} />
  );
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

/** 説明文の中の URL をリンクにする */
function Linkify({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_PATTERN).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="text-sat underline underline-offset-2">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}
