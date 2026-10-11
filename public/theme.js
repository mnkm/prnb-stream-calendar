// 保存済みのテーマを描画前に当て、読み込み時に一瞬だけ別の色になるのを防ぐ(src/client/lib/theme.ts と同じキー)。
// index.html に直接書かず別のファイルにしているのは、CSP(public/_headers)でインラインのスクリプトを禁止するため
try {
  var theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (e) {}
