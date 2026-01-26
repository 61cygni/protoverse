/**
 * Foundry Share Component
 * 
 * Connects to a Foundry streaming server and displays video in the 3D world.
 * Uses WebCodecs for efficient H.264 video decoding.
 * 
 * Supports two display types:
 * - "movie" (default): For foundry-player video streaming (movies, pre-recorded content)
 * - "screen": For foundry screen/window capture (live desktop streaming)
 * 
 * Requirements:
 * - For movies: foundry-player running (~/projects/foundry)
 * - For screens: foundry running with --window option (~/projects/foundry)
 * 
 * Usage in world.json:
 * "foundryDisplays": [
 *   {
 *     "type": "screen",
 *     "name": "Desktop Share",
 *     "wsUrl": "ws://localhost:23646/ws",
 *     "position": [0, 2, -3],
 *     "rotation": [0, 0, 0, 1],
 *     "width": 2.0,
 *     "aspectRatio": 1.777
 *   },
 *   {
 *     "type": "movie",
 *     "name": "Theater Screen",
 *     "wsUrl": "wss://protoverse-movie.fly.dev/ws",
 *     ...
 *   }
 * ]
 * 
 * Type differences:
 * - movie: Fetches movie info, supports restart, TV-like ambient glow, AI commentary
 * - screen: No movie info, no restart (live), stable ambient glow, no AI commentary
 */

import * as THREE from "three";
import { worldToUniverse } from "./coordinate-transform.js";
import { SplatEdit, SplatEditSdf, SplatEditSdfType, SplatEditRgbaBlendMode } from "@sparkjsdev/spark";

// Active Foundry displays per world
const worldFoundryDisplays = new Map(); // worldUrl -> FoundryDisplay[]

// Scene and camera references
let sceneRef = null;
let cameraRef = null;
let localFrameRef = null;
let audioListenerRef = null;

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
    constructor(config, mesh, worldUrl = null) {
        this.config = config;
        this.mesh = mesh;
        this.worldUrl = worldUrl;  // For identifying display in callbacks
        this.type = config.type || "movie";  // "movie" (default) or "screen"
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
        
        // Spatial audio
        this.useSpatialAudio = false;
        this.spatialConfig = null;
        this.pannerNode = null;
        this.audioGainNode = null;
        this._setupSpatialAudio();
        
        // Pause state
        this.isPaused = false;
        
        // Ambient glow (SDF lighting)
        this.ambientGlowLayer = null;
        this.ambientGlowLights = [];
        this._setupAmbientGlow();
        
        console.log(`[Foundry] Created ${this.type} display: "${config.name}"`);
    }
    
    /**
     * Set up ambient glow using Spark SDF edits
     * Creates RGB light spheres around the TV that illuminate when playing
     */
    _setupAmbientGlow() {
        if (!sceneRef || !this.mesh) {
            console.log(`[Foundry] No scene or mesh, skipping ambient glow setup`);
            return;
        }
        
        // Check if ambient glow is enabled in config (default: true)
        const glowConfig = this.config.ambientGlow;
        if (glowConfig === false || glowConfig?.enabled === false) {
            console.log(`[Foundry] "${this.config.name}" ambient glow disabled`);
            return;
        }
        
        // Get glow settings with defaults
        const settings = typeof glowConfig === 'object' ? glowConfig : {};
        const radius = settings.radius ?? 2.5;
        const opacity = settings.opacity ?? 0.15;
        const softEdge = settings.softEdge ?? 1.5;
        const offsetZ = settings.offsetZ ?? 0.3;  // How far in front of the screen
        
        // Create lighting layer with ADD_RGBA blend mode (adds light)
        this.ambientGlowLayer = new SplatEdit({
            rgbaBlendMode: SplatEditRgbaBlendMode.ADD_RGBA,
            sdfSmooth: 0.1,
            softEdge: softEdge,
        });
        sceneRef.add(this.ambientGlowLayer);
        
        // Get TV dimensions
        const width = this.config.width || 2.0;
        const aspectRatio = this.config.aspectRatio || (16 / 9);
        const height = width / aspectRatio;
        
        // Get TV position and rotation
        const tvPos = this.mesh.position.clone();
        const tvQuat = this.mesh.quaternion.clone();
        
        // Calculate forward direction (normal to the screen, pointing toward viewer)
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(tvQuat);
        
        // Create single centered light
        // Screen type: neutral white, Movie type: dim blue (TV flicker effect)
        const isScreen = this.type === "screen";
        const initialColor = isScreen 
            ? new THREE.Color().setHSL(0.0, 0.0, 0.4)   // Neutral white/gray
            : new THREE.Color().setHSL(0.6, 0.6, 0.3);  // Dim blue
        
        const light = new SplatEditSdf({
            type: SplatEditSdfType.SPHERE,
            color: initialColor,
            radius: radius,
            opacity: 0,  // Start hidden, will show when connected
        });
        
        // Position: TV center + forward offset
        const lightPos = tvPos.clone()
            .add(forward.clone().multiplyScalar(offsetZ));
        
        light.position.copy(lightPos);
        
        this.ambientGlowLayer.add(light);
        const phaseOffset = Math.random() * Math.PI * 2;
        this.ambientGlowLights.push({ light, config: { name: isScreen ? 'white' : 'blue' }, baseOpacity: opacity, phaseOffset });
        
        // Track glow active state for animation
        this.ambientGlowActive = false;
        
        console.log(`[Foundry] "${this.config.name}" ambient glow setup: ${this.ambientGlowLights.length} lights, radius=${radius}, opacity=${opacity}`);
    }
    
    /**
     * Update ambient glow visibility
     * @param {boolean} visible - Whether the glow should be visible
     */
    _setAmbientGlowVisible(visible) {
        this.ambientGlowActive = visible;
        for (const { light, baseOpacity } of this.ambientGlowLights) {
            light.opacity = visible ? baseOpacity : 0;
        }
        console.log(`[Foundry] Ambient glow ${visible ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Update ambient glow animation (call each frame)
     * Movie type: TV-like flickering effect using color variation
     * Screen type: Stable neutral glow (desktop content is more static)
     * @param {number} time - Current time in seconds
     */
    updateAmbientGlow(time) {
        if (!this.ambientGlowActive || this.ambientGlowLights.length === 0) return;
        
        const isScreen = this.type === "screen";
        
        if (isScreen) {
            // Screen type: stable neutral glow with very subtle breathing
            const breathe = Math.sin(time * 0.5) * 0.02 + 0.98;  // 96-100% brightness
            
            for (const { light, baseOpacity } of this.ambientGlowLights) {
                // Neutral white/gray with subtle warmth variation
                light.color.setHSL(0.1, 0.05, 0.35 * breathe);
                light.opacity = baseOpacity;
            }
        } else {
            // Movie type: TV-like flicker using multiple sine waves (similar to Spark dynamic-lighting example)
            const baseHue = 0.6;  // Blue hue (0.6 = blue in HSL)
            const hueVariation = 0.05;  // Slight variation toward cyan/purple
            
            // Combine flickers for natural TV effect
            const slowFlicker = Math.sin(time * 6) * 0.04 + 0.5;       // Slow base
            const mediumFlicker = Math.sin(time * 13) * 0.1 + 0.1;     // Medium
            const fastFlicker = Math.sin(time * 20) * 0.1 + 0.1;       // Fast
            const combinedFlicker = (slowFlicker + mediumFlicker + fastFlicker) / 3;
            
            // Random-ish variation for saturation
            const randomFlicker = Math.sin(time * 4) * 0.5 + 0.5;
            
            for (const { light, baseOpacity } of this.ambientGlowLights) {
                // Vary hue slightly
                const h = baseHue + combinedFlicker * hueVariation;
                // Vary saturation
                const s = 0.4 + randomFlicker * 0.2;
                // Vary lightness (brightness) - this creates the flicker
                // Keep lightness very low (0.1 - 0.25) for subtle effect
                const l = 0.1 + combinedFlicker * 0.15;
                
                light.color.setHSL(h, s, l);
                light.opacity = baseOpacity;
            }
        }
    }
    
    /**
     * Set up spatial audio using Web Audio API PannerNode
     * We create our own panner instead of using THREE.PositionalAudio's internal system
     * because we're streaming audio chunks rather than playing a single buffer
     */
    _setupSpatialAudio() {
        if (!audioListenerRef || !this.mesh) {
            console.log(`[Foundry] No audio listener or mesh, skipping spatial audio setup`);
            return;
        }
        
        // Store config for later use when audio context is ready
        this.spatialConfig = this.config.spatialAudio || {};
        
        // We'll create the actual panner node when the audio context is initialized
        // For now, just mark that we want spatial audio
        this.useSpatialAudio = true;
        
        console.log(`[Foundry] "${this.config.name}" spatial audio enabled`);
    }
    
    /**
     * Create the panner node for spatial audio (called when audio context is ready)
     */
    _createPannerNode() {
        if (!this.audioCtx || !this.useSpatialAudio || this.pannerNode) {
            return;
        }
        
        const spatialConfig = this.spatialConfig || {};
        const refDistance = spatialConfig.refDistance ?? 5;
        const rolloffFactor = spatialConfig.rolloffFactor ?? 1;
        const maxDistance = spatialConfig.maxDistance ?? 50;
        const volume = spatialConfig.volume ?? 1.0;
        
        // Create panner node
        this.pannerNode = this.audioCtx.createPanner();
        this.pannerNode.panningModel = 'HRTF';  // Better 3D sound
        this.pannerNode.distanceModel = 'inverse';
        this.pannerNode.refDistance = refDistance;
        this.pannerNode.rolloffFactor = rolloffFactor;
        this.pannerNode.maxDistance = maxDistance;
        
        // Create gain node for volume control
        this.audioGainNode = this.audioCtx.createGain();
        this.audioGainNode.gain.value = volume;
        
        // Connect: sources -> gain -> panner -> destination
        this.audioGainNode.connect(this.pannerNode);
        this.pannerNode.connect(this.audioCtx.destination);
        
        // Set initial position from mesh
        this._updatePannerPosition();
        
        console.log(`[Foundry] "${this.config.name}" panner created: refDist=${refDistance}, rolloff=${rolloffFactor}, maxDist=${maxDistance}`);
    }
    
    /**
     * Update panner position from mesh world position
     */
    _updatePannerPosition() {
        if (!this.pannerNode || !this.mesh) return;
        
        // Get mesh world position
        const worldPos = new THREE.Vector3();
        this.mesh.getWorldPosition(worldPos);
        
        // Update panner position
        if (this.pannerNode.positionX) {
            // Modern API
            this.pannerNode.positionX.value = worldPos.x;
            this.pannerNode.positionY.value = worldPos.y;
            this.pannerNode.positionZ.value = worldPos.z;
        } else {
            // Legacy API
            this.pannerNode.setPosition(worldPos.x, worldPos.y, worldPos.z);
        }
    }
    
    /**
     * Pause playback - sends command to server and pauses client-side
     * @param {boolean} fromRemote - If true, don't notify listeners (avoid echo)
     */
    pause(fromRemote = false) {
        if (this.isPaused) return;
        this.isPaused = true;
        
        // Send pause command to server (stops transmission)
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "pause" }));
        }
        
        // Dim ambient glow when paused
        this._setAmbientGlowVisible(false);
        
        console.log(`[Foundry] "${this.config.name}" paused`);
        
        // Notify listeners (unless this is from a remote sync)
        if (!fromRemote && this.worldUrl) {
            notifyPlaybackChange(this.worldUrl, this.config.name, true);
        }
    }
    
    /**
     * Resume playback - sends command to server and resumes client-side
     * @param {boolean} fromRemote - If true, don't notify listeners (avoid echo)
     */
    resume(fromRemote = false) {
        if (!this.isPaused) return;
        this.isPaused = false;
        
        // Send resume command to server (resumes transmission)
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "resume" }));
        }
        
        // Reset audio timing to avoid stutter
        if (this.audioCtx) {
            this.nextPlaybackTime = this.audioCtx.currentTime + 0.05;
        }
        
        // Request keyframe to ensure clean resume
        this._requestKeyframe("resume");
        
        // Restore ambient glow when playing
        this._setAmbientGlowVisible(true);
        
        console.log(`[Foundry] "${this.config.name}" resumed`);
        
        // Notify listeners (unless this is from a remote sync)
        if (!fromRemote && this.worldUrl) {
            notifyPlaybackChange(this.worldUrl, this.config.name, false);
        }
    }
    
    /**
     * Restart playback from the beginning - sends command to server
     * Only applies to movie type (screen streams don't have a beginning)
     */
    restart() {
        // Screen type doesn't support restart (live stream)
        if (this.type === "screen") {
            console.log(`[Foundry] "${this.config.name}" restart ignored (screen type)`);
            return;
        }
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "restart" }));
            console.log(`[Foundry] "${this.config.name}" restart requested`);
            
            // Reset audio timing
            if (this.audioCtx) {
                this.nextPlaybackTime = this.audioCtx.currentTime + 0.05;
            }
            
            // Request keyframe to ensure clean start
            this._requestKeyframe("restart");
        }
    }
    
    /**
     * Toggle pause state
     */
    togglePause() {
        if (this.isPaused) {
            this.resume();
        } else {
            this.pause();
        }
        return this.isPaused;
    }
    
    /**
     * Connect to Foundry server
     */
    async connect(options = {}) {
        if (this.isConnected) return true;
        
        // Set restart flag if host is starting the movie
        this._restartOnConnect = options.restart || false;
        
        try {
            // Reset frame size so first frame triggers proper canvas/texture setup
            this.frameSize = { w: 0, h: 0 };
            
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
     * Uses the listener's context if spatial audio is available for proper 3D audio
     */
    _initAudioContext() {
        if (!this.audioCtx) {
            // Use the listener's context if we have spatial audio, otherwise create our own
            if (this.useSpatialAudio && audioListenerRef) {
                this.audioCtx = audioListenerRef.context;
                console.log(`[Foundry] Using listener's audio context for spatial audio, state: ${this.audioCtx.state}`);
            } else {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                console.log(`[Foundry] Audio context created (non-spatial), state: ${this.audioCtx.state}`);
            }
        }
        
        // Resume if suspended (this works because we're in a click handler)
        if (this.audioCtx.state === "suspended") {
            this.audioCtx.resume().then(() => {
                console.log(`[Foundry] Audio context resumed`);
            });
        }
        
        // iOS Safari workaround: play a tiny silent buffer to fully unlock audio
        // This is needed because iOS requires actual audio output during user gesture
        if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
            const silentBuffer = this.audioCtx.createBuffer(1, 1, 22050);
            const source = this.audioCtx.createBufferSource();
            source.buffer = silentBuffer;
            source.connect(this.audioCtx.destination);
            source.start(0);
            console.log(`[Foundry] iOS audio unlock triggered`);
        }
        
        // Create panner node now that audio context is ready
        if (this.useSpatialAudio) {
            this._createPannerNode();
        }
        
        this.nextPlaybackTime = this.audioCtx.currentTime + 0.05;
    }
    
    /**
     * Open WebSocket connection
     */
    _openSocket() {
        // Support URL override for remote servers (Fly.io, etc.)
        const wsUrl = window.FOUNDRY_URL_OVERRIDE || this.config.wsUrl;
        console.log(`[Foundry] "${this.config.name}" connecting to: ${wsUrl}`);
        const socket = new WebSocket(wsUrl);
        this.ws = socket;
        socket.binaryType = "arraybuffer";
        
        socket.onopen = () => {
            if (this.ws !== socket) return socket.close();
            console.log(`[Foundry] "${this.config.name}" socket opened (type: ${this.type})`);
            this._resetBackoff();
            this.isConnected = true;
            this._setupTexture();
            
            // Enable ambient glow when connected
            this._setAmbientGlowVisible(true);
            
            // Fetch movie info from foundry-player (only for movie type)
            if (this.type === "movie") {
                this._fetchMovieInfo(wsUrl);
            }
            
            // Request video mode
            this._sendJson({ type: "mode", mode: "video", codec: REQUESTED_CODEC });
            
            // Restart playback from beginning if requested (host starting movie)
            if (this._restartOnConnect) {
                this._sendJson({ type: "restart" });
                console.log(`[Foundry] "${this.config.name}" restart requested on connect`);
                this._restartOnConnect = false; // Only restart once
            }
            
            // Request keyframe with retries to handle network latency
            this._requestKeyframe("socket-open");
            // Additional requests with delays for high-latency connections
            setTimeout(() => this._requestKeyframe("socket-open-retry-1"), 200);
            setTimeout(() => this._requestKeyframe("socket-open-retry-2"), 500);
        };
        
        socket.onclose = (ev) => {
            if (this.ws !== socket) return;
            const reason = ev.reason ? `${ev.code} ${ev.reason}` : `${ev.code}`;
            console.log(`[Foundry] "${this.config.name}" socket closed (${reason})`);
            this.isConnected = false;
            this._showPlaceholder();
            
            // Disable ambient glow when disconnected
            this._setAmbientGlowVisible(false);
            
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
     * Routes through spatial audio if available for 3D positioning
     */
    _playAudio(samples, sampleRate, channels) {
        // Skip if paused
        if (this.isPaused) {
            return;
        }
        
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
        
        // Route through spatial audio if available, otherwise direct to destination
        if (this.audioGainNode && this.pannerNode) {
            // Update panner position from mesh
            this._updatePannerPosition();
            // Connect to our gain node -> panner -> destination chain
            source.connect(this.audioGainNode);
        } else {
            // Fallback to direct output
            source.connect(this.audioCtx.destination);
        }
        
        const now = this.audioCtx.currentTime;
        const duration = samplesPerChannel / sampleRate;
        
        // Buffer 50ms ahead for tighter sync (matches foundry)
        const bufferAhead = 0.05;
        
        // If we've fallen too far behind (>300ms), reset to catch up
        if (this.nextPlaybackTime < now - 0.3) {
            this.nextPlaybackTime = now + bufferAhead;
        }
        
        // If we're too far ahead (>500ms buffer), skip to reduce latency
        if (this.nextPlaybackTime > now + 0.5) {
            this.nextPlaybackTime = now + bufferAhead;
        }
        
        const startAt = Math.max(now + bufferAhead, this.nextPlaybackTime);
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
        
        // Skip frame updates when paused (keeps last frame displayed)
        if (this.isPaused) {
            bitmap.close?.();
            return;
        }
        
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
                
                // Update mesh to match actual video aspect ratio
                // Geometry was created with (width, width/configAspect)
                // Scale Y so displayed aspect matches video aspect
                const videoAspect = fw / fh;
                const configAspect = this.config.aspectRatio || (16/9);
                this.mesh.scale.set(1, configAspect / videoAspect, 1);
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
     * Fetch movie info from foundry-player's /movie-info endpoint
     * @param {string} wsUrl - WebSocket URL to derive HTTP URL from
     */
    async _fetchMovieInfo(wsUrl) {
        try {
            // Convert WebSocket URL to HTTP URL
            // wss://host:port/ws -> https://host:port/movie-info
            // ws://host:port/ws -> http://host:port/movie-info
            let httpUrl = wsUrl
                .replace(/^wss:/, 'https:')
                .replace(/^ws:/, 'http:')
                .replace(/\/ws$/, '/movie-info');
            
            console.log(`[Foundry] "${this.config.name}" fetching movie info from: ${httpUrl}`);
            
            const response = await fetch(httpUrl);
            if (response.ok) {
                const text = await response.text();
                console.log(`[Foundry] "${this.config.name}" raw movie info response:`, text);
                
                try {
                    this.movieInfo = JSON.parse(text);
                    console.log(`[Foundry] "${this.config.name}" ✓ movie info loaded:`);
                    console.log(`[Foundry]   title: "${this.movieInfo.title || '(none)'}"`);
                    console.log(`[Foundry]   description: "${(this.movieInfo.description || '(none)').substring(0, 50)}${(this.movieInfo.description?.length > 50) ? '...' : ''}"`);
                    console.log(`[Foundry]   year: ${this.movieInfo.year || '(none)'}`);
                } catch (parseError) {
                    console.error(`[Foundry] "${this.config.name}" failed to parse movie info JSON:`, parseError.message);
                    console.error(`[Foundry]   raw response was:`, text.substring(0, 200));
                    this.movieInfo = null;
                }
            } else {
                const errorText = await response.text().catch(() => '(no body)');
                console.warn(`[Foundry] "${this.config.name}" movie info not available:`);
                console.warn(`[Foundry]   status: ${response.status} ${response.statusText}`);
                console.warn(`[Foundry]   body: ${errorText.substring(0, 200)}`);
                this.movieInfo = null;
            }
        } catch (error) {
            console.warn(`[Foundry] "${this.config.name}" failed to fetch movie info:`);
            console.warn(`[Foundry]   error: ${error.message}`);
            console.warn(`[Foundry]   this may happen if foundry-player doesn't have /movie-info endpoint (needs redeploy)`);
            this.movieInfo = null;
        }
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
        
        // Clean up audio - only close context if we created it ourselves (not spatial audio)
        if (this.audioCtx) {
            // Don't close shared context (spatial audio uses listener's context)
            if (!this.useSpatialAudio) {
                this.audioCtx.close().catch(() => {});
            }
            this.audioCtx = null;
            this.nextPlaybackTime = null;
        }
        
        // Clean up spatial audio nodes
        if (this.pannerNode) {
            this.pannerNode.disconnect();
            this.pannerNode = null;
        }
        if (this.audioGainNode) {
            this.audioGainNode.disconnect();
            this.audioGainNode = null;
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
        
        // Clean up spatial audio nodes
        if (this.pannerNode) {
            this.pannerNode.disconnect();
            this.pannerNode = null;
        }
        if (this.audioGainNode) {
            this.audioGainNode.disconnect();
            this.audioGainNode = null;
        }
        
        // Clean up ambient glow
        if (this.ambientGlowLayer) {
            if (this.ambientGlowLayer.parent) {
                this.ambientGlowLayer.parent.remove(this.ambientGlowLayer);
            }
            this.ambientGlowLayer = null;
            this.ambientGlowLights = [];
        }
        
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
export function initFoundryShare(scene, camera, localFrame, audioListener = null) {
    sceneRef = scene;
    cameraRef = camera;
    localFrameRef = localFrame;
    audioListenerRef = audioListener;
    
    console.log("[Foundry] Initialized" + (audioListener ? " with spatial audio support" : ""));
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
        const display = createFoundryPlaceholder(config, worldno, worldUrl);
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
function createFoundryPlaceholder(config, worldno, worldUrl) {
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
    
    return new FoundryDisplay(config, mesh, worldUrl);
}

/**
 * Connect to a Foundry display (by name or index)
 * @param {string} worldUrl - World URL
 * @param {number|string} identifier - Display index or name
 * @param {Object} options - Connection options
 * @param {boolean} options.restart - If true, restart playback from beginning (for host starting movie)
 */
export async function connectFoundry(worldUrl, identifier = 0, options = {}) {
    console.log(`[Foundry] connectFoundry called: worldUrl=${worldUrl}, identifier=${identifier}, options=`, options);
    const displays = worldFoundryDisplays.get(worldUrl);
    console.log(`[Foundry] worldFoundryDisplays has ${displays ? displays.length : 0} displays for this world`);
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
    
    return display.connect(options);
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
        // Host is starting movie - restart playback from beginning
        return display.connect({ restart: true });
    }
}

/**
 * Check if Foundry is connected
 */
export function isFoundryConnected(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) return false;
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    return display?.isConnected ?? false;
}

/**
 * Get Foundry URL for a display
 */
export function getFoundryUrl(worldUrl, identifier = 0) {
    // If there's a global override (custom movie URL), use that
    if (window.FOUNDRY_URL_OVERRIDE) {
        return window.FOUNDRY_URL_OVERRIDE;
    }
    
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) return null;
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    return display?.config?.wsUrl || display?.config?.url || null;
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

/**
 * Update all Foundry displays (call each frame for animations)
 * @param {number} time - Current time in seconds
 */
export function updateFoundryDisplays(time) {
    for (const displays of worldFoundryDisplays.values()) {
        for (const display of displays) {
            display.updateAmbientGlow(time);
        }
    }
}

// ============================================
// Cinema Mode - Dims the environment for viewing
// ============================================

let cinemaOverlay = null;
let cinemaMode = false;
const cinemaModeListeners = new Set();

// VR cinema mode state
let rendererRef = null;
let savedLightIntensities = new Map(); // Store original intensities

/**
 * Set renderer reference for VR detection
 * @param {THREE.WebGLRenderer} renderer
 */
export function setCinemaRenderer(renderer) {
    rendererRef = renderer;
}

/**
 * Check if currently in VR mode
 */
function isInVRMode() {
    return rendererRef?.xr?.isPresenting ?? false;
}

/**
 * Toggle cinema mode - creates a CSS overlay that dims everything except the center
 */
export function toggleCinemaMode(worldUrl) {
    cinemaMode = !cinemaMode;
    
    if (cinemaMode) {
        enableCinemaMode(worldUrl);
    } else {
        disableCinemaMode();
    }
    
    // Notify listeners
    cinemaModeListeners.forEach(callback => callback(cinemaMode, worldUrl));
    
    return cinemaMode;
}

/**
 * Register a listener for cinema mode changes
 * @param {Function} callback - Called with (isActive: boolean, worldUrl: string)
 */
export function onCinemaModeChange(callback) {
    cinemaModeListeners.add(callback);
}

/**
 * Unregister a cinema mode listener
 */
export function offCinemaModeChange(callback) {
    cinemaModeListeners.delete(callback);
}

/**
 * Enable cinema mode - uses CSS vignette for non-VR, light dimming for VR
 */
export function enableCinemaMode(worldUrl) {
    if (cinemaOverlay) {
        disableCinemaMode();
    }
    
    // Dim scene lights (works for meshes in both VR and non-VR)
    dimSceneLights();
    
    if (isInVRMode()) {
        // VR mode: Create a dark sphere around the player
        enableVRCinemaMode();
    } else {
        // Non-VR: Use CSS overlay
        enableCSSCinemaMode();
    }
    
    cinemaMode = true;
}

/**
 * Enable CSS-based cinema mode (for non-VR)
 */
function enableCSSCinemaMode() {
    cinemaOverlay = document.createElement('div');
    cinemaOverlay.id = 'cinema-overlay';
    cinemaOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 100;
        background: radial-gradient(
            ellipse 60% 60% at 50% 50%,
            transparent 0%,
            transparent 40%,
            rgba(0, 0, 0, 0.3) 60%,
            rgba(0, 0, 0, 0.6) 80%,
            rgba(0, 0, 0, 0.8) 100%
        );
    `;
    
    document.body.appendChild(cinemaOverlay);
}

/**
 * Enable VR cinema mode - just dims lights for now
 * TODO: Splat-based darkening approaches didn't work well, revisit later
 */
function enableVRCinemaMode() {
    // For now, VR cinema mode only uses the light dimming (already applied in enableCinemaMode)
    // The splat-based sphere/cone approaches had rendering issues
    console.log("[Cinema] VR cinema mode enabled (light dimming only)");
}

/**
 * Dim scene lights (for meshes that respond to lighting)
 */
function dimSceneLights() {
    if (!sceneRef) return;
    
    savedLightIntensities.clear();
    
    sceneRef.traverse((obj) => {
        if (obj.isLight) {
            // Save original intensity
            savedLightIntensities.set(obj.uuid, obj.intensity);
            
            // Dim the light significantly
            if (obj.isAmbientLight) {
                obj.intensity = 0.05; // Very dim ambient
            } else {
                obj.intensity = obj.intensity * 0.1; // 10% of original
            }
        }
    });
    
    console.log(`[Cinema] Dimmed ${savedLightIntensities.size} lights`);
}

/**
 * Restore scene lights to original intensities
 */
function restoreSceneLights() {
    if (!sceneRef || savedLightIntensities.size === 0) return;
    
    sceneRef.traverse((obj) => {
        if (obj.isLight && savedLightIntensities.has(obj.uuid)) {
            obj.intensity = savedLightIntensities.get(obj.uuid);
        }
    });
    
    console.log(`[Cinema] Restored ${savedLightIntensities.size} lights`);
    savedLightIntensities.clear();
}

/**
 * Disable cinema mode
 */
export function disableCinemaMode() {
    // Restore lights
    restoreSceneLights();
    
    // Remove CSS overlay
    if (cinemaOverlay) {
        cinemaOverlay.remove();
        cinemaOverlay = null;
    }
    
    cinemaMode = false;
    console.log("[Cinema] Cinema mode disabled");
}

/**
 * Check if cinema mode is active
 */
export function isCinemaModeActive() {
    return cinemaMode;
}

/**
 * Update cinema mode - handle VR state changes
 * Call this when entering/exiting VR while cinema mode is active
 */
export function updateCinemaMode(worldUrl) {
    if (!cinemaMode) return;
    
    const inVR = isInVRMode();
    const hasCSSOverlay = cinemaOverlay !== null;
    
    // Switch between VR and non-VR modes if needed
    if (inVR && hasCSSOverlay) {
        // Entered VR while cinema mode was on - remove CSS overlay (light dimming still active)
        cinemaOverlay.remove();
        cinemaOverlay = null;
        console.log("[Cinema] Switched to VR mode (light dimming only)");
    } else if (!inVR && !hasCSSOverlay) {
        // Exited VR while cinema mode was on - restore CSS overlay
        enableCSSCinemaMode();
        console.log("[Cinema] Switched to non-VR mode (CSS overlay + light dimming)");
    }
}

/**
 * Get the position of a Foundry display screen
 * @param {string} worldUrl - World URL to get display from
 * @param {number|string} identifier - Display index or name
 * @returns {THREE.Vector3|null} - Screen position or null if not found
 */
export function getFoundryScreenPosition(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) {
        return null;
    }
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    if (!display?.mesh?.position) {
        return null;
    }
    
    return display.mesh.position.clone();
}

/**
 * Get the rotation of a Foundry display screen
 * @param {string} worldUrl - World URL to get display from
 * @param {number|string} identifier - Display index or name
 * @returns {THREE.Quaternion|null} - Screen rotation or null if not found
 */
export function getFoundryScreenRotation(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) {
        return null;
    }
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    if (!display?.mesh?.quaternion) {
        return null;
    }
    
    return display.mesh.quaternion.clone();
}

/**
 * Get the movie config from a Foundry display
 * Returns movie info fetched from foundry-player's /movie-info endpoint
 * @param {string} worldUrl - World URL to get display from
 * @param {number|string} identifier - Display index or name
 * @returns {Object|null} - Movie config {title, description, year} or null if not found
 */
export function getFoundryMovieConfig(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) {
        console.log(`[Foundry] getFoundryMovieConfig: no displays for worldUrl=${worldUrl}`);
        return null;
    }
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    if (!display) {
        console.log(`[Foundry] getFoundryMovieConfig: display not found (identifier=${identifier})`);
        return null;
    }
    
    // Return movie info fetched from foundry-player (preferred) or fall back to static config
    if (display.movieInfo) {
        console.log(`[Foundry] getFoundryMovieConfig: using fetched movieInfo - title="${display.movieInfo.title}"`);
        return display.movieInfo;
    } else if (display.config?.movie) {
        console.log(`[Foundry] getFoundryMovieConfig: using static config.movie - title="${display.config.movie.title}"`);
        return display.config.movie;
    } else {
        console.log(`[Foundry] getFoundryMovieConfig: no movie info available for display "${display.config?.name}"`);
        return null;
    }
}

/**
 * Get the full display config from a Foundry display
 * @param {string} worldUrl - World URL to get display from
 * @param {number|string} identifier - Display index or name
 * @returns {Object|null} - Full display config or null if not found
 */
export function getFoundryDisplayConfig(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) {
        return null;
    }
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    return display?.config || null;
}

/**
 * Get the type of a Foundry display ("movie" or "screen")
 * @param {string} worldUrl - World URL to get display from
 * @param {number|string} identifier - Display index or name
 * @returns {string|null} - Display type or null if not found
 */
export function getFoundryDisplayType(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) {
        return null;
    }
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    return display?.type || null;
}

/**
 * Capture the current frame from a Foundry display as a data URL
 * @param {string} worldUrl - World URL to get display from
 * @param {number|string} identifier - Display index or name
 * @returns {string|null} - Base64 data URL of the frame, or null if unavailable
 */
export function captureFoundryFrame(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) {
        return null;
    }
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    if (!display || !display.frameCanvas) {
        return null;
    }
    
    try {
        // Get the frame as a JPEG data URL (smaller than PNG)
        const dataUrl = display.frameCanvas.toDataURL('image/jpeg', 0.7);
        
        return dataUrl;
    } catch (error) {
        console.warn('[Foundry] Failed to capture frame:', error);
        return null;
    }
}

/**
 * Pause a Foundry display
 * @param {string} worldUrl - World URL to get display from
 * @param {number|string} identifier - Display index or name
 */
export function pauseFoundryDisplay(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) return;
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    display?.pause();
}

/**
 * Resume a Foundry display
 * @param {string} worldUrl - World URL to get display from
 * @param {number|string} identifier - Display index or name
 */
export function resumeFoundryDisplay(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) return;
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    display?.resume();
}

/**
 * Toggle pause state of a Foundry display
 * @param {string} worldUrl - World URL to get display from
 * @param {number|string} identifier - Display index or name
 * @returns {boolean|null} - New pause state, or null if display not found
 */
export function toggleFoundryDisplayPause(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) return null;
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    return display?.togglePause() ?? null;
}

/**
 * Check if a Foundry display is paused
 * @param {string} worldUrl - World URL to get display from
 * @param {number|string} identifier - Display index or name
 * @returns {boolean|null} - Pause state, or null if display not found
 */
export function isFoundryDisplayPaused(worldUrl, identifier = 0) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) return null;
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    return display?.isPaused ?? null;
}

/**
 * Set pause state of a Foundry display (for remote sync)
 * @param {string} worldUrl - World URL to get display from
 * @param {number|string} identifier - Display index or name
 * @param {boolean} paused - New pause state
 */
export function setFoundryDisplayPaused(worldUrl, identifier = 0, paused = true) {
    const displays = worldFoundryDisplays.get(worldUrl);
    if (!displays || displays.length === 0) return;
    
    let display;
    if (typeof identifier === 'number') {
        display = displays[identifier];
    } else {
        display = displays.find(d => d.config.name === identifier);
    }
    
    if (!display) return;
    
    // Pass fromRemote=true to avoid echoing the state change back
    if (paused && !display.isPaused) {
        display.pause(true);
    } else if (!paused && display.isPaused) {
        display.resume(true);
    }
}

// Playback state change listeners
const playbackChangeListeners = new Set();

/**
 * Register a listener for playback state changes
 * @param {Function} callback - (worldUrl, displayName, isPaused) => void
 * @returns {Function} - Unsubscribe function
 */
export function onPlaybackStateChange(callback) {
    playbackChangeListeners.add(callback);
    return () => playbackChangeListeners.delete(callback);
}

/**
 * Notify listeners of playback state change (internal)
 */
function notifyPlaybackChange(worldUrl, displayName, isPaused) {
    for (const listener of playbackChangeListeners) {
        try {
            listener(worldUrl, displayName, isPaused);
        } catch (e) {
            console.error('[Foundry] Error in playback change listener:', e);
        }
    }
}