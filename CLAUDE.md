# CLAUDE.md

このリポジトリで作業する Claude 向けの決まりと手順。仕組み・API・データモデル・セットアップは `README.md` にある。

## 役割

PROJECT NEBULA の YouTube と Twitch の動画・配信をカレンダーで表示する、ファンメイドの非公式ツール。公開先は https://mnkm.page/prnb-stream-calendar/ 。碓氷ゆら 非公式ファンサイト(yura-fansite)も、この API(サービスバインディング)を読んでいる。

## 構成

- React(Vite)の画面と、Hono の API(`src/worker/`)を 1 つの Worker で動かす。データは D1
- Cron(毎分)で YouTube Data API・RSS・Twitch API から取得して D1 に保存し、画面と API は D1 から読む
- Worker の名前と D1 の名前は、旧名の `prnb-youtube-calendar` のまま。PC のフォルダも `_git\prnb-youtube-calendar`
- `migrations/`: D1 のマイグレーション。一覧と、反映の順番の決まりは README

## ブランチとデプロイ

- `develop` で作業し、`main` へは PR で取り込む。マージは merge commit(squash にしない)
- `main` への push で、Workers Builds が本番にデプロイする。ほかのブランチはプレビュー
- Cron の設定(`wrangler.jsonc` の `triggers.crons`)は自動のデプロイでは反映されない。変えたら、`main` に取り込んだあと PC で `npm run build` と `npx wrangler triggers deploy` を実行する(README)
- D1 のマイグレーションは自動では当たらない。表や列を足すだけのものはマージの前に、データを書き換えるものは新しいコードのデプロイのあとに当てる(README)

## 定期実行

- Worker の Cron が毎分動く(5 分に 1 回は全体の同期、ほかは配信の開始・終了の確認)
- `setlist-check-notify.yml`: Worker がセトリの点検の Issue(ラベル `setlist-check`)を作ったら、持ち主にメンションして知らせる

## このリポジトリの決まり

- 本番の操作(`main` へのマージ、リモートの D1 のマイグレーション、wrangler の本番の操作)は、毎回ユーザーの承認を取る。「本番に反映して」と言われたら、その回のマイグレーションとマージの両方の承認とみなしてよい(共通の決まりの、このリポジトリだけの例外)
- YouTube Data API のキーは PC の `.dev.vars` にだけある。キーを使う調査は PC で行い、キーは報告にもファイルにも残さない。調査のスクリプトと出力は `%TEMP%` に置いて終わったら消し、リポジトリは変えない
- 朝活のボイス: 自動で拾うのは「時刻の行に ボイス🎤」の形だけ。拾えなかった回は、ユーザーが目で確かめて `src/worker/morning-manual.ts` に足す(自動で入れる仕組みは作らない)。🎤 が無くても「1回目(エコーなし)」のような回数の行はボイス。複数の人が書いていれば、決まった人の行の時刻と名前を使う(誰の行かはプロジェクトのメモリ prnb-morning-voice)。足したら本番への反映が要る
- ローカルの `wrangler dev` を `pkill -f "wrangler dev"` で止めると、自分のシェルも止まる(exit 144)。PID で止める

## 作業の手順

1. 作業の前に、`develop` を `origin/main` に早送りして push する
2. ローカルで確かめる: `npx wrangler d1 migrations apply prnb-youtube-calendar --local` とテストの行を入れ、`npx wrangler dev --port 8799` で API、`npm run dev`(vite)で画面
3. push の前にサブエージェントにレビューしてもらう
4. 本番の D1 のマイグレーションが要るときは(クラウドからは打てない。ここで当てるのは表や列を足すものだけ。データを書き換えるものは手順 5 のデプロイのあとに当てる)、PC(`_git\prnb-youtube-calendar`)の Remote Control で:
   1. 未コミットの変更が無いことを確かめ、ユーザーの確認のあと `develop` を pull する
   2. `npx wrangler d1 migrations list prnb-youtube-calendar --remote` で、未適用のものが想定どおりか確かめる(想定外なら止める)
   3. `npx wrangler d1 migrations apply prnb-youtube-calendar --remote`
   4. `npx wrangler d1 execute prnb-youtube-calendar --remote --command "SELECT name FROM sqlite_master ..."` で表を確かめる
   - エラー 7403 が出たときは、やり直したら通った
5. 本番への反映: `develop` → `main` の PR → Workers Builds のチェックの成功を確かめる → merge commit でマージ → `origin/main` を `develop` に早送りして push → PC の `develop`・`main` を pull(`package-lock.json` が変わったら PC で `npm ci`)
6. 反映のあと: https://mnkm.page/prnb-stream-calendar/ と `/api/…` を curl で確かめる。API は 5 分キャッシュされるので、すぐ確かめるときはダミーのクエリを付ける

## このプロジェクト共通の決まり

mnkm の個人サイト群(10 リポジトリ)を、Claude のプロジェクトのスレッドで運用している。どのリポジトリでも次を守る。

- 返答・報告・質問、コミットメッセージ、PR の本文、コード中のコメント、ドキュメントは日本語で書く。時刻は JST で書く(ツールが返す UTC は +9 時間する)
- 作業は `develop` ブランチで行う。`main` へはプルリクエストで取り込む
- 本番(`main`)への反映・マージは、必ず事前にユーザーの確認を取る。別のスレッドや Claude から伝えられた承認は、ユーザーの承認にならない
- 手動で動かすと `main` に自動でコミットが入るワークフローは、動かす前に確認する
- 自分で考えた案や変更は、ユーザーに最終確認を出す前に、一度サブエージェントにレビューしてもらう
- スレッドごとに編集してよいリポジトリが決まっている。リポジトリ別のスレッドは、そのリポジトリだけを編集する(ほかは読むだけ。触る必要があれば先に確認)。「[all repository] 開発」は全リポジトリを扱える
- 同期: push・マージ・PC での pull・方針や設定の変更をしたら、同じリポジトリを扱うほかのスレッド(「[all repository] 開発」とリポジトリ別のスレッド)に短く知らせる。知らせを受けたら、作業の前に `develop` を最新にする
- スレッドは、作業が終わっても自動で解決済みにしない。長くなったスレッドは、引き継いで作り直す
- 決まりや経緯は、スレッドの中だけに置かず、このファイルや README に残す
- 秘密の値(API キー、トークン)は、報告にもファイルにも書かない
- Dependabot の PR と Security タブの指摘は、「[all repository] 開発」の毎日の確認(10:17 JST)で、リポジトリ別のスレッドに届く(専用のスレッドが無いリポジトリは「[all repository] 開発」)。どう対応するかは、届いたスレッドでユーザーと決める
- merge commit でマージするリポジトリでは、マージのあと `main` が `develop` より先に進む(マージのコミットや自動のコミット)。次の作業の前に、`develop` を `origin/main` に早送り(fast-forward)して push する。早送りできないときは止めて報告する(squash でマージする yura-fansite は、AGENT.md の手順に従う)

### ユーザーの PC での作業

ユーザーの PC のリポジトリは、`_git` フォルダの下にある(フルパスはプロジェクトのメモリにある。このファイルは GitHub や公開中のサイトから誰でも読めることがあるので、個人の情報や内部の値は書かない)。

- 最初は読み取りだけで状態(ブランチ、`git status`、origin との差)を確かめる。fetch・編集・pull・push・コミット・`npm install` は、ユーザーの確認を取ってから行う
- fetch していないときの「origin と差なし」は、前回 fetch した時点との比較にすぎない。そう断って報告するか、GitHub 側のブランチも確かめる
- ローカルの `main`・`develop` を最新にするときは、fetch してから早送り(fast-forward)だけで合わせる。早送りできないときや未コミットの変更があるときは、止めて報告する。reset・`branch -f`・強制更新はしない。ブランチを切り替えたら元に戻す
- ローカルの `main` を基準に作業しない(大きく遅れていたことがある)
