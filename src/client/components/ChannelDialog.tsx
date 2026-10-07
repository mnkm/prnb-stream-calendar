import { ArrowLeft, ChevronRight, ExternalLink } from 'lucide-react';
import type { Channel } from '../../shared/types';
import { Modal } from './Modal';

const compactNumber = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 });

/** list = チャンネル一覧、channel = 1 チャンネルのプロフィール(一覧から開いたときは戻れる) */
export type ChannelDialogState = { kind: 'list' } | { kind: 'channel'; channel: Channel; fromList?: boolean };

interface Props {
  state: ChannelDialogState | null;
  channels: Channel[];
  onChange: (state: ChannelDialogState | null) => void;
}

/** ヘッダーのチャンネルアイコン(または「+N」)から開く、チャンネルの一覧とプロフィール */
export function ChannelDialog({ state, channels, onChange }: Props) {
  return (
    <Modal open={state !== null} onClose={() => onChange(null)}>
      {state?.kind === 'list' ? (
        <ChannelList channels={channels} onSelect={(channel) => onChange({ kind: 'channel', channel, fromList: true })} />
      ) : state?.kind === 'channel' ? (
        <ChannelProfile
          key={state.channel.id}
          channel={state.channel}
          onBack={state.fromList ? () => onChange({ kind: 'list' }) : undefined}
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

function ChannelProfile({ channel, onBack }: { channel: Channel; onBack?: () => void }) {
  const channelUrl = channel.customUrl
    ? `https://www.youtube.com/${channel.customUrl}`
    : `https://www.youtube.com/channel/${channel.id}`;
  const stats = [
    channel.subscriberCount !== null && `登録者 ${compactNumber.format(channel.subscriberCount)}人`,
    channel.videoCount !== null && `動画 ${channel.videoCount.toLocaleString()}本`,
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

        {channel.description ? (
          <p className="text-sm leading-relaxed break-words whitespace-pre-line text-ink/85">
            <Linkify text={channel.description} />
          </p>
        ) : (
          <p className="text-sm text-muted">チャンネルの説明はまだありません。</p>
        )}

        <div className="flex gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-sm font-medium transition hover:bg-ink/5"
            >
              <ArrowLeft className="size-4" />
              一覧
            </button>
          )}
          <a
            href={channelUrl}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-canvas transition hover:opacity-90"
          >
            YouTube でチャンネルを開く
            <ExternalLink className="size-4" />
          </a>
        </div>
      </div>
    </div>
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
