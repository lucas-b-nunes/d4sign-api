#!/bin/bash
# =============================================================================
# setup-ssl.sh — Gera certificado Let's Encrypt para api.SEU_DOMINIO.com
# Uso: bash scripts/setup-ssl.sh
# =============================================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[ssl]${NC} $1"; }
warn() { echo -e "${YELLOW}[aviso]${NC} $1"; }
err()  { echo -e "${RED}[erro]${NC} $1"; exit 1; }

cd "$(dirname "$0")/.."

read -rp "Domínio da API (ex: api.connectthink.com.br): " API_DOMAIN
read -rp "E-mail para Let's Encrypt: " EMAIL

[ -z "$API_DOMAIN" ] && err "Domínio não informado."
[ -z "$EMAIL"      ] && err "E-mail não informado."

# Substituir SEU_DOMINIO.com no arquivo nginx do projeto
log "Configurando arquivo nginx..."
sed -i "s/SEU_DOMINIO\.com/$(echo "$API_DOMAIN" | sed 's/api\.//')/g" nginx/d4sign-api.conf

# Instalar config HTTP temporária para validação ACME
log "Instalando config nginx (HTTP only para validação ACME)..."
TEMP_API=$(mktemp)
cat > "$TEMP_API" <<EOF
server {
    listen 80;
    server_name $API_DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
EOF

cp "$TEMP_API" /etc/nginx/sites-available/d4sign-api.conf
ln -sf /etc/nginx/sites-available/d4sign-api.conf /etc/nginx/sites-enabled/d4sign-api.conf
nginx -t && systemctl reload nginx

# Gerar certificado
log "Gerando certificado SSL para $API_DOMAIN..."
if ! command -v certbot &>/dev/null; then
  apt-get install -y certbot python3-certbot-nginx
fi

certbot certonly --webroot -w /var/www/html \
  -d "$API_DOMAIN" \
  --email "$EMAIL" --agree-tos --no-eff-email \
  || err "Falha no certbot. Verifique se o domínio aponta para este servidor."

# Instalar config completa com SSL
log "Instalando config nginx com SSL..."
cp nginx/d4sign-api.conf /etc/nginx/sites-available/d4sign-api.conf
nginx -t && systemctl reload nginx

# Cron de renovação automática
CRON_JOB="0 3 * * * certbot renew --quiet && systemctl reload nginx"
( crontab -l 2>/dev/null | grep -qF "certbot renew" ) || \
  ( crontab -l 2>/dev/null; echo "$CRON_JOB" ) | crontab -

log "SSL configurado com sucesso!"
echo ""
echo " Agora execute: bash scripts/deploy.sh"
echo ""
