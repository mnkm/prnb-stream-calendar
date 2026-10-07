import { ExternalLink } from 'lucide-react';
import type { Channel } from '../../shared/types';
import { Modal } from './Modal';

const compactNumber = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 });

/** ヘッダーのチャンネルアイコンから開く、チャンネルのプロフィール */
export function ChannelDialog({ channel, onClose }: { channel: Channel | null; onClose: () => void }) {
  return (
    <Modal open={channel !== null} onClose={onClose}>
      {channel && <ChannelProfile channel={channel} />}
    </Modal>
  );
}

function ChannelProfile({ channel }: { channel: Channel }) {
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
          {channel.iconUrl ? (
            <img src={channel.iconUrl} alt="" className="size-20 shrink-0 rounded-full object-cover ring-4 ring-surface" />
          ) : (
            <div className="size-20 shrink-0 rounded-full ring-4 ring-surface" style={{ background: channel.color }} />
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

        {channel.description ? (
          <p className="text-sm leading-relaxed break-words whitespace-pre-line text-ink/85">
            <Linkify text={channel.description} />
          </p>
        ) : (
          <p className="text-sm text-muted">チャンネルの説明はまだありません。</p>
        )}

        <a
          href={channelUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-canvas transition hover:opacity-90"
        >
          YouTube でチャンネルを開く
          <ExternalLink className="size-4" />
        </a>
      </div>
    </div>
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
