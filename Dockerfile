# ステージ1: クライアントのビルド (builder)
FROM node:20-alpine AS builder

WORKDIR /app

# スクリプトから渡されるビルド引数を定義
ARG REACT_APP_FIREBASE_API_KEY
ARG REACT_APP_FIREBASE_AUTH_DOMAIN
ARG REACT_APP_FIREBASE_PROJECT_ID
ARG REACT_APP_FIREBASE_STORAGE_BUCKET
ARG REACT_APP_FIREBASE_MESSAGING_SENDER_ID
ARG REACT_APP_FIREBASE_APP_ID
ARG REACT_APP_MEASUREMENT_ID

# 受け取ったARGをENVに設定してビルドプロセスで使えるようにする
ENV REACT_APP_FIREBASE_API_KEY=${REACT_APP_FIREBASE_API_KEY}
ENV REACT_APP_FIREBASE_AUTH_DOMAIN=${REACT_APP_FIREBASE_AUTH_DOMAIN}
ENV REACT_APP_FIREBASE_PROJECT_ID=${REACT_APP_FIREBASE_PROJECT_ID}
ENV REACT_APP_FIREBASE_STORAGE_BUCKET=${REACT_APP_FIREBASE_STORAGE_BUCKET}
ENV REACT_APP_FIREBASE_MESSAGING_SENDER_ID=${REACT_APP_FIREBASE_MESSAGING_SENDER_ID}
ENV REACT_APP_FIREBASE_APP_ID=${REACT_APP_FIREBASE_APP_ID}
ENV REACT_APP_MEASUREMENT_ID=${REACT_APP_MEASUREMENT_ID}

# clientのpackage.jsonをコピーしてnpm install
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm install

# clientのソースコードをコピー
COPY client ./client

# clientをビルド
RUN cd client && npm run build

# ---

# ステージ2: サーバーの実行環境 (runner)
FROM node:20-alpine

WORKDIR /app

# Install Chromium and dependencies for Puppeteer
# また、sqlite3 などのネイティブモジュールのビルドに必要なツール (python3, make, g++) を追加
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      freetype-dev \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      nodejs \
      yarn \
      font-noto-cjk \
      python3 \
      make \
      g++

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# serverのpackage.jsonをコピーしてnpm install
COPY server/package.json server/package-lock.json ./server/
# --omit=dev は本番環境で不要な開発用パッケージをインストールしないためのオプション
RUN cd server && npm install --omit=dev

# serverのソースコードと関連ファイルをコピー
COPY server ./server
COPY SC_Security.csv ./

# builderステージからビルド済みのclient静的ファイルをコピー
COPY --from=builder /app/client/build ./client/build

# サーバーがリッスンするポートを公開
EXPOSE 3001

# アプリケーションの起動コマンド
CMD [ "node", "server/index.js" ]
