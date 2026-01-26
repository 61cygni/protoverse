import * as THREE from "three";
import Stats from "stats.js";
import { universeToWorld } from "./coordinate-transform.js";

// ========== Stats (FPS Graph) ==========
let stats = null;

/**
 * Initialize HUD elements (stats FPS graph)
 * @returns {Stats} Stats instance for use in animation loop
 */
export function initHud() {
    stats = new Stats();
    // Position stats FPS graph on the right side to avoid overlap with audio toggle
    stats.dom.style.cssText = 'position: fixed; top: 10px; right: 10px;';
    document.body.appendChild(stats.dom);
    return stats;
}

/**
 * Get the stats instance
 * @returns {Stats} Stats instance
 */
export function getStats() {
    return stats;
}

// ========== Position HUD ==========
const hud = document.createElement("div");
hud.style.cssText = `
  position: fixed;
  bottom: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: #0f0;
  font-family: monospace;
  font-size: 14px;
  padding: 8px 12px;
  border-radius: 4px;
  z-index: 1000;
  white-space: pre;
`;
document.body.appendChild(hud);

/**
 * Show/hide the bottom-left HUD panel
 * @param {boolean} visible
 */
export function setHudPanelVisible(visible) {
    hud.style.display = visible ? "block" : "none";
}

// ========== Audio Toggle Button ==========
let audioEnabled = false; // Default to audio off (user must click to enable - required for VR)
let audioToggleCallback = null; // Callback function when audio is toggled

// ========== Collision Mesh Toggle ==========
let collisionMeshVisible = false; // Default to hidden
let collisionMeshToggleCallback = null;
const collisionMeshListeners = new Set();

/**
 * Create audio toggle button in upper left
 * @param {Function} onToggle - Callback function called when audio is toggled (receives new state: boolean)
 * @param {boolean} initialEnabled - Initial audio state (default: false)
 */
export function createAudioToggleButton(onToggle, initialEnabled = false) {
    audioToggleCallback = onToggle;
    audioEnabled = initialEnabled;
    
    // If initially enabled, trigger the callback so audio system knows
    // (Note: actual playback may still require user interaction due to browser policies)
    if (initialEnabled && audioToggleCallback) {
        // Delay slightly to ensure audio system is ready
        setTimeout(() => {
            audioToggleCallback(true);
            audioListeners.forEach(callback => callback(true));
        }, 100);
    }
    
    const button = document.createElement("button");
    button.id = "audio-toggle";
    button.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid rgba(255, 255, 255, 0.5);
        border-radius: 50%;
        color: white;
        font-size: 20px;
        cursor: pointer;
        z-index: 1001;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    `;
    button.addEventListener("click", () => {
        audioEnabled = !audioEnabled;
        updateAudioToggleButton();
        if (audioToggleCallback) {
            audioToggleCallback(audioEnabled);
        }
        // Notify all listeners
        audioListeners.forEach(callback => callback(audioEnabled));
    });
    button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(0, 0, 0, 0.9)";
        button.style.borderColor = "rgba(255, 255, 255, 0.8)";
    });
    button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(0, 0, 0, 0.7)";
        button.style.borderColor = "rgba(255, 255, 255, 0.5)";
    });
    
    updateAudioToggleButton(button);
    document.body.appendChild(button);
}

/**
 * Update the audio toggle button icon
 */
function updateAudioToggleButton(button = null) {
    const btn = button || document.getElementById("audio-toggle");
    if (!btn) return;
    
    // Use Unicode symbols for audio icons
    // 🔊 = speaker with sound, 🔇 = muted speaker
    btn.textContent = audioEnabled ? "🔊" : "🔇";
    btn.title = audioEnabled ? "Audio: ON (click to mute)" : "Audio: OFF (click to unmute)";
}

/**
 * Get current audio enabled state
 */
export function getAudioEnabled() {
    return audioEnabled;
}

/**
 * Set audio enabled state (updates button icon)
 */
export function setAudioEnabled(enabled) {
    audioEnabled = enabled;
    updateAudioToggleButton();
}

// Audio toggle listeners
const audioListeners = new Set();

/**
 * Register a listener for audio toggle events
 * @param {Function} callback - Called with (isEnabled: boolean)
 */
export function onAudioToggle(callback) {
    audioListeners.add(callback);
}

/**
 * Unregister an audio toggle listener
 */
export function offAudioToggle(callback) {
    audioListeners.delete(callback);
}

// ========== Collision Mesh Toggle Functions ==========

/**
 * Create collision mesh toggle button (below audio toggle)
 * @param {Function} onToggle - Callback function called when collision mesh visibility is toggled
 */
export function createCollisionMeshToggleButton(onToggle) {
    collisionMeshToggleCallback = onToggle;
    
    const button = document.createElement("button");
    button.id = "collision-toggle";
    button.style.cssText = `
        position: fixed;
        top: 60px;
        left: 10px;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid rgba(255, 255, 255, 0.5);
        border-radius: 50%;
        color: white;
        font-size: 18px;
        cursor: pointer;
        z-index: 1001;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    `;
    button.addEventListener("click", () => {
        collisionMeshVisible = !collisionMeshVisible;
        console.log("Collision toggle clicked, new state:", collisionMeshVisible);
        console.log("  Notifying", collisionMeshListeners.size, "listener(s)");
        updateCollisionMeshToggleButton();
        if (collisionMeshToggleCallback) {
            collisionMeshToggleCallback(collisionMeshVisible);
        }
        // Notify all registered listeners
        collisionMeshListeners.forEach(cb => cb(collisionMeshVisible));
    });
    button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(0, 0, 0, 0.9)";
        button.style.borderColor = "rgba(255, 255, 255, 0.8)";
    });
    button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(0, 0, 0, 0.7)";
        button.style.borderColor = "rgba(255, 255, 255, 0.5)";
    });
    
    updateCollisionMeshToggleButton(button);
    document.body.appendChild(button);
}

/**
 * Update the collision mesh toggle button icon
 */
function updateCollisionMeshToggleButton(button = null) {
    const btn = button || document.getElementById("collision-toggle");
    if (!btn) return;
    
    // Use Unicode symbols: 🔲 (collision on) or ⬜ (collision off)
    btn.textContent = collisionMeshVisible ? "🔲" : "⬜";
    btn.title = collisionMeshVisible
        ? "Wireframe collision mesh: VISIBLE (click to hide)"
        : "Wireframe collision mesh: HIDDEN (click to show)";
}

/**
 * Get current collision mesh visibility state
 */
export function getCollisionMeshVisible() {
    return collisionMeshVisible;
}

/**
 * Set collision mesh visibility state (updates button icon)
 */
export function setCollisionMeshVisible(visible) {
    collisionMeshVisible = visible;
    updateCollisionMeshToggleButton();
}

/**
 * Register a listener for collision mesh visibility changes
 * @param {Function} callback - Called with (isVisible: boolean)
 */
export function onCollisionMeshToggle(callback) {
    collisionMeshListeners.add(callback);
    console.log("Registered collision mesh toggle listener, total listeners:", collisionMeshListeners.size);
}

/**
 * Unregister a collision mesh visibility listener
 */
export function offCollisionMeshToggle(callback) {
    collisionMeshListeners.delete(callback);
}

// ========== Movement Mode Toggle ==========
// 'weightless' = zero-G with thrusters (original physics mode)
// 'gravityBoots' = FPS walking with gravity
let movementMode = 'gravityBoots';  // Default to FPS walking
let movementModeToggleCallback = null;
const movementModeListeners = new Set();

/**
 * Create movement mode toggle button (below collision mesh toggle)
 * Toggles between Thrust (zero-G) and Gravity Boots (walking)
 * @param {Function} onToggle - Callback function called when mode is toggled (receives new mode)
 * @param {string} initialMode - Initial movement mode: 'weightless' or 'gravityBoots' (default: 'gravityBoots')
 */
export function createMovementModeToggleButton(onToggle, initialMode = 'gravityBoots') {
    movementModeToggleCallback = onToggle;
    movementMode = initialMode;
    
    const button = document.createElement("button");
    button.id = "movement-mode-toggle";
    button.style.cssText = `
        position: fixed;
        top: 110px;
        left: 10px;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid rgba(100, 200, 255, 0.5);
        border-radius: 50%;
        color: white;
        font-size: 18px;
        cursor: pointer;
        z-index: 1001;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    `;
    button.addEventListener("click", () => {
        movementMode = movementMode === 'weightless' ? 'gravityBoots' : 'weightless';
        console.log("Movement mode toggle clicked, new mode:", movementMode);
        updateMovementModeToggleButton();
        if (movementModeToggleCallback) {
            movementModeToggleCallback(movementMode);
        }
        // Notify all registered listeners
        movementModeListeners.forEach(cb => cb(movementMode));
    });
    button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(0, 0, 0, 0.9)";
        button.style.borderColor = "rgba(100, 200, 255, 0.8)";
    });
    button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(0, 0, 0, 0.7)";
        button.style.borderColor = "rgba(100, 200, 255, 0.5)";
    });
    
    updateMovementModeToggleButton(button);
    document.body.appendChild(button);
}

/**
 * Update the movement mode toggle button icon
 */
function updateMovementModeToggleButton(button = null) {
    const btn = button || document.getElementById("movement-mode-toggle");
    if (!btn) return;
    
    if (movementMode === 'gravityBoots') {
        btn.textContent = "🥾";
        btn.title = "Walk mode (click for thrusters)";
    } else {
        btn.textContent = "🚀";
        btn.title = "Thrusters (click for walk mode)";
    }
}

/**
 * Get current movement mode
 */
export function getMovementMode() {
    return movementMode;
}

/**
 * Set movement mode (updates button icon)
 */
export function setMovementModeUI(mode) {
    movementMode = mode;
    updateMovementModeToggleButton();
}

/**
 * Register a listener for movement mode changes
 * @param {Function} callback - Called with (mode: string)
 */
export function onMovementModeToggle(callback) {
    movementModeListeners.add(callback);
}

/**
 * Unregister a movement mode listener
 */
export function offMovementModeToggle(callback) {
    movementModeListeners.delete(callback);
}

// ========== Ghost Mode Toggle ==========
// Ghost mode = no gravity + no collisions (pass through everything)
let ghostModeEnabled = true;
let ghostModeToggleCallback = null;
const ghostModeListeners = new Set();

/**
 * Create ghost mode toggle button (below movement mode toggle)
 * Ghost mode disables gravity and collisions
 * @param {Function} onToggle - Callback function called when ghost mode is toggled
 * @param {boolean} initialEnabled - Initial ghost mode state (default: true)
 */
export function createGhostModeToggleButton(onToggle, initialEnabled = true) {
    ghostModeToggleCallback = onToggle;
    ghostModeEnabled = initialEnabled;
    
    const button = document.createElement("button");
    button.id = "ghost-mode-toggle";
    button.style.cssText = `
        position: fixed;
        top: 160px;
        left: 10px;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid rgba(200, 100, 255, 0.5);
        border-radius: 50%;
        color: white;
        font-size: 18px;
        cursor: pointer;
        z-index: 1001;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    `;
    button.addEventListener("click", () => {
        ghostModeEnabled = !ghostModeEnabled;
        console.log("Ghost mode toggle clicked, enabled:", ghostModeEnabled);
        updateGhostModeToggleButton();
        if (ghostModeToggleCallback) {
            ghostModeToggleCallback(ghostModeEnabled);
        }
        // Notify all registered listeners
        ghostModeListeners.forEach(cb => cb(ghostModeEnabled));
    });
    button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(0, 0, 0, 0.9)";
        button.style.borderColor = "rgba(200, 100, 255, 0.8)";
    });
    button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(0, 0, 0, 0.7)";
        button.style.borderColor = "rgba(200, 100, 255, 0.5)";
    });
    
    updateGhostModeToggleButton(button);
    document.body.appendChild(button);
}

/**
 * Update the ghost mode toggle button icon
 */
function updateGhostModeToggleButton(button = null) {
    const btn = button || document.getElementById("ghost-mode-toggle");
    if (!btn) return;
    
    if (ghostModeEnabled) {
        btn.textContent = "👻";
        btn.title = "Physics: OFF (ghost/no collisions) - click to enable";
    } else {
        btn.textContent = "🧱";
        btn.title = "Physics: ON (collisions enabled) - click to disable";
    }
}

/**
 * Get current ghost mode state
 */
export function getGhostModeEnabled() {
    return ghostModeEnabled;
}

/**
 * Set ghost mode (updates button icon)
 */
export function setGhostModeUI(enabled) {
    ghostModeEnabled = enabled;
    updateGhostModeToggleButton();
}

/**
 * Register a listener for ghost mode changes
 * @param {Function} callback - Called with (enabled: boolean)
 */
export function onGhostModeToggle(callback) {
    ghostModeListeners.add(callback);
}

/**
 * Unregister a ghost mode listener
 */
export function offGhostModeToggle(callback) {
    ghostModeListeners.delete(callback);
}

// Legacy physics toggle support (maps to movement mode for backwards compatibility)
export function createPhysicsToggleButton(onToggle, initialState = false) {
    // Create movement mode toggle instead
    createMovementModeToggleButton((mode) => {
        // Convert mode to boolean for legacy callback
        const enabled = mode === 'weightless';
        if (onToggle) onToggle(enabled);
    });
    if (initialState) {
        movementMode = 'weightless';
        updateMovementModeToggleButton();
    }
}

export function getPhysicsEnabled() {
    return movementMode === 'weightless';
}

export function setPhysicsEnabled(enabled) {
    movementMode = enabled ? 'weightless' : 'gravityBoots';
    updateMovementModeToggleButton();
}

export function onPhysicsToggle(callback) {
    movementModeListeners.add((mode) => callback(mode === 'weightless'));
}

export function offPhysicsToggle(callback) {
    // Note: This won't work perfectly with wrapped callbacks
    movementModeListeners.delete(callback);
}

// ========== Foundry Toggle ==========
let foundryConnected = false;
let foundryToggleCallback = null;

/**
 * Create Foundry toggle button (below ghost mode toggle)
 * @param {Function} onToggle - Callback function called when Foundry is toggled
 */
export function createFoundryToggleButton(onToggle) {
    foundryToggleCallback = onToggle;
    
    const button = document.createElement("button");
    button.id = "foundry-toggle";
    button.style.cssText = `
        position: fixed;
        top: 210px;
        left: 10px;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid rgba(0, 255, 255, 0.5);
        border-radius: 50%;
        color: white;
        font-size: 18px;
        cursor: pointer;
        z-index: 1001;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    `;
    button.addEventListener("click", async () => {
        if (foundryToggleCallback) {
            const newState = await foundryToggleCallback();
            foundryConnected = newState;
            updateFoundryToggleButton();
        }
    });
    button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(0, 0, 0, 0.9)";
        button.style.borderColor = "rgba(0, 255, 255, 0.8)";
    });
    button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(0, 0, 0, 0.7)";
        button.style.borderColor = "rgba(0, 255, 255, 0.5)";
    });
    
    updateFoundryToggleButton(button);
    document.body.appendChild(button);
}

/**
 * Update the Foundry toggle button icon
 */
function updateFoundryToggleButton(button = null) {
    const btn = button || document.getElementById("foundry-toggle");
    if (!btn) return;
    
    // 📺 = screen share icon
    btn.textContent = "📺";
    btn.style.borderColor = foundryConnected ? "rgba(0, 255, 0, 0.8)" : "rgba(0, 255, 255, 0.5)";
    btn.title = foundryConnected
        ? "Start movie: ON (click to stop)"
        : "Start movie: OFF (click to start)";
}

/**
 * Set Foundry connected state (updates button icon)
 */
export function setFoundryConnected(connected) {
    foundryConnected = connected;
    updateFoundryToggleButton();
}

// ========== Cinema Mode Toggle ==========
let cinemaModeActive = false;
let cinemaModeToggleCallback = null;

/**
 * Create cinema mode toggle button (below Foundry toggle)
 * @param {Function} onToggle - Callback function called when cinema mode is toggled
 */
export function createCinemaModeButton(onToggle) {
    cinemaModeToggleCallback = onToggle;
    
    const button = document.createElement("button");
    button.id = "cinema-toggle";
    button.style.cssText = `
        position: fixed;
        top: 260px;
        left: 10px;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid rgba(128, 0, 255, 0.5);
        border-radius: 50%;
        color: white;
        font-size: 18px;
        cursor: pointer;
        z-index: 1001;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    `;
    button.addEventListener("click", () => {
        if (cinemaModeToggleCallback) {
            const newState = cinemaModeToggleCallback();
            cinemaModeActive = newState;
            updateCinemaModeButton();
        }
    });
    button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(0, 0, 0, 0.9)";
        button.style.borderColor = "rgba(128, 0, 255, 0.8)";
    });
    button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(0, 0, 0, 0.7)";
        button.style.borderColor = cinemaModeActive ? "rgba(128, 0, 255, 0.8)" : "rgba(128, 0, 255, 0.5)";
    });
    
    updateCinemaModeButton(button);
    document.body.appendChild(button);
}

/**
 * Update the cinema mode toggle button icon
 */
function updateCinemaModeButton(button = null) {
    const btn = button || document.getElementById("cinema-toggle");
    if (!btn) return;
    
    // 🎬 = cinema mode
    btn.textContent = "🎬";
    btn.style.borderColor = cinemaModeActive ? "rgba(128, 0, 255, 0.8)" : "rgba(128, 0, 255, 0.5)";
    btn.title = cinemaModeActive ? "Cinema mode: ON (click to disable)" : "Cinema mode: OFF (click to enable)";
}

/**
 * Set cinema mode state (updates button icon)
 */
export function setCinemaModeActive(active) {
    cinemaModeActive = active;
    updateCinemaModeButton();
}

/**
 * Show/hide Foundry toggle button (for host-only controls)
 */
export function setFoundryButtonVisible(visible) {
    const btn = document.getElementById("foundry-toggle");
    if (btn) {
        btn.style.display = visible ? "flex" : "none";
    }
}

/**
 * Show/hide Cinema mode toggle button (for host-only controls)
 */
export function setCinemaButtonVisible(visible) {
    const btn = document.getElementById("cinema-toggle");
    if (btn) {
        btn.style.display = visible ? "flex" : "none";
    }
}

// ========== Playback Pause Button (Host only, when movie is playing) ==========
let playbackPaused = false;
let playbackPauseCallback = null;

/**
 * Create playback pause button (below cinema toggle, hidden by default)
 * @param {Function} onToggle - Callback function called when playback is toggled
 */
export function createPlaybackPauseButton(onToggle) {
    playbackPauseCallback = onToggle;
    
    const button = document.createElement("button");
    button.id = "playback-pause-toggle";
    button.style.cssText = `
        position: fixed;
        top: 310px;
        left: 10px;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid rgba(255, 200, 0, 0.5);
        border-radius: 50%;
        color: white;
        font-size: 18px;
        cursor: pointer;
        z-index: 1001;
        display: none;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    `;
    button.addEventListener("click", () => {
        if (playbackPauseCallback) {
            playbackPauseCallback();
        }
    });
    button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(0, 0, 0, 0.9)";
        button.style.borderColor = "rgba(255, 200, 0, 0.8)";
    });
    button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(0, 0, 0, 0.7)";
        button.style.borderColor = "rgba(255, 200, 0, 0.5)";
    });
    
    updatePlaybackPauseButton(button);
    document.body.appendChild(button);
}

/**
 * Update the playback pause button icon
 */
function updatePlaybackPauseButton(button = null) {
    const btn = button || document.getElementById("playback-pause-toggle");
    if (!btn) return;
    
    // ⏸️ = paused, ▶️ = playing
    btn.textContent = playbackPaused ? "▶️" : "⏸️";
    btn.title = playbackPaused ? "Movie PAUSED (click to play)" : "Movie PLAYING (click to pause)";
}

/**
 * Set playback paused state (updates button icon)
 */
export function setPlaybackPaused(paused) {
    playbackPaused = paused;
    updatePlaybackPauseButton();
}

/**
 * Show/hide playback pause button (only visible when host has movie playing)
 */
export function setPlaybackButtonVisible(visible) {
    const btn = document.getElementById("playback-pause-toggle");
    if (btn) {
        btn.style.display = visible ? "flex" : "none";
    }
}

// ========== Fullscreen Toggle Button ==========
let fullscreenToggleCallback = null;

export function createFullscreenToggleButton(onToggle = null) {
    fullscreenToggleCallback = onToggle;

    const button = document.createElement("button");
    button.id = "fullscreen-toggle";
    button.style.cssText = `
        position: fixed;
        top: 360px;
        left: 10px;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid rgba(255, 255, 255, 0.5);
        border-radius: 50%;
        color: white;
        font-size: 18px;
        cursor: pointer;
        z-index: 1001;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    `;
    button.addEventListener("click", async () => {
        try {
            if (isFullscreenActive()) {
                await exitFullscreen();
            } else {
                await enterFullscreen();
            }
            if (fullscreenToggleCallback) {
                fullscreenToggleCallback(isFullscreenActive());
            }
        } catch (error) {
            console.warn("Fullscreen toggle failed:", error);
        }
    });
    button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(0, 0, 0, 0.9)";
        button.style.borderColor = "rgba(255, 255, 255, 0.8)";
    });
    button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(0, 0, 0, 0.7)";
        button.style.borderColor = "rgba(255, 255, 255, 0.5)";
    });

    updateFullscreenToggleButton(button);
    document.body.appendChild(button);

    document.addEventListener("fullscreenchange", () => {
        updateFullscreenToggleButton();
    });
}

function isFullscreenActive() {
    return !!document.fullscreenElement;
}

async function enterFullscreen() {
    const element = document.documentElement;
    if (element.requestFullscreen) {
        await element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
    }
}

async function exitFullscreen() {
    if (document.exitFullscreen) {
        await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
    }
}

function updateFullscreenToggleButton(button = null) {
    const btn = button || document.getElementById("fullscreen-toggle");
    if (!btn) return;
    const active = isFullscreenActive();
    btn.textContent = active ? "🗗" : "⛶";
    btn.title = active ? "Fullscreen: Exit" : "Fullscreen: Enter";
}

const worldPos = new THREE.Vector3();
const worldQuat = new THREE.Quaternion();
const euler = new THREE.Euler();
const wpos = new THREE.Vector3();

// Build timestamps (injected at build time by Vite define)
// Vite replaces these identifiers with the actual string values at build time
// eslint-disable-next-line no-undef
const PROTOVERSE_BUILD_TIME = __PROTOVERSE_BUILD_TIME__;
// eslint-disable-next-line no-undef
const SPARK_BUILD_TIME = __SPARK_BUILD_TIME__;

// Format timestamp for display (show date and time)
function formatBuildTime(isoString) {
  if (isoString === 'unknown') return isoString;
  const date = new Date(isoString);
  return date.toLocaleString('en-US', { 
    month: 'short', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export function updateHUD(camera, protoVerse, rootworld = "/root/world.json") {
  // Update HUD with camera world position and orientation
  camera.getWorldPosition(worldPos);
  camera.getWorldQuaternion(worldQuat);
  euler.setFromQuaternion(worldQuat, 'YXZ');
  
  // Get world information from protoVerse
  const currentWorldUrl = protoVerse.getCurrentWorldUrl();
  let worldno = 0;
  const worldState = protoVerse.getWorldState();
  if (currentWorldUrl) {
    const currentState = worldState.get(currentWorldUrl);
    if (currentState && currentState.worldno !== undefined) {
      worldno = currentState.worldno;
    }
  }
  
  // Calculate world position: transform from universe coordinates to world coordinates
  const worldPosVec = universeToWorld(worldPos, worldno);
  wpos.copy(worldPosVec);
  
  hud.textContent = `pos: ${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}\nwpos: ${wpos.x.toFixed(2)}, ${wpos.y.toFixed(2)}, ${wpos.z.toFixed(2)}\nrot: ${euler.x.toFixed(2)}, ${euler.y.toFixed(2)}, ${euler.z.toFixed(2)}\nworld: ${currentWorldUrl || rootworld} [${worldno}]\nbuild: ${formatBuildTime(PROTOVERSE_BUILD_TIME)}\nspark: ${formatBuildTime(SPARK_BUILD_TIME)}`;
}

