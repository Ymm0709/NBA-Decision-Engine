#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PID_FILE=".nba-vite.pid"
LOG_FILE="nohup.out"
PORT="5888"

ensure_deps() {
  if [ ! -d "node_modules" ]; then
    echo "[nohup] Installing Node dependencies..."
    npm install
  fi
}

is_running() {
  if [ ! -f "$PID_FILE" ]; then
    return 1
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    return 1
  fi
  return 0
}

start() {
  if is_running; then
    echo "[nohup] Service already running (PID $(cat "$PID_FILE"))."
    return 0
  fi

  ensure_deps
  echo "[nohup] Starting app on 0.0.0.0:${PORT} in background..."
  nohup npm run dev -- --host 0.0.0.0 --port "${PORT}" >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  sleep 1

  if is_running; then
    echo "[nohup] Started successfully. PID: $(cat "$PID_FILE")"
    echo "[nohup] Logs: ${ROOT_DIR}/${LOG_FILE}"
  else
    echo "[nohup] Failed to start. Check logs: ${ROOT_DIR}/${LOG_FILE}"
    exit 1
  fi
}

stop() {
  if ! is_running; then
    echo "[nohup] Service is not running."
    rm -f "$PID_FILE"
    return 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  echo "[nohup] Stopping service (PID $pid)..."
  kill "$pid" 2>/dev/null || true
  sleep 1

  if kill -0 "$pid" 2>/dev/null; then
    echo "[nohup] Force stopping service (PID $pid)..."
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$PID_FILE"
  echo "[nohup] Stopped."
}

status() {
  if is_running; then
    echo "[nohup] Running (PID $(cat "$PID_FILE"))."
  else
    echo "[nohup] Not running."
  fi
}

logs() {
  if [ -f "$LOG_FILE" ]; then
    echo "[nohup] Showing logs from ${ROOT_DIR}/${LOG_FILE}"
    tail -n 100 "$LOG_FILE"
  else
    echo "[nohup] Log file not found: ${ROOT_DIR}/${LOG_FILE}"
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  logs) logs ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
