import * as THREE from "three";
import { SplatMesh } from "@sparkjsdev/spark";
import { worldToUniverse } from "./coordinate-transform.js";
import { setupPortalLighting } from "./port.js";

/**
 * ProtoScene - Manages the Three.js scene, camera, renderer, and local frame
 */
export class ProtoScene {
    constructor() {
        // ========== Scene Setup ==========
        this.scene = new THREE.Scene();

        // ========== Camera Setup ==========
        this.camera = new THREE.PerspectiveCamera(
            90,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        // ========== Renderer Setup ==========
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        // ========== Local Frame Setup ==========
        // Local frame for camera (used for movement and teleportation)
        this.localFrame = new THREE.Group();
        this.scene.add(this.localFrame);
        this.localFrame.add(this.camera);
        this.localFrame.position.set(0, 2, 0);

        // Setup lighting for portal materials
        setupPortalLighting(this.scene, this.camera);
    }

    /**
     * Get the scene instance
     * @returns {THREE.Scene}
     */
    getScene() {
        return this.scene;
    }

    /**
     * Get the camera instance
     * @returns {THREE.PerspectiveCamera}
     */
    getCamera() {
        return this.camera;
    }

    /**
     * Get the renderer instance
     * @returns {THREE.WebGLRenderer}
     */
    getRenderer() {
        return this.renderer;
    }

    /**
     * Get the local frame instance
     * @returns {THREE.Group}
     */
    getLocalFrame() {
        return this.localFrame;
    }

    /**
     * Handle window resize - update camera and renderer
     */
    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * Load a splat mesh and set its position
     * @param {string} url - URL to the splat file
     * @param {Array|THREE.Vector3} position - Position [x, y, z] or Vector3
     * @param {number} world - World number (0 for root world)
     * @returns {Promise<SplatMesh>} The loaded mesh
     */
    async loadSplatandSetPosition(url, position = [0, 0, 0], world = 0) {
        console.log("Loading", url);

        const absoluteURL = new URL(url, window.location.href).href;

        const mesh = new SplatMesh({ url: absoluteURL, paged: true });
        await mesh.initialized;

        if (Array.isArray(position)) {
            mesh.position.fromArray(position);
        } else {
            mesh.position.copy(position);
        }
        mesh.quaternion.fromArray([0, 0, 0, 1]);
        if (world !== 0) {
            const universePos = worldToUniverse(mesh.position, world);
            mesh.position.copy(universePos);
        }

        this.scene.add(mesh);
        console.log("Loaded", url);
        return mesh;
    }
}

/**
 * Load world JSON data from a URL
 * @param {string} worldUrl - URL to the world.json file
 * @returns {Promise<Object>} World data object
 */
export async function loadWorldJSON(worldUrl) {
    console.log("loadWorldJSON:", worldUrl);
    // Use cache: 'reload' to force a fresh fetch and bypass browser cache
    // This ensures we always get the latest world.json from the server
    const response = await fetch(worldUrl, {
        cache: 'reload'
    });
    console.log("response:", response);
    const worlddata = await response.json();
    console.log("worlddata:", worlddata);
    return worlddata;
}
