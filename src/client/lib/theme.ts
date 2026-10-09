import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

// index.html のインラインスクリプトでも同じキーを読み、描画前にテーマを当てている
const STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** ボタンで選んだテーマ。まだ選んでいなければ null(OS の設定に合わせる) */
function readSaved(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function save(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // プライベートブラウズなどで保存できなくても、表示中のテーマは切り替わる
  }
}

const osTheme = (): Theme => (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light');

/**
 * 表示中のテーマ(ライトかダーク)と、切り替える関数。
 * 最初は OS の設定に合わせ(OS の設定が変わればそれに付いていく)、ボタンで切り替えたら、その選択を保存して使う。
 * <html data-theme> を書き換え、CSS 側で色を切り替える
 */
export function useTheme() {
  const [saved, setSaved] = useState(readSaved);
  const [os, setOs] = useState(osTheme);

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => setOs(osTheme());
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (saved) root.dataset.theme = saved;
    else delete root.dataset.theme;
  }, [saved]);

  const theme = saved ?? os;
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setSaved(next);
    save(next);
  };
  return [theme, toggle] as const;
}
