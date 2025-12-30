import * as THREE from "three";
import { universeToWorld } from "./coordinate-transform.js";

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
let audioEnabled = true; // Default to audio on
let audioToggleCallback = null; // Callback function when audio is toggled

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

export function updateHUD(camera, currentWorldUrl, worldno) {
  // Update HUD with camera world position and orientation
  camera.getWorldPosition(worldPos);
  camera.getWorldQuaternion(worldQuat);
  euler.setFromQuaternion(worldQuat, 'YXZ');
  
  // Calculate world position: transform from universe coordinates to world coordinates
  const worldPosVec = universeToWorld(worldPos, worldno);
  wpos.copy(worldPosVec);
  
  hud.textContent = `pos: ${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}\nwpos: ${wpos.x.toFixed(2)}, ${wpos.y.toFixed(2)}, ${wpos.z.toFixed(2)}\nrot: ${euler.x.toFixed(2)}, ${euler.y.toFixed(2)}, ${euler.z.toFixed(2)}\nworld: ${currentWorldUrl} [${worldno}]\nbuild: ${formatBuildTime(PROTOVERSE_BUILD_TIME)}\nspark: ${formatBuildTime(SPARK_BUILD_TIME)}`;
}

