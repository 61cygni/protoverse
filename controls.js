import { SparkControls, SparkXr } from "@sparkjsdev/spark";
import * as THREE from "three";

// Reusable quaternions for rotation calculations
const _tempQuat = new THREE.Quaternion();
const _rotationQuat = new THREE.Quaternion();
const _euler = new THREE.Euler();

/**
 * Configuration options for controls
 */
export class ControlsConfig {
    constructor(options = {}) {
        this.enableVr = options.enableVr ?? true;
        this.animatePortal = options.animatePortal ?? true;
        this.xrFramebufferScale = options.xrFramebufferScale ?? 0.5;
        this.onEnterXr = options.onEnterXr ?? null;
        this.onExitXr = options.onExitXr ?? null;
        // VR rotation mode:
        // false = yaw only (turn left/right on XZ plane) - simpler, recommended
        // true = full 3DOF (yaw/pitch/roll with thumbstick + trigger/grip)
        this.vrFullRotation = options.vrFullRotation ?? false;
    }
}

// Store config reference for applyVRRotation
let activeControlsConfig = null;

/**
 * Initialize controls and VR support
 * @param {THREE.WebGLRenderer} renderer 
 * @param {THREE.Camera} camera 
 * @param {THREE.Group} localFrame 
 * @param {ControlsConfig|Object} config 
 * @returns {Object} Object containing controls and sparkXr instances
 */
export function initControls(renderer, camera, localFrame, config = {}) {
    const controlsConfig = config instanceof ControlsConfig ? config : new ControlsConfig(config);
    
    // Initialize movement controls
    const controls = new SparkControls({
        renderer,
        canvas: renderer.domElement,
    });

    // Initialize VR support if enabled
    let sparkXr = null;
    if (controlsConfig.enableVr) {
        sparkXr = new SparkXr({
            renderer,
            onMouseLeaveOpacity: 0.5,
            onReady: async (supported) => {
                console.log(`SparkXr ready: VR ${supported ? "supported" : "not supported"}`);
            },
            onEnterXr: () => {
                console.log("Enter XR");
                if (controlsConfig.onEnterXr) {
                    controlsConfig.onEnterXr();
                }
            },
            onExitXr: () => {
                console.log("Exit XR");
                if (controlsConfig.onExitXr) {
                    controlsConfig.onExitXr();
                }
            },
            enableHands: true,
            controllers: {
                // Disable SparkXr's built-in rotation - we'll handle it ourselves in local space
                getRotate: (gamepads, sparkXr) => {
                    // Return zero - we handle rotation manually in the animation loop
                    return new THREE.Vector3(0, 0, 0);
                },
            },
        });
        renderer.xr.setFramebufferScaleFactor(controlsConfig.xrFramebufferScale);
        window.sparkXr = sparkXr;
    }

    // Store config for applyVRRotation
    activeControlsConfig = controlsConfig;
    
    return {
        controls,
        sparkXr,
        config: controlsConfig
    };
}

/**
 * Apply VR controller rotation to localFrame
 * Two modes controlled by vrFullRotation config:
 * - false (default): yaw only (turn left/right on XZ plane)
 * - true: full 3DOF (yaw/pitch/roll)
 * @param {THREE.Group} localFrame - The local frame to rotate
 * @param {THREE.WebGLRenderer} renderer - Renderer for XR session access
 * @param {number} deltaTime - Time since last frame in seconds
 */
export function applyVRRotation(localFrame, renderer, deltaTime) {
    if (!renderer.xr.isPresenting) return;
    
    const session = renderer.xr.getSession();
    if (!session) return;
    
    const fullRotation = activeControlsConfig?.vrFullRotation ?? false;
    let yaw = 0, pitch = 0, roll = 0;
    const rotationSpeed = 1.5; // radians per second at full deflection
    
    for (const source of session.inputSources) {
        const gamepad = source.gamepad;
        if (!gamepad) continue;
        
        if (source.handedness === "right") {
            // Thumbstick left/right for yaw
            const rawYaw = gamepad.axes[2] || 0;
            if (Math.abs(rawYaw) > 0.1) yaw = rawYaw;
            
            // Full rotation mode: also read pitch and roll
            if (fullRotation) {
                // Thumbstick up/down for pitch
                const rawPitch = gamepad.axes[3] || 0;
                if (Math.abs(rawPitch) > 0.1) pitch = rawPitch;
                
                // Trigger/grip for roll
                const triggerValue = gamepad.buttons[0]?.value || 0;
                const gripValue = gamepad.buttons[1]?.value || 0;
                const rawRoll = (triggerValue - gripValue);
                if (Math.abs(rawRoll) > 0.1) roll = rawRoll;
            }
        }
    }
    
    // If no input, skip
    if (yaw === 0 && pitch === 0 && roll === 0) return;
    
    // Calculate rotation amounts for this frame
    const yawAmount = -yaw * rotationSpeed * deltaTime;    // Negate for natural feel
    const pitchAmount = -pitch * rotationSpeed * deltaTime; // Negate: push up to look up
    const rollAmount = -roll * rotationSpeed * deltaTime;   // Negate: trigger = roll right
    
    if (fullRotation) {
        // Full 3DOF: apply rotations in LOCAL space using quaternions
        
        // Yaw (rotate around LOCAL Y axis)
        if (yawAmount !== 0) {
            _rotationQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAmount);
            localFrame.quaternion.multiply(_rotationQuat);
        }
        
        // Pitch (rotate around LOCAL X axis)
        if (pitchAmount !== 0) {
            _rotationQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchAmount);
            localFrame.quaternion.multiply(_rotationQuat);
        }
        
        // Roll (rotate around LOCAL Z axis)
        if (rollAmount !== 0) {
            _rotationQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rollAmount);
            localFrame.quaternion.multiply(_rotationQuat);
        }
    } else {
        // Yaw only: apply around WORLD Y axis (turning on XZ plane)
        if (yawAmount !== 0) {
            _rotationQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAmount);
            localFrame.quaternion.premultiply(_rotationQuat);  // premultiply for world-space
        }
    }
    
    // Normalize to prevent drift
    localFrame.quaternion.normalize();
}

/**
 * Create an animation loop callback function
 * @param {Object} params - Parameters needed for the animation loop
 * @param {Stats} params.stats - Stats instance for FPS tracking
 * @param {Object} params.controls - Controls object from initControls
 * @param {Object} params.sparkXr - SparkXr instance (can be null)
 * @param {THREE.WebGLRenderer} params.renderer - Renderer instance (for VR detection)
 * @param {THREE.Camera} params.camera - Camera instance
 * @param {THREE.Group} params.localFrame - Local frame group
 * @param {Function} params.updateHUD - Function to update HUD
 * @param {Function} params.updatePortals - Function to update portals
 * @param {Function} params.updatePortalDisks - Function to update portal disks
 * @param {Function} params.updateMultiplayer - Function to update multiplayer (optional)
 * @param {Function} params.updatePhysics - Function to update physics (optional)
 * @param {Function} params.updateCharacters - Function to update character animations (optional)
 * @param {boolean} params.animatePortal - Whether to animate portals
 * @returns {Function} Animation loop callback function
 */
export function createAnimationLoop({
    stats,
    controls,
    sparkXr,
    renderer,
    camera,
    localFrame,
    updateHUD,
    updatePortals,
    updatePortalDisks,
    updateMultiplayer,
    updatePhysics,
    updateCharacters,
    updateFoundry,
    animatePortal = true
}) {
    let lastTime = performance.now();
    
    return function animate(time, xrFrame) {
        stats?.begin();
        
        // Calculate delta time in seconds
        const deltaTime = (time - lastTime) / 1000;
        lastTime = time;

        // Update XR controllers (before controls.update)
        if (sparkXr?.updateControllers) {
            sparkXr.updateControllers(camera);
        }
        
        // Apply VR rotation in local space (right controller)
        applyVRRotation(localFrame, renderer, deltaTime);

        // Update movement controls (may be disabled when physics is on)
        controls.update(localFrame);
        
        // Update physics (if enabled)
        if (updatePhysics) {
            updatePhysics(deltaTime);
        }

        // Update character animations
        if (updateCharacters) {
            updateCharacters(deltaTime, time);
        }

        // Update HUD
        updateHUD();

        // Update portal animations and VR disk visibility
        const isInVR = renderer.xr.isPresenting;
        updatePortalDisks(time, isInVR, animatePortal);

        // Update multiplayer (send position, animate peer avatars)
        if (updateMultiplayer) {
            updateMultiplayer(time);
        }

        // Update Foundry displays (ambient glow animation)
        if (updateFoundry) {
            updateFoundry(time / 1000);  // Convert to seconds
        }

        // Update XR hands if active
        if (sparkXr?.updateHands && isInVR) {
            sparkXr.updateHands({ xrFrame });
        }

        // Update portals and render
        updatePortals();

        stats?.end();
    };
}

