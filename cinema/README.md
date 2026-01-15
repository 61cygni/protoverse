# Protoverse Cinema

Deploy movies for streaming in Protoverse with a single command.

## Quick Start

```bash
# 1. Create a movie directory
mkdir -p cinema/mymovie/movie

# 2. Add your movie file
cp /path/to/mymovie.mp4 cinema/mymovie/movie/mymovie.mp4

# 3. Deploy
cd cinema
./deploy.sh mymovie
```

## Directory Structure

```
cinema/
├── deploy.sh              # Deployment script
├── fly.template.toml      # Fly.io config template
├── entrypoint.sh          # Container startup script
├── foundry-player/        # (auto-copied on first deploy)
├── README.md              # This file
│
├── holygrail/             # Example movie
│   └── movie/
│       └── holygrail.mp4
│
└── bigtrouble/            # Another movie
    └── movie/
        └── bigtrouble.mp4
```

## Deployment Options

```bash
# Basic deployment
./deploy.sh holygrail

# Custom app name
./deploy.sh holygrail --app-name my-theater

# Different region (lax, sjc, ewr, etc.)
./deploy.sh holygrail --region lax

# Force full rebuild
./deploy.sh holygrail --no-cache

# Just create app without deploying
./deploy.sh holygrail --create-only
```

## After Deployment

Your services will be available at:
- **Foundry**: `wss://protoverse-<movie>.fly.dev/ws`
- **WS Server**: `wss://protoverse-<movie>.fly.dev:8765`

Use this URL to access:
```
https://cozytheatership.netlify.app?ws=wss://protoverse-<movie>.fly.dev:8765&foundry=wss://protoverse-<movie>.fly.dev/ws
```

## Movie Encoding Recommendations

For best streaming performance, encode movies to 2Mbps:

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -b:v 2M -maxrate 2.5M -bufsize 4M \
  -c:a aac -b:a 128k \
  output.mp4
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

Verify movie file exists in the container:
```bash
fly ssh console -a protoverse-<movie> -C "ls -la /app/movies/"
```
