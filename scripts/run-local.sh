#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

FRONTEND_PORT="${VITE_PORT:-5174}"
API_URL="${VITE_API_URL:-http://localhost:3000}"

echo ">>> Iniciando backend e frontend..."
echo ">>> API URL: $API_URL"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm não encontrado. Instale o Node.js."
  exit 1
fi

if ! command -v hostname >/dev/null 2>&1; then
  echo "hostname não encontrado."
  exit 1
fi

IP_ADDR=$(hostname -I | awk '{print $1}')
FRONTEND_ORIGIN="http://$IP_ADDR:$FRONTEND_PORT"
API_URL="${VITE_API_URL:-http://$IP_ADDR:3000}"

echo ">>> IP local detectado: $IP_ADDR"
echo ">>> Acesso no celular: http://$IP_ADDR:$FRONTEND_PORT"

if [ ! -d "$BACKEND_DIR/node_modules" ]; then
  echo ">>> Instalando dependências do backend..."
  (cd "$BACKEND_DIR" && npm install)
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo ">>> Instalando dependências do frontend..."
  (cd "$ROOT_DIR" && npm install)
fi

echo ">>> Subindo backend..."
(if command -v lsof >/dev/null 2>&1; then
  OLD_PID=$(lsof -ti tcp:3000 || true)
  if [ -n "${OLD_PID}" ]; then
    echo ">>> Encerrando processo antigo na porta 3000 (PID $OLD_PID)..."
    kill "$OLD_PID" || true
    sleep 1
  fi
fi)
(cd "$BACKEND_DIR" && FRONTEND_ORIGIN="$FRONTEND_ORIGIN" npm run dev) &
BACKEND_PID=$!

sleep 1

echo ">>> Subindo frontend..."
(if command -v lsof >/dev/null 2>&1; then
  OLD_FRONT_PID=$(lsof -ti tcp:"$FRONTEND_PORT" || true)
  if [ -n "${OLD_FRONT_PID}" ]; then
    echo ">>> Encerrando processo antigo na porta $FRONTEND_PORT (PID $OLD_FRONT_PID)..."
    kill "$OLD_FRONT_PID" || true
    sleep 1
  fi
fi)
(cd "$ROOT_DIR" && VITE_API_URL="$API_URL" npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT") &
FRONTEND_PID=$!

trap 'echo ">>> Encerrando..."; kill $BACKEND_PID $FRONTEND_PID' EXIT

wait

