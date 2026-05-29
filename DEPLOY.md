# d4sign-api — Deploy

## Arquitetura

```
Bitrix24 / d4sign-web → d4sign-api (PM2, porta 3003)
                                ↕
                           MySQL (Docker)
```

Nginx faz proxy reverso de `https://api.SEU_DOMINIO.com` → `http://127.0.0.1:3003`.

---

## 1. Provisionar servidor (primeira vez)

```bash
# Na droplet Ubuntu 22.04, como root:
bash scripts/setup-server.sh
```

Instala: Docker, Node.js 22, pnpm, PM2, Nginx, Certbot, UFW, Fail2ban.

---

## 2. Preencher variáveis de ambiente

```bash
cp .env.production.example .env.production
nano .env.production
```

Campos obrigatórios:

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | String de conexão MySQL |
| `MYSQL_ROOT_PASSWORD` | Senha root do MySQL (Docker) |
| `MYSQL_PASSWORD` | Senha do usuário `d4sign_bitrix` |
| `PUBLIC_APP_URL` | `https://api.SEU_DOMINIO.com` |
| `BITRIX_APP_ID` | ID do app no Bitrix24 |
| `BITRIX_APP_SECRET` | Secret do app no Bitrix24 |
| `CORS_ORIGINS` | URL do d4sign-web (Vercel + domínio customizado) |

---

## 3. Gerar SSL

```bash
bash scripts/setup-ssl.sh
# Informe: api.seudominio.com e seu e-mail
```

---

## 4. Deploy

```bash
bash scripts/deploy.sh
```

O script:
1. Sobe MySQL via Docker
2. Instala dependências (`pnpm install`)
3. Gera Prisma Client + aplica migrations
4. Inicia/recarrega a API com PM2

---

## Monitorar

```bash
pm2 list                                          # status
pm2 logs d4sign-api                               # logs em tempo real
pm2 monit                                         # dashboard
pm2 reload ecosystem.config.cjs --env production  # reload sem downtime
```

## Healthcheck

```bash
curl https://api.SEU_DOMINIO.com/health
# {"ok":true}
```

---

## URLs para cadastrar no Bitrix24

| Campo | URL |
|-------|-----|
| Instalação | `https://api.SEU_DOMINIO.com/api/bitrix/install` |
| Robô enviar | `https://api.SEU_DOMINIO.com/bitrix/enviar-documento` |
| Timeline cancelar | `https://api.SEU_DOMINIO.com/bitrix/cancelar-documento` |
| Webhook D4Sign | `https://api.SEU_DOMINIO.com/api/webhooks/d4sign` |

---

## Atualizar após push

```bash
bash scripts/deploy.sh
```
