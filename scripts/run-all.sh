#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

# Função para encontrar porta livre
find_free_port() {
  local port=$1
  while :; do
    (echo >/dev/tcp/127.0.0.1/$port) >/dev/null 2>&1
    if [ $? -ne 0 ]; then
      echo "$port"
      return 0
    fi
    port=$((port+1))
  done
}

BACKEND_PORT=$(find_free_port 3000)
echo ">>> Porta do Backend definida para: $BACKEND_PORT"

FRONTEND_PORT="${VITE_PORT:-5174}"
API_URL="${VITE_API_URL:-http://localhost:$BACKEND_PORT}"
USE_HTTPS_LOCAL="${USE_HTTPS_LOCAL:-false}"
USE_TUNNEL="${USE_TUNNEL:-cloudflare}"

echo ">>> Iniciando tudo com um único script..."

wait_for_tunnel_url() {
  local log_file="$1"
  local timeout="${2:-15}"
  local url=""
  local i=""

  for i in $(seq 1 "$timeout"); do
    url=$(grep -oE 'https://[^ ]*trycloudflare\.com' "$log_file" | tail -1 || true)
    if [ -n "$url" ]; then
      echo "$url" | sed 's/^[[:space:]]*//'
      return 0
    fi

    url=$(grep -oE 'https://[^ ]*loca\.lt' "$log_file" | tail -1 || true)
    if [ -n "$url" ]; then
      echo "$url" | sed 's/^[[:space:]]*//'
      return 0
    fi

    sleep 1
  done

  url=$(grep -oE 'https?://[^ ]+' "$log_file" | grep -vE 'developers\.cloudflare\.com|cloudflare\.com/website-terms' | tail -1 || true)
  echo "$url" | sed 's/^[[:space:]]*//'
}

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
API_URL="${VITE_API_URL:-http://$IP_ADDR:$BACKEND_PORT}"
BACKEND_PROTOCOL="http"
FRONTEND_PROTOCOL="http"

echo ">>> IP local detectado: $IP_ADDR"

kill_old_tunnels() {
  if command -v pkill >/dev/null 2>&1; then
    pkill -f "cloudflared tunnel --no-autoupdate --url http://localhost:3000" || true
    pkill -f "cloudflared tunnel --no-autoupdate --url http://localhost:$BACKEND_PORT" || true
    pkill -f "cloudflared tunnel --no-autoupdate --url http://localhost:$FRONTEND_PORT" || true
    pkill -f "localtunnel --port 3000" || true
    pkill -f "localtunnel --port $BACKEND_PORT" || true
    pkill -f "localtunnel --port $FRONTEND_PORT" || true
  fi
}

kill_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local pid
    pid=$(lsof -ti tcp:"$port" || true)
    if [ -n "$pid" ]; then
      echo ">>> Encerrando processo antigo na porta $port (PID $pid)..."
      kill "$pid" || true
      sleep 1
      if lsof -ti tcp:"$port" >/dev/null 2>&1; then
        echo ">>> Porta $port ainda ocupada, forçando encerramento..."
        kill -9 "$(lsof -ti tcp:"$port")" || true
        sleep 1
      fi
    fi
    return 0
  fi

  if command -v fuser >/dev/null 2>&1; then
    local fpid
    fpid=$(fuser -n tcp "$port" 2>/dev/null || true)
    if [ -n "$fpid" ]; then
      echo ">>> Encerrando processo antigo na porta $port (PID $fpid)..."
      fuser -k -n tcp "$port" || true
      sleep 1
    fi
  fi
}

if [ ! -d "$BACKEND_DIR/node_modules" ]; then
  echo ">>> Instalando dependências do backend..."
  (cd "$BACKEND_DIR" && npm install)
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo ">>> Instalando dependências do frontend..."
  (cd "$ROOT_DIR" && npm install)
fi

echo ">>> Subindo backend..."
if [ "$USE_TUNNEL" = "cloudflare" ] || [ "$USE_TUNNEL" = "localtunnel" ]; then
  echo ">>> Encerrando túneis antigos..."
  kill_old_tunnels
fi
# kill_port $BACKEND_PORT # Não precisamos matar pois encontramos uma livre

if [ "$USE_HTTPS_LOCAL" = "true" ]; then
  BACKEND_PROTOCOL="https"
  FRONTEND_PROTOCOL="https"
  FRONTEND_ORIGIN="https://$IP_ADDR:$FRONTEND_PORT"
  API_URL="${VITE_API_URL:-https://$IP_ADDR:$BACKEND_PORT}"
  if [ ! -f "$BACKEND_DIR/certs/key.pem" ] || [ ! -f "$BACKEND_DIR/certs/cert.pem" ]; then
    echo ">>> Certificados não encontrados em backend/certs. Rode mkcert e tente novamente."
    exit 1
  fi
  (cd "$BACKEND_DIR" && FRONTEND_ORIGIN="$FRONTEND_ORIGIN" PORT="$BACKEND_PORT" HTTPS=true HTTPS_KEY=./certs/key.pem HTTPS_CERT=./certs/cert.pem npm run dev) &
else
  (cd "$BACKEND_DIR" && FRONTEND_ORIGIN="$FRONTEND_ORIGIN" PORT="$BACKEND_PORT" npm run dev) &
fi
BACKEND_PID=$!

sleep 1

if [ -z "${BACKEND_URL:-}" ] && [ "$USE_TUNNEL" = "localtunnel" ]; then
  if ! command -v npx >/dev/null 2>&1; then
    echo "npx não encontrado. Instale o Node.js."
  else
    echo ">>> Abrindo túnel localtunnel para backend..."
    BACKEND_LOG="/tmp/konekt-backend-localtunnel.log"
    rm -f "$BACKEND_LOG"
    npx localtunnel --port "$BACKEND_PORT" > "$BACKEND_LOG" &
    BACKEND_TUNNEL_PID=$!

    sleep 3
    BACKEND_URL=$(wait_for_tunnel_url "$BACKEND_LOG" 20 || true)
    if [ -n "$BACKEND_URL" ]; then
      API_URL="$BACKEND_URL"
      echo ">>> Backend tunnel (localtunnel): $BACKEND_URL"
    fi
  fi
fi

if [ -z "${BACKEND_URL:-}" ] && [ "$USE_TUNNEL" = "cloudflare" ]; then
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "cloudflared não encontrado. Instale para usar USE_TUNNEL=cloudflare."
  else
    echo ">>> Abrindo túnel Cloudflare para backend..."
    BACKEND_LOG="/tmp/konekt-backend-cloudflare.log"
    rm -f "$BACKEND_LOG"
    cloudflared tunnel --no-autoupdate --url "http://localhost:$BACKEND_PORT" > "$BACKEND_LOG" 2>&1 &
    BACKEND_TUNNEL_PID=$!

    sleep 3
    BACKEND_URL=$(wait_for_tunnel_url "$BACKEND_LOG" 20 || true)
    if [ -n "$BACKEND_URL" ]; then
      API_URL="$BACKEND_URL"
      echo ">>> Backend tunnel (cloudflare): $BACKEND_URL"
    fi
  fi
fi

FRONTEND_URL=""
echo ">>> Subindo frontend..."
kill_port "$FRONTEND_PORT"
if [ "$USE_HTTPS_LOCAL" = "true" ]; then
  (cd "$ROOT_DIR" && VITE_API_URL="$API_URL" npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" --strictPort --https --cert "$BACKEND_DIR/certs/cert.pem" --key "$BACKEND_DIR/certs/key.pem") &
else
  (cd "$ROOT_DIR" && VITE_API_URL="$API_URL" npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" --strictPort) &
fi
FRONTEND_PID=$!

sleep 1

if [ -z "${FRONTEND_URL:-}" ] && [ "$USE_TUNNEL" = "localtunnel" ]; then
  if ! command -v npx >/dev/null 2>&1; then
    echo "npx não encontrado. Instale o Node.js."
  else
    echo ">>> Abrindo túnel localtunnel para frontend..."
    FRONTEND_LOG="/tmp/konekt-frontend-localtunnel.log"
    rm -f "$FRONTEND_LOG"
    npx localtunnel --port "$FRONTEND_PORT" > "$FRONTEND_LOG" &
    FRONTEND_TUNNEL_PID=$!

    sleep 3
    FRONTEND_URL=$(wait_for_tunnel_url "$FRONTEND_LOG" 20 || true)
  fi
fi

if [ -z "${FRONTEND_URL:-}" ] && [ "$USE_TUNNEL" = "cloudflare" ]; then
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "cloudflared não encontrado. Instale para usar USE_TUNNEL=cloudflare."
  else
    echo ">>> Abrindo túnel Cloudflare para frontend..."
    FRONTEND_LOG="/tmp/konekt-frontend-cloudflare.log"
    rm -f "$FRONTEND_LOG"
    cloudflared tunnel --no-autoupdate --url "http://localhost:$FRONTEND_PORT" > "$FRONTEND_LOG" 2>&1 &
    FRONTEND_TUNNEL_PID=$!

    sleep 3
    FRONTEND_URL=$(wait_for_tunnel_url "$FRONTEND_LOG" 20 || true)
  fi
fi

if [ -n "${FRONTEND_URL:-}" ]; then
  echo ">>> Acesso no celular (fora do Wi-Fi): $FRONTEND_URL"
elif [ "$USE_TUNNEL" = "localtunnel" ] || [ "$USE_TUNNEL" = "cloudflare" ]; then
  echo ">>> Não foi possível obter o link externo (túnel)."
fi

echo ">>> Acesso no celular (rede local): ${FRONTEND_PROTOCOL}://$IP_ADDR:$FRONTEND_PORT"

trap 'echo ">>> Encerrando..."; kill $BACKEND_PID $FRONTEND_PID ${BACKEND_TUNNEL_PID:-} ${FRONTEND_TUNNEL_PID:-}' EXIT
wait

