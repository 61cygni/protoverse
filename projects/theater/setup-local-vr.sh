#!/bin/bash
#
# Setup ADB port forwarding for local VR debugging
#
# This allows a Quest headset connected via USB to access local services
# running on your development machine. Use this for localhost debugging only.
#
# For production/remote testing, deploy to Fly.io with ./deploy.sh
#
# Usage:
#   ./setup-local-vr.sh          # Setup port forwarding
#   ./setup-local-vr.sh --check  # Check current forwarding status
#   ./setup-local-vr.sh --clear  # Remove all port forwarding
#

# Ports to forward (must match your local services)
VITE_PORT=3000          # Vite dev server
WS_PORT=8765            # Multiplayer WS server (matches config.js)
FOUNDRY_PORT=23646      # Foundry player (matches world.json wsUrl)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if ADB is available
check_adb() {
    if ! command -v adb &> /dev/null; then
        echo -e "${RED}Error: adb not found${NC}"
        echo "Install Android SDK Platform Tools or add adb to your PATH"
        exit 1
    fi
}

# Check if device is connected
check_device() {
    local devices=$(adb devices | grep -v "List" | grep -v "^$" | wc -l)
    if [ "$devices" -eq 0 ]; then
        echo -e "${RED}Error: No device connected${NC}"
        echo "Connect your Quest via USB and enable USB debugging"
        exit 1
    fi
    echo -e "${GREEN}✓ Device connected${NC}"
}

# Setup port forwarding
setup_forwarding() {
    echo -e "${CYAN}Setting up ADB port forwarding for VR development...${NC}"
    echo ""
    
    check_adb
    check_device
    echo ""
    
    # Forward each port
    for port in $VITE_PORT $WS_PORT $FOUNDRY_PORT; do
        echo -n "Forwarding port $port... "
        if adb reverse tcp:$port tcp:$port 2>/dev/null; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}✗${NC}"
        fi
    done
    
    echo ""
    echo -e "${GREEN}Port forwarding configured!${NC}"
    echo ""
    echo "Your Quest can now access:"
    echo "  Vite:       http://localhost:$VITE_PORT"
    echo "  WS Server:  ws://localhost:$WS_PORT"
    echo "  Foundry:    ws://localhost:$FOUNDRY_PORT/ws"
    echo ""
    echo -e "${YELLOW}Note: Run this again if you reconnect your Quest${NC}"
}

# Check current forwarding status
check_status() {
    echo -e "${CYAN}Current ADB reverse port forwarding:${NC}"
    echo ""
    
    check_adb
    
    local forwards=$(adb reverse --list 2>/dev/null)
    if [ -z "$forwards" ]; then
        echo "No port forwarding configured"
    else
        echo "$forwards"
    fi
}

# Clear all forwarding
clear_forwarding() {
    echo -e "${YELLOW}Clearing all ADB port forwarding...${NC}"
    
    check_adb
    
    if adb reverse --remove-all 2>/dev/null; then
        echo -e "${GREEN}✓ All port forwarding removed${NC}"
    else
        echo -e "${RED}Failed to clear port forwarding${NC}"
    fi
}

# Main
case "${1:-}" in
    --check|-c)
        check_status
        ;;
    --clear|-x)
        clear_forwarding
        ;;
    --help|-h)
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  (none)       Setup port forwarding"
        echo "  --check, -c  Check current forwarding status"
        echo "  --clear, -x  Remove all port forwarding"
        echo "  --help, -h   Show this help"
        echo ""
        echo "Ports forwarded:"
        echo "  $VITE_PORT      Vite dev server"
        echo "  $WS_PORT      Multiplayer WS server"
        echo "  $FOUNDRY_PORT     Foundry player"
        ;;
    *)
        setup_forwarding
        ;;
esac
