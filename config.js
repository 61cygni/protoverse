/**
 * ProtoVerse Configuration
 * 
 * Centralized configuration for the entire application.
 * Import this file to access all configuration options.
 * 
 * Configuration is built from:
 *   1. Base config (defaults defined below)
 *   2. Mode preset (from projects/{mode}/config.js based on --mode flag)
 *   3. Environment variables (from .env and .env.[mode] files)
 * 
 * Usage:
 *   npm run dev              # Default mode
 *   npm run dev:theater      # Theater preset + .env.theater
 *   npm run dev:demo         # Demo preset + .env.demo
 * 
 * Environment variables (set in .env or .env.[mode] files):
 *   VITE_WS_URL - WebSocket server URL for multiplayer
 *   VITE_CDN_URL - CDN base URL for assets
 *   VITE_CONVEX_HTTP_URL - Convex HTTP URL for session discovery
 *   VITE_PROTOVERSE_URL - Public URL for this app (used by lobby)
 * 
 * See .env.example for documentation.
 */

import { presets, deepMerge } from './projects/index.js';

// Current mode (set by vite --mode flag)
const MODE = import.meta.env.MODE || 'development';

// Helper to get env var with fallback
const env = (key, fallback) => import.meta.env?.[key] || fallback;

// Base configuration (defaults)
const baseConfig = {
    // ========== World Settings ==========
    world: {
        // Starting world (relative path from urlBase)
        //rootWorld: "/cozyship/world.json",
        rootWorld: "/theatership/world.json",
        
        // Number of portal hops to preload worlds for
        // Higher = more worlds loaded in advance, but more memory/bandwidth
        preloadHops: 2,
        
        // Preload collision meshes for nearby worlds in the background
        // true = faster portal transitions, more bandwidth upfront
        // false = load collision meshes only when entering a world
        backgroundPreloadCollision: true,
        
        // Wait for all assets (splats, collision meshes, characters) to load before proceeding
        // true = synchronous loading with loading screen (guaranteed no pop-in)
        // false = background loading (faster initial view, assets may pop in)
        waitForFullLoad: true,
        
        // Starting camera rotation (Euler angles in radians: [x, y, z] or [pitch, yaw, roll])
        // null = use rotation from world.json
        startingCameraRotation: [0.06, 3.03, 0.01],
    },
    
    // ========== URL / CDN Settings ==========
    urls: {
        // CDN base URL for assets (splats, collision meshes, etc.)
        // Set VITE_CDN_URL in .env
        cdnBase: env('VITE_CDN_URL', ''),
        
        // Local file base URL (used when useCdn is false or cdnBase is empty)
        localBase: "/worlds",
        
        // Use CDN for assets (can be overridden by preset to force local)
        // Set to false in a preset to always use local files regardless of VITE_CDN_URL
        useCdn: true,
        
        // Get the active URL base
        // Returns localBase if useCdn is false, otherwise cdnBase (or localBase if cdnBase is empty)
        get urlBase() {
            if (!this.useCdn) return this.localBase;
            return this.cdnBase || this.localBase;
        }
    },
    
    // ========== Portal Settings ==========
    portals: {
        // Show text labels on portals
        showLabels: false,
        
        // Use full URLs for portal labels (vs world names)
        useUrlsForLabels: true,
        
        // Animate portal disks (swirling effect)
        animatePortal: true,
    },
    
    // ========== VR Settings ==========
    vr: {
        // Enable VR support
        enabled: true,
        
        // Framebuffer scale for VR rendering (0.5 = half resolution, better performance)
        // 1.0 = full resolution
        framebufferScale: 0.5,
        
        // Enable full 3DOF rotation in VR (pitch, yaw, roll)
        // false = yaw only (easier to orient)
        fullRotation: false,
    },
    
    // ========== Multiplayer Settings ==========
    multiplayer: {
        // Enable multiplayer features (set to true in preset for multiplayer worlds)
        enabled: false,
        
        // WebSocket server URL
        // Set VITE_WS_URL in .env for production
        wsUrl: env('VITE_WS_URL', 'ws://localhost:8765'),
        
        // Player name prefix (random number appended)
        playerNamePrefix: "player",
    },
    
    // ========== Lobby / Session Discovery ==========
    lobby: {
        // Convex HTTP URL for session discovery and AI proxy
        // Set VITE_CONVEX_HTTP_URL in .env (not VITE_CONVEX_URL - that's managed by Convex)
        convexUrl: env('VITE_CONVEX_HTTP_URL', ''),
        
        // Public URL where Protoverse is hosted (for join links)
        // Set VITE_PROTOVERSE_URL in .env
        protoverseUrl: env('VITE_PROTOVERSE_URL', 'http://localhost:3000'),
    },
    
    // ========== Audio Settings ==========
    audio: {
        // Start with audio enabled
        enabledByDefault: false,
        
        // Thrust sound volume (0.0 - 1.0)
        thrustVolume: 0.5,
    },
    
    // ========== AI Settings ==========
    ai: {
        // Enable AI chat features (requires VITE_BRAINTRUST_API_KEY)
        enabled: true,
        
        // Braintrust project name
        projectName: "protoverse",
    },
    
    // ========== Feature Toggles ==========
    features: {
        // Show cinema/movie controls (Foundry toggle, cinema mode, playback pause)
        // Set to true in preset for worlds with video displays (e.g., theater)
        showCinemaControls: false,
    },
    
    // ========== Debug Settings ==========
    debug: {
        // Show FPS counter
        showFps: true,
        
        // Log world changes to console
        logWorldChanges: true,
        
        // Log portal crossings to console
        logPortalCrossings: true,
        
        // Show collision meshes by default
        showCollisionMeshes: false,
        
        // Enable physics by default
        physicsEnabled: true,
    },
};

// Apply mode preset (if any)
const preset = presets[MODE] || {};

// Final config: base merged with preset
// Environment variables are already applied in baseConfig via env() calls
export const config = deepMerge(baseConfig, preset);

// Log active mode in development
if (import.meta.env.DEV) {
    console.log(`[Config] Mode: ${MODE}${preset ? ` (preset applied)` : ''}`);
    console.log(`[Config] urls.useCdn: ${config.urls.useCdn}, urlBase: ${config.urls.urlBase}`);
    console.log(`[Config] world.rootWorld: ${config.world.rootWorld}`);
    if (preset.world) {
        console.log(`[Config] preset.world.rootWorld: ${preset.world.rootWorld}`);
    }
}

/**
 * Helper to get a config value by dot-notation path
 * @param {string} path - e.g., "world.rootWorld" or "urls.useCdn"
 * @returns {any}
 */
export function getConfig(path) {
    const parts = path.split('.');
    let obj = config;
    for (const part of parts) {
        obj = obj?.[part];
        if (obj === undefined) {
            console.warn(`Config path not found: ${path}`);
            return undefined;
        }
    }
    return obj;
}

/**
 * Helper to set a config value by dot-notation path
 * @param {string} path - e.g., "world.rootWorld"
 * @param {any} value - New value
 */
export function setConfig(path, value) {
    const parts = path.split('.');
    let obj = config;
    for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]];
        if (!obj) {
            console.warn(`Config path not found: ${path}`);
            return;
        }
    }
    obj[parts[parts.length - 1]] = value;
    console.log(`Config updated: ${path} = ${value}`);
}

// Re-export physics config for convenience
export { physicsConfig, setPhysicsConfig, getPhysicsConfig } from "./physics-config.js";

