#!/bin/bash
# =============================================================================
# List all deployed Protoverse theater instances
# =============================================================================
#
# Shows all Fly.io apps with movies and generates URLs to use them
#
# Usage:
#   ./list-theaters.sh
#   ./list-theaters.sh --json    # Output as JSON
#
# =============================================================================

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[0;90m'
NC='\033[0m' # No Color

# Config
PROTOVERSE_URL="${PROTOVERSE_URL:-https://cozytheatership.netlify.app}"
APP_PREFIX="protoverse-"

# Parse args
JSON_OUTPUT=""
if [[ "$1" == "--json" ]]; then
    JSON_OUTPUT="true"
fi

# Get all protoverse apps
apps=$(fly apps list 2>/dev/null | grep "^${APP_PREFIX}" | awk '{print $1}')

if [ -z "$apps" ]; then
    if [ "$JSON_OUTPUT" ]; then
        echo "[]"
    else
        echo -e "${YELLOW}No Protoverse theater apps found.${NC}"
        echo ""
        echo "Deploy a movie with:"
        echo "  cd cinema && ./deploy.sh <moviename>"
    fi
    exit 0
fi

if [ "$JSON_OUTPUT" ]; then
    # JSON output
    echo "["
    first=true
    for app in $apps; do
        movie="${app#$APP_PREFIX}"
        
        # Get app status - check for "started" state in Machines table
        if fly status -a "$app" 2>/dev/null | grep -qE "\sstarted\s"; then
            status="running"
        else
            status="stopped"
        fi
        
        ws_url="wss://${app}.fly.dev:8765"
        foundry_url="wss://${app}.fly.dev/ws"
        join_url="${PROTOVERSE_URL}?ws=${ws_url}&foundry=${foundry_url}"
        
        if [ "$first" = true ]; then
            first=false
        else
            echo ","
        fi
        
        cat <<EOF
  {
    "app": "$app",
    "movie": "$movie",
    "status": "$status",
    "wsUrl": "$ws_url",
    "foundryUrl": "$foundry_url",
    "joinUrl": "$join_url"
  }
EOF
    done
    echo ""
    echo "]"
else
    # Human-readable output
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║            🎬 Protoverse Theater Instances                   ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    count=0
    for app in $apps; do
        movie="${app#$APP_PREFIX}"
        count=$((count + 1))
        
        # Get app status - check for "started" state in Machines table
        if fly status -a "$app" 2>/dev/null | grep -qE "\sstarted\s"; then
            status="${GREEN}● running${NC}"
        else
            status="${YELLOW}○ stopped${NC}"
        fi
        
        ws_url="wss://${app}.fly.dev:8765"
        foundry_url="wss://${app}.fly.dev/ws"
        
        echo -e "${GREEN}[$count] ${movie}${NC}"
        echo -e "    Status:  $status"
        echo -e "    App:     ${DIM}${app}${NC}"
        echo ""
        echo -e "    ${BLUE}▶ Join URL:${NC}"
        echo -e "    ${PROTOVERSE_URL}?ws=${ws_url}&foundry=${foundry_url}"
        echo ""
        echo -e "    ${DIM}WS:      ${ws_url}${NC}"
        echo -e "    ${DIM}Foundry: ${foundry_url}${NC}"
        echo ""
        echo -e "    ${DIM}Commands:${NC}"
        echo -e "    ${DIM}  fly status -a ${app}${NC}"
        echo -e "    ${DIM}  fly logs -a ${app}${NC}"
        echo ""
        echo -e "${DIM}────────────────────────────────────────────────────────────────${NC}"
        echo ""
    done
    
    echo -e "${CYAN}Total: ${count} theater(s)${NC}"
    echo ""
    echo -e "${DIM}Lobby: ${PROTOVERSE_URL}/lobby/${NC}"
    echo ""
fi
