#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ ! -d "node_modules" ]; then
  echo "[run] Installing Node dependencies..."
  npm install
fi

echo "[run] Starting app on 0.0.0.0:5173 ..."
npm run dev -- --host 0.0.0.0
