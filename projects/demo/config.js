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
    urls: {
        useCdn: false,  // Use local /worlds for development
    },
    debug: {
        showFps: true,
        logWorldChanges: false,
    },
};
