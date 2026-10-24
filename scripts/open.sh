#!/bin/sh
# Enciende el servidor de Agent Orbs (si no está ya corriendo) y abre Firefox.
set -eu

# Resuelve la carpeta real del proyecto aunque se llame desde un enlace simbólico.
ROOT="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
PORT="${PORT:-3210}"
URL="http://127.0.0.1:$PORT"
LOG_DIR="$HOME/.agent-orbs"
LOG="$LOG_DIR/server.log"

is_up() {
  curl -fsS --max-time 1 "$URL/api/health" 2>/dev/null | grep -q '"agent-orbs"'
}

if is_up; then
  echo "Agent Orbs ya está corriendo en $URL"
else
  if ss -ltn "sport = :$PORT" 2>/dev/null | grep -q LISTEN; then
    echo "El puerto $PORT está ocupado por otro programa. Usa: PORT=3211 $0" >&2
    exit 1
  fi
  cd "$ROOT"
  [ -d node_modules ] || npm ci
  [ -d dist ] || npm run build
  mkdir -p "$LOG_DIR"
  echo "Encendiendo Agent Orbs en $URL (log: $LOG)"
  PORT="$PORT" nohup node server/index.mjs >"$LOG" 2>&1 &
  i=0
  until is_up; do
    i=$((i + 1))
    if [ "$i" -ge 50 ]; then
      echo "El servidor no respondió. Revisa $LOG" >&2
      exit 1
    fi
    sleep 0.2
  done
fi

nohup firefox --new-tab "$URL" >/dev/null 2>&1 &
