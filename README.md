# PROJECT NEBULA Stream Calendar

YouTube チャンネルの動画・ショート・ライブ配信と、Twitch の配信・クリップをカレンダーで表示する Web アプリです。

公開 URL: https://mnkm.page/prnb-stream-calendar/

> **ファンメイドの非公式ツールです。** PROJECT NEBULA および所属タレントの公式のものではなく、運営・タレントとは関係のない個人が作成・運用しています。

```
React SPA ──fetch──▶ Hono (/api/*) ──▶ D1
                                        ▲ upsert
        Cron (毎分) ───── sync ───────┘──▶ YouTube Data API v3 / RSS
                                          └▶ Twitch API (Helix)
```

Cron で YouTube と Twitch のデータを定期的に取得して D1 に保存し、画面は D1 から読みます。画面を開くたびに外部の API を呼ばないので、表示が速く、YouTube API の 1 日の使用量(クォータ)も抑えられます。

機能・API・データモデル・同期の仕組みの詳しい説明は [docs/details.md](docs/details.md) にあります。

## 主な機能

- 月・週・日・リストの表示の切り替え
- 詳細ダイアログでの再生と、歌枠のセットリストの表示
- 種別(ライブ・動画・ショート・Twitch)とチャンネルの絞り込み
- タイトルとセットリストのキーワード検索
- チャンネル情報、再生リスト、Twitch のクリップの一覧
- 非公開・削除された動画への「再生不可」の表示
- ライト・ダークのテーマ

表示の状態は URL のパラメータ(`view`・`date`・`q`)に入るので、URL を共有すると同じ表示を開けます。

## 構成

Cloudflare Workers の 1 つの Worker で、画面(静的アセット)と API(Hono)を配信します。データは D1 に保存します。

| パス | 内容 |
|---|---|
| `src/client/` | 画面(React、Vite、Tailwind CSS) |
| `src/worker/` | API と Cron の処理 |
| `src/shared/` | 画面と Worker で共有する型と処理 |
| `migrations/` | D1 のマイグレーション |

## セットアップ

### API キーとアプリの登録

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成し、「YouTube Data API v3」を有効にします。
2. API キーを作成し、API の制限で YouTube Data API v3 だけを許可します。サーバーから呼ぶので、HTTP リファラーの制限は設定しません。
3. Twitch の配信も表示する場合は、[Twitch Developer Console](https://dev.twitch.tv/console) でアプリを登録し(リダイレクト URL は `http://localhost`、クライアントのタイプは「機密保持」)、Client ID と Client Secret を控えます。登録には Twitch アカウントの 2 段階認証が必要です。

### ローカル開発

```bash
npm install
cp .dev.vars.example .dev.vars   # YOUTUBE_API_KEY と ADMIN_TOKEN(と TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET)を記入
npm run db:migrate:local
npm run dev                      # http://localhost:5173
```

初回のデータは次のコマンドで取り込みます。過去分が多い場合は数回実行します。

```bash
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:5173/api/admin/sync
```

Cron の処理は `http://localhost:5173/cdn-cgi/handler/scheduled` を開くと手動で実行できます。`.dev.vars` に Twitch のキーが無いときは、Twitch を同期しません。

### Cloudflare へのデプロイ

```bash
npx wrangler login
npx wrangler d1 create prnb-youtube-calendar   # 出力された database_id を wrangler.jsonc に記入
npm run db:migrate:remote
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put GITHUB_TOKEN          # セットリストの点検の Issue 用
npx wrangler secret put TWITCH_CLIENT_ID      # Twitch の配信も表示する場合
npx wrangler secret put TWITCH_CLIENT_SECRET
npm run deploy
```

Worker と D1 の名前は旧名の `prnb-youtube-calendar` のままです。

`GITHUB_TOKEN` は fine-grained personal access token で作り、対象はこのリポジトリだけ、権限は Issues の Read and write だけにします。期限が切れると Issue が作られなくなり、Workers のログに `setlist audit failed` が出ます。期限の前に作り直し、`secret put` で設定し直してください。

自動デプロイは、Cloudflare のダッシュボードの Workers & Pages → `prnb-youtube-calendar` → Settings → Builds で、このリポジトリを接続して設定します(Build command: `npm run build`、Deploy command: `npx wrangler deploy`)。`main` への push で本番にデプロイされ、ほかのブランチの push ではプレビュー版がアップロードされます。

## 運用

### 本番への反映

1. `develop` ブランチで開発して push します。
2. スキーマを変えた場合は、本番の D1 にマイグレーションを反映します(`npm run db:migrate:remote`)。D1 のマイグレーションは自動では反映されません。
   - 表や列を足すだけのものは、新しいコードのデプロイの前に反映します。
   - データを書き換えるもの(`0017_recheck_split_setlists.sql` のように、新しいコードの動作を前提にしたもの)は、新しいコードのデプロイのあとに反映します。
3. `develop` を `main` に取り込んで push すると、本番にデプロイされます。

### Cron の間隔を変えるとき

自動デプロイでは、Cron の設定は本番に反映されません。`wrangler.jsonc` の `triggers.crons` を変えて `main` に取り込んだあと、次のコマンドを実行します。

```bash
npm run build                 # Cron の設定を含むデプロイ用の設定ファイルを作り直す
npx wrangler triggers deploy  # Cron の設定だけを本番に反映する
```

実行間隔が切り替わるまで、20 分ほどかかることがあります。反映された設定はダッシュボードの Settings → Trigger events で確認できます。

### 同期の状態の確認

本番の D1 の同期の日時を確認します。日時は UTC です。

```bash
npx wrangler d1 execute prnb-youtube-calendar --remote \
  --command "SELECT label, synced_at, twitch_synced_at FROM channels ORDER BY sort_order"
```

`[code: 7403]` のエラーは一時的なものです。少し待ってからやり直してください。

### チャンネルの追加

`channels` に ID を 1 行追加すると、次の Cron から過去分の取り込みが始まります。タイトルとアイコンは自動で取得します。

```bash
npx wrangler d1 execute prnb-youtube-calendar --remote \
  --command "INSERT INTO channels (id, color, sort_order) VALUES ('UCxxxxxxxxxxxxxxxxxxxxxx', '#f472b6', 1)"
```

| 列 | 内容 |
|---|---|
| `color` | チャンネルの色。CSS の色を書く。`var(--ink)` はライトテーマで黒、ダークテーマで白になる |
| `sort_order` | 画面での並び順 |
| `label` | 表示・非表示のボタンに出す短い名前(例: `公式`、`桃瀬にな`) |
| `songlist_talent` | 楽曲リストのサイトの talent パラメータの値(例: `nina`)。入れると「楽曲リストを開く」ボタンが出る |
| `twitch_login` | Twitch のログイン名(`twitch.tv/◯◯` の部分)。入れると次の Cron から Twitch の配信も取り込む |

チャンネルを 1 つ増やすと、YouTube API の使用量が 1 日に約 350〜650 ユニット増えます。1 日の上限は 10,000 ユニットなので、増やす前に見積もってください(内訳は [docs/details.md](docs/details.md) の「クォータの目安」)。

### 依存パッケージの固定

`package.json` の `overrides` で、`undici` を `^7.30.1` に固定しています。開発用の `miniflare` が脆弱性のある `undici` 7.29.1 を指定しているためです。`undici` は開発サーバーだけで使い、本番の Worker には入りません。`npm ls undici --all` で `miniflare` が 7.30.1 以上を指定するようになったら、この `overrides` を消してください。

## 既知の制限

- メンバー限定から一般公開に変わった動画には、「メン限」の印が付いたままになります。
- 予定日時を過ぎた配信予定は、YouTube に待機所が残っている間、予定として表示されます。
- ショート・プレミア公開・メンバー限定の判定には、公式に案内されていない再生リスト(`UUSH` / `UULF` / `UUMO` / `UUMF`)を使っています。この仕様が変わると、判定が正しくなくなります。
- Twitch には待機所が無いので、Twitch の配信予定は表示されません。配信は始まってから 5 分以内に表示されます。
- Twitch のアーカイブは取り込みを始めた時点で残っているものだけを取り込みます。保存期間(7〜60 日)を過ぎたものは再生できなくなり、アーカイブを残さない配信は、配信中に取り込んだ記録だけが残ります。
- YouTube の API では削除と非公開を区別できません。「再生不可」の表示まで最長で 1 日ほどかかり、表示する日付は確認した日です。
- 削除された Twitch のクリップは、確認されるまで(最長 1 日ほど)一覧に残ります。Twitch の API が返すクリップには上限(1,000 件ほど)があり、再生数の少ない古いクリップは取り込まれないことがあります。
- YouTube と Twitch で同時に配信すると、同じ配信が 2 件表示されます。
- 半角カタカナの濁点(`ｶﾞ` など)を含む語は、検索では一致しても強調表示されないことがあります。

## クレジット

- Icon: [MingCute Icons](https://github.com/mingcute-design/mingcute-icons)（Apache License 2.0）、[Lucide](https://github.com/lucide-icons/lucide)（ISC License。Feather 由来の一部は MIT License）。対象とライセンス全文は `THIRD_PARTY_NOTICES.md` にあります。
