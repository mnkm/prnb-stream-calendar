/** D1 上で文字列比較できるよう、ミリ秒なしの UTC ISO 8601 に揃える */
export function toIsoSeconds(value: Date | string): string {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
