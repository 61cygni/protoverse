/**
 * Theater Mode Config Preset
 * 
 * Optimized for movie watching experience.
 * Use with: npm run dev:theater
 */
export default {
    world: {
        rootWorld: "/theatership/world.json",
    },
    multiplayer: {
        enabled: true,
    },
    debug: {
        showFps: false,
        logWorldChanges: false,
        logPortalCrossings: false,
    },
};
