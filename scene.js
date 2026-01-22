import * as THREE from "three";
import { SplatMesh } from "@sparkjsdev/spark";
import { worldToUniverse } from "./coordinate-transform.js";
import { setupPortalLighting } from "./port.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

// Loaders
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();

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
     * @param {Array} rotation - Rotation quaternion [x, y, z, w] (default: identity)
     * @returns {Promise<SplatMesh>} The loaded mesh
     */
    async loadSplatandSetPosition(url, position = [0, 0, 0], world = 0, rotation = [0, 0, 0, 1]) {
        console.log("Loading", url);

        const absoluteURL = new URL(url, window.location.href).href;

        // Pre-check if the URL is accessible (catches 404s early with clear error)
        try {
            const headResponse = await fetch(absoluteURL, { method: 'HEAD' });
            if (!headResponse.ok) {
                console.error(`[Scene] Failed to load splat: ${absoluteURL}`);
                console.error(`[Scene]   HTTP ${headResponse.status}: ${headResponse.statusText}`);
                console.error(`[Scene]   Check that splatUrl in world.json is correct`);
                throw new Error(`Splat file not found: ${absoluteURL} (HTTP ${headResponse.status})`);
            }
        } catch (fetchError) {
            if (fetchError.message.includes('Splat file not found')) {
                throw fetchError; // Re-throw our custom error
            }
            // Network error or CORS - log but continue (SplatMesh might handle it differently)
            console.warn(`[Scene] Could not pre-check splat URL (may still load): ${absoluteURL}`, fetchError.message);
        }

        try {
            const mesh = new SplatMesh({ url: absoluteURL, paged: true });
            await mesh.initialized;

            if (Array.isArray(position)) {
                mesh.position.fromArray(position);
            } else {
                mesh.position.copy(position);
            }
            mesh.quaternion.fromArray(rotation);
            if (world !== 0) {
                const universePos = worldToUniverse(mesh.position, world);
                mesh.position.copy(universePos);
            }

            this.scene.add(mesh);
            console.log("Loaded", url);
            return mesh;
        } catch (error) {
            console.error(`[Scene] Failed to initialize splat mesh: ${absoluteURL}`);
            console.error(`[Scene]   Error: ${error.message}`);
            console.error(`[Scene]   Check that splatUrl in world.json points to a valid .spz file`);
            throw error;
        }
    }

    /**
     * Load a collision mesh (GLB) and set its position
     * @param {string} url - URL to the GLB file
     * @param {number} world - World number (0 for root world)
     * @param {boolean} visible - Initial visibility (default false)
     * @returns {Promise<THREE.Group>} The loaded collision mesh
     */
    async loadCollisionMesh(url, world = 0, visible = false, bustCache = true) {
        console.log("Loading collision mesh:", url);

        let absoluteURL = new URL(url, window.location.href).href;
        
        // Add cache-busting query parameter to force fresh load
        if (bustCache) {
            const separator = absoluteURL.includes('?') ? '&' : '?';
            absoluteURL += `${separator}_t=${Date.now()}`;
        }

        return new Promise((resolve, reject) => {
            gltfLoader.load(
                absoluteURL,
                (gltf) => {
                    const collisionMesh = gltf.scene;
                    
                    // Apply wireframe material to all meshes for debugging visibility
                    collisionMesh.traverse((child) => {
                        if (child.isMesh) {
                            child.material = new THREE.MeshBasicMaterial({
                                color: 0x00ff00,
                                wireframe: true,
                                transparent: true,
                                opacity: 0.5
                            });
                        }
                    });
                    
                    // Transform to universe coordinates if not root world
                    if (world !== 0) {
                        const universePos = worldToUniverse(collisionMesh.position, world);
                        collisionMesh.position.copy(universePos);
                    }
                    
                    // Set initial visibility
                    collisionMesh.visible = visible;
                    
                    this.scene.add(collisionMesh);
                    
                    // Debug: log mesh info
                    let meshCount = 0;
                    collisionMesh.traverse((child) => {
                        if (child.isMesh) meshCount++;
                    });
                    console.log("Loaded collision mesh:", url);
                    console.log("  Contains", meshCount, "mesh(es)");
                    console.log("  Position:", collisionMesh.position.toArray());
                    console.log("  Visible:", collisionMesh.visible);
                    
                    resolve(collisionMesh);
                },
                (progress) => {
                    if (progress.total) {
                        console.log(`Loading collision mesh: ${(progress.loaded / progress.total * 100).toFixed(0)}%`);
                    }
                },
                (error) => {
                    console.error("Error loading collision mesh:", url, error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Load a character model (FBX or GLB) with animation
     * @param {Object} characterData - Character configuration from world.json
     * @param {string} characterData.name - Character name
     * @param {string} characterData.model - Model file path
     * @param {Array<number>} characterData.position - Position [x, y, z]
     * @param {Array<number>} characterData.rotation - Rotation as quaternion [x, y, z, w] or Euler [x, y, z]
     * @param {number} characterData.scale - Uniform scale (default 1)
     * @param {number} world - World number for position offset
     * @param {Function} resolveUrl - URL resolver function
     * @returns {Promise<{model: THREE.Group, mixer: THREE.AnimationMixer}>}
     */
    async loadCharacter(characterData, world = 0, resolveUrl = null) {
        const { name, model, position = [0, 0, 0], rotation = [0, 0, 0, 1], scale = 1 } = characterData;
        
        console.log(`Loading character "${name}":`, model);
        
        // Resolve the URL
        let url = model;
        if (resolveUrl && !model.startsWith('http')) {
            url = resolveUrl(model);
        }
        const absoluteURL = new URL(url, window.location.href).href;
        
        // Determine loader based on file extension
        const ext = model.toLowerCase().split('.').pop();
        const isFBX = ext === 'fbx';
        
        return new Promise((resolve, reject) => {
            const loader = isFBX ? fbxLoader : gltfLoader;
            
            loader.load(
                absoluteURL,
                (result) => {
                    // FBX returns the object directly, GLTF has a .scene property
                    const characterModel = isFBX ? result : result.scene;
                    
                    // Set position
                    characterModel.position.fromArray(position);
                    
                    // Transform to universe coordinates if not root world
                    if (world !== 0) {
                        const universePos = worldToUniverse(characterModel.position, world);
                        characterModel.position.copy(universePos);
                    }
                    
                    // Set rotation (support both quaternion [x,y,z,w] and Euler [x,y,z])
                    if (rotation.length === 4) {
                        characterModel.quaternion.fromArray(rotation);
                    } else if (rotation.length === 3) {
                        characterModel.rotation.fromArray(rotation);
                    }
                    
                    // Set scale
                    if (typeof scale === 'number') {
                        characterModel.scale.setScalar(scale);
                    } else if (Array.isArray(scale)) {
                        characterModel.scale.fromArray(scale);
                    }
                    
                    // Create animation mixer
                    const mixer = new THREE.AnimationMixer(characterModel);
                    
                    // Get animations (FBX stores them in result.animations, GLTF in result.animations)
                    const animations = isFBX ? result.animations : result.animations;
                    
                    // Play all animations (or just the first one)
                    if (animations && animations.length > 0) {
                        console.log(`  Found ${animations.length} animation(s) for "${name}"`);
                        animations.forEach((clip, index) => {
                            console.log(`    - ${clip.name || `Animation ${index}`} (${clip.duration.toFixed(2)}s)`);
                            const action = mixer.clipAction(clip);
                            action.play();
                        });
                    } else {
                        console.log(`  No animations found for "${name}"`);
                    }
                    
                    // Add to scene
                    this.scene.add(characterModel);
                    
                    console.log(`  Character "${name}" loaded at`, characterModel.position.toArray());
                    
                    resolve({ model: characterModel, mixer, animations });
                },
                (progress) => {
                    if (progress.total) {
                        const pct = (progress.loaded / progress.total * 100).toFixed(0);
                        console.log(`Loading character "${name}": ${pct}%`);
                    }
                },
                (error) => {
                    console.error(`Error loading character "${name}":`, error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Remove a character from the scene
     * @param {{model: THREE.Group, mixer: THREE.AnimationMixer}} character
     */
    removeCharacter(character) {
        if (character.mixer) {
            character.mixer.stopAllAction();
        }
        if (character.model) {
            this.scene.remove(character.model);
            character.model.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
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
