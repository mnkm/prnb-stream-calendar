import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // スクリプトや CSS の URL を、ページからの相対指定にする。このサイトは、別の Worker(プロキシ)から
  // 「https://mnkm.page/prnb-stream-calendar/」のようなサブパスで配信されるので、「/assets/…」のような
  // ルートからの指定だと届かない。相対指定なら、同じビルドがサブパスでもルートでも動く
  // (画面の URL はパスを持たず、状態はクエリだけなので、相対指定の基準は変わらない)。
  // API の呼び出しも同じ理由で相対指定にしている(src/client/lib/api.ts)
  base: './',
  plugins: [react(), tailwindcss(), cloudflare()],
});
