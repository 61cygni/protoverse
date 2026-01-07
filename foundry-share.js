/**
 * Foundry Share Component
 * 
 * Connects to a Foundry screen streaming server and displays it in the 3D world.
 * Uses WebCodecs for efficient H.264 video decoding.
 * 
 * Requirements:
 * - Foundry server running (cargo run --release in foundry project)
 *   By default serves on http://localhost:3000
 * 
 * Usage in world.json:
 * "foundryDisplays": [
 *   {
 *     "name": "My Screen",
 *     "wsUrl": "ws://localhost:3000/ws",
 *     "position": [0, 2, -3],
 *     "rotation": [0, 0, 0, 1],
 *     "width": 2.0,
 *     "aspectRatio": 1.777
 *   }
 * ]
 */

import * as THREE from "three";
import { worldToUniverse } from "./coordinate-transform.js";

// Active Foundry displays per world
const worldFoundryDisplays = new Map(); // worldUrl -> FoundryDisplay[]

// Scene and camera references
let sceneRef = null;
let cameraRef = null;
let localFrameRef = null;

// Raycaster for interaction
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// Codec to request from server
const REQUESTED_CODEC = "avc";

// Reconnection backoff
const BACKOFF_STEPS_MS = [250, 1000, 2000, 5000];

// Audio magic bytes "AUD0"
const AUDIO_MAGIC = [0x41, 0x55, 0x44, 0x30];

/**
 * Foundry display instance
 */
class FoundryDisplay {
    constructor(config, mesh) {
        this.config = config;
        this.mesh = mesh;
        this.ws = null;
        this.texture = null;
        this.isConnected = false;
        this.videoWorker = null;
        this.frameCanvas = null;
        this.frameCtx = null;
        this.frameSize = { w: 0, h: 0 };
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        
        // Audio playback state
        this.audioCtx = null;
        this.nextPlaybackTime = null;
    }
    
    /**
     * Connect to Foundry server
     */
    async connect() {
        if (this.isConnected) return true;
        
        try {
            // Create offscreen canvas for rendering frames
            this.frameCanvas = document.createElement('canvas');
            this.frameCanvas.width = 1920;
            this.frameCanvas.height = 1080;
            this.frameCtx = this.frameCanvas.getContext('2d');
            
            // Create video decoder worker
            this.videoWorker = new Worker('/foundry-worker.js');
            this.videoWorker.onmessage = (event) => this._handleWorkerMessage(event);
            
            // Initialize audio context NOW (during user gesture) to enable playback
            this._initAudioContext();
            
            // Connect WebSocket
            this._openSocket();
            
            return true;
            
        } catch (error) {
            console.error(`[Foundry] "${this.config.name}" connection error:`, error);
            return false;
        }
    }
    
    /**
     * Initialize audio context (must be called during user gesture)
     */
    _initAudioContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            console.log(`[Foundry] Audio context created, state: ${this.audioCtx.state}`);
        }
        
        // Resume if suspended (this works because we're in a click handler)
        if (this.audioCtx.state === "suspended") {
            this.audioCtx.resume().then(() => {
                console.log(`[Foundry] Audio context resumed`);
            });
        }
        
        this.nextPlaybackTime = this.audioCtx.currentTime + 0.1;
    }
    
    /**
     * Open WebSocket connection
     */
    _openSocket() {
        const socket = new WebSocket(this.config.wsUrl);
        this.ws = socket;
        socket.binaryType = "arraybuffer";
        
        socket.onopen = () => {
            if (this.ws !== socket) return socket.close();
            console.log(`[Foundry] "${this.config.name}" socket opened`);
            this._resetBackoff();
            this.isConnected = true;
            this._setupTexture();
            
            // Request video mode
            this._sendJson({ type: "mode", mode: "video", codec: REQUESTED_CODEC });
            this._requestKeyframe("socket-open");
        };
        
        socket.onclose = (ev) => {
            if (this.ws !== socket) return;
            const reason = ev.reason ? `${ev.code} ${ev.reason}` : `${ev.code}`;
            console.log(`[Foundry] "${this.config.name}" socket closed (${reason})`);
            this.isConnected = false;
            this._showPlaceholder();
            this._scheduleReconnect(reason);
        };
        
        socket.onerror = (err) => {
            if (this.ws !== socket) return;
            console.log(`[Foundry] "${this.config.name}" socket error`);
        };
        
        socket.onmessage = (ev) => {
            if (this.ws !== socket) return;
            
            if (typeof ev.data === "string") {
                if (ev.data === "heartbeat") return;
                
                try {
                    const msg = JSON.parse(ev.data);
                    if (msg.type === "mode-ack") {
                        console.log(`[Foundry] mode-ack: ${msg.mode} codec: ${msg.codec}`);
                    } else if (msg.type === "video-config") {
                        this.videoWorker?.postMessage({ type: "config", config: msg.config });
                    }
                } catch (_) {
                    // Ignore parse errors
                }
                return;
            }
            
            // Check if binary data is audio or video
            if (this._isAudioPacket(ev.data)) {
                this._handleAudioPacket(ev.data);
            } else {
                // Video chunk
                this.videoWorker?.postMessage({ type: "chunk", chunk: ev.data }, [ev.data]);
            }
        };
    }
    
    /**
     * Check if packet is audio (starts with AUD0 magic)
     */
    _isAudioPacket(data) {
        if (!(data instanceof ArrayBuffer) || data.byteLength < 4) return false;
        const view = new Uint8Array(data);
        return AUDIO_MAGIC.every((byte, i) => view[i] === byte);
    }
    
    /**
     * Handle incoming audio packet
     */
    _handleAudioPacket(buffer) {
        try {
            const view = new DataView(buffer);
            // Parse header: magic(4) + startMs(8) + sampleRate(4) + channels(4) + count(4) = 24 bytes
            const sampleRate = view.getUint32(12, true);
            const channels = view.getUint32(16, true);
            const sampleCount = view.getUint32(20, true);
            
            const samples = new Int16Array(buffer, 24, sampleCount);
            this._playAudio(samples, sampleRate, channels);
        } catch (err) {
            console.log(`[Foundry] audio error: ${err}`);
        }
    }
    
    /**
     * Play audio samples (supports mono and stereo)
     */
    _playAudio(samples, sampleRate, channels) {
        // Skip if no audio context (should have been created on connect)
        if (!this.audioCtx) {
            return;
        }
        
        // Skip if audio context is not running
        if (this.audioCtx.state !== "running") {
            return;
        }
        
        const numChannels = Math.min(channels, 2); // Support up to stereo
        const samplesPerChannel = Math.floor(samples.length / numChannels);
        
        if (samplesPerChannel === 0) return;
        
        // Create audio buffer
        const audioBuffer = this.audioCtx.createBuffer(numChannels, samplesPerChannel, sampleRate);
        
        // Deinterleave and convert i16 to float32
        for (let ch = 0; ch < numChannels; ch++) {
            const channelData = audioBuffer.getChannelData(ch);
            for (let i = 0; i < samplesPerChannel; i++) {
                channelData[i] = samples[i * numChannels + ch] / 32768;
            }
        }
        
        // Schedule playback
        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioCtx.destination);
        
        const now = this.audioCtx.currentTime;
        const duration = samplesPerChannel / sampleRate;
        
        // Minimal buffer to reduce latency (20ms ahead)
        const startAt = Math.max(now + 0.02, this.nextPlaybackTime);
        source.start(startAt);
        this.nextPlaybackTime = startAt + duration;
    }
    
    /**
     * Handle messages from video worker
     */
    _handleWorkerMessage(event) {
        const { type, bitmap, width, height, error, message } = event.data;
        
        if (error) {
            console.log(`[Foundry] worker error: ${error}`);
            return;
        }
        
        switch (type) {
            case "frame":
                this._handleVideoFrame(bitmap, width, height);
                break;
            case "log":
                if (message) console.log(`[Foundry] ${message}`);
                break;
            case "request-keyframe":
                this._requestKeyframe("decoder-request");
                break;
        }
    }
    
    /**
     * Handle decoded video frame
     */
    _handleVideoFrame(bitmap, fw, fh) {
        if (!this.frameCtx) return;
        
        const sizeChanged = fw !== this.frameSize.w || fh !== this.frameSize.h;
        if (sizeChanged) {
            this.frameSize = { w: fw, h: fh };
            this.frameCanvas.width = fw;
            this.frameCanvas.height = fh;
            
            // Recreate texture at new size
            this.texture?.dispose();
            this.texture = new THREE.CanvasTexture(this.frameCanvas);
            this.texture.colorSpace = THREE.SRGBColorSpace;
            this.texture.magFilter = THREE.LinearFilter;
            this.texture.minFilter = THREE.LinearMipmapLinearFilter;
            this.texture.generateMipmaps = true;
            
            if (this.mesh) {
                this.mesh.material.map = this.texture;
                this.mesh.material.color.set(0xffffff);
                this.mesh.material.needsUpdate = true;
                
                // Update mesh aspect ratio
                const aspect = fw / fh;
                const baseWidth = this.config.width || 2.0;
                if (aspect >= 1) {
                    this.mesh.scale.set(1, 1 / aspect, 1);
                } else {
                    this.mesh.scale.set(aspect, 1, 1);
                }
            }
        }
        
        // Draw frame to canvas
        this.frameCtx.clearRect(0, 0, fw, fh);
        this.frameCtx.drawImage(bitmap, 0, 0, fw, fh);
        bitmap.close?.();
        
        // Update texture
        if (this.texture) {
            this.texture.needsUpdate = true;
        }
    }
    
    /**
     * Set up the texture on mesh
     */
    _setupTexture() {
        if (!this.mesh) return;
        
        this.texture = new THREE.CanvasTexture(this.frameCanvas);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.colorSpace = THREE.SRGBColorSpace;
        
        this.mesh.material.map = this.texture;
        this.mesh.material.color.set(0xffffff);
        this.mesh.material.needsUpdate = true;
        this.mesh.visible = true;
    }
    
    /**
     * Show placeholder when disconnected
     */
    _showPlaceholder() {
        if (this.mesh) {
            this.mesh.material.map = null;
            this.mesh.material.color.set(0x222233);
            this.mesh.material.needsUpdate = true;
        }
    }
    
    /**
     * Send JSON message
     */
    _sendJson(message) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
            return true;
        }
        return false;
    }
    
    /**
     * Request keyframe from server
     */
    _requestKeyframe(context = "") {
        const ok = this._sendJson({ type: "force-keyframe" });
        if (!ok && context) {
            console.log(`[Foundry] keyframe request skipped (${context})`);
        }
    }
    
    /**
     * Get current backoff delay
     */
    _currentBackoffMs() {
        const idx = Math.min(this.reconnectAttempts, BACKOFF_STEPS_MS.length - 1);
        return BACKOFF_STEPS_MS[idx];
    }
    
    /**
     * Reset backoff counter
     */
    _resetBackoff() {
        this.reconnectAttempts = 0;
    }
    
    /**
     * Schedule reconnection
     */
    _scheduleReconnect(reason) {
        if (this.reconnectTimer) return;
        
        const delay = this._currentBackoffMs() * (0.75 + Math.random() * 0.5);
        console.log(`[Foundry] "${this.config.name}" reconnecting in ${Math.floor(delay)}ms`);
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.reconnectAttempts += 1;
            this._openSocket();
        }, delay);
    }
    
    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        if (this.videoWorker) {
            this.videoWorker.terminate();
            this.videoWorker = null;
        }
        
        if (this.texture) {
            this.texture.dispose();
            this.texture = null;
        }
        
        // Close audio context
        if (this.audioCtx) {
            this.audioCtx.close().catch(() => {});
            this.audioCtx = null;
            this.nextPlaybackTime = null;
        }
        
        this.frameCanvas = null;
        this.frameCtx = null;
        this._showPlaceholder();
        this.isConnected = false;
        
        console.log(`[Foundry] "${this.config.name}" disconnected`);
    }
    
    /**
     * Dispose of all resources
     */
    dispose() {
        this.disconnect();
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            if (this.mesh.parent) {
                this.mesh.parent.remove(this.mesh);
            }
        }
    }
}

/**
 * Initialize the Foundry share system
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {THREE.Object3D} localFrame
 */
export function initFoundryShare(scene, camera, localFrame) {
    sceneRef = scene;
    cameraRef = camera;
    localFrameRef = localFrame;
    
    console.log("[Foundry] Initialized");
}

/**
 * Load Foundry displays for a world
 * @param {string} worldUrl
 * @param {Object} worldData
 * @param {number} worldno
 */
export function loadWorldFoundryDisplays(worldUrl, worldData, worldno) {
    const foundryDisplays = worldData?.foundryDisplays;
    if (!foundryDisplays || foundryDisplays.length === 0) {
        return;
    }
    
    // Don't reload if already loaded
    if (worldFoundryDisplays.has(worldUrl)) {
        return;
    }
    
    const displays = [];
    
    for (const config of foundryDisplays) {
        const display = createFoundryPlaceholder(config, worldno);
        if (display) {
            displays.push(display);
        }
    }
    
    worldFoundryDisplays.set(worldUrl, displays);
    console.log(`[Foundry] Loaded ${displays.length} display(s) for ${worldUrl}`);
}

/**
 * Create a Foundry display placeholder mesh
 */
function createFoundryPlaceholder(config, worldno) {
    if (!sceneRef) {
        console.warn("[Foundry] Scene not initialized");
        return null;
    }
    
    const width = config.width || 2.0;
    const aspectRatio = config.aspectRatio || (16 / 9);
    const height = width / aspectRatio;
    
    // Create geometry
    const geometry = new THREE.PlaneGeometry(width, height);
    
    // Create material with placeholder appearance
    const material = new THREE.MeshBasicMaterial({
        color: 0x222233,
        side: THREE.DoubleSide,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position
    let position = config.position || [0, 1.5, -2];
    if (worldno !== 0) {
        position = worldToUniverse(position, worldno);
    }
    mesh.position.set(position[0], position[1], position[2]);
    
    // Rotation (quaternion)
    if (config.rotation) {
        mesh.quaternion.set(
            config.rotation[0],
            config.rotation[1],
            config.rotation[2],
            config.rotation[3]
        );
    }
    
    // Add border frame (cyan for Foundry)
    const borderGeometry = new THREE.EdgesGeometry(geometry);
    const borderMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff });
    const border = new THREE.LineSegments(borderGeometry, borderMaterial);
    mesh.add(border);
    
    mesh.name = `foundry-${config.name || 'unnamed'}`;
    mesh.userData.foundryConfig = config;
    
    sceneRef.add(mesh);
    
    return new FoundryDisplay(config, mesh);
}

/**
 * Connect to a Foundry display (by name or index)
 */
export async function connectFoundry(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) {
        console.warn(`[Foundry] No displays found for ${worldUrl}`);
        return false;
    }
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    if (!display) {
        console.warn(`[Foundry] Display "${identifier}" not found`);
        return false;
    }
    
    return display.connect();
}

/**
 * Disconnect from a Foundry display
 */
export function disconnectFoundry(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays) return;
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    if (display) {
        display.disconnect();
    }
}

/**
 * Toggle Foundry connection
 */
export async function toggleFoundry(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays) return false;
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    if (!display) return false;
    
    if (display.isConnected) {
        display.disconnect();
        return false;
    } else {
        return display.connect();
    }
}

/**
 * Check if world has Foundry displays
 */
export function hasWorldFoundryDisplays(worldUrl) {
    return worldFoundryDisplays.has(worldUrl) && worldFoundryDisplays.get(worldUrl).length > 0;
}

/**
 * Unload Foundry displays for a world
 */
export function unloadWorldFoundryDisplays(worldUrl) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays) return;
    
    for (const display of displays) {
        display.dispose();
    }
    
    worldFoundryDisplays.delete(worldUrl);
    console.log(`[Foundry] Unloaded displays for ${worldUrl}`);
}

/**
 * Get all Foundry displays for a world
 */
export function getWorldFoundryDisplays(worldUrl) {
    return worldFoundryDisplays.get(worldUrl) || [];
}

