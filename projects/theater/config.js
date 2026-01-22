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
    urls: {
        useCdn: true,  // Use CDN for production assets
    },
    features: {
        showCinemaControls: true,  // Theater has movie displays
        showSessionBrowser: true,  // Show list of active sessions to join
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
