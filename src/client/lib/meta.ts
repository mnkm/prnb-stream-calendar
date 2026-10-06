import { Clapperboard, type LucideIcon, Radio, Smartphone } from 'lucide-react';
import type { LiveStatus, VideoType } from '../../shared/types';

interface TypeMeta {
  label: string;
  icon: LucideIcon;
  /** カレンダー上のチップ */
  chip: string;
  /** バッジ */
  badge: string;
  /** 小さな丸(モバイルの月表示) */
  dot: string;
  /** フィルター ON 時 */
  toggleOn: string;
}

// Tailwind がクラスを検出できるよう、すべて静的な文字列で書く
export const TYPE_META: Record<VideoType, TypeMeta> = {
  live: {
    label: 'ライブ',
    icon: Radio,
    chip: 'bg-live/12 text-live hover:bg-live/20',
    badge: 'bg-live/12 text-live',
    dot: 'bg-live',
    toggleOn: 'border-live/40 bg-live/12 text-live',
  },
  video: {
    label: '動画',
    icon: Clapperboard,
    chip: 'bg-video/12 text-video hover:bg-video/20',
    badge: 'bg-video/12 text-video',
    dot: 'bg-video',
    toggleOn: 'border-video/40 bg-video/12 text-video',
  },
  short: {
    label: 'ショート',
    icon: Smartphone,
    chip: 'bg-short/14 text-short hover:bg-short/22',
    badge: 'bg-short/14 text-short',
    dot: 'bg-short',
    toggleOn: 'border-short/40 bg-short/14 text-short',
  },
};

export const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
  upcoming: '配信予定',
  live: '配信中',
  ended: '配信済み',
};
