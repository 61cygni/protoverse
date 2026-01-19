# Protoverse Theater

Deploy movies for streaming in Protoverse with a single command.

## Quick Start

```bash
# 1. Transcode your movie (recommended)
cd ~/projects/foundry
./transcode.sh --small /path/to/original-movie.mp4
# Creates: original-movie_480p_500k.mp4

# 2. Create a movie directory
cd /path/to/protoverse/projects/theater
mkdir -p mymovie/movie

# 3. Add your transcoded movie file
cp ~/projects/foundry/original-movie_480p_500k.mp4 mymovie/movie/mymovie.mp4

# 4. (Optional) Add movie metadata
cat > mymovie/metadata.json << 'EOF'
{
    "title": "My Movie Title",
    "description": "A brief description for Y-Bot commentary",
    "year": 2024
}
EOF

# 5. Deploy
./deploy.sh mymovie
```

## Directory Structure

```
projects/theater/
├── config.js              # Theater project config preset
├── deploy.sh              # Deploy single movie to Fly.io
├── theater-deploy.sh      # Full deployment (Fly.io + Netlify + CDN)
├── list-theaters.sh       # List all deployed theaters
├── start-backend.sh       # Start backend for local dev
├── setup-local-vr.sh      # ADB port forwarding for Quest USB
├── fly.template.toml      # Fly.io config template
├── entrypoint.sh          # Container startup script
├── foundry-player/        # (auto-copied on deploy)
├── README.md              # This file
│
├── holygrail/             # Example movie
│   ├── movie/
│   │   └── holygrail.mp4
│   └── metadata.json      # Movie info (title, description, year)
│
└── bigtrouble/            # Another movie
    ├── movie/
    │   └── bigtrouble.mp4
    └── metadata.json
```

## Scripts

### deploy.sh - Deploy a movie to Fly.io

```bash
# Basic deployment
./deploy.sh holygrail

# Custom app name
./deploy.sh holygrail --app-name my-theater

# Different region (lax, sjc, ewr, etc.)
./deploy.sh holygrail --region lax

# Force full rebuild (after foundry-player updates)
./deploy.sh holygrail --no-cache

# Just create app without deploying
./deploy.sh holygrail --create-only
```

### theater-deploy.sh - Full deployment

Deploys everything: CDN assets, Fly.io backend, and Netlify frontend.

```bash
# Full deployment
./theater-deploy.sh holygrail

# Force fresh Fly.io build
./theater-deploy.sh holygrail --no-cache

# Skip Fly deployment (frontend only)
./theater-deploy.sh holygrail --skip-fly

# Dry run (show what would happen)
./theater-deploy.sh holygrail --dry-run
```

### list-theaters.sh - List deployed theaters

```bash
# Human-readable list
./list-theaters.sh

# JSON output (for scripting)
./list-theaters.sh --json
```

### start-backend.sh - Local backend services

Starts WS server and Foundry player for local development (no Fly.io):

```bash
# Start with a movie
./start-backend.sh ~/Movies/mymovie.mp4

# Start at 5 minutes into the movie
./start-backend.sh --start 300 ~/Movies/mymovie.mp4

# Stop all services
./start-backend.sh --stop
```

Then run `npm run dev` in another terminal for the frontend.

### setup-local-vr.sh - Quest USB debugging

Sets up ADB port forwarding so a Quest connected via USB can access localhost:

```bash
# Setup port forwarding
./setup-local-vr.sh

# Check current status
./setup-local-vr.sh --check

# Clear all forwarding
./setup-local-vr.sh --clear
```

Forwards ports: 3000 (Vite), 8765 (WS), 23646 (Foundry)

## Movie Transcoding

Use the transcode script in `~/projects/foundry/` for optimal streaming:

| Preset | Resolution | Bitrate | Use Case |
|--------|------------|---------|----------|
| `--small` | 480p | 500k | Low bandwidth, VR over WiFi |
| `--medium` | 720p | 1M | Balanced quality/size |
| `--large` | 1080p | 4M | High quality |

```bash
cd ~/projects/foundry

# Recommended for streaming
./transcode.sh --small movie.mp4

# Custom settings
./transcode.sh -b 800k -r 720 movie.mp4
```

## Movie Metadata

Create `metadata.json` in your movie directory for Y-Bot AI commentary:

```json
{
    "title": "My Movie Title",
    "description": "Brief description of the movie",
    "year": 2024
}
```

Served at: `https://protoverse-<movie>.fly.dev/movie-info`

## After Deployment

Your services will be available at:
- **Foundry**: `wss://protoverse-<movie>.fly.dev/ws`
- **WS Server**: `wss://protoverse-<movie>.fly.dev:8765`
- **Movie Info**: `https://protoverse-<movie>.fly.dev/movie-info`

Join URL:
```
https://cozytheatership.netlify.app?ws=wss://protoverse-<movie>.fly.dev:8765&foundry=wss://protoverse-<movie>.fly.dev/ws
```

## Runtime Configuration

Control playback without redeploying:

```bash
# Start movie at 5 minutes (300 seconds)
fly secrets set START_TIME=300 -a protoverse-mymovie

# Reset to beginning
fly secrets unset START_TIME -a protoverse-mymovie

# Enable looping
fly secrets set LOOP=true -a protoverse-mymovie
```

## Managing Deployments

```bash
# Check status
fly status -a protoverse-holygrail

# View logs
fly logs -a protoverse-holygrail

# SSH into container
fly ssh console -a protoverse-holygrail

# Stop app (save costs)
fly scale count 0 -a protoverse-holygrail

# Start app
fly scale count 1 -a protoverse-holygrail

# Destroy app
fly apps destroy protoverse-holygrail --yes
```

## Troubleshooting

### "Exec format error"
Always deploy with `--remote-only` (the script does this automatically).

### WebSocket connection fails
Check IPs are allocated:
```bash
fly ips list -a protoverse-<movie>
```

### Movie not playing
Check logs for errors:
```bash
fly logs -a protoverse-<movie>
```

Verify movie file exists:
```bash
fly ssh console -a protoverse-<movie> -C "ls -la /app/movies/"
```

### Movie info not loading (Y-Bot shows "Unknown")
Redeploy with `--no-cache` to get updated foundry-player:
```bash
./deploy.sh mymovie --no-cache
```

Check endpoint:
```bash
curl https://protoverse-mymovie.fly.dev/movie-info
```

### Sessions not appearing in lobby
Check Convex secret is set:
```bash
fly secrets list -a protoverse-mymovie
# Should include CONVEX_HTTP_URL
```
