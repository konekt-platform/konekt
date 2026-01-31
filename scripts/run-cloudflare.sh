#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

FRONTEND_PORT="${VITE_PORT:-5174}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared não encontrado. Instale antes de usar."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm não encontrado. Instale o Node.js."
  exit 1
fi

IP_ADDR=$(hostname -I | awk '{print $1}')

echo ">>> Subindo backend..."
(cd "$BACKEND_DIR" && npm run dev) &
BACKEND_PID=$!

sleep 1

echo ">>> Abrindo túnel Cloudflare para backend..."
BACKEND_LOG="/tmp/konekt-backend-tunnel.log"
rm -f "$BACKEND_LOG"
cloudflared tunnel --url http://localhost:3000 --logfile "$BACKEND_LOG" --loglevel info &
BACKEND_TUNNEL_PID=$!

sleep 3
BACKEND_URL=$(grep -oE 'https://[a-z0-9.-]+\.trycloudflare.com' "$BACKEND_LOG" | tail -1 || true)

if [ -z "$BACKEND_URL" ]; then
  echo "Não foi possível obter URL do túnel do backend. Verifique o cloudflared."
  exit 1
fi

echo ">>> Backend tunnel: $BACKEND_URL"

echo ">>> Subindo frontend..."
(cd "$ROOT_DIR" && VITE_API_URL="$BACKEND_URL" npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT") &
FRONTEND_PID=$!

sleep 1

echo ">>> Abrindo túnel Cloudflare para frontend..."
FRONTEND_LOG="/tmp/konekt-frontend-tunnel.log"
rm -f "$FRONTEND_LOG"
cloudflared tunnel --url "http://localhost:$FRONTEND_PORT" --logfile "$FRONTEND_LOG" --loglevel info &
FRONTEND_TUNNEL_PID=$!

sleep 3
FRONTEND_URL=$(grep -oE 'https://[a-z0-9.-]+\.trycloudflare.com' "$FRONTEND_LOG" | tail -1 || true)

echo ">>> Acesso no celular (HTTPS): $FRONTEND_URL"
echo ">>> IP local: http://$IP_ADDR:$FRONTEND_PORT"

trap 'echo ">>> Encerrando..."; kill $BACKEND_PID $FRONTEND_PID $BACKEND_TUNNEL_PID $FRONTEND_TUNNEL_PID' EXIT
wait

