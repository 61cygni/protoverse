/**
 * ProtoVerse Configuration
 * 
 * Centralized configuration for the entire application.
 * Import this file to access all configuration options.
 */

export const config = {
    // ========== World Settings ==========
    world: {
        // Starting world (relative path from urlBase)
        rootWorld: "/root/world.json",
        
        // Number of portal hops to preload worlds for
        // Higher = more worlds loaded in advance, but more memory/bandwidth
        preloadHops: 2,
        
        // Preload collision meshes for nearby worlds in the background
        // true = faster portal transitions, more bandwidth upfront
        // false = load collision meshes only when entering a world
        backgroundPreloadCollision: true,
        
        // Starting camera rotation (Euler angles in radians: [x, y, z] or [pitch, yaw, roll])
        // null = use rotation from world.json
        startingCameraRotation: [0.06, 3.03, 0.01],
    },
    
    // ========== URL / CDN Settings ==========
    urls: {
        // Use CDN for assets (splats, collision meshes, etc.)
        useCdn: true,
        
        // CDN base URL (used when useCdn is true)
        cdnBase: "https://public-spz.t3.storage.dev",
        
        // Local file base URL (used when useCdn is false)
        localBase: "/worlds",
        
        // Get the active URL base based on useCdn setting
        get urlBase() {
            return this.useCdn ? this.cdnBase : this.localBase;
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
        // Enable multiplayer features
        enabled: false,
        
        // WebSocket server URL (null = use environment variable VITE_WS_URL)
        wsUrl: null,
        
        // Player name prefix (random number appended)
        playerNamePrefix: "player",
    },
    
    // ========== Audio Settings ==========
    audio: {
        // Start with audio enabled
        enabledByDefault: false,
        
        // Thrust sound volume (0.0 - 1.0)
        thrustVolume: 0.5,
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

