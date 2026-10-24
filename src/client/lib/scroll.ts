/** 一覧の最後がこの距離まで近づいたら、続きを読み込む(検索結果・クリップ・再生リストの中身で共通) */
export const LOAD_MORE_MARGIN = '800px';

/** いちばん近い縦スクロールの親(ダイアログの中身)。無ければ null(画面全体) */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  }
  return null;
}
