import type { IcalEventRow } from './db';

/*
 * iCal(RFC 5545)のフィードを組み立てる。外部のライブラリは使わず、このサイトで使う項目だけを書く。
 * 日時はすべて UTC(末尾に Z)で書く。表示する時刻は、カレンダーアプリが利用者のタイムゾーンに直す
 */

/** 終了日時が分からない予定(予定・配信中)を仮に置く長さ */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
/** 配信中の予定の終わりは、少なくとも今からこの時間あとにする(開始から長くたった配信が、終わった予定に見えないように) */
const LIVE_MIN_REMAINING_MS = 30 * 60 * 1000;
/** 配信中の予定の終わりを丸める単位(取り直すたびに終わりの時刻が細かく変わらないように) */
const LIVE_END_STEP_MS = 15 * 60 * 1000;
/** 1 行の長さの上限(改行を除くオクテット数) */
const MAX_LINE_OCTETS = 75;

export interface IcalCalendar {
  /** カレンダーアプリに出る名前(X-WR-CALNAME) */
  name: string;
  description: string;
  events: IcalEventRow[];
  now: Date;
}

/** フィードの本文。行の区切りは CRLF */
export function buildIcal({ name, description, events, now }: IcalCalendar): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//mnkm.page//PROJECT NEBULA Stream Calendar//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-CALDESC:${escapeText(description)}`,
    // 取り直す間隔の希望(RFC 7986 と、その前から使われている独自の項目)。従うかはアプリ次第で、Google カレンダーは従わない
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events.flatMap((event) => eventLines(event, now)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

function eventLines(event: IcalEventRow, now: Date): string[] {
  const url = `https://www.youtube.com/watch?v=${event.id}`;
  const start = new Date(event.event_at);
  const title = `[${event.channel_name}] ${event.members_only === 1 ? '【メン限】' : ''}${event.title}`;
  return [
    'BEGIN:VEVENT',
    // 同じ配信の予定が変わったとき(枠の時刻の変更など)、アプリが同じ予定として置き換えられるよう、動画の ID から作る
    `UID:${event.id}@mnkm.page`,
    // DTSTAMP は、METHOD を書いたカレンダーでは、このデータを作った日時(RFC 5545 3.8.7.2)。予定が変わった日時は LAST-MODIFIED に書く
    `DTSTAMP:${formatUtc(now)}`,
    `LAST-MODIFIED:${formatUtc(new Date(event.updated_at))}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(endOf(event, start, now))}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(url)}`,
    // URL は TEXT ではない(URI)ので、エスケープしない
    `URL:${url}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

/**
 * 予定の終わり。終わった配信は終了日時、プレミア公開は動画の長さを使う。
 * 分からないものは開始から 2 時間後にし、配信中なら今より後になるようにずらす。終わりが開始以前にならないようにする
 */
export function endOf(event: IcalEventRow, start: Date, now: Date): Date {
  const startMs = start.getTime();
  let endMs = startMs + DEFAULT_DURATION_MS;
  if (event.type === 'video' && event.duration_sec) {
    endMs = startMs + event.duration_sec * 1000;
  } else if (event.ended_at) {
    endMs = Date.parse(event.ended_at);
  } else if (event.live_status === 'live') {
    const soon = Math.ceil((now.getTime() + LIVE_MIN_REMAINING_MS) / LIVE_END_STEP_MS) * LIVE_END_STEP_MS;
    endMs = Math.max(endMs, soon);
  }
  return new Date(endMs > startMs ? endMs : startMs + DEFAULT_DURATION_MS);
}

/** UTC の日時の形(20261115T093000Z) */
export const formatUtc = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');

/** TEXT の値のエスケープ。「\」「;」「,」と改行をエスケープし、ほかの制御文字は除く */
export function escapeText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/[\\;,]/g, (ch) => `\\${ch}`)
    .replace(/\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * 75 オクテットを超える行を折り返す。続きの行は先頭に空白を 1 つ置き、その空白も 75 オクテットに数える。
 * UTF-8 の文字の途中では切らない(サロゲートペアも 1 文字として扱う)
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) return line;
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    // 2 行目からは先頭の空白の 1 オクテットを含めて数える
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += ch;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}
