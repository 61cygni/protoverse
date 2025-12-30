import { SparkControls, SparkXr } from "@sparkjsdev/spark";

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
    }
}

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
            controllers: {},
        });
        renderer.xr.setFramebufferScaleFactor(controlsConfig.xrFramebufferScale);
        window.sparkXr = sparkXr;
    }

    return {
        controls,
        sparkXr,
        config: controlsConfig
    };
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
    animatePortal = true
}) {
    return function animate(time, xrFrame) {
        stats.begin();

        // Update XR controllers (before controls.update)
        if (sparkXr?.updateControllers) {
            sparkXr.updateControllers(camera);
        }

        // Update movement controls
        controls.update(localFrame);

        // Update HUD
        updateHUD();

        // Update portal animations and VR disk visibility
        const isInVR = renderer.xr.isPresenting;
        updatePortalDisks(time, isInVR, animatePortal);

        // Update XR hands if active
        if (sparkXr?.updateHands && isInVR) {
            sparkXr.updateHands({ xrFrame });
        }

        // Update portals and render
        updatePortals();

        stats.end();
    };
}

