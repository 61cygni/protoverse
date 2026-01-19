#!/bin/bash
set -e

echo "=== Protoverse Cinema ==="

# ============================================================================
# WS Server (multiplayer)
# ============================================================================
WS_PORT="${WS_PORT:-8765}"

echo "[1/2] Starting WS server on port $WS_PORT..."
cd /app
PORT=$WS_PORT node ws-server.js &
WS_PID=$!

sleep 2
if ! kill -0 $WS_PID 2>/dev/null; then
    echo "ERROR: WS server failed to start"
    exit 1
fi
echo "[1/2] WS server running (PID $WS_PID)"

# ============================================================================
# Foundry Player (embedded movie)
# ============================================================================
MOVIE_NAME="${MOVIE_NAME:-movie}"
MOVIE_PATH="/app/movies/${MOVIE_NAME}.mp4"

if [ ! -f "$MOVIE_PATH" ]; then
    echo "ERROR: Movie not found: $MOVIE_PATH"
    echo "Available movies:"
    ls -la /app/movies/
    exit 1
fi

echo "[2/2] Starting Foundry with movie: $MOVIE_PATH"

CMD="/app/foundry-player \"$MOVIE_PATH\" --port 8080 --shared"

if [ "$LOOP" = "true" ]; then
    CMD="$CMD --loop-playback"
fi

# Optional: start at a specific time (in seconds)
# Set via: fly secrets set START_TIME=300 -a <app-name>
if [ -n "$START_TIME" ]; then
    CMD="$CMD --start $START_TIME"
    echo "Starting at time: ${START_TIME}s"
fi

echo "Running: $CMD"
eval $CMD &
FOUNDRY_PID=$!

echo "=== All services started ==="
echo "  WS server:  wss://\${FLY_APP_NAME}.fly.dev:8765"
echo "  Foundry:    wss://\${FLY_APP_NAME}.fly.dev/ws"
echo ""

# Wait for either process to exit
wait -n $WS_PID $FOUNDRY_PID
EXIT_CODE=$?

echo "A service exited with code $EXIT_CODE, shutting down..."
kill $WS_PID $FOUNDRY_PID 2>/dev/null || true
exit $EXIT_CODE
