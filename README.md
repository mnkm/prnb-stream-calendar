# Stream Calendar

YouTube チャンネルの **動画・ショート・ライブ配信** をカレンダーで表示する Web アプリ。
Cloudflare Workers(静的アセット + Hono API)+ D1 + Cron Triggers で動作します。

```
React SPA ──fetch──▶ Hono (/api/*) ──▶ D1
                                        ▲ upsert
        Cron (15 分ごと) ── sync ───────┘──▶ YouTube Data API v3 / RSS
```

画面を開くたびに YouTube API を呼ぶのではなく、Cron で定期的に取得して D1 に保存しておき、画面は D1 から読みます。表示が速く、API の 1 日の使用量(クォータ)も抑えられます。

## 主な機能

| 機能 | 内容 |
|---|---|
| 表示の切り替え | **月 / 週 / 日 / リスト** をヘッダーで切り替え。スマホの初期表示はリスト |
| 月表示 | 種別ごとの色のチップで表示。1 日 4 件以上は「+N 件」から日別一覧を開く。スマホでは色の点のみ |
| 週・日表示 | 0〜23 時を縦スクロールで表示し、予定を時刻の位置にブロックで置く。今日の列に現在時刻の線。日表示はサムネイル付き |
| リスト表示 | 月内の予定を日付ごとにサムネイル付きで表示 |
| 詳細ダイアログ | 高画質サムネイル、日時・長さ、その場で再生(メンバー限定は YouTube へ誘導) |
| 期間の移動 | 前後ボタン、「今日」、カレンダーの左右スワイプ(タッチ操作のみ) |
| 種別フィルター | ライブ / 動画 / ショートの表示切り替え(表示中の期間の件数付き) |
| キーワード検索 | タイトルを全期間から検索。全角・半角、大文字・小文字を区別しない。結果はリストで全件たどれる |
| テーマ | 自動(OS の設定)/ ライト / ダーク をヘッダーのボタンで切り替え |
| チャンネル情報 | ヘッダーのチャンネルアイコンを押すと、バナー・@ハンドル・登録者数・動画数・説明文(URL はリンク)を表示 |
| 複数チャンネル | 2 チャンネル目を登録すると、チャンネルフィルターと色分けが自動で表示される |

表示の状態は URL に残るので、そのまま共有できます。

| パラメータ | 例 | 内容 |
|---|---|---|
| `view` | `month` / `week` / `day` / `list` | 表示モード |
| `date` | `2026-10-04` | 表示する日付(月・週表示ではその日を含む月・週) |
| `q` | `ASMR` | 検索語(指定すると検索結果を表示) |

以前の形式の `?month=2026-10` も開けます。

## 構成

| パス | 内容 |
|---|---|
| `src/client/App.tsx` | 画面全体の状態(表示モード・日付・フィルター・検索)と URL の同期、スワイプ |
| `src/client/components/` | `MonthView` / `TimeGridView`(週・日)/ `ListView` / `SearchResults` / `EventDialog` / `Header` / `Toolbar` ほか |
| `src/client/lib/` | API 呼び出し(`api.ts`)、日付の計算(`calendar.ts`)、表示の整形(`format.ts`)、テーマ(`theme.ts`) |
| `src/worker/index.ts` | API ルートと Cron ハンドラ |
| `src/worker/sync.ts` | 同期処理(過去分の段階取得 / 差分同期 / 一度だけの補正) |
| `src/worker/youtube.ts` | YouTube Data API クライアント、RSS、プレイリスト ID の導出 |
| `src/worker/db.ts` | D1 アクセス(保存・期間検索・キーワード検索) |
| `src/shared/` | 画面と Worker で共有する型(`types.ts`)と検索語の正規化(`search.ts`) |
| `migrations/` | D1 のスキーマと初期チャンネル |

主なライブラリ: React 19、Vite、Tailwind CSS v4、Motion(アニメーション・スワイプ)、TanStack Query(取得とキャッシュ)、date-fns、lucide-react、Hono。

## API

| メソッド・パス | 内容 |
|---|---|
| `GET /api/channels` | 有効なチャンネルの一覧(名前・アイコン・色・説明・登録者数など) |
| `GET /api/events?from=&to=&channels=&types=` | 期間内の予定(最大 100 日分)。カレンダー表示に使う |
| `GET /api/search?q=&types=&channels=&cursor=` | キーワード検索。50 件ずつ新しい順に返す(後述) |
| `POST /api/admin/sync` | 手動同期。`Authorization: Bearer <ADMIN_TOKEN>` が必要 |

## データモデル(D1)

### `videos`

| 列 | 内容 |
|---|---|
| `id` | 動画 ID |
| `type` | `live` / `video` / `short` |
| `live_status` | `upcoming`(予定)/ `live`(配信中)/ `ended`(終了)。ライブとプレミア公開のみ |
| `event_at` | カレンダーに置く日時(UTC)。ライブ・プレミアは開始(予定)時刻、それ以外は公開日時 |
| `ended_at` | 配信の終了日時 |
| `duration_sec` | 動画の長さ |
| `members_only` | メンバー限定なら 1 |
| `search_title` | 検索用に正規化したタイトル(後述) |

ほかに `title`、`thumbnail_url`、`published_at`、`updated_at` など。

### `channels`

同期対象のチャンネル。`color`(複数チャンネル時の識別色)、`enabled`、プロフィール(`description` / `custom_url` / `banner_url` / `subscriber_count` / `video_count`、1 日 1 回更新)、過去分の取得の進み具合(`backfill_stage` / `backfill_page_token`)、一度だけ行う補正の進み具合(`premieres_*` / `members_*`)を持ちます。

## 同期の仕組み

Cron(15 分ごと)で、有効なチャンネルごとに次の処理を行います。あわせて、チャンネルのプロフィール(`channels.list` の snippet / statistics / brandingSettings)を 1 日 1 回取り直します(1 ユニット)。

### 1. 過去分の取得(チャンネル登録直後)

1. 全アップロードのプレイリスト(`UU…`)を、1 回あたり 8 ページ(400 件)ずつ取得します。Workers の 1 回あたりの外部リクエスト数の上限を超えないよう、数回の Cron に分けて進めます。
2. 最後まで取得したら、ショートのプレイリスト(`UUSH…`)でショートを判定します。

### 2. 差分同期(過去分の取得が終わったあと)

- RSS(クォータを消費しない)で新着を検知します。
- メンバー限定は RSS にも `UU…` にも含まれないため、メンバー限定のプレイリスト(`UUMO…`)の先頭も確認します。
- 新着と「予定・配信中」のライブだけを `videos.list` で取得し直します。予定時刻の変更や配信の開始・終了が反映されます。
- 待機所が削除・非公開になった配信は、`videos.list` に返ってこないので、カレンダーからも消します。

### 3. 一度だけの補正(差分同期の中で、終わるまで続ける)

- **プレミア公開**: 「動画」タブのプレイリスト(`UULF…`)を最後まで見て、ライブとして登録されたプレミア公開を動画に分類し直します。
- **メンバー限定**: `UUMO…` を最後まで取り込み、`UUMF…` でメンバー限定のプレミア公開を判定します。
- **検索用の列**: `search_title` が空の行を、1 回あたり 1,000 件ずつ埋めます。

### 種別の判定

| 種別 | 判定方法 |
|---|---|
| ライブ | `liveStreamingDetails` があるもの |
| プレミア公開 | API ではライブと同じ形で返る。`UULF` / `UUMF` に含まれる、または公開前・公開中で動画の長さがある(ライブ配信は長さ 0)ものを **動画** として扱う。状態の追跡のため `live_status` は残し、API では動画として返す |
| ショート | `UUSH` に含まれるもの。プレイリストが使えないときは `/shorts/{id}` がリダイレクトされるかで判定 |
| 動画 | 上のどれにも当てはまらないもの |
| メンバー限定 | `UUMO` に含まれるもの(種別とは別に `members_only` を立てる) |

`UU` 以外のプレイリスト(`UUSH` / `UULF` / `UUMO` / `UUMF`)は YouTube の非公式な仕組みですが、広く使われています。

### クォータの目安

1 回の同期で約 4〜5 ユニット(`UUSH` / `UULF` / `UUMO` の先頭と `videos.list`)、1 チャンネルあたり約 400〜500 ユニット/日です(上限は 10,000 ユニット/日)。

## 画面の実装メモ

### 時刻の表示

- 保存は UTC、表示はブラウザのタイムゾーン(日本なら JST)です。
- 月・週・リスト表示の時刻は **5 分単位で切り捨て** て表示します(例: 21:03 → 21:00)。配信は予定より数分遅れて始まることが多いためです。詳細ダイアログでは実際の時刻を表示します。

### 週・日表示(`TimeGridView`)

- ブロックの高さは、配信なら実際の長さ(予定は 1 時間、配信中は現在時刻まで)、動画は動画の長さです。短いものは読める最小の高さ(週 25 分 / 日 60 分ぶん)にそろえます。
- 時間が重なる予定は横に並べます。日付をまたぐ配信は両方の日に表示します。
- 開いたときは、今日を含むなら現在時刻の少し前、それ以外は最初の予定の少し前までスクロールします。
- 週表示で日付の見出しを押すと、その日の日表示に切り替わります。

### 期間の移動とスワイプ

- 週・日表示も、その日を含む月グリッド(前後の週を含む)のデータで表示し、前後の月を先読みします。
- スワイプは Motion のドラッグで実装しています。タッチ操作のときだけ反応し、縦スクロールはブラウザに任せます(`touch-action: pan-y`)。80px 以上動かすか素早く払うと移動し、スワイプのあとに指を離した位置の予定は開きません。

### キーワード検索

- **全角・半角を区別しない仕組み**: SQLite には全角・半角をそろえる機能がないため、タイトルを NFKC で正規化して小文字にしたもの(例: `ＡＳＭＲ!` → `asmr!`、`ｼｬﾝﾌﾟｰ` → `シャンプー`)を `search_title` 列に保存しておきます。検索語も同じ規則でそろえてから `LIKE` で探します。正規化の規則は `src/shared/search.ts` で、画面と Worker が共有しています。
- `search_title` が空の行(列を追加する前に登録したもの)は、元のタイトルで検索します。同期で順に埋まります。
- スペース(全角も可)で区切ると、すべての語を含むものに絞り込みます。`%` や `_` は記号として扱います。
- **全件のたどり方**: 一度に全件を描くと重くなるため、50 件ずつ取得し、リストの下に近づくと続きを読み込みます。ページの区切りは `event_at` と ID のカーソルです。最初のページで種別ごとの一致件数を数え、全件の件数を表示します。種別・チャンネルの絞り込みはサーバー側で行います。
- 一致した語を強調表示します。600px 以上スクロールすると、右下に先頭へ戻るボタンが出ます。

### テーマ

選択は `<html data-theme>` と `localStorage` に保存します。`index.html` のインラインスクリプトで描画前に当てるので、読み込み時に一瞬別の色になることはありません。色は `src/client/index.css` の CSS 変数で定義しています。

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

Cron の処理は `http://localhost:5173/cdn-cgi/handler/scheduled` を開くと手動で動かせます。

### 3. Cloudflare へのデプロイ

```bash
npx wrangler login
npx wrangler d1 create prnb-youtube-calendar   # 出力された database_id を wrangler.jsonc に記入
npm run db:migrate:remote
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

### 4. GitHub 連携(自動デプロイ)

1. このリポジトリを GitHub に push
2. Cloudflare ダッシュボード → Workers & Pages → `prnb-youtube-calendar` → Settings → Builds → **Connect** で GitHub リポジトリを接続
3. Build command: `npm run build` / Deploy command: `npx wrangler deploy`

以降は `main` への push で本番デプロイされます。`main` 以外のブランチの push ではプレビュー版がアップロードされ、本番には影響しません。

## 運用

### ブランチと本番反映の流れ

1. `develop` ブランチで開発して push する
2. スキーマを変更した場合は、**先に** 本番の D1 にマイグレーションを反映する(D1 のマイグレーションは自動では適用されません)

   ```bash
   npm run db:migrate:remote
   ```

3. `develop` を `main` に取り込んで push すると、本番にデプロイされる

マイグレーションは列の追加だけにしておくと、新しいコードのデプロイ前に反映しても、動いている本番に影響しません。

| マイグレーション | 内容 |
|---|---|
| `0001_init.sql` | `channels` / `videos` テーブル |
| `0002_seed_channel.sql` | 初期チャンネル(碓氷ゆら / Yura Usui) |
| `0003_premieres_scan.sql` | プレミア公開の補正の進み具合 |
| `0004_members_only.sql` | メンバー限定の列と、取り込みの進み具合 |
| `0005_search_title.sql` | 検索用に正規化したタイトルの列 |
| `0006_channel_profile.sql` | チャンネルのプロフィール(説明・@ハンドル・バナー・登録者数・動画数) |

### チャンネルの追加

ID を 1 行追加するだけで、次の Cron から過去分の取り込みが始まります(タイトルとアイコンは自動取得)。

```bash
npx wrangler d1 execute prnb-youtube-calendar --remote \
  --command "INSERT INTO channels (id, color, sort_order) VALUES ('UCxxxxxxxxxxxxxxxxxxxxxx', '#f472b6', 1)"
```

2 チャンネル以上になると、画面にチャンネルフィルターと色分けが自動で表示されます。チャンネル数が 10 を超える場合は、Workers の 1 回あたりの外部リクエスト数の上限に近づくため、Workers Paid プランか Cloudflare Queues での分散を検討してください。

## 既知の制限

- **メンバー限定から一般公開に変わった動画**: 「メン限」ラベルが付いたままになります。
- **予定日時を過ぎた配信予定**: 待機所が残っている限り、YouTube が「配信予定」として返すため、カレンダーにも予定として表示されます。
- **非公式のプレイリスト**: `UUSH` / `UULF` / `UUMO` / `UUMF` の仕様が変わると、ショート・プレミア公開・メンバー限定の判定に影響します。
- **検索の強調表示**: 半角カタカナの濁点(`ｶﾞ` など)を含む語は、検索では一致しても、強調表示されないことがあります。
