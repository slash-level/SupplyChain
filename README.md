# セキュリティセルフチェック支援ツール

このプロジェクトは、個人開発のセキュリティセルフチェック支援ツールです。無料サービス（Firebase, Supabase, Render, Gemini APIなど）を活用して構築されています。Dockerコンテナとして動作し、React製のフロントエンドとNode.js製のバックエンドで構成されています。

## 評価基準について

本ツールで使用している評価基準は、経済産業省が公表した**「サプライチェーン強化に向けたセキュリティ対策評価制度構築に向けた中間取りまとめ」**（2025年4月公表）に基づいています。

*   **出典:** [経済産業省：サプライチェーン強化に向けたセキュリティ対策評価制度構築に向けた中間取りまとめを取りまとめました](https://www.meti.go.jp/press/2025/04/20250414002/20250414002.html)

現在は中間取りまとめ版をベースとしたベータ版ですが、今後、経済産業省より正式な評価基準やガイドラインが公表された際には、順次アップデートを行っていく予定です。

## 主な機能

*   **ユーザー認証:** Firebaseを利用した安全なログイン、パスワードリセット、パスワード変更、アカウント登録機能。
*   **ゲスト利用:** アカウント登録なしですぐに機能を試せるゲストログイン（匿名認証）機能。
*   **アカウント削除機能:** ユーザーは自身のアカウントを安全に削除できます。削除すると、認証情報と関連するすべてのデータベースレコード（評価セット、回答など）が完全に消去されます。
*   **評価セット管理:** 複数評価セットの管理機能。
*   **AIによる改善アドバイス:** Gemini APIと連携し、セキュリティ要件を達成するための具体的な改善策を提案。
*   **ダッシュボード:** 評価状況を円グラフで可視化。
*   **アクションアイテム管理:** 指摘事項に対するタスク管理機能。
*   **PDF/CSVエクスポート:** 評価結果をオフラインで確認・共有。

## 利用技術スタック

### クライアント
*   **フレームワーク:** React (TypeScript)
*   **UIライブラリ:** React-Bootstrap
*   **認証:** Firebase Authentication
*   **その他:** React Markdown

### サーバー
*   **ランタイム:** Node.js
*   **フレームワーク:** Express.js
*   **データベース:** PostgreSQL (Supabase), Sequelize ORM
*   **AI連携:** Google Gemini API (モデル: `gemini-2.5-flash` / 設定により変更可能)
*   **レポート生成:** Puppeteer, Handlebars

## APIエンドポイント

ここでは、アプリケーションが提供する主要なAPIエンドポイントについて説明します。

### ヘルスチェック
*   `GET /api/health`
    *   **説明:** サーバーが正常に動作しているかを確認するためのヘルスチェックエンドポイントです。

### Geminiモデル情報
*   `GET /api/gemini/models`
    *   **説明:** Gemini APIで利用可能なモデルのリストを取得します。

### 評価基準
*   `GET /api/criteria`
    *   **説明:** アプリケーションが使用するすべての評価基準のリストを取得します。

### ユーザー管理
*   `POST /api/users`
    *   **説明:** 新しいユーザーを登録するか、既存ユーザーの情報を更新します。
    *   **ボディ:** `firebaseUid`, `email`, `companyName` (将来の機能拡張用。ベータ版では入力は求めません)
*   `DELETE /api/users/:firebaseUid`
    *   **説明:** 指定された`firebaseUid`を持つユーザーアカウントと、そのユーザーに関連するすべてのデータ（評価セット、回答、アクションアイテム等）を削除します。
    *   **認証:** `Authorization: Bearer <IDトークン>` ヘッダーに、削除対象ユーザーの有効なFirebase IDトークンが必要です。

### 評価セット管理
*   `GET /api/evaluationsets/:firebaseUid`
    *   **説明:** 指定された`firebaseUid`を持つユーザーが作成したすべての評価セットを取得します。
*   `POST /api/evaluationsets`
    *   **説明:** 新しい評価セットを作成します。
    *   **ボディ:** `firebaseUid`, `name`, (オプション) `description`
*   `PUT /api/evaluationsets/:id`
    *   **説明:** 指定されたIDの評価セットを更新します。
    *   **ボディ:** (オプション) `name`, `description`, `status`
*   `DELETE /api/evaluationsets/:evaluationSetId`
    *   **説明:** 指定されたID의 評価セットを削除します。関連する回答やAIアドバイスも削除されます。

### 回答（評価結果）管理
*   `POST /api/answers`
    *   **説明:** 評価セット内の特定の基準に対する回答（ステータス、備考）を保存または更新します。
    *   **ボディ:** `evaluationSetId`, `requirement_id`, `criterion_id`, `status`, (オプション) `notes`
*   `GET /api/answers/:evaluationSetId`
    *   **説明:** 指定された評価セットIDのすべての回答と、それに関連するAIアドバイスを取得します。

### AIアドバイス
*   `POST /api/ai/advice`
    *   **説明:** Gemini APIを利用して、特定の評価基準に対する改善アドバイスを生成します。
    *   **ボディ:** `evaluationSetId`, `requirement_id`, `criterion_id`, `requirementText`, `criterionText`, (オプション) `notes`

### アクションアイテム管理
*   `GET /api/actionitems/:evaluationSetId`
    *   **説明:** 指定された評価セットIDのすべてのアクションアイテムを取得します。
*   `POST /api/actionitems`
    *   **説明:** 新しいアクションアイテムを作成します。
    *   **ボディ:** `evaluationSetId`, `requirement_id`, `criterion_id`, `taskDescription`, (オプション) `assignee`, `dueDate`, `status`
*   `PUT /api/actionitems/:actionItemId`
    *   **説明:** 指定されたアクションアイテムを更新します。
    *   **ボディ:** (オプション) `taskDescription`, `assignee`, `dueDate`, `status`
*   `DELETE /api/actionitems/:actionItemId`
    *   **説明:** 指定されたアクションアイテムを削除します。

### レポート生成
*   `POST /api/report/pdf`
    *   **説明:** 現在の評価結果からPDFレポートを生成します。
    *   **ボディ:** `requirements` (評価データのオブジェクト)
