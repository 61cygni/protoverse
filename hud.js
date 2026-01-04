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
 */
export function createAudioToggleButton(onToggle) {
    audioToggleCallback = onToggle;
    
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
    btn.title = collisionMeshVisible ? "Collision mesh: VISIBLE (click to hide)" : "Collision mesh: HIDDEN (click to show)";
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

// ========== Physics Toggle ==========
let physicsEnabled = false;
let physicsToggleCallback = null;
const physicsListeners = new Set();

/**
 * Create physics toggle button (below collision mesh toggle)
 * @param {Function} onToggle - Callback function called when physics is toggled
 * @param {boolean} initialState - Initial physics enabled state (default: false)
 */
export function createPhysicsToggleButton(onToggle, initialState = false) {
    physicsToggleCallback = onToggle;
    physicsEnabled = initialState;
    
    const button = document.createElement("button");
    button.id = "physics-toggle";
    button.style.cssText = `
        position: fixed;
        top: 110px;
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
        physicsEnabled = !physicsEnabled;
        console.log("Physics toggle clicked, new state:", physicsEnabled);
        updatePhysicsToggleButton();
        if (physicsToggleCallback) {
            physicsToggleCallback(physicsEnabled);
        }
        // Notify all registered listeners
        physicsListeners.forEach(cb => cb(physicsEnabled));
    });
    button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(0, 0, 0, 0.9)";
        button.style.borderColor = "rgba(255, 255, 255, 0.8)";
    });
    button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(0, 0, 0, 0.7)";
        button.style.borderColor = "rgba(255, 255, 255, 0.5)";
    });
    
    updatePhysicsToggleButton(button);
    document.body.appendChild(button);
}

/**
 * Update the physics toggle button icon
 */
function updatePhysicsToggleButton(button = null) {
    const btn = button || document.getElementById("physics-toggle");
    if (!btn) return;
    
    // 🚀 = physics on (thruster mode), ⚡ = physics off (free fly)
    btn.textContent = physicsEnabled ? "🚀" : "⚡";
    btn.title = physicsEnabled ? "Physics: ON (click to disable)" : "Physics: OFF (click to enable)";
}

/**
 * Get current physics enabled state
 */
export function getPhysicsEnabled() {
    return physicsEnabled;
}

/**
 * Set physics enabled state (updates button icon)
 */
export function setPhysicsEnabled(enabled) {
    physicsEnabled = enabled;
    updatePhysicsToggleButton();
}

/**
 * Register a listener for physics toggle changes
 * @param {Function} callback - Called with (isEnabled: boolean)
 */
export function onPhysicsToggle(callback) {
    physicsListeners.add(callback);
}

/**
 * Unregister a physics toggle listener
 */
export function offPhysicsToggle(callback) {
    physicsListeners.delete(callback);
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

