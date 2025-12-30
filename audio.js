// ========== Background Audio Management ==========
import { getAudioEnabled } from "./hud.js";

let currentAudio = null; // Currently playing audio element
let currentWorldData = null; // Cache current world data for audio checking
let urlResolver = null; // Function to resolve relative URLs

/**
 * Initialize the audio module with a URL resolver function
 * @param {Function} resolveUrlFn - Function to resolve relative paths to full URLs
 */
export function initAudio(resolveUrlFn) {
    urlResolver = resolveUrlFn;
}

/**
 * Set the current world data (for use when toggling audio on)
 * @param {Object} worldData - World data object
 */
export function setCurrentWorldData(worldData) {
    currentWorldData = worldData;
}

/**
 * Get the current world data
 * @returns {Object} Current world data
 */
export function getCurrentWorldData() {
    return currentWorldData;
}

/**
 * Play background audio for a world if bgAudio or bgAudioUrl is specified
 * If no audio is specified in the world data, keep current audio playing
 * @param {Object} worldData - World data object that may contain bgAudio or bgAudioUrl
 */
export async function playWorldAudio(worldData) {
    // Check if world has bgAudio or bgAudioUrl field (support both)
    const audioUrlField = worldData?.bgAudioUrl || worldData?.bgAudio;
    
    // If no audio field specified, keep current audio playing (don't stop it)
    if (!audioUrlField) {
        console.log("No audio specified for world, keeping current audio");
        return;
    }
    
    // Resolve the audio URL
    const newAudioUrl = audioUrlField.startsWith('http') 
        ? audioUrlField 
        : (urlResolver ? urlResolver(audioUrlField) : audioUrlField);
    
    // Check if we're already playing this same audio
    if (currentAudio && currentAudio.src === newAudioUrl) {
        console.log("Already playing this audio, skipping");
        return;
    }
    
    // Stop current audio if playing (only when switching to different audio)
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    
    // Only play if audio is enabled
    if (!getAudioEnabled()) {
        return;
    }
    
    try {
        console.log("Playing background audio:", newAudioUrl);
        
        // Create and play audio
        currentAudio = new Audio(newAudioUrl);
        currentAudio.loop = true; // Loop the background audio
        currentAudio.volume = 0.5; // Set volume (0.0 to 1.0)
        
        // Play with error handling
        await currentAudio.play().catch(error => {
            console.warn("Failed to play audio:", error);
            currentAudio = null;
        });
    } catch (error) {
        console.warn("Error loading audio:", error);
        currentAudio = null;
    }
}

/**
 * Handle audio toggle callback from HUD
 * @param {boolean} enabled - Whether audio is now enabled
 */
export function handleAudioToggle(enabled) {
    console.log("handleAudioToggle:", enabled);
    console.log("currentWorldData:", currentWorldData);
    if (enabled) {
        // If audio was just enabled and we have world data, play it
        if (currentWorldData) {
            playWorldAudio(currentWorldData);
        }
    } else {
        // If audio was just disabled, stop current audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }
    }
}

/**
 * Stop any currently playing audio
 */
export function stopAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
}

/**
 * Set audio volume
 * @param {number} volume - Volume level from 0.0 to 1.0
 */
export function setVolume(volume) {
    if (currentAudio) {
        currentAudio.volume = Math.max(0, Math.min(1, volume));
    }
}

