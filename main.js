import { updateHUD, createAudioToggleButton, initHud } from "./hud.js";
import { initAudio, playWorldAudio, handleAudioToggle, setCurrentWorldData } from "./audio.js";
import { initControls, createAnimationLoop } from "./controls.js";
import { ProtoVerse } from "./proto.js";
import { ProtoScene, loadWorldJSON } from "./scene.js";
import { createUrlResolver } from "./paths.js";


const USE_CDN = true;

let urlBase = USE_CDN ? "https://public-spz.t3.storage.dev" : "/worlds"
let urlConfig = { urlBase, useCdn: USE_CDN };
const resolveUrl = createUrlResolver({ urlBase });


// Starting point (relative path - resolved when fetching)
const rootworld = "/root/world.json";

const stats = initHud();
initAudio(resolveUrl);

// ========== Scene Setup ==========
const protoScene = new ProtoScene();
const camera = protoScene.getCamera();
const renderer = protoScene.getRenderer();
const localFrame = protoScene.getLocalFrame();

// ========== ProtoVerse Setup ==========
const protoVerse = new ProtoVerse(protoScene, {
    preloadHops: 2,
    showPortalLabels: false,
    useUrlsForLabels: true,
    urlBase: urlConfig.urlBase,
    useCdn: urlConfig.useCdn,
    resolveUrl: resolveUrl,
    onWorldChange: (worldUrl, worldData) => {
        // Handle world change (e.g., play audio)
        setCurrentWorldData(worldData);
        playWorldAudio(worldData);
    }
});

// Start of Execution Here 

// Load initial world data for camera position, then use DAG to load everything
const initialWorldData = await loadWorldJSON(resolveUrl(rootworld));

// Initialize ProtoVerse with root world (this will trigger onWorldChange callback)
await protoVerse.initialize(rootworld, initialWorldData);

// Set initial camera position from world data
localFrame.position.fromArray(initialWorldData.position);
localFrame.quaternion.fromArray(initialWorldData.rotation);

// Create audio toggle button (in HUD)
createAudioToggleButton(handleAudioToggle);

// ========== Controls & VR Setup ==========
const ANIMATE_PORTAL = true;
const { controls, sparkXr } = initControls(renderer, camera, localFrame, {
    enableVr: true,
    animatePortal: ANIMATE_PORTAL,
    xrFramebufferScale: 0.5,
});

// ========== Resize Handler ==========
window.addEventListener("resize", () => {
  protoScene.handleResize();
  protoVerse.getPortals().updateAspect(camera.aspect);
});

// ========== Animation Loop ==========
const animationLoop = createAnimationLoop({
    stats,
    controls,
    sparkXr,
    renderer,
    camera,
    localFrame,
    updateHUD: () => updateHUD(camera, protoVerse, rootworld),
    updatePortals: () => protoVerse.updatePortals(),
    updatePortalDisks: (time, isInVR, animatePortal) => protoVerse.updatePortalDisks(time, isInVR, animatePortal),
    animatePortal: ANIMATE_PORTAL,
});

renderer.setAnimationLoop(animationLoop);

