#!/bin/bash
set -e

# =============================================================================
# Protoverse Theater Full Deployment Script
# =============================================================================
#
# Performs a complete deployment of a theater experience:
#   1. Enables CDN in config.js
#   2. Uploads world.json files to Tigris CDN
#   3. Deploys Fly.io backend (foundry-player + WS server)
#   4. Builds protoverse frontend
#   5. Deploys to Netlify
#
# Usage:
#   ./theater-deploy.sh <movie-name> [options]
#
# Examples:
#   ./theater-deploy.sh holygrail
#   ./theater-deploy.sh bigtrouble --netlify-site cozytheatership
#   ./theater-deploy.sh holygrail --skip-fly    # Skip Fly deployment
#   ./theater-deploy.sh holygrail --skip-cdn    # Skip CDN upload
#
# Prerequisites:
#   - fly CLI installed and authenticated
#   - netlify CLI installed and authenticated
#   - AWS CLI configured for Tigris (or TIGRIS_ACCESS_KEY_ID/TIGRIS_SECRET_ACCESS_KEY set)
#   - Movie directory exists in <movie-name>/movie/ (relative to projects/theater/)
#
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTOVERSE_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

usage() {
    echo "Usage: $0 <movie-name> [options]"
    echo ""
    echo "Options:"
    echo "  --netlify-site SITE    Netlify site name (default: cozytheatership)"
    echo "  --fly-region REGION    Fly.io region (default: sjc)"
    echo "  --no-cache             Force full rebuild of Fly.io image (no Docker cache)"
    echo "  --skip-cdn             Skip CDN upload step"
    echo "  --skip-fly             Skip Fly.io deployment"
    echo "  --skip-netlify         Skip Netlify deployment"
    echo "  --skip-build           Skip npm build"
    echo "  --dry-run              Show what would be done without executing"
    echo "  --help                 Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 holygrail"
    echo "  $0 bigtrouble --netlify-site mytheatership"
    echo "  $0 holygrail --no-cache             # Force fresh Fly.io build"
    echo "  $0 holygrail --skip-fly --skip-cdn  # Just rebuild and deploy frontend"
    exit 1
}

# Parse arguments
MOVIE_NAME=""
NETLIFY_SITE="cozytheatership"
FLY_REGION="sjc"
NO_CACHE=""
SKIP_CDN=""
SKIP_FLY=""
SKIP_NETLIFY=""
SKIP_BUILD=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --netlify-site)
            NETLIFY_SITE="$2"
            shift 2
            ;;
        --fly-region)
            FLY_REGION="$2"
            shift 2
            ;;
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --skip-cdn)
            SKIP_CDN="true"
            shift
            ;;
        --skip-fly)
            SKIP_FLY="true"
            shift
            ;;
        --skip-netlify)
            SKIP_NETLIFY="true"
            shift
            ;;
        --skip-build)
            SKIP_BUILD="true"
            shift
            ;;
        --dry-run)
            DRY_RUN="true"
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
            if [ -z "$MOVIE_NAME" ]; then
                MOVIE_NAME="$1"
            else
                echo -e "${RED}Too many arguments${NC}"
                usage
            fi
            shift
            ;;
    esac
done

if [ -z "$MOVIE_NAME" ]; then
    echo -e "${RED}Error: Movie name required${NC}"
    usage
fi

# Validate movie directory exists
MOVIE_DIR="$SCRIPT_DIR/$MOVIE_NAME"
if [ ! -d "$MOVIE_DIR" ]; then
    echo -e "${RED}Error: Movie directory not found: $MOVIE_DIR${NC}"
    echo ""
    echo "Available movies in projects/theater/:"
    ls -1 "$SCRIPT_DIR" 2>/dev/null | grep -v -E '\.sh$|\.toml$|\.md$|^foundry-player$' || echo "  (none)"
    exit 1
fi

FLY_APP_NAME="protoverse-$MOVIE_NAME"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          Protoverse Theater Full Deployment                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Movie:         ${GREEN}$MOVIE_NAME${NC}"
echo -e "  Fly App:       ${GREEN}$FLY_APP_NAME${NC}"
echo -e "  Fly Region:    ${GREEN}$FLY_REGION${NC}"
echo -e "  Netlify Site:  ${GREEN}$NETLIFY_SITE${NC}"
echo ""

if [ "$DRY_RUN" = "true" ]; then
    echo -e "${YELLOW}[DRY RUN MODE - No changes will be made]${NC}"
    echo ""
fi

# =============================================================================
# Step 1: Enable CDN in config.js
# =============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}[1/5] Enabling CDN in config.js${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

CONFIG_FILE="$PROTOVERSE_ROOT/config.js"

# Check current CDN status
if grep -q "useCdn: true" "$CONFIG_FILE"; then
    echo -e "${GREEN}✓ CDN already enabled${NC}"
else
    if [ "$DRY_RUN" = "true" ]; then
        echo -e "${YELLOW}Would enable CDN (useCdn: false -> true)${NC}"
    else
        # Enable CDN
        sed -i '' 's/useCdn: false/useCdn: true/' "$CONFIG_FILE"
        echo -e "${GREEN}✓ CDN enabled${NC}"
    fi
fi
echo ""

# =============================================================================
# Step 2: Upload world.json files to Tigris CDN
# =============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}[2/5] Uploading world.json files to Tigris CDN${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$SKIP_CDN" = "true" ]; then
    echo -e "${YELLOW}⊘ Skipped (--skip-cdn)${NC}"
else
    if [ "$DRY_RUN" = "true" ]; then
        echo -e "${YELLOW}Would run: $PROTOVERSE_ROOT/scripts/local/upload-worlds-to-tigris.sh --json-only${NC}"
    else
        USE_PROFILE=true "$PROTOVERSE_ROOT/scripts/local/upload-worlds-to-tigris.sh" --json-only
        echo -e "${GREEN}✓ World files uploaded${NC}"
    fi
fi
echo ""

# =============================================================================
# Step 3: Deploy Fly.io backend (foundry-player + WS server)
# =============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}[3/5] Deploying Fly.io backend${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$SKIP_FLY" = "true" ]; then
    echo -e "${YELLOW}⊘ Skipped (--skip-fly)${NC}"
else
    if [ "$DRY_RUN" = "true" ]; then
        echo -e "${YELLOW}Would run: ./deploy.sh $MOVIE_NAME --region $FLY_REGION $NO_CACHE${NC}"
    else
        ./deploy.sh "$MOVIE_NAME" --region "$FLY_REGION" $NO_CACHE
        echo -e "${GREEN}✓ Fly.io backend deployed${NC}"
    fi
fi
echo ""

# =============================================================================
# Step 4: Build protoverse frontend
# =============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}[4/5] Building protoverse frontend${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$SKIP_BUILD" = "true" ]; then
    echo -e "${YELLOW}⊘ Skipped (--skip-build)${NC}"
else
    if [ "$DRY_RUN" = "true" ]; then
        echo -e "${YELLOW}Would run: npm --prefix $PROTOVERSE_ROOT run build${NC}"
    else
        npm --prefix "$PROTOVERSE_ROOT" run build
        echo -e "${GREEN}✓ Build complete${NC}"
    fi
fi
echo ""

# =============================================================================
# Step 5: Deploy to Netlify
# =============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}[5/5] Deploying to Netlify${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$SKIP_NETLIFY" = "true" ]; then
    echo -e "${YELLOW}⊘ Skipped (--skip-netlify)${NC}"
else
    if [ "$DRY_RUN" = "true" ]; then
        echo -e "${YELLOW}Would run: netlify deploy --prod --site $NETLIFY_SITE --dir $PROTOVERSE_ROOT/dist${NC}"
    else
        # Check if site is linked (has .netlify/state.json)
        if [ -f "$PROTOVERSE_ROOT/.netlify/state.json" ]; then
            echo -e "${GREEN}Using linked Netlify site${NC}"
            netlify deploy --prod --dir "$PROTOVERSE_ROOT/dist"
        else
            netlify deploy --prod --site "$NETLIFY_SITE" --dir "$PROTOVERSE_ROOT/dist"
        fi
        echo -e "${GREEN}✓ Netlify deployment complete${NC}"
    fi
fi
echo ""

# =============================================================================
# Summary
# =============================================================================
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    Deployment Complete!                      ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Frontend:${NC}  https://$NETLIFY_SITE.netlify.app"
echo -e "  ${GREEN}Backend:${NC}   https://$FLY_APP_NAME.fly.dev"
echo ""
echo -e "  ${BLUE}Share URL:${NC}"
echo -e "  https://$NETLIFY_SITE.netlify.app?ws=wss://$FLY_APP_NAME.fly.dev:8765&foundry=wss://$FLY_APP_NAME.fly.dev/ws"
echo ""

if [ "$DRY_RUN" = "true" ]; then
    echo -e "${YELLOW}[DRY RUN - No changes were made]${NC}"
    echo ""
fi
