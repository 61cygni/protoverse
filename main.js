import { updateHUD, createAudioToggleButton, createCollisionMeshToggleButton, createPhysicsToggleButton, initHud, getAudioEnabled } from "./hud.js";
import { initAudio, playWorldAudio, handleAudioToggle, setCurrentWorldData, ensureAudioContext, getCurrentWorldData } from "./audio.js";
import { initControls, createAnimationLoop } from "./controls.js";
import { ProtoVerse } from "./proto.js";
import { ProtoScene, loadWorldJSON } from "./scene.js";
import { createUrlResolver } from "./paths.js";
import { ProtoverseMultiplayer } from "./multiplayer.js";
import {
    initPhysics, 
    createPlayerBody, 
    setupThrusterInput, 
    updatePhysics, 
    setPhysicsEnabled,
    setDebugSphereVisible
} from "./physics.js";
import { showLoading, updateLoading, hideLoading } from "./loading.js";
import { config } from "./config.js";

// URL resolution
const resolveUrl = createUrlResolver({ urlBase: config.urls.urlBase });

// Root world from config
const rootworld = config.world.rootWorld;

const stats = initHud();
initAudio(resolveUrl);

// ========== Scene Setup ==========
const protoScene = new ProtoScene();
const camera = protoScene.getCamera();
const renderer = protoScene.getRenderer();
const localFrame = protoScene.getLocalFrame();

// ========== ProtoVerse Setup ==========
const protoVerse = new ProtoVerse(protoScene, {
    preloadHops: config.world.preloadHops,
    showPortalLabels: config.portals.showLabels,
    useUrlsForLabels: config.portals.useUrlsForLabels,
    urlBase: config.urls.urlBase,
    useCdn: config.urls.useCdn,
    backgroundPreloadCollision: config.world.backgroundPreloadCollision,
    resolveUrl: resolveUrl,
    onWorldChange: (worldUrl, worldData) => {
        // Handle world change (e.g., play audio)
        setCurrentWorldData(worldData);
        playWorldAudio(worldData);
        // Join the matching multiplayer room when world changes
        if (config.multiplayer.enabled && multiplayer) {
            multiplayer.joinWorld(worldUrl, playerName);
        }
        if (config.debug.logWorldChanges) {
            console.log("World changed:", worldUrl, worldData?.name);
        }
    }
});

// ========== Multiplayer Setup ==========
const playerName = `${config.multiplayer.playerNamePrefix}-${Math.floor(Math.random() * 10000)}`;
const multiplayer = config.multiplayer.enabled 
    ? new ProtoverseMultiplayer(protoScene.getScene(), {
        wsUrl: config.multiplayer.wsUrl || import.meta.env?.VITE_WS_URL,
    })
    : null;

// Start of Execution Here 

// Show loading overlay
showLoading('Loading world data...');

// Load initial world data for camera position, then use DAG to load everything
updateLoading(10, 'Loading world configuration...');
const initialWorldData = await loadWorldJSON(resolveUrl(rootworld));
console.log("main.js: initialWorldData loaded:");
console.log("  keys:", Object.keys(initialWorldData));
console.log("  collisionUrl:", initialWorldData.collisionUrl);
console.log("  bgAudioUrl:", initialWorldData.bgAudioUrl);

// Set initial world data for audio (so clicking audio toggle will play it)
setCurrentWorldData(initialWorldData);

// Set initial camera position from world data
localFrame.position.fromArray(initialWorldData.position);

// Apply starting rotation from config (if specified), otherwise use world.json rotation
if (config.world.startingCameraRotation) {
    const [x, y, z] = config.world.startingCameraRotation;
    // Set localFrame rotation (camera's world rotation = localFrame rotation since camera is a child)
    localFrame.rotation.set(x, y, z);
} else {
    localFrame.quaternion.fromArray(initialWorldData.rotation);
}

// ========== Controls & VR Setup ==========
updateLoading(20, 'Initializing controls...');
const { controls, sparkXr } = initControls(renderer, camera, localFrame, {
    enableVr: config.vr.enabled,
    animatePortal: config.portals.animatePortal,
    xrFramebufferScale: config.vr.framebufferScale,
    onEnterXr: async () => {
        // Resume AudioContext when entering VR (this is a valid user gesture)
        await ensureAudioContext();
        // If audio is enabled, try to start/resume the current world's audio
        if (getAudioEnabled()) {
            const worldData = getCurrentWorldData();
            if (worldData) {
                playWorldAudio(worldData);
            }
        }
        console.log("VR audio context ready");
    },
});

// ========== Physics Setup (before loading worlds so collision meshes get registered) ==========
updateLoading(30, 'Initializing physics...');
await initPhysics();
createPlayerBody(localFrame, camera, protoScene.getScene(), renderer);
setupThrusterInput();

// Initialize ProtoVerse with root world (this will trigger onWorldChange callback)
// NOTE: This must happen AFTER physics is initialized so collision meshes get registered
updateLoading(40, 'Loading world and collision meshes...');
await protoVerse.initialize(rootworld, initialWorldData);

// Hide loading overlay after everything is loaded
hideLoading();

// Create audio toggle button (in HUD)
createAudioToggleButton(handleAudioToggle);

// Create collision mesh toggle button (in HUD, below audio toggle)
// Also controls debug sphere visibility
createCollisionMeshToggleButton((visible) => {
    console.log("Collision mesh visibility:", visible);
    // Also show/hide the player collision debug sphere
    setDebugSphereVisible(visible);
});

// Create physics toggle button (in HUD, below collision mesh toggle)
createPhysicsToggleButton((enabled) => {
    console.log("Physics enabled:", enabled);
    setPhysicsEnabled(enabled);
    
    // Only disable keyboard movement when physics is enabled
    // Keep mouse look (pointerControls) active for camera direction
    if (controls) {
        if (controls.fpsMovement) controls.fpsMovement.enable = !enabled;
        // pointerControls stays enabled for mouse look
    }
}, config.debug.physicsEnabled);

// Enable physics by default if configured (must be after controls are set up)
if (config.debug.physicsEnabled) {
    setPhysicsEnabled(true);
    if (controls && controls.fpsMovement) {
        controls.fpsMovement.enable = false;
    }
}

// ========== Resize Handler ==========
window.addEventListener("resize", () => {
  protoScene.handleResize();
  protoVerse.getPortals().updateAspect(camera.aspect);
});

// ========== Animation Loop ==========
const animationLoop = createAnimationLoop({
    stats: config.debug.showFps ? stats : null,
    controls,
    sparkXr,
    renderer,
    camera,
    localFrame,
    updateHUD: () => updateHUD(camera, protoVerse, rootworld),
    updatePortals: () => protoVerse.updatePortals(),
    updatePortalDisks: (time, isInVR, animatePortal) => protoVerse.updatePortalDisks(time, isInVR, animatePortal),
    updateMultiplayer: config.multiplayer.enabled && multiplayer ? (time) => {
        multiplayer.update(
            time,
            localFrame.position.toArray(),
            localFrame.quaternion.toArray(),
            { playerName }
        );
    } : null,
    updatePhysics: (deltaTime) => updatePhysics(deltaTime),
    animatePortal: config.portals.animatePortal,
});

renderer.setAnimationLoop(animationLoop);

