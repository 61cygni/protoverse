#!/bin/bash
set -e

# =============================================================================
# Protoverse Cinema Deployment Script
# =============================================================================
#
# Usage:
#   ./deploy.sh <movie-directory> [options]
#
# Examples:
#   ./deploy.sh holygrail                    # Deploy holygrail with defaults
#   ./deploy.sh bigtrouble --region lax      # Deploy to LA region
#   ./deploy.sh holygrail --app-name myapp   # Custom app name
#
# Directory structure expected:
#   projects/theater/
#   ├── holygrail/
#   │   └── movie/
#   │       └── holygrail.mp4
#   ├── bigtrouble/
#   │   └── movie/
#   │       └── bigtrouble.mp4
#   └── deploy.sh (this script)
#
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTOVERSE_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    echo "Usage: $0 <movie-directory> [options]"
    echo ""
    echo "Options:"
    echo "  --app-name NAME    Fly app name (default: protoverse-<movie>)"
    echo "  --region REGION    Fly region (default: sjc)"
    echo "  --convex URL       Convex HTTP URL (default: ardent-chameleon-122.convex.site)"
    echo "  --no-cache         Force full rebuild"
    echo "  --create-only      Only create app, don't deploy"
    echo "  --help             Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 holygrail"
    echo "  $0 bigtrouble --region lax"
    echo "  $0 holygrail --app-name my-theater"
    exit 1
}

# Parse arguments
MOVIE_DIR=""
APP_NAME=""
REGION="sjc"
NO_CACHE=""
CREATE_ONLY=""
CONVEX_URL=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --app-name)
            APP_NAME="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --convex)
            CONVEX_URL="$2"
            shift 2
            ;;
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --create-only)
            CREATE_ONLY="true"
            shift
            ;;
        --help)
            usage
            ;;
        -*)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
        *)
            if [ -z "$MOVIE_DIR" ]; then
                MOVIE_DIR="$1"
            else
                echo -e "${RED}Too many arguments${NC}"
                usage
            fi
            shift
            ;;
    esac
done

if [ -z "$MOVIE_DIR" ]; then
    echo -e "${RED}Error: Movie directory required${NC}"
    usage
fi

# Validate movie directory
MOVIE_PATH="$SCRIPT_DIR/$MOVIE_DIR"
if [ ! -d "$MOVIE_PATH" ]; then
    echo -e "${RED}Error: Directory not found: $MOVIE_PATH${NC}"
    echo ""
    echo "Available movies:"
    ls -1 "$SCRIPT_DIR" | grep -v -E '\.sh$|\.toml$|\.md$|^foundry-player$' || echo "  (none)"
    exit 1
fi

# Find movie file
MOVIE_FILE=$(ls "$MOVIE_PATH/movie/"*.mp4 2>/dev/null | head -1)
if [ -z "$MOVIE_FILE" ]; then
    echo -e "${RED}Error: No .mp4 file found in $MOVIE_PATH/movie/${NC}"
    exit 1
fi

MOVIE_NAME=$(basename "$MOVIE_FILE" .mp4)
APP_NAME="${APP_NAME:-protoverse-$MOVIE_DIR}"

echo -e "${BLUE}=== Protoverse Cinema Deployment ===${NC}"
echo ""
echo -e "  Movie directory: ${GREEN}$MOVIE_DIR${NC}"
echo -e "  Movie file:      ${GREEN}$MOVIE_NAME.mp4${NC}"
echo -e "  App name:        ${GREEN}$APP_NAME${NC}"
echo -e "  Region:          ${GREEN}$REGION${NC}"
echo ""

# Always get fresh foundry-player from source
FOUNDRY_SOURCE="$HOME/projects/foundry/foundry-player"
if [ -d "$FOUNDRY_SOURCE" ]; then
    echo -e "${YELLOW}Refreshing foundry-player from source...${NC}"
    rm -rf "$SCRIPT_DIR/foundry-player"
    cp -r "$FOUNDRY_SOURCE" "$SCRIPT_DIR/foundry-player"
    echo -e "${GREEN}✓ Copied fresh foundry-player${NC}"
else
    # Fall back to cached copy if source not available
    if [ ! -d "$SCRIPT_DIR/foundry-player" ]; then
        echo -e "${RED}Error: foundry-player not found at $FOUNDRY_SOURCE${NC}"
        echo "Please copy it manually:"
        echo "  cp -r ~/projects/foundry/foundry-player $SCRIPT_DIR/foundry-player"
        exit 1
    else
        echo -e "${YELLOW}Warning: Using cached foundry-player (source not found at $FOUNDRY_SOURCE)${NC}"
    fi
fi

# Create build context directory
BUILD_DIR="$MOVIE_PATH/.build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo -e "${YELLOW}Preparing build context...${NC}"

# Copy required files to build context
cp -r "$SCRIPT_DIR/foundry-player" "$BUILD_DIR/foundry-player"
cp -r "$MOVIE_PATH/movie" "$BUILD_DIR/movie"
cp "$PROTOVERSE_ROOT/multiplayer/ws-server.js" "$BUILD_DIR/ws-server.js"
cp "$PROTOVERSE_ROOT/package.json" "$BUILD_DIR/package.json"
cp "$PROTOVERSE_ROOT/package-lock.json" "$BUILD_DIR/package-lock.json"
cp "$SCRIPT_DIR/entrypoint.sh" "$BUILD_DIR/entrypoint.sh"
cp "$SCRIPT_DIR/Dockerfile.cinema" "$BUILD_DIR/Dockerfile"

# Copy or generate metadata.json
if [ -f "$MOVIE_PATH/metadata.json" ]; then
    cp "$MOVIE_PATH/metadata.json" "$BUILD_DIR/metadata.json"
    echo -e "${GREEN}✓ Using existing metadata.json${NC}"
else
    # Generate default metadata from movie name
    # Convert movie-name to "Movie Name" format
    PRETTY_TITLE=$(echo "$MOVIE_DIR" | sed 's/-/ /g' | sed 's/\b\(.\)/\u\1/g')
    cat > "$BUILD_DIR/metadata.json" << EOF
{
    "title": "$PRETTY_TITLE",
    "description": "",
    "year": null
}
EOF
    echo -e "${YELLOW}Generated default metadata.json (create $MOVIE_PATH/metadata.json to customize)${NC}"
fi

# Generate fly.toml from template
sed -e "s/{{APP_NAME}}/$APP_NAME/g" \
    -e "s/{{REGION}}/$REGION/g" \
    -e "s/{{MOVIE_NAME}}/$MOVIE_NAME/g" \
    "$SCRIPT_DIR/fly.template.toml" > "$BUILD_DIR/fly.toml"

echo -e "${GREEN}✓ Build context ready${NC}"

# Check if app exists
if ! fly apps list 2>/dev/null | grep -q "^$APP_NAME "; then
    echo -e "${YELLOW}Creating Fly app: $APP_NAME${NC}"
    fly apps create "$APP_NAME" --machines
    
    echo -e "${YELLOW}Allocating IPs...${NC}"
    fly ips allocate-v4 --shared -a "$APP_NAME"
    fly ips allocate-v6 -a "$APP_NAME"
    
    echo -e "${GREEN}✓ App created${NC}"
fi

if [ "$CREATE_ONLY" = "true" ]; then
    echo -e "${GREEN}App created. Run without --create-only to deploy.${NC}"
    exit 0
fi

# Deploy
echo ""
echo -e "${YELLOW}Deploying to Fly.io...${NC}"
echo -e "${YELLOW}(This may take a few minutes for Rust compilation)${NC}"
echo ""

cd "$BUILD_DIR"
fly deploy --remote-only $NO_CACHE

# ============================================================================
# Post-deployment: Convex session tracking
# ============================================================================
# Priority: --convex flag > CONVEX_HTTP_URL env var > default
CONVEX_HTTP_URL="${CONVEX_URL:-${CONVEX_HTTP_URL:-https://ardent-chameleon-122.convex.site}}"

echo ""
echo -e "${YELLOW}Setting up Convex session tracking...${NC}"

# Set Convex secret (won't restart if already set to same value)
fly secrets set CONVEX_HTTP_URL="$CONVEX_HTTP_URL" -a "$APP_NAME" 2>/dev/null || true

echo -e "${GREEN}✓ Convex enabled${NC}"

# ============================================================================
# Post-deployment: Ensure single machine (for session consistency)
# ============================================================================
echo -e "${YELLOW}Ensuring single machine for session consistency...${NC}"

# Scale to 1 machine to avoid split-brain session issues
fly scale count 1 -a "$APP_NAME" --yes 2>/dev/null || true

echo -e "${GREEN}✓ Scaled to 1 machine${NC}"

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo -e "  App:      ${BLUE}https://$APP_NAME.fly.dev${NC}"
echo -e "  WS:       ${BLUE}wss://$APP_NAME.fly.dev:8765${NC}"
echo -e "  Foundry:  ${BLUE}wss://$APP_NAME.fly.dev/ws${NC}"
echo -e "  Convex:   ${BLUE}$CONVEX_HTTP_URL${NC}"
echo ""
echo -e "Frontend URL:"
echo -e "  ${BLUE}https://cozytheatership.netlify.app?ws=wss://$APP_NAME.fly.dev:8765&foundry=wss://$APP_NAME.fly.dev/ws${NC}"
echo ""
echo -e "Lobby:"
echo -e "  ${BLUE}https://cozytheatership.netlify.app/lobby/${NC}"
echo ""

# Cleanup build directory
rm -rf "$BUILD_DIR"
