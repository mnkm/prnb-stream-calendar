import clsx from 'clsx';
import { useState } from 'react';
import type { CalendarEvent } from '../../shared/types';

/** 高解像度サムネイルを優先し、存在しなければ API が返した URL にフォールバック */
export function Thumbnail({ event, hd = false, className }: { event: CalendarEvent; hd?: boolean; className?: string }) {
  // ライブ中・予定のサムネイルは maxres が用意されないことが多いので API の URL を使う。Twitch も API の URL だけを使う
  const preferHd =
    hd &&
    event.platform === 'youtube' &&
    !event.unavailableAt &&
    event.liveStatus !== 'live' &&
    event.liveStatus !== 'upcoming';
  const [src, setSrc] = useState(
    preferHd ? `https://i.ytimg.com/vi/${event.id}/maxresdefault.jpg` : (event.thumbnailUrl ?? ''),
  );

  return (
    <div className={clsx('overflow-hidden bg-ink/5', className)}>
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onLoad={(e) => {
            // maxresdefault が無い場合、YouTube は 120x90 のプレースホルダー画像を返す
            if (preferHd && e.currentTarget.naturalWidth <= 120 && event.thumbnailUrl) setSrc(event.thumbnailUrl);
          }}
          onError={() => event.thumbnailUrl && src !== event.thumbnailUrl && setSrc(event.thumbnailUrl)}
        />
      )}
    </div>
  );
}
