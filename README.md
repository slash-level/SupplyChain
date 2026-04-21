# サプライチェーン強化に向けたセキュリティ対策評価制度 セルフチェック支援ツール

このプロジェクトは、経済産業省の「サプライチェーン強化に向けたセキュリティ対策評価制度」の自己評価を支援するツールです。個人開発プロジェクトとして、無料サービス（Firebase, Supabase, Render, Gemini APIなど）を最大限に活用し構築されています。Dockerコンテナとして動作し、React (TypeScript) のフロントエンドと Node.js のバックエンドで構成されています。

## 評価基準について

本ツールで使用している要求事項及び評価基準は、経済産業省が公表した「サプライチェーン強化に向けたセキュリティ対策評価制度に関する制度構築方針」（2026年3月27日公表）に基づいています。

*   出典: [サプライチェーン強化に向けたセキュリティ対策評価制度に関する制度構築方針](https://www.meti.go.jp/shingikai/mono_info_service/sangyo_cyber/wg_seido/wg_supply_chain/20260327_report.html)

## 主な機能

*   **組織管理 (マルチテナント)**: 招待コードによる組織への紐付け。組織オーナーによるメンバーの役割管理（管理者/一般）や除外が可能。
*   **組織テンプレート & コピー作成**: 管理者が特定の評価セットを「テンプレート」として共有し、他メンバーがその回答内容を引き継いで新しい評価を開始できる機能。
*   ユーザー認証: Firebaseを利用した安全なログイン、パスワード変更、アカウント管理機能。
*   ゲスト利用: アカウント登録なしで基準の内容やAIアドバイスを試せる匿名認証ログイン（※組織機能は制限されます）。
*   評価セットの管理: 部署別や時期別など、複数の評価セットを個別に作成・保存・編集・削除可能。★3（必須）と★4（標準目標）の動的な切り替えに対応。
*   評価基準の解説表示: 全153項目の要求事項と評価基準に対し、背景や具体的な実務上の対応例を平易な言葉で解説。セルフチェックの判断をサポートします。
*   AIによる改善アドバイス: Google Gemini APIと連携。改善が必要な項目に対し、評価結果に合わせた具体的な改善手順を提案。
*   評価状況の可視化: ダッシュボードによる進捗管理と円グラフ表示。
*   アクションアイテム管理: 要対応事項をタスクとして登録し、期限や担当者を管理。
*   レポート出力:
    *   PDFレポート出力: 視認性を高めた評価報告書（「アクションアイテム一覧」を含む）を生成。
    *   CSVエクスポート: 他ツールとのデータ連携用。
*   データ整合性への配慮: サーバーメンテナンスやDBリセットなどでデータに不整合が生じた場合に、クライアント側の状態不整合を検知・リセットする仕組みを実装。

## 利用技術スタック

### クライアント
*   フレームワーク: React (TypeScript)
*   UIライブラリ: React-Bootstrap (Material Design Principles)
*   認証: Firebase Authentication

### サーバー
*   ランタイム: Node.js
*   フレームワーク: Express.js
*   データベース: PostgreSQL (Supabase), Sequelize ORM
*   AI連携: Google Gemini API
*   レポート生成: Puppeteer (Chromium), Handlebars

## APIエンドポイント

ここでは、アプリケーションが提供する主要なAPIエンドポイントについて説明します。

### ヘルスチェック
*   `GET /api/health`
    *   説明: サーバーが正常に動作しているかを確認するためのヘルスチェックエンドポイントです。

### Geminiモデル情報
*   `GET /api/gemini/models`
    *   説明: Gemini APIで利用可能なモデルのリストを取得します。

### 評価基準
*   `GET /api/criteria`
    *   説明: アプリケーションが使用するすべての評価基準のリストを取得します。

### ユーザー管理
*   `POST /api/users`
    *   説明: 新しいユーザーを登録するか、既存ユーザーの情報を更新します。
    *   ボディ: `firebaseUid`, `email`, `companyName` (将来の機能拡張用)
*   `DELETE /api/users/:firebaseUid`
    *   説明: 指定された`firebaseUid`を持つユーザーアカウントと、そのユーザーに関連するすべてのデータ（評価セット、回答、アクションアイテム等）を削除します。
    *   認証: `Authorization: Bearer <IDトークン>` ヘッダーに、有効なFirebase IDトークンが必要です。

### 評価セット管理
*   `GET /api/evaluationsets/:firebaseUid`
    *   説明: 指定された`firebaseUid`を持つユーザーが作成したすべての評価セットを取得します。
*   `POST /api/evaluationsets`
    *   説明: 新しい評価セットを作成します。
*   `PUT /api/evaluationsets/:id`
    *   説明: 指定されたIDの評価セットを更新（名称、説明、星レベルなど）します。
*   `PUT /api/evaluationsets/:id/template`
    *   説明: 特定の評価セットを組織テンプレートとして公開・非公開を切り替えます。
*   `POST /api/evaluationsets/copy`
    *   説明: 既存のテンプレートから回答や備考をコピーして、新しい評価セットを作成します。
*   `DELETE /api/evaluationsets/:evaluationSetId`
    *   説明: 指定されたIDの評価セットを削除します。

### 組織管理
*   `GET /api/organizations/:id/templates`
    *   説明: 指定された組織内で共有されている評価テンプレートの一覧を取得します。
*   `POST /api/organizations`
    *   説明: 新しい組織を作成し、招待コードを生成します。

### 回答（評価結果）管理
*   `POST /api/answers`
    *   説明: 評価セット内の特定の基準に対する回答（評価、備考）を保存または更新します。
*   `GET /api/answers/:evaluationSetId`
    *   説明: 指定された評価セットIDのすべての回答と、関連するAIアドバイスを取得します。

### AIアドバイス
*   `POST /api/ai/advice`
    *   説明: Gemini APIを利用して、改善アドバイスを生成します。

### アクションアイテム管理
*   `GET /api/actionitems/:evaluationSetId`
    *   説明: 指定された評価セットのアクションアイテムを取得します。
*   `POST /api/actionitems`
    *   説明: 新しいアクションアイテムを作成します。
*   `PUT /api/actionitems/:actionItemId`
    *   説明: アクションアイテムを更新します。
*   `DELETE /api/actionitems/:actionItemId`
    *   説明: アクションアイテムを削除します。

### レポート生成
*   `POST /api/report/pdf`
    *   説明: 現在の評価結果からPDFレポートを生成します。