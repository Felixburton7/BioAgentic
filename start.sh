#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# start.sh — Launch the BioAgentic backend + frontend together
# Usage:  ./start.sh
# Stop:   Ctrl+C  (kills both processes)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Colour

# ── Cleanup on exit ─────────────────────────────────────────
cleanup() {
    echo ""
    echo -e "${YELLOW}⏹  Shutting down…${NC}"
    # Kill the whole process group so child processes also stop
    kill 0 2>/dev/null
    wait 2>/dev/null
    echo -e "${GREEN}✓  All processes stopped.${NC}"
}
trap cleanup EXIT INT TERM

# ── Preflight checks ────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}✗  python3 not found. Install Python ≥ 3.11.${NC}" >&2
    exit 1
fi

if ! command -v node &>/dev/null; then
    echo -e "${RED}✗  node not found. Install Node.js ≥ 18.${NC}" >&2
    exit 1
fi

if [ ! -f "$ROOT_DIR/.env" ]; then
    echo -e "${YELLOW}⚠  No .env file found. Copying .env.example → .env${NC}"
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    echo -e "${YELLOW}   → Edit .env and add your XAI_API_KEY before using the app.${NC}"
fi

# ── Install backend dependencies (if needed) ────────────────
echo -e "${CYAN}📦 Checking backend dependencies…${NC}"
if ! python3 -c "import litellm, fastapi, langgraph" 2>/dev/null; then
    echo -e "${CYAN}   Installing Python dependencies…${NC}"
    pip install -e "$ROOT_DIR" --quiet
fi

# ── Install frontend dependencies (if needed) ───────────────
echo -e "${CYAN}📦 Checking frontend dependencies…${NC}"
if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
    echo -e "${CYAN}   Running npm install…${NC}"
    npm install --prefix "$ROOT_DIR/frontend" --silent
fi

# ── Launch backend ───────────────────────────────────────────
echo -e "${GREEN}🚀 Starting backend on http://localhost:${BACKEND_PORT}${NC}"
uvicorn backend.server:app \
    --reload \
    --port "$BACKEND_PORT" \
    --app-dir "$ROOT_DIR" \
    2>&1 | sed "s/^/  [backend] /" &

BACKEND_PID=$!

# ── Launch frontend ──────────────────────────────────────────
echo -e "${GREEN}🚀 Starting frontend on http://localhost:${FRONTEND_PORT}${NC}"
npm run dev --prefix "$ROOT_DIR/frontend" -- --port "$FRONTEND_PORT" \
    2>&1 | sed "s/^/  [frontend] /" &

FRONTEND_PID=$!

# ── Wait ─────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓  Both services running. Press Ctrl+C to stop.${NC}"
echo -e "   Backend:  http://localhost:${BACKEND_PORT}"
echo -e "   Frontend: http://localhost:${FRONTEND_PORT}"
echo ""

wait
