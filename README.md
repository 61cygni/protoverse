# ProtoVerse

<p align="center">
  <img src="docs/images/header1.png" width="24%" />
  <img src="docs/images/header2.png" width="24%" />
  <img src="docs/images/header3.png" width="24%" />
  <img src="docs/images/header4.png" width="24%" />
</p>

A Web/Mobile/VR (WebXR) metaverse built with Sparkjs and treejs.

## Features

- **Infinite Gaussian Splat Universes** - Dynamically load arbitrarily large
worlds using SparkJS. Worlds are streamed on-demand as you explore, with
automatic loading/unloading based on proximity.

- **Portal System** - Connect worlds by portals supporting distributed hosting.
World DAG can pre-fetch up to N hops.

- **Physics & Collisions** - Rapier.js physics with collision meshes. 

- **Controls** - Intuitive controls for web, VR and mobile.

- **AI Characters** - NPCs framework supporting chat, waypoint navigation, 
and multi-model integration in VR. For example, NPCs can watch movies and
comment on frames. 

- **WebXR/VR Support** - Full Quest 3 compatibility with physics-based
locomotion, VR keyboard, and 3D chat panels.

- **Movie & Screen Streaming** - Support for desktop and window streaming. And video streaming into the 
protoverse.

- **Spatial Audio** - Positional audio sources placed throughout worlds, plus
background music per world.

- **Multiplayer** - Basic support for multiplayer with chat, shared positions, etc.

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Configuration

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

Key settings:
- `VITE_WS_URL` - Multiplayer WebSocket server URL
- `VITE_CDN_URL` - CDN for world assets (leave empty for local)
- `VITE_CONVEX_HTTP_URL` - Convex HTTP endpoint (session discovery + AI proxy)

Edit `config.js` for additional options (world settings, physics, VR, etc.)

## AI Setup (Braintrust)

AI character conversations are powered by [Braintrust](https://braintrust.dev). The prompts are stored in `prompts/` and proxied securely through Convex.

```bash
# 1. Create a Braintrust account and get an API key
# 2. Push the prompts to your Braintrust project
npx braintrust login
npx braintrust push --project-name "protoverse" prompts/

# 3. Set the API key in Convex (server-side, secure)
npx convex env set BRAINTRUST_API_KEY sk-your-key-here
```

See [docs/deployment-guide.md](docs/deployment-guide.md) for full setup instructions.

## Documentation

- [AICodeGuide.md](AICodeGuide.md) - Architecture and code guide
- [docs/deployment-guide.md](docs/deployment-guide.md) - Deployment instructions
- [cinema/README.md](cinema/README.md) - Movie theater setup

## Project Structure

```
├── main.js              # Entry point
├── proto.js             # World/portal management
├── scene.js             # Three.js scene setup
├── characters/          # AI character definitions
├── prompts/             # Braintrust AI prompts (synced via CLI)
├── multiplayer/         # Real-time multiplayer system
├── vr/                  # VR UI (keyboard, chat panels)
├── convex/              # Session tracking + AI proxy backend
├── cinema/              # Movie theater deployment
└── public/worlds/       # World assets and configs
```

## License

MIT License - see [LICENSE](LICENSE)
