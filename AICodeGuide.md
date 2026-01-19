# ProtoVerse AI Code Guide

This document is designed for AI assistants working on this codebase. It explains the architecture, conventions, and common pitfalls to help you work effectively.

## Project Overview

ProtoVerse is a WebXR-enabled 3D world explorer built with Three.js and Gaussian Splatting. Users can navigate through interconnected worlds via portals, interact with animated characters, watch synchronized movies, and experience physics-based movement in multiplayer VR.

**Key Technologies:**
- **Three.js** - 3D rendering
- **SparkJS** (`@sparkjsdev/spark`) - Gaussian Splatting renderer, VR support, portal system
- **Rapier.js** - Physics engine
- **Vite** - Build tool
- **WebXR** - VR support (Quest 3 tested)
- **Convex** - Real-time backend for session tracking
- **Fly.io** - Cinema backend hosting (streaming + multiplayer)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                           main.js                                │
│  Entry point: creates scene, controls, protoverse, starts loop  │
└─────────────────────────────────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
   │  scene.js   │         │  proto.js   │         │ controls.js │
   │ ProtoScene  │         │ ProtoVerse  │         │   Input     │
   │ Three.js    │         │ World/Portal│         │  Handling   │
   │ setup       │         │ management  │         │             │
   └─────────────┘         └─────────────┘         └─────────────┘
          │                       │
          │                       ├── verse-dag.js (World graph)
          │                       ├── world-state.js (Per-world state)
          │                       └── character-manager.js (NPCs)
          │
          └── Uses SparkJS for:
              - SplatMesh (Gaussian splats)
              - SparkPortals (portal rendering)
              - SparkXr (VR support)
              - SparkControls (camera movement)
              - textSplats (3D text rendering)

┌─────────────────────────────────────────────────────────────────┐
│                    Multiplayer System                            │
├─────────────────────────────────────────────────────────────────┤
│  multiplayer/session-manager.js  ←→  Fly.io WS Server           │
│  multiplayer/multiplayer.js      ←→  Peer avatar sync           │
│  multiplayer/character-sync.js   ←→  NPC state broadcast        │
│  multiplayer/host-controls.js    ←→  Session UI                 │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Convex (Session Registry)                     │
│  convex/sessions.ts - Session CRUD, heartbeats                  │
│  public/lobby/index.html - Real-time session browser            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### 1. World System

**Worlds** are defined in `public/worlds/<world-name>/world.json`:

```json
{
  "name": "World Name",
  "splatUrl": "/worldname/splats/world-lod-0.spz",
  "collisionUrl": "/worldname/collision.glb",
  "bgAudioUrl": "/worldname/ambient.mp3",
  "position": [x, y, z],
  "rotation": [qx, qy, qz, qw],
  "portals": [...],
  "characters": [...],
  "foundryDisplays": [...],
  "waypointGraph": [...]
}
```

- **splatUrl**: Gaussian splat file (.spz format)
- **collisionUrl**: GLB mesh for physics collisions
- **position/rotation**: Camera starting position in this world
- **foundryDisplays**: Video streaming screens (see Foundry section)
- **waypointGraph**: NPC navigation paths

### 2. WorldNo System

Each loaded world gets a unique `worldno` (0, 1, 2, ...). This is used for:
- **Coordinate transforms**: `worldToUniverse()` offsets positions so multiple worlds don't overlap
- **Physics separation**: Each world's collision mesh is registered with its worldno

**Important**: Root world is always `worldno = 0`. Non-root worlds get positive numbers.

### 3. Local Frame

The `localFrame` is a `THREE.Group` that contains the camera. This is crucial:
- Moving the player = moving `localFrame`
- Camera rotation is set on `localFrame.rotation` for FPS-style controls
- VR uses `localFrame` as the XR reference space
- Audio listener should be attached to `localFrame`, not camera

### 4. Portal System

Portals use SparkJS's `SparkPortals` class with custom `ProtoPortal` wrappers:
- Portals are bidirectional pairs (entry ↔ exit)
- Crossing a portal triggers `syncWorldsFromDag()` to load/unload worlds
- The `VerseDag` tracks which worlds are reachable within N hops

### 5. Character System

Characters are defined in `characters/*.js` and registered in `characters/index.js`.

**Character Definition Structure:**
```javascript
export const MyCharacter = {
  id: "my-char",           // Unique identifier
  name: "My Character",    // Display name
  
  animations: {
    idle: { file: "/world/chars/char/idle.fbx", loop: true },
    walk: { file: "/world/chars/char/walk.fbx", loop: true },
  },
  
  sounds: {
    greeting: { file: "/world/chars/char/hi.mp3", positional: false },
  },
  
  defaultState: "idle",
  defaultScale: 0.01,
  proximityDistance: 5.0,
  
  states: {
    idle: { animation: 'idle', transitions: [...] },
    walk: { animation: 'walk', transitions: [...] },
  },
  
  onSpawn: (instance, manager) => { ... },
  onUpdate: (instance, deltaTime, context) => { ... },
  onProximityEnter: (instance, manager, playerPosition) => { ... },
  onProximityExit: (instance, manager, playerPosition) => { ... },
};
```

**Instance Data** (from world.json):
```json
{
  "name": "Character Instance Name",
  "type": "my-char",
  "position": [x, y, z],
  "rotation": [qx, qy, qz, qw],
  "scale": 0.01,
  "waypointGraph": [
    { "id": "start", "pos": [x,y,z], "edges": ["waypoint2"] },
    { "id": "waypoint2", "pos": [x,y,z], "edges": ["start", "waypoint3"], "isCinemaSpot": true }
  ]
}
```

### 6. Waypoint Graph System

Characters like Y-Bot use a DAG (Directed Acyclic Graph) for natural wandering:

```javascript
// In world.json, define waypointGraph per character instance
"waypointGraph": [
  { "id": "start", "pos": [-7.86, 4.99, 6.05], "edges": ["door"] },
  { "id": "door", "pos": [-7.86, 4.99, 1.05], "edges": ["start", "hallway"] },
  { "id": "theater-rug", "pos": [...], "edges": [...], "isCinemaSpot": true }
]
```

**Behavior:**
- At each node, pick random edge (excluding previous node to avoid backtracking)
- 20% chance to pause at a node (1-5 seconds)
- `isCinemaSpot: true` marks where the character goes in cinema mode
- Safety checks prevent characters from walking off into space

### 7. Foundry Streaming

Foundry is a custom Rust server for video streaming (H.264 over WebSocket).

**Server**: `~/projects/foundry/foundry-player/` - Rust application
**Client**: `foundry-share.js` + `public/foundry-worker.js`

```json
// world.json
"foundryDisplays": [
  {
    "name": "Screen Share",
    "wsUrl": "wss://protoverse-bigtrouble.fly.dev/ws",
    "position": [-13.33, 6.5, -0.06],
    "width": 3.5,
    "aspectRatio": 1.777,
    "vrCommentaryPanel": {
      "offsetX": 0,
      "offsetY": -1.0,
      "offsetZ": 0.3,
      "width": 5.4
    }
  }
]
```

The `vrCommentaryPanel` configures where Y-Bot's movie commentary appears (subtitle-style at bottom of screen).

### 8. AI Chat System

Characters can have AI-powered conversations using Braintrust, proxied through Convex for security.

**Desktop**: `chat-ui.js` - 2D overlay chat window
**VR**: `vr-chat.js` + `vr-keyboard.js` + `vr-chat-panel.js` - 3D keyboard/panel

**Prompts**: Stored in `prompts/` directory, synced with Braintrust via CLI:
```bash
npx braintrust push --project-name "protoverse" prompts/
```

**Configuration:**
- `config.js`: `ai.enabled`, `ai.projectName`
- Character: `CHAT.promptSlug` for Braintrust prompt ID
- Convex: `BRAINTRUST_API_KEY` environment variable (server-side, secure)

**Architecture:**
```
Browser (ai/bt.js) → Convex (/ai/invoke, /ai/stream) → Braintrust API
                         ↑                                    ↑
                    API key stored here              prompts/ synced here
```

**Flow:**
1. Player approaches character → `onProximityEnter`
2. `stopPlayerMovement()` halts player
3. `showChat()` (desktop) or `startVRChat()` (VR)
4. User types → `getChatResponse()` → Convex proxy → Braintrust streaming
5. Response appears via `startStreamingMessage()` / `appendToStreamingMessage()`

### 9. Multiplayer System

Real-time multiplayer with host/viewer model:

**Components:**
- `multiplayer/session-manager.js` - WebSocket client, session state
- `multiplayer/multiplayer.js` - Peer avatar rendering
- `multiplayer/character-sync.js` - NPC state broadcast (host → viewers)
- `multiplayer/host-controls.js` - Session creation UI
- `multiplayer/ws-server.js` - Server (runs on Fly.io)

**Session Flow:**
1. Host creates session → gets 6-char code (e.g., `HYG2CQ`)
2. Session registered with Convex for discovery
3. Host shares URL with `?session=CODE&ws=...&foundry=...`
4. Viewers join via URL → auto-join if `session` param present
5. Host broadcasts: position, rotation, movie state, NPC state
6. Viewers receive updates, render peer avatars

**Key Events:**
- `session-created` / `session-joined` / `session-error`
- `state-update` - Player position/rotation
- `character-state` - NPC sync (position, animation, commentary)
- `foundry-state` - Movie playback state
- `request-full-state` - Viewer requests immediate sync on join

### 10. Splat Dialog Box (VR Commentary)

3D text rendering using SparkJS `textSplats` for movie commentary:

```javascript
import { showSplatCommentary, hideSplatCommentary } from './splat-dialog-box.js';

// Show commentary at screen position
showSplatCommentary(
  "Great scene!", 
  "Y-Bot",
  screenPosition,    // THREE.Vector3
  screenRotation,    // THREE.Quaternion (optional)
  { offsetY: -1.0, offsetZ: 0.3 }  // Position offsets
);
```

- Uses splat-based text that composes well with Gaussian splats
- Positioned relative to Foundry display (subtitle-style)
- Has outline effect for readability against movie backgrounds

### 11. Convex Integration

Convex provides two services:
1. **Session Registry** - Real-time session tracking for multiplayer lobby
2. **AI Proxy** - Secure proxy for Braintrust API calls (keeps API key server-side)

**Schema** (`convex/schema.ts`):
```typescript
sessions: defineTable({
  code: v.string(),
  hostName: v.string(),
  movieTitle: v.string(),
  flyApp: v.string(),
  wsUrl: v.string(),
  foundryUrl: v.string(),
  viewerCount: v.number(),
  maxViewers: v.number(),
  lastHeartbeat: v.number(),
})
```

**Functions** (`convex/sessions.ts`):
- `registerSession` - Create/update session
- `heartbeat` - Keep session alive
- `endSession` - Remove session
- `listActiveSessions` - Query all active sessions

**HTTP Actions** (`convex/http.ts`):
- `POST /session/register` - Register new session
- `POST /session/heartbeat` - Keep session alive
- `POST /session/end` - End session
- `GET /sessions` - List active sessions
- `POST /ai/invoke` - Proxy Braintrust call (non-streaming)
- `POST /ai/stream` - Proxy Braintrust call (streaming)

**Environment Variables** (set in Convex dashboard):
- `BRAINTRUST_API_KEY` - Braintrust API key for AI chat

WS server calls session endpoints via `CONVEX_HTTP_URL` environment variable.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `main.js` | Entry point, creates all managers, starts render loop |
| `config.js` | Centralized configuration (world, VR, multiplayer, debug, AI) |
| `scene.js` | `ProtoScene` class - Three.js scene/camera/renderer setup |
| `proto.js` | `ProtoVerse` class - World loading, portals, DAG sync |
| `verse-dag.js` | `VerseDag` - Graph of world connections |
| `world-state.js` | `WorldState` - Per-world runtime state |
| `character-manager.js` | `CharacterManager` - NPC spawning, animation, state machine |
| `characters/index.js` | Character registry |
| `characters/ybot.js` | Y-Bot character with cinema mode + AI commentary |
| `physics.js` | Rapier physics integration, `stopPlayerMovement()` |
| `physics-config.js` | Physics parameters (thrust, bounce, drag) |
| `controls.js` | Input handling (keyboard, mouse, VR controllers) |
| `hud.js` | UI elements (FPS, buttons, movie controls) |
| `loading.js` | Loading progress bar |
| `audio.js` | Background audio management |
| `spatial-audio.js` | Positional audio sources from world.json |
| `coordinate-transform.js` | `worldToUniverse()` transform |
| `port.js` | `ProtoPortal` class |
| `sparkdisk.js` / `sparkring.js` | Portal visual effects |
| **Streaming** | |
| `foundry-share.js` | Foundry video/audio streaming client |
| `public/foundry-worker.js` | WebCodecs H.264 decoder worker |
| `splat-dialog-box.js` | 3D splat-based text for VR commentary |
| **AI Chat** | |
| `chat-ui.js` | Desktop 2D chat interface |
| `ai/chat-provider.js` | Chat response abstraction (AI or stock) |
| `ai/bt.js` | Braintrust API integration (via Convex proxy) |
| `prompts/` | Braintrust prompts (synced via `npx braintrust push`) |
| **VR Chat** | |
| `vr-chat.js` | VR chat system orchestrator |
| `vr-keyboard.js` | 3D virtual keyboard for VR |
| `vr-chat-panel.js` | 3D chat message display panel |
| **Multiplayer** | |
| `multiplayer/session-manager.js` | WebSocket client, session state |
| `multiplayer/multiplayer.js` | Peer avatar rendering |
| `multiplayer/avatar.js` | GhostAvatar - procedural splat avatars |
| `multiplayer/character-sync.js` | NPC state broadcast |
| `multiplayer/host-controls.js` | Session creation UI |
| `multiplayer/ws-server.js` | WebSocket server (for Fly.io) |
| `multiplayer/multiplayer-panel.js` | HUD panel for multiplayer info |
| **Convex** | |
| `convex/schema.ts` | Database schema |
| `convex/sessions.ts` | Session CRUD functions |
| `convex/http.ts` | HTTP endpoints for WS server + AI proxy |
| `convex/ai.ts` | Braintrust API proxy (keeps API key server-side) |
| `convex/crons.ts` | Scheduled cleanup jobs |
| `public/lobby/index.html` | Session browser UI |

---

## Cinema Deployment

The `projects/theater/` directory contains everything for deploying movie theaters:

```
projects/theater/
├── deploy.sh              # Build & deploy Fly.io backend
├── theater-deploy.sh      # Full deployment (CDN + Fly + Netlify)
├── list-theaters.sh       # List deployed Fly.io instances
├── start-backend.sh       # Local backend for development
├── setup-local-vr.sh      # ADB port forwarding for Quest
├── fly.template.toml      # Fly.io config template
├── Dockerfile.cinema      # Docker image for cinema backend (Rust + Node)
├── entrypoint.sh          # Container startup script
├── <movie>/               # Per-movie directories
│   ├── metadata.json      # Movie title, description
│   └── movie/
│       └── movie.mp4
└── README.md
```

**Deploy a new movie:**
```bash
# Full deployment (uploads CDN, builds Fly, deploys Netlify)
./projects/theater/theater-deploy.sh bigtrouble

# Or just the Fly.io backend
./projects/theater/deploy.sh bigtrouble --app-name protoverse-bigtrouble
```

**Movie metadata** (`projects/theater/<movie>/metadata.json`):
```json
{
  "title": "Big Trouble in Little China",
  "description": "Jack Burton and the Pork Chop Express find trouble",
  "year": 1986
}
```

**Runtime configuration** (Fly.io secrets):
```bash
# Set movie start time without redeploying
fly secrets set START_TIME=3600 -a protoverse-bigtrouble
```

---

## Common Patterns

### URL Resolution

Asset URLs in world.json are relative to `/worlds/`. Use `resolveUrl()`:

```javascript
// In world.json: "splatUrl": "/root/splats/root.spz"
// Resolves to: "/worlds/root/splats/root.spz"
const fullUrl = resolveUrl("/root/splats/root.spz");
```

### State Machine Transitions

Characters can trigger state transitions via the manager:

```javascript
// In onUpdate or onProximityEnter:
if (manager && instance.currentState !== MyStates.GREETING) {
    manager.transitionToState(instance, MyStates.GREETING);
}
```

### Playing Sounds

```javascript
// In character hooks:
if (manager) {
    manager.playSound(instance, 'greeting');
}
```

### Overriding Animation Root Motion

Mixamo animations often include root motion. Override in `onUpdate`:

```javascript
onUpdate: (instance, deltaTime, context) => {
    // Calculate your own position
    state.controlledPosition.addScaledVector(forward, speed * deltaTime);
    
    // Override animation's position
    model.position.copy(state.controlledPosition);
    model.rotation.set(0, state.currentRotation, 0);
}
```

### Broadcasting Character State (Multiplayer)

```javascript
// In character onUpdate (host only):
if (window.characterSyncBroadcast && isHost) {
    window.characterSyncBroadcast(instance.definition.id, {
        position: model.position.toArray(),
        rotation: [model.quaternion.x, model.quaternion.y, model.quaternion.z, model.quaternion.w],
        animation: instance.currentState,
        comment: state.currentComment,
        screenPosition: state.screenPosition?.toArray(),
        screenRotation: state.screenRotation ? [state.screenRotation.x, ...] : null,
    });
}
```

---

## Common Gotchas & Lessons Learned

### 1. Rotation: Use `model.rotation.set(0, y, 0)` not `model.rotation.y = y`

When a model has a quaternion set (from world.json), setting only `rotation.y` may not work correctly. Always use:
```javascript
model.rotation.set(0, yRotation, 0);
```

### 2. Mixamo Characters Face +Z

Mixamo exports face +Z (not Three.js default -Z). Forward direction:
```javascript
// Correct for Mixamo:
forwardDir.set(Math.sin(rotation), 0, Math.cos(rotation));

// NOT this (would be backwards):
// forwardDir.set(-Math.sin(rotation), 0, -Math.cos(rotation));
```

### 3. FBX Cloning Requires SkeletonUtils

When caching/cloning animated FBX models:
```javascript
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
const clone = SkeletonUtils.clone(originalModel);
```

Regular `.clone()` breaks bone references.

### 4. Positional Audio Can Be Distorted

If spatial audio sounds distorted, try:
```javascript
sounds: {
    mySound: {
        file: "...",
        positional: false,  // Disable spatialization
    }
}
```

### 5. Scene Traversal is Expensive

Don't do `scene.traverse()` every frame. Cache results:
```javascript
// BAD - every frame:
onUpdate: () => {
    scene.traverse(child => { ... }); // Very slow!
}

// GOOD - cache and refresh periodically:
let cachedMeshes = [];
let lastCacheTime = 0;
if (now - lastCacheTime > 2000) {
    cachedMeshes = [];
    scene.traverse(child => cachedMeshes.push(child));
    lastCacheTime = now;
}
```

### 6. Instance Data vs Definition

- `instance.definition` - The character type definition (shared)
- `instance.instanceData` - The specific instance config from world.json
- `instance.stateData` - Runtime state you create in `onSpawn`

### 7. Rapier Physics "Sleeping"

Rapier puts slow-moving bodies to sleep, causing abrupt stops. Disable if needed:
```javascript
rigidBodyDesc.setCanSleep(false);
```

### 8. AudioContext Requires User Gesture

For VR audio, ensure AudioContext is resumed with a user gesture:
```javascript
if (audioContext.state === 'suspended') {
    audioContext.resume();
}
```

### 9. worldToUniverse for Non-Root Worlds

Characters/objects in non-root worlds need coordinate transform:
```javascript
if (worldno !== 0) {
    const universePos = worldToUniverse(localPos, worldno);
    model.position.copy(universePos);
}
```

### 10. Loading Order Matters

In `character-manager.js`, the order is:
1. Load FBX model
2. Set position/rotation
3. Set up animation mixer
4. Set up sounds (before onSpawn!)
5. Call `onSpawn`
6. Start initial animation

### 11. Multiplayer State Serialization

When syncing THREE.js objects over WebSocket, convert to arrays:
```javascript
// Sending:
position: model.position.toArray(),
rotation: [q.x, q.y, q.z, q.w],

// Receiving (in character-sync.js):
const pos = new THREE.Vector3().fromArray(charState.position);
const rot = new THREE.Quaternion().fromArray(charState.rotation);
```

### 12. Fly.io Single Machine Requirement

For multiplayer sessions to work correctly, Fly.io must run only ONE machine (in-memory session state):
```toml
# fly.template.toml
[http_service]
  max_machines_running = 1
```

### 13. VR Commentary Needs 3D Splat Text

Canvas-texture-based text doesn't compose well with Gaussian splats in VR. Use `SplatDialogBox` with `textSplats` for readable commentary.

---

## Configuration System

All config is in `config.js`. Access via:

```javascript
import { config } from './config.js';

// Direct access:
config.world.rootWorld
config.debug.physicsEnabled

// Or via helper:
import { getConfig, setConfig } from './config.js';
getConfig('world.rootWorld');
setConfig('debug.showFps', true);
```

**Key Config Sections:**
- `world` - Root world, preload hops, loading behavior
- `urls` - CDN vs local, base URLs
- `portals` - Labels, animation
- `vr` - Enabled, framebuffer scale, rotation mode
- `multiplayer` - WebSocket config
- `audio` - Default state, volumes
- `debug` - FPS, logging, physics toggle
- `ai` - Enabled, project name

---

## Adding a New Character

1. **Create FBX animations** in `public/worlds/<world>/characters/<char>/`

2. **Create character definition** in `characters/<char>.js`:
   - Define states, animations, sounds
   - Implement `onSpawn`, `onUpdate`, proximity handlers

3. **Register in `characters/index.js`**:
   ```javascript
   import { MyCharacter } from './my-char.js';
   export const characterRegistry = {
       // ...existing...
       "my-char": MyCharacter,
   };
   ```

4. **Add to world.json**:
   ```json
   "characters": [{
       "name": "My Character",
       "type": "my-char",
       "position": [0, 0, 0],
       "rotation": [0, 0, 0, 1],
       "scale": 0.01
   }]
   ```

---

## Testing & Development

- **Local frontend**: `npm run dev` (Vite dev server)
- **Local backend**: `./projects/theater/start-backend.sh <movie>` (WS server + Foundry)
- **VR testing**: Quest 3 browser → `http://<local-ip>:3000`
- **VR USB debugging**: `./projects/theater/setup-local-vr.sh` (ADB port forwarding)
- **Collision mesh editing**: `tools/collision-editor.html`
- **Physics tuning**: Adjust `physics-config.js`

**Debugging:**
```javascript
// In browser console:
debugSessionState()  // Show current session info
debugSessions()      // Query server for all sessions
```

---

## Deployment

See `docs/deployment-guide.md` for comprehensive instructions.

**Quick Overview:**

| Component | Platform | Command |
|-----------|----------|---------|
| Frontend | Netlify | `netlify deploy --prod` |
| Cinema Backend | Fly.io | `./projects/theater/deploy.sh <movie>` |
| Session Registry | Convex | `npx convex deploy` |
| Assets | Tigris CDN | `scripts/local/upload-worlds-to-tigris.sh` |

**Full deployment:**
```bash
./projects/theater/theater-deploy.sh bigtrouble --netlify-site cozytheatership
```

**Directory Structure:**
```
scripts/local/           # User-specific scripts (gitignored)
projects/theater/                  # Theater deployment scripts
convex/                  # Convex backend functions
public/lobby/            # Session browser (deployed with frontend)
docs/deployment-guide.md # Detailed deployment docs
```

---

## Tips for AI Assistants

1. **Read relevant files before making changes** - especially `character-manager.js` for character work, `proto.js` for world/portal work, `multiplayer/` for session work.

2. **Test coordinate systems** - Position bugs are common. Log positions liberally.

3. **Check console for errors** - Many issues show up as Three.js or FBX loader warnings.

4. **Preserve user's manual edits** - If user modified world.json positions/rotations, don't overwrite them.

5. **Keep it simple** - Avoid over-engineering. Single-purpose functions, minimal abstraction.

6. **Performance matters** - VR needs 72+ FPS. Avoid per-frame allocations and traversals.

7. **Use existing patterns**:
   - `timeless.js` - Walking characters with sounds
   - `old-man.js` - Proximity reactions  
   - `ybot.js` - Waypoint graph pathing + AI commentary + cinema mode

8. **VR coordinate spaces** - WebXR poses are in XR reference space. Transform to world space via `localFrame.matrixWorld` before using in Three.js. See `vr-chat.js` for examples.

9. **AI is optional** - Chat features require `BRAINTRUST_API_KEY` set in Convex. Always check `config.ai.enabled` and fall back gracefully to stock phrases.

10. **Multiplayer is host-authoritative** - NPCs run only on host. Viewers receive state via `character-sync.js`.

11. **Check Fly.io logs** - `fly logs -a <app-name>` for backend debugging.

12. **Git safety** - Never run destructive git commands (`reset --hard`, `clean -fd`) without explicit user approval.

---

*Last updated: January 2026*
