# セキュリティチェック

このリポジトリは公開用です。API キー、アクセストークン、秘密鍵、実際の環境変数、データベース、認証情報を保存しないでください。

## プッシュ前の検査

Node.js 22.13 以降で、最初に次を実行します。macOS / Linux の arm64・x64 に対応します。

```bash
npm run security:setup
git config --local core.hooksPath .githooks
```

既存の `core.hooksPath` がある場合は、上書きする前に既存フックと統合してください。フックの有効化はクローンごとに必要です。`security:setup` は公式リリースから固定バージョンの Gitleaks を取得し、固定した SHA-256 と一致した場合だけ `.cache/` に配置します。追加の npm 依存やスキャナーのライセンスキーは不要です。

以降の `git push` では次の検査が自動で走ります。

- ローカルの全 Git 履歴を Gitleaks で検査。後から削除した秘密情報も対象。
- ステージ済みのファイルを一時領域へ取り出して検査。未コミットの追加も対象。
- 実際の `.env`、秘密鍵、認証設定、DB ファイル、生成物の混入をファイル名でも拒否。
- `.openai/hosting.json` が `project_id` と論理バインド名だけを含むか確認。

未ステージの編集はステージ後に検査してください。レポートでは秘密の値を完全に伏せます。スキャナー未導入・実行エラー・検出時にはプッシュを止めます。フックを迂回するとこのローカル保護は働かないため、GitHub 側の保護も併用します。

```bash
git add <公開するファイル>
npm run security:check
```

`security:dependencies` は `package-lock.json` の本番・開発依存を npm のアドバイザリーデータベースと照合し、Moderate 以上で失敗します。Low も出力に表示されます。レジストリ接続エラーも成功扱いにしません。

## GitHub での継続検査

`Security` ワークフローは main への push、Pull Request、週次、手動実行で動きます。秘密情報・公開ファイルの検査と、依存関係監査を別々に実行します。検知機能自体についても、偽の認証情報を実行時に作り、ステージ中・削除済みの履歴から検出できることをテストします。

GitHub Actions は読み取り専用の権限で、checkout の認証情報を保持せず、Action を完全なコミット SHA で固定しています。`pull_request_target` や公開用のシークレットは使用しません。スキャナーのバージョンとチェックサムは `scripts/security/gitleaks-release.json` で管理します。更新時は公式の release assets にある digest と照合してください。

Dependabot は npm と GitHub Actions の更新を週次で提案します。GitHub 標準の Secret scanning と Push protection も併用します。Actions は push **後**に走るため、それだけでは漏洩の事前防止になりません。

## 検出された場合

値をログや公開 Issue に貼らず、秘密情報を除去してください。コミット済みの場合は対象の履歴を確認し、公開済み・共有済みの認証情報は失効・再発行します。検出回避のための一括除外や履歴の無断書き換えはしないでください。

`.openai/hosting.json` の `project_id` は認証能力を持たないサイト識別子で、ソース管理対象です。ソース書き込み用トークン、閲覧用バイパストークン、環境変数はここに追加しません。公開用画像は別途目視確認が必要です。検知は既知のパターン・既知の脆弱性に基づくため、未検出が安全の保証になるわけではありません。

参考: [Gitleaks](https://github.com/gitleaks/gitleaks)、[GitHub Actions の安全な利用](https://docs.github.com/en/actions/reference/security/secure-use)。
