#!/bin/bash
# =============================================================================
# setup-server.sh — Provisiona uma droplet Ubuntu 22.04 do zero
# Uso: bash scripts/setup-server.sh
# =============================================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[setup]${NC} $1"; }
warn() { echo -e "${YELLOW}[aviso]${NC} $1"; }

# ---------------------------------------------------------------------------
# 1. Atualizar sistema
# ---------------------------------------------------------------------------
log "Atualizando pacotes..."
apt-get update -qq
apt-get upgrade -y -qq

# ---------------------------------------------------------------------------
# 2. Instalar dependências básicas
# ---------------------------------------------------------------------------
log "Instalando dependências básicas..."
apt-get install -y -qq \
  curl wget git unzip gnupg lsb-release \
  ca-certificates apt-transport-https \
  software-properties-common ufw fail2ban nginx certbot python3-certbot-nginx

# ---------------------------------------------------------------------------
# 3. Docker
# ---------------------------------------------------------------------------
if command -v docker &>/dev/null; then
  warn "Docker já instalado: $(docker --version)"
else
  log "Instalando Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker
  log "Docker instalado: $(docker --version)"
fi

# ---------------------------------------------------------------------------
# 4. Node.js 22 LTS
# ---------------------------------------------------------------------------
if command -v node &>/dev/null; then
  warn "Node.js já instalado: $(node --version)"
else
  log "Instalando Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
  log "Node.js instalado: $(node --version)"
fi

# ---------------------------------------------------------------------------
# 5. pnpm
# ---------------------------------------------------------------------------
if command -v pnpm &>/dev/null; then
  warn "pnpm já instalado: $(pnpm --version)"
else
  log "Instalando pnpm..."
  npm install -g pnpm
fi

# ---------------------------------------------------------------------------
# 6. PM2
# ---------------------------------------------------------------------------
if command -v pm2 &>/dev/null; then
  warn "PM2 já instalado: $(pm2 --version)"
else
  log "Instalando PM2..."
  npm install -g pm2
  pm2 startup systemd -u root --hp /root | tail -1 | bash
  log "PM2 instalado: $(pm2 --version)"
fi

# ---------------------------------------------------------------------------
# 7. Firewall (UFW)
# ---------------------------------------------------------------------------
log "Configurando firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log "Firewall configurado."

# ---------------------------------------------------------------------------
# 8. Fail2ban
# ---------------------------------------------------------------------------
systemctl enable fail2ban
systemctl start fail2ban

# ---------------------------------------------------------------------------
# 9. Garantir /var/www/html para ACME challenge
# ---------------------------------------------------------------------------
mkdir -p /var/www/html

# ---------------------------------------------------------------------------
# 10. Clonar repositório
# ---------------------------------------------------------------------------
REPO_DIR="/opt/d4sign-api"

if [ -d "$REPO_DIR/.git" ]; then
  warn "Repositório já existe em $REPO_DIR. Pulando clone."
else
  read -rp "URL do repositório d4sign-api (ex: git@github.com:usuario/d4sign-api.git): " REPO_URL
  if [ -n "$REPO_URL" ]; then
    log "Clonando $REPO_URL em $REPO_DIR..."
    git clone "$REPO_URL" "$REPO_DIR"
  else
    warn "Nenhuma URL fornecida. Clone o repositório manualmente em $REPO_DIR."
  fi
fi

# ---------------------------------------------------------------------------
# 11. Configurar .env de produção
# ---------------------------------------------------------------------------
if [ -d "$REPO_DIR" ]; then
  cd "$REPO_DIR"
  if [ ! -f ".env.production" ]; then
    cp .env.production.example .env.production
    warn "Preencha $REPO_DIR/.env.production com os valores reais."
  fi
fi

# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo " Servidor provisionado com sucesso!"
echo "============================================================"
echo ""
echo " Próximos passos:"
echo "   1. Editar $REPO_DIR/.env.production"
echo "   2. Gerar SSL: bash $REPO_DIR/scripts/setup-ssl.sh"
echo "   3. Subir API: bash $REPO_DIR/scripts/deploy.sh"
echo ""
