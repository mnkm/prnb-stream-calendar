/** 日本時間(UTC+9)と UTC の差 */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** D1 上で文字列比較できるよう、ミリ秒なしの UTC ISO 8601 に揃える */
export function toIsoSeconds(value: Date | string): string {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** now から ms だけ前の日時(toIsoSeconds の形)。ms が負なら先の日時 */
export const isoBefore = (now: Date | number, ms: number) => toIsoSeconds(new Date(new Date(now).getTime() - ms));

/** at(ISO 8601。まだ一度も無ければ null)から intervalMs 以上たったか。null なら、たったものとみなす */
export const isDue = (at: string | null, intervalMs: number, now: Date | number = Date.now()) =>
  !at || new Date(now).getTime() - Date.parse(at) >= intervalMs;
