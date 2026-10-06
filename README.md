# Stream Calendar

YouTube チャンネルの **動画・ショート・ライブ配信** をカレンダーで表示する Web アプリ。
Cloudflare Workers(静的アセット + Hono API)+ D1 + Cron Triggers で動作します。

```
React SPA ──fetch──▶ Hono (/api/*) ──▶ D1
                                        ▲ upsert
        Cron (15 分ごと) ── sync ───────┘──▶ YouTube Data API v3 / RSS
```

## 構成

| パス | 内容 |
|---|---|
| `src/client/` | React + Tailwind CSS v4 + Motion のカレンダー UI |
| `src/worker/index.ts` | API ルート (`/api/channels`, `/api/events`, `/api/admin/sync`) と Cron ハンドラ |
| `src/worker/sync.ts` | 同期ロジック(過去分の段階取得 / 差分同期) |
| `src/worker/youtube.ts` | YouTube Data API クライアント、RSS、ショート判定 |
| `src/worker/db.ts` | D1 アクセス |
| `src/shared/types.ts` | フロントと Worker で共有する型 |
| `migrations/` | D1 スキーマと初期チャンネル |

## 同期の仕組み

- **過去分の取得**: チャンネル登録後、アップロード一覧(`UU…`)を 8 ページ(400 件)ずつ Cron ごとに取得し、最後にショート一覧(`UUSH…`)で種別を補正します。
- **差分同期**: RSS(クォータ消費なし)で新着を検知し、新着と「予定・配信中」のライブだけを `videos.list` で更新します。
- **種別判定**: `liveStreamingDetails` があればライブ、`UUSH` プレイリストに含まれればショート、それ以外は動画。
- **クォータ目安**: 1 チャンネルあたり約 300 ユニット/日(上限 10,000)。

## セットアップ

### 1. YouTube Data API キー

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「YouTube Data API v3」を有効化
3. 認証情報 → API キーを作成し、**API の制限** で YouTube Data API v3 のみに制限
   (サーバー側から呼ぶため、HTTP リファラー制限は設定しない)

### 2. ローカル開発

```bash
npm install
cp .dev.vars.example .dev.vars   # YOUTUBE_API_KEY と ADMIN_TOKEN を記入
npm run db:migrate:local
npm run dev                      # http://localhost:5173
```

初回データの取り込み(過去分が多い場合は数回実行):

```bash
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:5173/api/admin/sync
```

### 3. Cloudflare へのデプロイ

```bash
npx wrangler login
npx wrangler d1 create youtube-calendar   # 出力された database_id を wrangler.jsonc に記入
npm run db:migrate:remote
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

### 4. GitHub 連携(自動デプロイ)

1. このリポジトリを GitHub に push
2. Cloudflare ダッシュボード → Workers & Pages → `prnb-youtube-calendar` → Settings → Builds → **Connect** で GitHub リポジトリを接続
3. Build command: `npm run build` / Deploy command: `npx wrangler deploy`

以降は `main` への push で本番デプロイ、PR ごとにプレビュー URL が発行されます。
※ D1 マイグレーションは自動では適用されないため、スキーマ変更時は `npm run db:migrate:remote` を実行してください。

## チャンネルの追加

ID を 1 行追加するだけで、次の Cron から過去分の取り込みが始まります(タイトルとアイコンは自動取得)。

```bash
npx wrangler d1 execute youtube-calendar --remote \
  --command "INSERT INTO channels (id, color, sort_order) VALUES ('UCxxxxxxxxxxxxxxxxxxxxxx', '#f472b6', 1)"
```

2 チャンネル以上になると、画面にチャンネルフィルターと色分けが自動で表示されます。
