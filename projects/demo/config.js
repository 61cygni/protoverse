/**
 * Demo Mode Config Preset
 * 
 * Single-player demo mode with local assets.
 * Use with: npm run dev:demo
 */
export default {
    world: {
        rootWorld: "/cozyship/world.json",
    },
    multiplayer: {
        enabled: false,
    },
    debug: {
        showFps: true,
        logWorldChanges: false,
    },
};
