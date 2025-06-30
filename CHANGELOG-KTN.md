# KTN Fork Changelog

## 変更記録について / About This Changelog

### Cherry-Pick時の出典表示 / Cherry-Pick Attribution
- コードを他のリポジトリからCherry-Pickした場合は、Fork元を明記します
- Cherry-pickしたコミットには以下の形式で出典を記載します：
  ```
  (Cherry-picked from https://github.com/owner/repository/pull/123)
  ```
- When cherry-picking code from other repositories, I will specify the source fork
- For cherry-picked commits, I will include the source in the following format:
  ```
  (Cherry-picked from https://github.com/owner/repository/pull/123)
  ```

### アイデアの流用について / About Idea Usage
- アイデアや機能の発想の流用については記載しません
- コードそのものの複製・改変のみ出典表示します
- Ideas and feature inspirations will not be documented
- Only code duplication and modifications will require source attribution

---

## 変更履歴 / Change History

<!-- 
新しい変更は上に追加してください
Add new changes above this line
-->

<!--
## 未リリース / Unreleased

### General
- 

### Client
- 

### Server
- 
-->

## 2025.4.1-ktn.1(UnReleased)

### General
- Feat: Google翻訳機能を追加
  - ノートの翻訳にGoogle Translateを使用できるように
  - 管理画面でGoogle Translate APIの設定が可能に
- Fix: SharkeyからMisskeyへのブランディング変更
  - ページ名、ファイル名、URL参照などを更新
  - アセットファイル（アイコン、ファビコンなど）をMisskey標準のものに変更
  - ローカライゼーションファイルの参照をsharkey-localesからlocalesに変更
- Fix: リポジトリ情報の更新
  - package.jsonやその他設定ファイルでのリポジトリURLを更新
  - GitLabテンプレートファイルの参照を修正
- Fix: SPDXライセンス情報の追加
- Fix: READMEファイルの内容を更新

### Client
- Feat: 管理画面に外部翻訳サービス設定UIを追加
  - Google Translate APIキーの設定画面
- Fix: デフォルト設定をMisskey仕様に変更
  - 設定項目のデフォルト値を調整
- Fix: About ページのSharkeyからMisskeyへの変更
  - `/about-sharkey` → `/about-misskey` にページ名変更
  - アイコンとページ内容を更新

### Server
- Feat: Google Translate APIとの連携機能を実装
  - 新しいマイグレーション：翻訳サービス設定の追加
  - MetaEntity に翻訳設定フィールドを追加
  - `/api/notes/translate` エンドポイントにGoogle Translate対応を追加
  - 管理API（`/api/admin/meta`, `/api/admin/update-meta`）に翻訳設定を追加
- Fix: マイグレーションファイルの調整

---

*このフォークはAGPLv3ライセンスに基づいており、すべての変更は同ライセンスの下で提供されます。*  
*This fork is licensed under AGPLv3, and all changes are provided under the same license.*
