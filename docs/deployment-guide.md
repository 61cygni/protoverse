# Protoverse Theater - Complete Deployment Guide

This guide covers the full deployment of Protoverse Theater, a multiplayer VR movie watching experience.

> **Note**: This guide uses example URLs (e.g., `cozytheatership.netlify.app`, `ardent-chameleon-122.convex.site`). Replace these with your own deployment URLs. See `.env.example` for environment variable configuration.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER DEVICES                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                                  │
│  │  Laptop  │  │   VR     │  │  Mobile  │                                  │
│  │  (Host)  │  │ (Viewer) │  │ (Viewer) │                                  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                                  │
└───────┼─────────────┼─────────────┼────────────────────────────────────────┘
        │             │             │
        ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            NETLIFY (Static Hosting)                          │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                   │
│  │   Protoverse Main App   │  │      Lobby Page         │                   │
│  │  cozytheatership.       │  │  theaterlobby.          │                   │
│  │  netlify.app            │  │  netlify.app            │                   │
│  │                         │  │                         │                   │
│  │  • 3D world rendering   │  │  • Session discovery    │                   │
│  │  • VR support           │  │  • Real-time updates    │                   │
│  │  • Player avatars       │  │  • Click to join        │                   │
│  │  • Y-Bot AI companion   │  │                         │                   │
│  └─────────────────────────┘  └───────────┬─────────────┘                   │
└───────────────────────────────────────────┼─────────────────────────────────┘
                                            │
        ┌───────────────────────────────────┼───────────────────────────┐
        │                                   │                           │
        ▼                                   ▼                           ▼
┌───────────────────┐  ┌─────────────────────────────┐  ┌───────────────────┐
│    FLY.IO         │  │         CONVEX              │  │     TIGRIS        │
│  (Per Movie)      │  │  (Session Registry + AI)    │  │   (CDN/Assets)    │
│                   │  │                             │  │                   │
│ protoverse-       │  │  ardent-chameleon-122       │  │  public-spz.      │
│ bigtrouble.       │  │  .convex.site                │  │  t3.storage.dev   │
│ fly.dev           │  │                             │  │                   │
│                   │  │  • Sessions table           │  │  • world.json     │
│ • WS Server :8765 │──┼─▶• HTTP endpoints          │  │  • .glb models    │
│ • Foundry :443/ws │  │  • AI proxy (Braintrust)    │  │  • .spz splats    │
│ • Movie streaming │  │  • Auto-cleanup cron        │  │                   │
└───────────────────┘  └─────────────────────────────┘  └───────────────────┘
```

## Components Overview

| Component | Purpose | Hosting | URL Pattern |
|-----------|---------|---------|-------------|
| **Protoverse App** | Main 3D experience | Netlify | `cozytheatership.netlify.app` |
| **Lobby** | Session discovery | Netlify (same site) | `cozytheatership.netlify.app/lobby/` |
| **Purgatory** | World browser | Netlify (separate) | `purgatory.netlify.app` |
| **Cinema Backend** | WS + Video streaming | Fly.io | `protoverse-{movie}.fly.dev` |
| **Convex** | Session + World registry, AI proxy | Convex Cloud | `{deployment}.convex.site` |
| **Tigris** | Asset CDN | Tigris/S3 | `public-spz.t3.storage.dev` |

---

## Prerequisites

Before deploying, ensure you have:

```bash
# Required CLIs
npm install -g netlify-cli
brew install flyctl  # or: curl -L https://fly.io/install.sh | sh
npm install -g convex

# Authenticated
netlify login
fly auth login
npx convex login

# AWS CLI for Tigris (optional, for CDN uploads)
brew install awscli
```

---

## Configuration System

Protoverse uses a flexible configuration system with **presets** for different use cases.

### Configuration Modes

```bash
npm run dev              # Default development mode
npm run dev:theater      # Theater mode (multiplayer movie watching)
npm run dev:demo         # Demo mode (single player, local assets)

npm run build            # Default production build
npm run build:theater    # Production build with theater preset
```

### How It Works

Configuration is merged from two sources:

1. **Environment files** (`.env`, `.env.theater`, `.env.demo`) - URLs and secrets
2. **Config presets** (`configs/*.js`) - App behavior settings

```
.env                    # Shared defaults (all modes)
.env.theater            # Theater-specific URLs
.env.demo               # Demo-specific URLs

projects/
├── index.js            # Preset registry
├── theater/
│   └── config.js       # Theater preset (multiplayer, no FPS)
├── demo/
│   └── config.js       # Demo preset (single player)
└── helloworld/
    └── config.js       # Example project
```

### Creating a New Project/Mode

Use the helper script:

```bash
./scripts/add-project.sh myproject
```

This creates:
- `projects/myproject/config.js` - Config preset
- `projects/myproject/README.md` - Project documentation
- `.env.myproject.example` - Environment template  
- Adds `npm run dev:myproject` and `build:myproject` scripts

Then customize:
1. Edit `projects/myproject/config.js` to override settings
2. Copy `.env.myproject.example` to `.env.myproject` for URLs
3. Run `npm run dev:myproject`

### Multiple World Configs

You can have multiple world JSON files in the same directory:

```
public/worlds/cozyship/
├── world.json           # Default config
├── helloworld.json      # Custom variant
├── splats/              # Shared assets
└── collision-mesh.glb
```

Then point to different configs:
```javascript
// configs/helloworld.js
export default {
    world: {
        rootWorld: "/cozyship/helloworld.json",
    },
};
```

### Key Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_WS_URL` | Multiplayer WebSocket | `wss://app.fly.dev:8765` |
| `VITE_CDN_URL` | CDN for assets (empty = local) | `https://cdn.example.com` |
| `VITE_CONVEX_HTTP_URL` | Convex HTTP endpoint | `https://xxx.convex.site` |
| `VITE_PROTOVERSE_URL` | Public app URL | `https://app.netlify.app` |

See `.env.example` for full documentation.

---

## Part 1: Convex (Session Registry + AI Proxy)

Convex provides two services:
1. **Session Registry** - Tracks active sessions for the lobby
2. **AI Proxy** - Securely proxies Braintrust API calls (keeps API key server-side)

### Initial Setup (One Time)

```bash
cd /path/to/protoverse

# Install dependencies
npm install convex

# Initialize Convex project
npx convex dev
# Follow prompts to create project
# Note your deployment URL (e.g., ardent-chameleon-122)
```

### Deploy Convex Functions

```bash
# Development (watches for changes)
npx convex dev

# Production deployment
npx convex deploy
```

### Set Environment Variables

Convex stores secrets server-side (secure, never sent to browsers). Set these in the Convex dashboard:

1. Go to https://dashboard.convex.dev
2. Select your project → Settings → Environment Variables
3. Add:
   - `BRAINTRUST_API_KEY` - Your Braintrust API key (for AI NPC chat)

Or via CLI:
```bash
# For dev environment
npx convex env set BRAINTRUST_API_KEY sk-your-key-here --env dev

# For production
npx convex env set BRAINTRUST_API_KEY sk-your-key-here
```

> **Security Note**: The Braintrust API key is proxied through Convex (`/ai/invoke`, `/ai/stream` endpoints) so it's never exposed to browsers. This is handled automatically by `ai/bt.js`.

### Moving from Dev to Production

When you're ready to go live, switch from the dev deployment to a production deployment:

#### 1. Deploy to Production

```bash
npx convex deploy
```

This creates a separate production deployment. Note the new deployment URL (it will be different from your dev URL).

#### 2. Find Your Production URL

Check the output of `npx convex deploy` or visit the Convex dashboard:
- https://dashboard.convex.dev

Your production HTTP URL will look like: `https://your-prod-name-123.convex.site`

#### 3. Update Fly.io Apps

Update each Fly.io theater backend to use the production Convex URL:

```bash
# List your theater apps
./list-theaters.sh

# Update each app's secret
fly secrets set CONVEX_HTTP_URL=https://YOUR-PROD-DEPLOYMENT.convex.site -a protoverse-bigtrouble
fly secrets set CONVEX_HTTP_URL=https://YOUR-PROD-DEPLOYMENT.convex.site -a protoverse-holygrail
# ... repeat for each movie app
```

#### 4. Update Environment Configuration

Create or update your `.env` file with the production Convex URL:

```bash
# Copy from .env.example if you haven't already
cp .env.example .env

# Edit .env and set:
VITE_CONVEX_HTTP_URL=https://YOUR-PROD-DEPLOYMENT.convex.site
```

> **Important**: Use `VITE_CONVEX_HTTP_URL` (not `VITE_CONVEX_URL`). Convex auto-manages `VITE_CONVEX_URL` in `.env.local` with `.convex.cloud`, but HTTP actions need `.convex.site`.

The lobby page and AI proxy will use this URL automatically.

#### 5. Redeploy Frontend

```bash
npm run build
netlify deploy --prod --dir dist
```

#### 6. Verify Production

```bash
# Check Fly logs show production Convex
fly logs -a protoverse-bigtrouble | grep -i convex

# Test the lobby loads sessions
curl https://YOUR-PROD-DEPLOYMENT.convex.site/sessions

# Create a session and verify it appears in:
# - Production Convex dashboard
# - Lobby page
```

> **Note**: Your dev deployment still exists and can be used for testing. Production has its own separate data.

### Verify Convex

1. **Dashboard**: https://dashboard.convex.dev/d/{your-deployment}
2. **Test HTTP endpoint**:
   ```bash
   curl https://{your-deployment}.convex.site/sessions
   # Should return [] or list of sessions
   ```

### Key URLs

| Purpose | URL |
|---------|-----|
| HTTP Actions | `https://{deployment}.convex.site` |
| Dashboard | `https://dashboard.convex.dev/d/{deployment}` |
| AI Invoke | `POST https://{deployment}.convex.site/ai/invoke` |
| AI Stream | `POST https://{deployment}.convex.site/ai/stream` |

> **Note on Convex URLs**: 
> - `.convex.site` - For HTTP actions (REST endpoints, used by our code)
> - `.convex.cloud` - For Convex JS SDK (auto-managed by `npx convex dev`)

---

## Part 1.5: Braintrust (AI Prompts)

AI character conversations are powered by [Braintrust](https://braintrust.dev). Prompts are stored in the `prompts/` directory and synced with Braintrust.

### Initial Setup (One Time)

```bash
# Install Braintrust CLI (included in package.json)
npm install

# Login to Braintrust
npx braintrust login

# Create a project named "protoverse" in Braintrust dashboard
# https://www.braintrust.dev/app
```

### Push Prompts to Braintrust

The AI prompts are stored in `prompts/` and should be pushed to your Braintrust project:

```bash
# Push all prompts
npx braintrust push --project-name "protoverse" prompts/
```

### Pull Prompts (if editing in Braintrust UI)

If you make changes in the Braintrust web UI and want to sync locally:

```bash
# Pull latest prompts
npx braintrust pull --project-name "protoverse" --output-dir prompts/
```

### Connect to Convex

The Braintrust API key must be set in Convex (not in frontend code):

```bash
# Get your API key from: https://www.braintrust.dev/app/settings
# Set it in Convex
npx convex env set BRAINTRUST_API_KEY sk-your-key-here
```

### How It Works

```
Browser → Convex (/ai/stream) → Braintrust API → AI Response
              ↑
         BRAINTRUST_API_KEY (stored in Convex, secure)
```

The prompts define character personalities (e.g., Y-Bot's chat responses, movie commentary). Edit `prompts/` to customize character behavior.

---

## Part 2: Fly.io Cinema Backends

Each movie gets its own Fly.io app with:
- WebSocket server for multiplayer (port 8765)
- Foundry video streaming (port 443)

### Transcoding Movies

Before deploying, transcode your video to an optimized format for streaming. The transcode script in `~/projects/foundry/` creates H.264/AAC MP4 files optimized for web streaming.

**Presets:**

| Preset | Resolution | Video Bitrate | Audio | Use Case |
|--------|------------|---------------|-------|----------|
| `--small` | 480p | 500 kbps | 96k | Low bandwidth, VR over WiFi |
| `--medium` | 720p | 1 Mbps | 128k | Balanced quality/size |
| `--large` | 1080p | 4 Mbps | 192k | High quality (default) |

```bash
cd ~/projects/foundry

# Recommended for most streaming (low bandwidth)
./transcode.sh --small /path/to/original-movie.mp4

# Output: original-movie_480p_500k.mp4

# Custom output name
./transcode.sh --small -o mymovie.mp4 /path/to/original.mkv

# Custom bitrate
./transcode.sh -b 800k -r 720 /path/to/original.mp4
```

> **Tip**: Use `--small` for reliable streaming over variable WiFi connections, especially in VR headsets. File sizes are typically 200-400 MB for a 2-hour movie.

### Setup a New Movie

```bash
cd /path/to/protoverse/projects/theater

# 1. Transcode the movie (recommended)
cd ~/projects/foundry
./transcode.sh --small /path/to/original-movie.mp4
# Creates: original-movie_480p_500k.mp4

# 2. Create movie directory and copy transcoded file
cd /path/to/protoverse/projects/theater
mkdir -p mymovie/movie
cp ~/projects/foundry/original-movie_480p_500k.mp4 mymovie/movie/mymovie.mp4

# 2. (Optional) Create metadata.json for movie info
cat > mymovie/metadata.json << 'EOF'
{
    "title": "My Movie Title",
    "description": "A brief description of the movie",
    "year": 2024
}
EOF

# 3. Deploy to Fly.io
./deploy.sh mymovie

# This will:
# - Create Fly app: protoverse-mymovie
# - Build Docker image with video + servers
# - Auto-configure Convex session tracking
# - Deploy to Fly.io
```

### Directory Structure

```
projects/theater/
├── mymovie/
│   ├── movie/
│   │   └── mymovie.mp4        # The video file
│   └── metadata.json          # Optional: movie title/description
├── deploy.sh
├── entrypoint.sh
└── fly.template.toml
```

### Movie Metadata

Movie info is served from the Fly.io backend at `/movie-info`. This is used by Y-Bot for AI commentary.

If you don't create `metadata.json`, a default title is generated from the directory name.

```bash
# Check movie info endpoint
curl https://protoverse-mymovie.fly.dev/movie-info
# {"title": "My Movie Title", "description": "...", "year": 2024}
```

### Convex Secret (Auto-configured)

The deploy script automatically sets `CONVEX_HTTP_URL`. To manually override:

```bash
fly secrets set CONVEX_HTTP_URL=https://{your-deployment}.convex.site -a protoverse-mymovie
```

### Verify Fly.io Deployment

```bash
# Check app status
fly status -a protoverse-mymovie

# Should show 1 machine running:
# PROCESS  ID              STATE    
# app      abc123def456    running

# Check logs
fly logs -a protoverse-mymovie

# Should see:
# WS server listening on 0.0.0.0:8765
# [Convex] Session tracking enabled

# Test WS endpoint (should connect then close)
websocat wss://protoverse-mymovie.fly.dev:8765

# Test Foundry endpoint
curl -I https://protoverse-mymovie.fly.dev/
# Should return 200 OK
```

### Key URLs (per movie)

| Purpose | URL |
|---------|-----|
| WebSocket | `wss://protoverse-{movie}.fly.dev:8765` |
| Foundry Video | `wss://protoverse-{movie}.fly.dev/ws` |
| Status | `fly status -a protoverse-{movie}` |

---

## Part 3: Tigris CDN (Assets)

Tigris stores world.json files and large assets (splats, GLB models).

### Upload World Files

> **Note:** The upload script is in `scripts/local/` (gitignored). Create your own copy
> if you need to upload to a different CDN.

```bash
cd /path/to/protoverse

# Upload only world.json files (fast)
USE_PROFILE=true ./scripts/local/upload-worlds-to-tigris.sh --json-only

# Upload everything (world.json, .glb, .mp3)
USE_PROFILE=true ./scripts/local/upload-worlds-to-tigris.sh
```

### Verify Tigris

```bash
# Check a world.json is accessible
curl https://public-spz.t3.storage.dev/theatership/world.json
```

### Configuration

Set your CDN URL in `.env`:

```bash
VITE_CDN_URL=https://your-bucket.t3.storage.dev
```

If `VITE_CDN_URL` is not set, assets will be served from `/worlds` (local).

---

## Part 4: Protoverse Main App (Netlify)

The main 3D application.

### Build and Deploy

```bash
cd /path/to/protoverse

# Ensure CDN is enabled
# Edit config.js: useCdn: true

# Create lobby config (gitignored, must be created before build)
cp public/lobby/config.js.example public/lobby/config.js
# Edit public/lobby/config.js with your production URLs

# Build and deploy (default preset)
npm run build
netlify deploy --prod --dir dist
```

### Deploying Different Projects

You can deploy different project presets without editing `netlify.toml`:

```bash
# Build with specific project preset, then deploy
npm run build:worldship && netlify deploy --prod --dir dist
npm run build:theater && netlify deploy --prod --dir dist
npm run build:helloworld && netlify deploy --prod --dir dist

# Or for any project:
npm run build:<project> && netlify deploy --prod --dir dist
```

**Available build commands:**
- `npm run build:theater` - Theater mode (multiplayer movie watching)
- `npm run build:worldship` - Worldship mode (space exploration)
- `npm run build:helloworld` - Hello World demo
- `npm run build:demo` - Demo mode (single player)

**For Netlify CI (auto-builds):** Either:
1. Edit `netlify.toml` to use your project's build command:
   ```toml
   [build]
     command = "npm run build:worldship"
   ```
2. Or set `VITE_PRESET` environment variable in Netlify:
   - Site settings → Environment variables → Add: `VITE_PRESET=worldship`
   - This works with the default `npm run build` command

Or use the all-in-one script:

```bash
./theater-deploy.sh mymovie

# Options:
./theater-deploy.sh mymovie --no-cache      # Force fresh Fly.io build
./theater-deploy.sh mymovie --skip-fly      # Skip Fly deployment (frontend only)
./theater-deploy.sh mymovie --skip-cdn      # Skip CDN upload
./theater-deploy.sh mymovie --dry-run       # Show what would be done
```

### Verify Protoverse

1. Open https://cozytheatership.netlify.app
2. Should load the 3D world
3. Check browser console for errors

### Joining a Session

Users can join via URL parameters:

```
https://cozytheatership.netlify.app?ws=wss://protoverse-mymovie.fly.dev:8765&foundry=wss://protoverse-mymovie.fly.dev/ws&session=ABC123
```

---

## Part 5: Lobby Page

The session discovery page. It's included as part of the main Protoverse app at `/lobby/`.

### Configure

Copy the example config file and fill in your URLs:

```bash
cp public/lobby/config.js.example public/lobby/config.js
cp lobby/config.js.example lobby/config.js
```

Edit `public/lobby/config.js`:
```javascript
window.CONVEX_HTTP_URL = 'https://your-deployment.convex.site';
window.PROTOVERSE_URL = 'https://your-app.netlify.app';
```

Alternatively, pass URLs as query parameters: `/lobby/?convex=https://...&protoverse=https://...`

### Deploy

The lobby is deployed automatically with the main app:

```bash
npm run build
netlify deploy --prod --dir dist
```

The lobby will be available at: `https://cozytheatership.netlify.app/lobby/`

### Verify Lobby

1. Open https://cozytheatership.netlify.app/lobby/
2. Create a session in Protoverse
3. Session should appear in lobby within 10 seconds
4. Click "Join Party" should open Protoverse with session pre-filled

---

## Part 6: World Registry & Protoverse Purgatory

The World Registry is a Convex-powered directory of all deployed Protoverse worlds. "Protoverse Purgatory" is a standalone web app for browsing and entering registered worlds.

### Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WORLD REGISTRY ARCHITECTURE                          │
│                                                                              │
│  ┌─────────────────────┐      ┌─────────────────────┐                       │
│  │  Protoverse         │      │  Protoverse         │                       │
│  │  Purgatory          │      │  (Any World)        │                       │
│  │  purgatory.         │      │  myworld.           │                       │
│  │  netlify.app        │      │  netlify.app        │                       │
│  └──────────┬──────────┘      └──────────┬──────────┘                       │
│             │                            │                                   │
│             │ GET /worlds                │ register-world.js                │
│             ▼                            ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         CONVEX                                       │    │
│  │  worlds table:           worldServices table:                        │    │
│  │  • name, slug            • worldId                                   │    │
│  │  • url, rootWorld        • type (multiplayer/streaming/ai)           │    │
│  │  • description           • url, flyAppName                           │    │
│  │  • thumbnail, tags                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Registering a World

After deploying a world to Netlify, register it with the registry:

```bash
# Basic registration (pulls name/description from world.json)
npm run register-world -- \
  --url "https://myworld.netlify.app" \
  --world "/myworld/world.json"

# With multiplayer and streaming services
npm run register-world -- \
  --url "https://cozytheatership.netlify.app/?ws=wss://protoverse-holygrail.fly.dev:8765&foundry=wss://protoverse-holygrail.fly.dev/ws" \
  --world "/theatership/world.json" \
  --tags "movie,multiplayer,social"

# Dry run (preview what will be registered)
npm run register-world -- \
  --url "https://myworld.netlify.app" \
  --world "/myworld/world.json" \
  --dry
```

The script:
1. Parses the URL and extracts `?ws=` and `?foundry=` service params
2. Fetches `world.json` from the deployment (or CDN)
3. Extracts `name`, `description`, and `thumbnail` from the JSON
4. Auto-generates a URL-safe slug from the name
5. Auto-detects thumbnail if not specified (looks for `thumbnail.png` next to `world.json`)
6. Registers the world and any services with Convex

### Updating or Deleting Worlds

```bash
# Update an existing world (same options as register)
npm run register-world -- --update \
  --url "https://myworld.netlify.app" \
  --world "/myworld/world.json"

# Delete a world by slug
npm run register-world -- --delete --slug "my-world"
```

### World.json Fields for Registry

Add these fields to your `world.json` for better registry entries:

```json
{
  "name": "My Awesome World",
  "description": "A brief description for the world browser",
  "thumbnail": "/myworld/thumbnail.png",
  "splatUrl": "/myworld/splats/world-lod-0.spz",
  ...
}
```

### Thumbnails

Thumbnails are displayed in the Purgatory world browser. You can provide them in three ways (in priority order):

1. **CLI flag**: `--thumbnail "https://cdn.example.com/thumb.png"`
2. **world.json field**: `"thumbnail": "/myworld/thumbnail.png"`
3. **Auto-detect**: Place `thumbnail.png` (or `.jpg`/`.webp`) next to your `world.json`

Recommended size: 400×225 pixels (16:9 aspect ratio)

**Uploading thumbnails to CDN:**

```bash
# Upload everything including thumbnails (but skip large .spz files)
./scripts/local/upload-worlds-to-tigris.sh --world myworld --no-splats

# Upload everything including .spz splats
./scripts/local/upload-worlds-to-tigris.sh --world myworld
```

### API Endpoints

The registry exposes these HTTP endpoints on Convex:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/worlds` | List all registered worlds |
| `POST` | `/worlds` | Register a new world |
| `GET` | `/worlds/by-slug?slug=xxx` | Get world by slug (with services) |
| `PATCH` | `/worlds/by-slug?slug=xxx` | Update a world |
| `DELETE` | `/worlds/by-slug?slug=xxx` | Remove a world |
| `GET` | `/worlds/services?slug=xxx` | List services for a world |
| `POST` | `/worlds/services?slug=xxx` | Register a service |
| `DELETE` | `/worlds/services?slug=xxx&type=yyy&url=zzz` | Remove a service |

### Deploying Protoverse Purgatory

Protoverse Purgatory is a standalone site in `purgatory/`:

```bash
cd purgatory

# 1. Create config
cp config.js.example config.js

# 2. Edit config.js with your Convex URL
echo "window.CONVEX_HTTP_URL = 'https://your-deployment.convex.site';" > config.js

# 3. Test locally
npx serve .

# 4. Deploy to Netlify
netlify deploy --prod
```

Or for build-time config injection:

```toml
# purgatory/netlify.toml
[build]
  command = "echo \"window.CONVEX_HTTP_URL = '$CONVEX_HTTP_URL';\" > config.js"
  publish = "."
```

Then set `CONVEX_HTTP_URL` in Netlify environment variables.

### Verify Registry

```bash
# List all worlds
curl https://your-deployment.convex.site/worlds

# Get a specific world with services
curl "https://your-deployment.convex.site/worlds/by-slug?slug=cozy-theatership"
```

### Purgatory Features

- 🌀 Dark, atmospheric "liminal space" theme
- 🔍 Search by name, description, or tags
- 🏷️ Filter by tags
- 👥 Multiplayer service indicator
- 🎬 Streaming service indicator
- 🤖 AI service indicator
- ✨ Click any world to enter

---

## Full Deployment Checklist

### For a New Movie Release

```bash
# 1. Transcode movie (recommended for streaming)
cd ~/projects/foundry
./transcode.sh --small /path/to/original-movie.mp4

# 2. Prepare theater directory
cd /path/to/protoverse
mkdir -p projects/theater/mymovie/movie
cp ~/projects/foundry/original-movie_480p_500k.mp4 projects/theater/mymovie/movie/mymovie.mp4

# 2. (Optional) Add movie metadata
cat > projects/theater/mymovie/metadata.json << 'EOF'
{
    "title": "My Movie Title",
    "description": "Brief description for Y-Bot AI commentary",
    "year": 2024
}
EOF

# 3. Deploy everything (Fly.io + Netlify)
./theater-deploy.sh mymovie

# Or just Fly.io backend:
./projects/theater/deploy.sh mymovie
# (Convex is auto-configured!)

# 4. Verify
fly status -a protoverse-mymovie
curl https://protoverse-mymovie.fly.dev/movie-info

# 5. (Optional) Start movie at specific time
fly secrets set START_TIME=300 -a protoverse-mymovie  # 5 minutes in
```

### Quick Verification Flow

1. **Fly.io Running?**
   ```bash
   fly status -a protoverse-mymovie
   ```

2. **Convex Connected?**
   ```bash
   fly logs -a protoverse-mymovie | grep Convex
   # Should see: [Convex] Session tracking enabled
   ```

3. **Create Session**: Open Protoverse, click multiplayer, create session

4. **Check Convex Dashboard**: https://dashboard.convex.dev/d/{deployment}
   - Go to Data > sessions
   - Should see your session

5. **Check Lobby**: Open lobby page
   - Session should appear
   - Click "Join Party" should work

---

## Troubleshooting

### Sessions Not Appearing in Lobby

1. **Check Convex secret on Fly.io**:
   ```bash
   fly secrets list -a protoverse-mymovie
   # Should include CONVEX_HTTP_URL
   ```

2. **Check Fly.io logs**:
   ```bash
   fly logs -a protoverse-mymovie | grep -i "convex\|session"
   ```

3. **Check Convex dashboard** for errors in Logs tab

### VR Can't Join Session

1. **Multiple machines issue**: Ensure only 1 machine:
   ```bash
   fly status -a protoverse-mymovie
   # Should show exactly 1 machine
   fly scale count 1 -a protoverse-mymovie
   ```

2. **Check browser console** for WebSocket errors

3. **Verify URLs match**: Host and viewer must use same WS URL

### Video Not Playing

1. **Check Foundry endpoint**:
   ```bash
   curl -I https://protoverse-mymovie.fly.dev/
   ```

2. **Check Fly.io logs** for video errors:
   ```bash
   fly logs -a protoverse-mymovie | grep -i foundry
   ```

### Assets Not Loading

1. **Check CDN config** in `config.js`:
   ```javascript
   useCdn: true  // Must be true for production
   ```

2. **Verify Tigris upload**:
   ```bash
   curl https://public-spz.t3.storage.dev/theatership/world.json
   ```

### Movie Info Not Loading (Y-Bot shows "Unknown")

1. **Check /movie-info endpoint**:
   ```bash
   curl https://protoverse-mymovie.fly.dev/movie-info
   # Should return JSON with title, description, year
   ```

2. **If 404**: Fly.io needs redeploy with updated foundry-player:
   ```bash
   ./projects/theater/deploy.sh mymovie --no-cache
   ```

3. **Check browser console** for fetch errors:
   ```
   [Foundry] "Screen Share" ✓ movie info loaded:
   [Foundry]   title: "My Movie"
   ```

---

## Environment Variables Reference

### Fly.io (Cinema Backend)

| Variable | Description | Example |
|----------|-------------|---------|
| `CONVEX_HTTP_URL` | Convex HTTP endpoint | `https://abc.convex.site` |
| `MOVIE_NAME` | Movie filename (auto-set) | `movie.mp4` |
| `WS_PORT` | WebSocket port (auto-set) | `8765` |
| `START_TIME` | Start movie at this time (seconds) | `300` (5 minutes) |
| `LOOP` | Loop playback when movie ends | `true` |

### Controlling Movie Start Time

You can start a movie partway through without redeploying:

```bash
# Start movie at 5 minutes (300 seconds)
fly secrets set START_TIME=300 -a protoverse-mymovie

# Reset to beginning
fly secrets unset START_TIME -a protoverse-mymovie
```

Setting/unsetting secrets automatically restarts the machine with the new value.

### Netlify (Protoverse App)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_CDN_URL` | CDN base URL for assets | `https://public-spz.t3.storage.dev` |
| `VITE_CONVEX_HTTP_URL` | Convex HTTP endpoint (for AI proxy) | `https://abc.convex.site` |
| `VITE_WS_URL` | Default WebSocket URL (optional) | `wss://protoverse-movie.fly.dev:8765` |

> **Note**: `BRAINTRUST_API_KEY` is set in **Convex**, not Netlify. See Part 1.

### Lobby Page

Configured in `lobby/index.html`:

| Variable | Description | Example |
|----------|-------------|---------|
| `CONVEX_HTTP_URL` | Convex HTTP endpoint | `https://abc.convex.site` |
| `PROTOVERSE_URL` | Main app URL | `https://cozytheatership.netlify.app` |

---

## List Deployed Theaters

Use `list-theaters.sh` to see all deployed Fly.io movie instances and get ready-to-use URLs:

```bash
./list-theaters.sh
```

**Output:**
```
╔══════════════════════════════════════════════════════════════╗
║            🎬 Protoverse Theater Instances                   ║
╚══════════════════════════════════════════════════════════════╝

[1] bigtrouble
    Status:  ● running
    App:     protoverse-bigtrouble

    ▶ Join URL:
    https://cozytheatership.netlify.app?ws=wss://protoverse-bigtrouble.fly.dev:8765&foundry=wss://protoverse-bigtrouble.fly.dev/ws

[2] holygrail
    Status:  ○ stopped
    App:     protoverse-holygrail

    ▶ Join URL:
    https://cozytheatership.netlify.app?ws=wss://protoverse-holygrail.fly.dev:8765&foundry=wss://protoverse-holygrail.fly.dev/ws

Total: 2 theater(s)
```

**Options:**
```bash
./list-theaters.sh              # Human-readable output
./list-theaters.sh --json       # JSON output for scripting

# Custom base URL
PROTOVERSE_URL=https://mysite.netlify.app ./list-theaters.sh
```

---

## Useful Commands

```bash
# World Registry
npm run register-world -- --url "https://myworld.netlify.app" --world "/myworld/world.json"
npm run register-world -- --url "https://..." --world "/..." --tags "demo,social"
npm run register-world -- --update --url "https://..." --world "/..."  # Update existing
npm run register-world -- --delete --slug "my-world"                   # Delete by slug
npm run register-world -- --url "https://..." --world "/..." --dry     # Preview only

# Upload to Tigris CDN
./scripts/local/upload-worlds-to-tigris.sh --world myworld             # All files
./scripts/local/upload-worlds-to-tigris.sh --world myworld --no-splats # Skip .spz files
./scripts/local/upload-worlds-to-tigris.sh --world myworld --json-only # Only .json files

# Transcode movies (in ~/projects/foundry)
./transcode.sh --small movie.mp4      # 480p @ 500k (recommended)
./transcode.sh --medium movie.mp4     # 720p @ 1M
./transcode.sh --large movie.mp4      # 1080p @ 4M

# List all theaters
./list-theaters.sh                    # Show all deployed movies with URLs

# Fly.io
fly status -a protoverse-mymovie      # Check app status
fly logs -a protoverse-mymovie        # View logs
fly secrets list -a protoverse-mymovie # List secrets
fly scale count 1 -a protoverse-mymovie # Ensure single machine
fly machines restart -a protoverse-mymovie # Restart

# Force rebuild (after foundry-player updates)
./projects/theater/deploy.sh mymovie --no-cache
./theater-deploy.sh mymovie --no-cache

# Control playback start time
fly secrets set START_TIME=300 -a protoverse-mymovie   # Start at 5 min
fly secrets unset START_TIME -a protoverse-mymovie     # Start at beginning

# Convex
npx convex dev                        # Development mode
npx convex deploy                     # Production deploy
npx convex logs                       # View function logs

# Netlify
netlify deploy --prod --dir dist      # Deploy protoverse (includes lobby at /lobby/)

# Local Development
npm run dev                           # Default dev server
npm run dev:theater                   # Theater mode (multiplayer enabled)
npm run dev:demo                      # Demo mode (single player)
./scripts/add-project.sh myproject    # Create new project preset
node multiplayer/ws-server.js         # Start local WS server
cd projects/theater && ./start-backend.sh movie.mp4  # Start WS + Foundry with movie
```

---

## Architecture Decisions

1. **Fly.io per movie**: Each movie gets its own container to isolate video streaming resources

2. **Single machine per app**: Session state is in-memory, so we force exactly 1 machine to avoid split-brain

3. **Convex for discovery**: Real-time database with auto-cleanup, perfect for ephemeral session tracking

4. **Tigris CDN**: S3-compatible storage for large assets, keeps Netlify bundle small

5. **Splat-based UI**: Text uses Gaussian splats for proper compositing in VR
