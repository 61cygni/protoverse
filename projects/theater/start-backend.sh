#!/bin/bash
#
# Protoverse Theater - Start Backend Services
#
# Starts backend services for local development:
#   - WS server (multiplayer)
#   - Foundry player (video streaming)
#
# NOTE: Run 'npm run dev' separately for the frontend (Vite).
#       For production, use ./deploy.sh to deploy to Fly.io.
#
# Usage:
#   ./start-backend.sh                        # Uses default movie
#   ./start-backend.sh /path/to/movie.mp4     # Custom movie
#   ./start-backend.sh --start 300 movie.mp4  # Start at 5 minutes
#   ./start-backend.sh --stop                 # Stop all services
#

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTOVERSE_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Ports (must match config.js and world.json)
VITE_PORT=3000      # Vite dev server (frontend)
WS_PORT=8765        # Multiplayer WS server (matches config.js)
FOUNDRY_PORT=23646  # Foundry player (matches world.json wsUrl)

# Default movie path (change this or pass as argument)
DEFAULT_MOVIE="$HOME/Movies/movie.mp4"

# Foundry player path
FOUNDRY_BIN="$HOME/projects/foundry/target/release/foundry-player"

# Foundry start time (seconds to skip into movie, override with --start)
FOUNDRY_START="${FOUNDRY_START:-0}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get local network IP address
get_lan_ip() {
    local ip=""
    
    # Method 1: macOS ipconfig (most common interfaces)
    if command -v ipconfig &> /dev/null; then
        ip=$(ipconfig getifaddr en0 2>/dev/null)
        [[ -z "$ip" ]] && ip=$(ipconfig getifaddr en1 2>/dev/null)
    fi
    
    # Method 2: Linux ip command
    if [[ -z "$ip" ]] && command -v ip &> /dev/null; then
        ip=$(ip route get 1 2>/dev/null | awk '{print $7; exit}')
    fi
    
    # Method 3: Parse ifconfig (fallback)
    if [[ -z "$ip" ]] && command -v ifconfig &> /dev/null; then
        ip=$(ifconfig 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
    fi
    
    # Method 4: hostname -I (some Linux)
    if [[ -z "$ip" ]] && command -v hostname &> /dev/null; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    
    echo "${ip:-unknown}"
}

stop_services() {
    echo -e "${YELLOW}Stopping services...${NC}"
    
    # Stop WS server
    if pkill -f "node.*ws-server.js"; then
        echo -e "${GREEN}✓ WS server stopped${NC}"
    else
        echo -e "${YELLOW}  WS server was not running${NC}"
    fi
    
    # Stop Foundry player
    if pkill -f "foundry-player"; then
        echo -e "${GREEN}✓ Foundry player stopped${NC}"
    else
        echo -e "${YELLOW}  Foundry player was not running${NC}"
    fi
}

start_services() {
    local MOVIE="$1"
    
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║        Protoverse Theater - Local Development                ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}NOTE: This is for local development only.${NC}"
    echo -e "${YELLOW}      For production, use: ./deploy.sh <movie>${NC}"
    echo ""
    
    # Check if movie file exists
    if [[ ! -f "$MOVIE" ]]; then
        echo -e "${RED}Error: Movie file not found: $MOVIE${NC}"
        echo ""
        echo "Usage: $0 [--start SECONDS] <movie_path>"
        echo ""
        echo "Example:"
        echo "  $0 ~/Movies/mymovie.mp4"
        echo "  $0 --start 300 ~/Movies/mymovie.mp4"
        exit 1
    fi
    
    # Check if Foundry binary exists
    if [[ ! -f "$FOUNDRY_BIN" ]]; then
        echo -e "${RED}Error: Foundry binary not found: $FOUNDRY_BIN${NC}"
        echo -e "${YELLOW}Build it with: cd ~/projects/foundry && cargo build --release${NC}"
        exit 1
    fi
    
    # Stop any existing services first
    stop_services
    echo ""
    
    # Start WS server
    echo -e "${YELLOW}Starting WS server on port $WS_PORT...${NC}"
    PORT=$WS_PORT node "$PROTOVERSE_ROOT/multiplayer/ws-server.js" &
    WS_PID=$!
    sleep 0.5
    
    if kill -0 $WS_PID 2>/dev/null; then
        echo -e "${GREEN}✓ WS server started (PID: $WS_PID)${NC}"
    else
        echo -e "${RED}✗ WS server failed to start${NC}"
        exit 1
    fi
    
    # Start Foundry player
    echo -e "${YELLOW}Starting Foundry player on port $FOUNDRY_PORT...${NC}"
    echo -e "  Movie: $MOVIE"
    echo -e "  Start: ${FOUNDRY_START}s"
    
    # Create temp log file for Foundry output
    FOUNDRY_LOG=$(mktemp)
    
    # Set up early trap for cleanup during startup
    cleanup_startup() {
        echo -e "\n${YELLOW}Interrupted during startup, cleaning up...${NC}"
        rm -f "$FOUNDRY_LOG" 2>/dev/null
        kill $FOUNDRY_PID 2>/dev/null
        kill $WS_PID 2>/dev/null
        exit 1
    }
    trap cleanup_startup SIGINT SIGTERM
    
    # Build Foundry command
    FOUNDRY_CMD="$FOUNDRY_BIN --port $FOUNDRY_PORT --shared --loop-playback"
    if [[ "$FOUNDRY_START" -gt 0 ]]; then
        FOUNDRY_CMD="$FOUNDRY_CMD --start $FOUNDRY_START"
    fi
    FOUNDRY_CMD="$FOUNDRY_CMD \"$MOVIE\""
    
    # Start Foundry with output redirected to log file
    eval "$FOUNDRY_CMD" > "$FOUNDRY_LOG" 2>&1 &
    FOUNDRY_PID=$!
    
    # Wait for Foundry to be ready (look for "Shared playback ready")
    echo -e "  ${YELLOW}Waiting for audio decode...${NC}"
    TIMEOUT=180  # Max wait time in seconds (large movies take longer)
    ELAPSED=0
    SPINNER='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    
    while ! grep -q "Shared playback ready" "$FOUNDRY_LOG" 2>/dev/null; do
        # Check if process died
        if ! kill -0 $FOUNDRY_PID 2>/dev/null; then
            echo -e "\n${RED}✗ Foundry player failed to start${NC}"
            echo -e "${RED}Log output:${NC}"
            cat "$FOUNDRY_LOG"
            rm -f "$FOUNDRY_LOG"
            kill $WS_PID 2>/dev/null
            exit 1
        fi
        
        # Check timeout
        if [[ $ELAPSED -ge $TIMEOUT ]]; then
            echo -e "\n${RED}✗ Timeout waiting for Foundry (${TIMEOUT}s)${NC}"
            echo -e "${RED}Log output:${NC}"
            cat "$FOUNDRY_LOG"
            rm -f "$FOUNDRY_LOG"
            kill $FOUNDRY_PID 2>/dev/null
            kill $WS_PID 2>/dev/null
            exit 1
        fi
        
        # Show spinner with audio decode progress if available
        SPIN_CHAR=${SPINNER:$((ELAPSED % 10)):1}
        AUDIO_LINE=$(grep -o "Audio:.*decoded" "$FOUNDRY_LOG" 2>/dev/null | tail -1)
        if [[ -n "$AUDIO_LINE" ]]; then
            printf "\r  ${SPIN_CHAR} ${AUDIO_LINE}          "
        else
            printf "\r  ${SPIN_CHAR} Decoding audio... (${ELAPSED}s)          "
        fi
        
        sleep 1
        ((ELAPSED++))
    done
    
    printf "\r                                                              \r"  # Clear spinner line
    
    # Show the ready message from Foundry
    grep "Audio:" "$FOUNDRY_LOG" | tail -1
    grep "Shared mode" "$FOUNDRY_LOG"
    grep "Shared playback ready" "$FOUNDRY_LOG"
    grep "Open http" "$FOUNDRY_LOG"
    
    echo -e "${GREEN}✓ Foundry player ready (PID: $FOUNDRY_PID) - took ${ELAPSED}s${NC}"
    
    # Clean up log file (Foundry continues to run)
    rm -f "$FOUNDRY_LOG"
    
    echo ""
    echo -e "${GREEN}All services started!${NC}"
    echo ""
    
    # Get LAN IP
    LAN_IP=$(get_lan_ip)
    
    echo "  ┌─────────────────────────────────────────────────────────┐"
    echo "  │  LOCALHOST (this machine)                               │"
    echo "  ├─────────────────────────────────────────────────────────┤"
    echo "  │  Frontend:  http://localhost:$VITE_PORT                      │"
    echo "  │  WS Server: ws://localhost:$WS_PORT                         │"
    echo "  │  Foundry:   ws://localhost:$FOUNDRY_PORT/ws                   │"
    echo "  └─────────────────────────────────────────────────────────┘"
    
    if [[ "$LAN_IP" != "unknown" && -n "$LAN_IP" ]]; then
        echo ""
        echo "  ┌─────────────────────────────────────────────────────────┐"
        echo "  │  LAN (other devices on your network)                    │"
        echo "  ├─────────────────────────────────────────────────────────┤"
        printf "  │  Frontend:  http://%-38s│\n" "$LAN_IP:$VITE_PORT"
        printf "  │  WS Server: ws://%-40s│\n" "$LAN_IP:$WS_PORT"
        printf "  │  Foundry:   ws://%-40s│\n" "$LAN_IP:$FOUNDRY_PORT/ws"
        echo "  └─────────────────────────────────────────────────────────┘"
        echo ""
        echo -e "  ${YELLOW}LAN URL for other devices:${NC}"
        echo -e "  ${GREEN}http://$LAN_IP:$VITE_PORT?ws=ws://$LAN_IP:$WS_PORT&foundry=ws://$LAN_IP:$FOUNDRY_PORT/ws${NC}"
    fi
    
    echo ""
    echo -e "${YELLOW}Run 'npm run dev' in another terminal to start the frontend.${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
    
    # Wait for Ctrl+C
    trap "stop_services; exit 0" SIGINT SIGTERM
    wait
}

# Parse arguments
MOVIE=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --start|-s)
            FOUNDRY_START="$2"
            shift 2
            ;;
        --stop)
            stop_services
            exit 0
            ;;
        --help|-h)
            echo "Protoverse Theater - Local Development"
            echo ""
            echo "Usage: $0 [options] [movie_path]"
            echo ""
            echo "Options:"
            echo "  --start, -s SECONDS   Start movie at this time"
            echo "  --stop                Stop all services"
            echo "  --help, -h            Show this help"
            echo ""
            echo "Environment Variables:"
            echo "  FOUNDRY_START         Start time in seconds (default: 0)"
            echo ""
            echo "Ports:"
            echo "  Frontend (Vite):  $VITE_PORT"
            echo "  WS Server:        $WS_PORT"
            echo "  Foundry Player:   $FOUNDRY_PORT"
            echo ""
            echo "Examples:"
            echo "  $0 ~/Movies/movie.mp4              # Start from beginning"
            echo "  $0 --start 300 ~/Movies/movie.mp4  # Start at 5 minutes"
            echo "  FOUNDRY_START=600 $0 movie.mp4     # Start at 10 minutes"
            echo "  $0 --stop                          # Stop all services"
            echo ""
            echo "Note: Run 'npm run dev' separately to start the Vite frontend."
            echo ""
            echo "For PRODUCTION deployment, use:"
            echo "  ./deploy.sh <movie>         # Deploy to Fly.io"
            echo "  ./theater-deploy.sh <movie> # Full deployment"
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            echo "Run '$0 --help' for usage"
            exit 1
            ;;
        *)
            MOVIE="$1"
            shift
            ;;
    esac
done

# Use default movie if none specified
MOVIE="${MOVIE:-$DEFAULT_MOVIE}"

start_services "$MOVIE"
