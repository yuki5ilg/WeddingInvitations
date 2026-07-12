# Wedding RSVP — Cloudflare バックエンド

FormspreeをやめてCloudflare（Worker + D1）でRSVPを集計する仕組み。
**サイトの見た目・ホスティング（GitHub Pages）は変わりません。** フォームの送信先だけが変わります。

## 構成
```
サイトのフォーム ──POST──▶ Cloudflare Worker ──▶ D1 (SQLite DB)
                                   ▲
              管理ページ /admin ───┘（パスワード付き・集計＆CSV）
```

## デプロイ手順（フェーズ1：裏側だけ）

前提：Cloudflareアカウント＋ドメイン（yuki5ilg.com）がCloudflare管理下にあること。

```bash
cd cloudflare
npm install

# 1) Cloudflare にログイン
npx wrangler login

# 2) D1 データベースを作成 → 出力される database_id をコピー
npx wrangler d1 create wedding-rsvp
#   → wrangler.toml の database_id = "PASTE_DATABASE_ID_HERE" に貼り付け

# 3) テーブル作成（本番DBへ）
npx wrangler d1 execute wedding-rsvp --remote --file=schema.sql

# 4) 管理ページのパスワードを設定（好きな文字列を入力）
npx wrangler secret put ADMIN_TOKEN

# 5) デプロイ
npx wrangler deploy
#   → https://wedding-rsvp.<あなたのサブドメイン>.workers.dev が発行される
```

## 疎通確認（切り替え前に必ず）

```bash
# a) DB接続チェック（{"ok":true,"count":0} が返ればOK）
curl https://wedding-rsvp.<xxx>.workers.dev/health

# b) テスト送信
curl -X POST https://wedding-rsvp.<xxx>.workers.dev/ \
  -F 'name=テスト太郎' -F 'attendance=喜んで出席します' -F 'メールアドレス=test@example.com'
#   → {"ok":true,...}

# c) 管理ページをブラウザで開く（設定したパスワードを入れる）
#   https://wedding-rsvp.<xxx>.workers.dev/admin?token=設定したパスワード
```

管理ページにテスト送信が表示され、件数が数えられていれば疎通OK。

## フェーズ2：フォームを切り替え

疎通確認できたら、`index.html` の送信先URLを Formspree から Worker のURLに変えるだけ。
（この作業はアシスタント側で対応します。Worker のURLを教えてください。）

## （任意）独自サブドメインにする

`api.yuki5ilg.com` などで受けたい場合は Cloudflare ダッシュボード →
Workers & Pages → 該当Worker → Settings → Domains & Routes → Custom Domain で追加。

## 無料枠
- Worker: 10万リクエスト/日
- D1: 10万書き込み/日・5GB保存
- → Formspreeの50件/月制限は消滅
