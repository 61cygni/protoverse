#!/bin/bash
#
# Add a new project/config preset
#
# Usage: ./scripts/add-project.sh myproject
#
# This will:
#   1. Create projects/myproject/ directory with config.js
#   2. Register it in projects/index.js
#   3. Add npm scripts to package.json
#   4. Create .env.myproject.example

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check for project name argument
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide a project name${NC}"
    echo "Usage: $0 <project-name>"
    echo "Example: $0 myproject"
    exit 1
fi

PROJECT_NAME="$1"

# Validate project name (lowercase, no spaces)
if [[ ! "$PROJECT_NAME" =~ ^[a-z][a-z0-9_-]*$ ]]; then
    echo -e "${RED}Error: Project name must be lowercase, start with a letter, and contain only letters, numbers, hyphens, or underscores${NC}"
    exit 1
fi

echo -e "${GREEN}Creating project: ${PROJECT_NAME}${NC}"

# Capitalize first letter (bash 3 compatible)
PROJECT_NAME_CAP="$(echo "$PROJECT_NAME" | awk '{print toupper(substr($0,1,1)) tolower(substr($0,2))}')"

# 1. Create project directory and config file
PROJECT_DIR="$PROJECT_ROOT/projects/${PROJECT_NAME}"
CONFIG_FILE="$PROJECT_DIR/config.js"

if [ -d "$PROJECT_DIR" ]; then
    echo -e "${YELLOW}Warning: $PROJECT_DIR already exists${NC}"
else
    mkdir -p "$PROJECT_DIR"
    echo -e "${GREEN}✓ Created $PROJECT_DIR${NC}"
fi

if [ -f "$CONFIG_FILE" ]; then
    echo -e "${YELLOW}Warning: $CONFIG_FILE already exists, skipping${NC}"
else
    cat > "$CONFIG_FILE" << EOF
/**
 * ${PROJECT_NAME_CAP} Project Config
 * 
 * Use with: npm run dev:${PROJECT_NAME}
 */
export default {
    world: {
        // rootWorld: "/myworld/world.json",
    },
    multiplayer: {
        enabled: false,
    },
    debug: {
        showFps: true,
        logWorldChanges: false,
        logPortalCrossings: false,
    },
};
EOF
    echo -e "${GREEN}✓ Created $CONFIG_FILE${NC}"
fi

# Create project README
README_FILE="$PROJECT_DIR/README.md"
if [ ! -f "$README_FILE" ]; then
    cat > "$README_FILE" << EOF
# ${PROJECT_NAME_CAP} Project

## Usage

\`\`\`bash
npm run dev:${PROJECT_NAME}
npm run build:${PROJECT_NAME}
\`\`\`

## Configuration

Edit \`config.js\` to customize settings.

Create \`.env.${PROJECT_NAME}\` in the project root for environment variables.
EOF
    echo -e "${GREEN}✓ Created $README_FILE${NC}"
fi

# 2. Register in projects/index.js
INDEX_FILE="$PROJECT_ROOT/projects/index.js"
if grep -q "import ${PROJECT_NAME} from" "$INDEX_FILE"; then
    echo -e "${YELLOW}Warning: ${PROJECT_NAME} already imported in index.js, skipping${NC}"
else
    # Add import after other imports (after the last import line)
    sed -i.bak "/^import helloworld/a\\
import ${PROJECT_NAME} from './${PROJECT_NAME}/config.js';
" "$INDEX_FILE"
    
    # Add to presets object
    sed -i.bak "s/    helloworld,/    helloworld,\\
    ${PROJECT_NAME},/" "$INDEX_FILE"
    
    rm -f "$INDEX_FILE.bak"
    echo -e "${GREEN}✓ Registered in projects/index.js${NC}"
fi

# 3. Add npm scripts to package.json
PACKAGE_FILE="$PROJECT_ROOT/package.json"
if grep -q "\"dev:${PROJECT_NAME}\"" "$PACKAGE_FILE"; then
    echo -e "${YELLOW}Warning: npm scripts already exist, skipping${NC}"
else
    # Use node to safely edit JSON
    node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$PACKAGE_FILE', 'utf8'));
pkg.scripts['dev:${PROJECT_NAME}'] = 'vite --mode ${PROJECT_NAME}';
pkg.scripts['build:${PROJECT_NAME}'] = 'vite build --mode ${PROJECT_NAME}';
fs.writeFileSync('$PACKAGE_FILE', JSON.stringify(pkg, null, 2) + '\n');
"
    echo -e "${GREEN}✓ Added npm scripts to package.json${NC}"
fi

# 4. Create .env example file
ENV_EXAMPLE="$PROJECT_ROOT/.env.${PROJECT_NAME}.example"
if [ -f "$ENV_EXAMPLE" ]; then
    echo -e "${YELLOW}Warning: $ENV_EXAMPLE already exists, skipping${NC}"
else
    cat > "$ENV_EXAMPLE" << EOF
# ${PROJECT_NAME_CAP} Mode Environment
# Copy to .env.${PROJECT_NAME} and customize
#
# Usage: npm run dev:${PROJECT_NAME}

# WebSocket server (leave empty for no multiplayer)
VITE_WS_URL=

# Convex HTTP endpoint (for AI chat)
VITE_CONVEX_HTTP_URL=

# CDN for world assets (leave empty for local /worlds)
VITE_CDN_URL=

# Public URL
VITE_PROTOVERSE_URL=http://localhost:3000
EOF
    echo -e "${GREEN}✓ Created $ENV_EXAMPLE${NC}"
fi

echo ""
echo -e "${GREEN}Done! Next steps:${NC}"
echo "  1. Edit projects/${PROJECT_NAME}/config.js to customize settings"
echo "  2. Copy .env.${PROJECT_NAME}.example to .env.${PROJECT_NAME} if needed"
echo "  3. Run: npm run dev:${PROJECT_NAME}"
