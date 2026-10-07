import { useEffect, useState } from 'react';

/** system = OS の設定に合わせる */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];

// index.html のインラインスクリプトでも同じキーを読み、描画前にテーマを当てている
const STORAGE_KEY = 'theme';

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function savePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // プライベートブラウズなどで保存できなくても、表示中のテーマは切り替わる
  }
}

/** テーマの選択。<html data-theme> を書き換え、CSS 側で色を切り替える */
export function useThemePreference() {
  const [pref, setPref] = useState(readPreference);

  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'system') delete root.dataset.theme;
    else root.dataset.theme = pref;
    savePreference(pref);
  }, [pref]);

  return [pref, setPref] as const;
}
