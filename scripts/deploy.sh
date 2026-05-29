#!/bin/bash
# =============================================================================
# deploy.sh — Build e sobe/atualiza d4sign-api com PM2
#             MySQL roda em Docker (docker-compose.prod.yml)
# Uso: bash scripts/deploy.sh
# =============================================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[aviso]${NC} $1"; }
err()  { echo -e "${RED}[erro]${NC} $1"; exit 1; }

cd "$(dirname "$0")/.."
ROOT_DIR=$(pwd)

# ---------------------------------------------------------------------------
# Validar .env.production
# ---------------------------------------------------------------------------
[ ! -f ".env.production" ] && {
  warn ".env.production não encontrado. Copiando exemplo..."
  cp .env.production.example .env.production
  err "Preencha .env.production e execute novamente."
}

# Carregar variáveis de ambiente
set -a; source .env.production; set +a

# ---------------------------------------------------------------------------
# Pull de código
# ---------------------------------------------------------------------------
if [ -d ".git" ]; then
  log "Atualizando código..."
  git pull
fi

# ---------------------------------------------------------------------------
# MySQL via Docker Compose
# ---------------------------------------------------------------------------
log "Iniciando MySQL (Docker)..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d mysql

log "Aguardando MySQL ficar pronto..."
until docker compose -f docker-compose.prod.yml exec -T mysql \
  mysqladmin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" --silent 2>/dev/null; do
  printf '.'
  sleep 2
done
echo ""
log "MySQL pronto."

# ---------------------------------------------------------------------------
# Instalar dependências
# ---------------------------------------------------------------------------
log "Instalando dependências..."
pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Prisma
# ---------------------------------------------------------------------------
log "Gerando Prisma Client..."
node_modules/.bin/prisma generate

log "Aplicando migrations..."
node_modules/.bin/prisma migrate deploy

# ---------------------------------------------------------------------------
# PM2 — iniciar ou recarregar
# ---------------------------------------------------------------------------
mkdir -p /var/log/pm2

if pm2 list | grep -q "d4sign-api"; then
  log "Recarregando d4sign-api no PM2..."
  pm2 reload ecosystem.config.cjs --env production
else
  log "Iniciando d4sign-api no PM2 pela primeira vez..."
  pm2 start ecosystem.config.cjs --env production
fi

pm2 save

# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo " Deploy concluído!"
echo "============================================================"
pm2 list
echo ""
log "Logs:    pm2 logs d4sign-api"
log "Monitor: pm2 monit"
echo ""
