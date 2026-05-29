# d4sign-api

Backend HTTP (Hono + Prisma) para Bitrix24 + D4Sign.

## Dev

1. `docker compose up -d` na raiz do repositório
2. `npm install` → `npx prisma migrate deploy`
3. `npm run dev` (porta **3001**)
4. `ngrok http 3001` → copiar URL para `PUBLIC_APP_URL` no `.env`

## URLs Bitrix (usar host do ngrok)

- Instalação: `/api/bitrix/install`
- Robô: `/bitrix/enviar-documento`
- Timeline: `/bitrix/cancelar-documento`
- Webhook: `/api/webhooks/d4sign`

## CORS

Permite `http://127.0.0.1:3000` e `http://localhost:3000` (frontend local).
