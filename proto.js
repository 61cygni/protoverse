import { SparkPortals } from "@sparkjsdev/spark";
import { ProtoPortal, PortalEffects } from "./port.js";
import { WorldState } from "./world-state.js";
import { VerseDag } from "./verse-dag.js";
import { worldNoAllocator } from "./worldno.js";
import { worldToUniverse } from "./coordinate-transform.js";
import { loadWorldJSON } from "./scene.js";
import { updateDiskAnimation } from "./sparkdisk.js";

/**
 * Configuration options for ProtoVerse
 */
export class ProtoVerseConfig {
    constructor(options = {}) {
        this.preloadHops = options.preloadHops ?? 2;
        this.showPortalLabels = options.showPortalLabels ?? false;
        this.useUrlsForLabels = options.useUrlsForLabels ?? true;
        this.urlBase = options.urlBase ?? "";
        this.useCdn = options.useCdn ?? false;
        this.resolveUrl = options.resolveUrl ?? null; // Function to resolve URLs
        this.onWorldChange = options.onWorldChange ?? null; // Callback when world changes (worldUrl, worldData)
    }
}

/**
 * ProtoVerse - Manages the portal system, world loading, and DAG synchronization
 */
export class ProtoVerse {
    constructor(protoScene, config = {}) {
        this.protoScene = protoScene;
        this.scene = protoScene.getScene();
        this.camera = protoScene.getCamera();
        this.renderer = protoScene.getRenderer();
        this.localFrame = protoScene.getLocalFrame();
        this.config = config instanceof ProtoVerseConfig ? config : new ProtoVerseConfig(config);
        
        // Initialize world state and DAG
        this.worldState = new WorldState();
        this.verseDag = new VerseDag();
        this.currentWorldUrl = null;
        
        // Initialize portal system
        this.portals = new SparkPortals({
            renderer: this.renderer,
            scene: this.scene,
            camera: this.camera,
            localFrame: this.localFrame,
            defaultPortalRadius: 1.0,
            sparkOptions: {
                maxStdDev: Math.sqrt(4),
                lodSplatScale: 0.5,
                behindFoveate: 0.3,
                coneFov0: 20.0,
                coneFov: 150.0,
                coneFoveate: 0.3,
            },
        });
    }

    /**
     * Get the current world URL
     * @returns {string} Current world URL
     */
    getCurrentWorldUrl() {
        return this.currentWorldUrl;
    }

    /**
     * Get the portals instance
     * @returns {SparkPortals}
     */
    getPortals() {
        return this.portals;
    }

    /**
     * Get the world state instance
     * @returns {WorldState}
     */
    getWorldState() {
        return this.worldState;
    }

    /**
     * Get the verse DAG instance
     * @returns {VerseDag}
     */
    getVerseDag() {
        return this.verseDag;
    }

    /**
     * Resolve a relative path to a full URL
     * @param {string} relativePath 
     * @returns {string}
     */
    _resolveUrl(relativePath) {
        if (this.config.resolveUrl) {
            return this.config.resolveUrl(relativePath);
        }
        // Fallback: if URL starts with http, return as-is, otherwise prepend URL_BASE
        if (relativePath.startsWith('http')) {
            return relativePath;
        }
        const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
        const base = this.config.urlBase.endsWith('/') ? this.config.urlBase.slice(0, -1) : this.config.urlBase;
        return `${base}/${cleanPath}`;
    }

    /**
     * Sync loaded worlds based on DAG traversal from the new root
     * @param {string} newRootUrl - The world URL to center on
     * @param {string} previousRootUrl - Where we came from (for keeping return portal)
     */
    async syncWorldsFromDag(newRootUrl, previousRootUrl = null) {
        console.log("=== syncWorldsFromDag ===");
        console.log("New root:", newRootUrl);
        console.log("Previous root:", previousRootUrl);

        // Phase 1: Ensure all reachable worlds have their worldData loaded
        // This is needed so the DAG knows about all outgoing portals
        this.verseDag.setRoot(newRootUrl);
        
        // Load root world data if missing
        let rootNode = this.verseDag.getWorld(newRootUrl);
        if (!rootNode || !rootNode.worldData) {
            console.warn("rootNode not in DAG. This probably indicates a bug.");
            const fetchUrl = newRootUrl.startsWith('http') ? newRootUrl : this._resolveUrl(newRootUrl);
            console.log("Loading world data for root:", newRootUrl, "->", fetchUrl);
            const worldData = await loadWorldJSON(fetchUrl);
            this.verseDag.loadWorldData(newRootUrl, worldData);
        }
        
        // Iteratively discover and load world data for reachable worlds
        // Keep going until no new worlds are discovered
        let discoveredNew = true;
        while (discoveredNew) {
            discoveredNew = false;
            const plan = this.verseDag.getTraversalPlan(this.config.preloadHops);
            
            for (const node of plan.worldsToLoad) {
                if (!node.worldData) {
                    // Resolve relative URL to full URL for fetching
                    const fetchUrl = node.url.startsWith('http') ? node.url : this._resolveUrl(node.url);
                    console.log("Discovering world data for:", node.url, "->", fetchUrl);
                    const worldData = await loadWorldJSON(fetchUrl);
                    this.verseDag.loadWorldData(node.url, worldData);
                    discoveredNew = true;
                }
            }
        }
        
        // Phase 2: Now get the final traversal plan with complete knowledge
        const plan = this.verseDag.getTraversalPlan(this.config.preloadHops);
        
        console.log("Traversal plan:");
        console.log("  Worlds to load:", plan.worldsToLoad.map(n => n.url));
        console.log("  Portals to setup:", plan.portalsToSetup.map(e => `${e.sourceUrl} -> ${e.destinationUrl}`));
        console.log("  Worlds to flush:", plan.worldsToFlush.map(n => n.url));

        // 1. Flush worlds that are too far away
        for (const node of plan.worldsToFlush) {
            const worldUrl = node.url;
            // Don't flush the previous root (we need its return portal)
            if (worldUrl === previousRootUrl) {
                console.log("Keeping previous root for return portal:", worldUrl);
                continue;
            }
            
            const state = this.worldState.get(worldUrl);
            if (state) {
                console.log("Flushing world:", worldUrl);
                // Dispose all portals
                for (const protoPortal of state.portalPairs) {
                    if (protoPortal instanceof ProtoPortal) {
                        protoPortal.dispose();
                    }
                }
                state.portalPairs = [];
                
                // Remove mesh from scene
                if (state.mesh) {
                    this.scene.remove(state.mesh);
                    state.mesh = null;
                }
                
                this.worldState.delete(worldUrl);
            }
        }

        // 2. Load world meshes for worlds in the plan
        for (const node of plan.worldsToLoad) {
            const worldUrl = node.url;
            const worldData = node.worldData; // Already loaded in Phase 1
            
            // Skip mesh loading if already loaded
            if (this.worldState.has(worldUrl) && this.worldState.get(worldUrl).mesh) {
                console.log("World mesh already loaded:", worldUrl);
                continue;
            }

            // Allocate worldno (0 for root, new number for others)
            const isRoot = (worldUrl === newRootUrl);
            let state = this.worldState.get(worldUrl);
            let worldno;
            
            if (state) {
                worldno = state.worldno;
            } else {
                worldno = isRoot && !previousRootUrl ? 0 : worldNoAllocator.allocate();
                state = this.worldState.create(worldUrl, worldData, worldno);
            }

            // Load mesh if not already loaded
            if (!state.mesh) {
                console.log("Loading mesh for:", worldUrl, "worldno:", worldno);
                // Resolve splatUrl to full URL if it's relative
                const splatUrl = worldData.splatUrl.startsWith('http') 
                    ? worldData.splatUrl 
                    : this._resolveUrl(worldData.splatUrl);
                const mesh = await this.protoScene.loadSplatandSetPosition(splatUrl, [0, 0, 0], worldno);
                state.mesh = mesh;
                console.log("  Mesh position:", mesh.position.toArray());
            }
        }

        // 3. Set up portals based on plan
        for (const edge of plan.portalsToSetup) {
            const sourceUrl = edge.sourceUrl;
            const destUrl = edge.destinationUrl;
            const portalData = edge.portalData;
            
            if (!portalData) {
                console.warn("No portal data for edge:", sourceUrl, "->", destUrl);
                continue;
            }

            const sourceState = this.worldState.get(sourceUrl);
            const destState = this.worldState.get(destUrl);
            
            if (!sourceState || !destState) {
                console.warn("Missing state for portal:", sourceUrl, "->", destUrl);
                continue;
            }

            // Check if this exact portal already exists (same dest AND same start position)
            // This allows multiple portals between the same two worlds at different positions
            const startPos = portalData.start?.position;
            const existingPortal = sourceState.portalPairs.find(p => {
                if (!(p instanceof ProtoPortal) || p.destinationUrl !== destUrl) return false;
                // Check if entry portal positions match
                const existingPos = p.pair.entryPortal.position;
                const adjustedStartPos = worldToUniverse(startPos, sourceState.worldno);
                return Math.abs(existingPos.x - adjustedStartPos.x) < 0.01 &&
                       Math.abs(existingPos.y - adjustedStartPos.y) < 0.01 &&
                       Math.abs(existingPos.z - adjustedStartPos.z) < 0.01;
            });
            if (existingPortal) {
                console.log("Portal already exists:", sourceUrl, "->", destUrl, "at", startPos);
                continue;
            }

            console.log("Setting up portal:", sourceUrl, "->", destUrl);
            console.log("  Source worldno:", sourceState.worldno, "Dest worldno:", destState.worldno);
            
            const pair = this.portals.addPortalPair({ radius: 1.0 });
            const start = portalData.start;
            const destination = portalData.destination;
            
            // Adjust positions to universe coordinates
            const adjustedStartPos = worldToUniverse(start.position, sourceState.worldno);
            const adjustedDestPos = worldToUniverse(destination.position, destState.worldno);
            
            console.log("  Start local:", start.position, "-> universe:", adjustedStartPos.toArray());
            console.log("  Dest local:", destination.position, "-> universe:", adjustedDestPos.toArray());
            
            pair.entryPortal.position.copy(adjustedStartPos);
            pair.entryPortal.quaternion.fromArray(start.rotation);
            pair.exitPortal.position.copy(adjustedDestPos);
            pair.exitPortal.quaternion.fromArray(destination.rotation);

            // Create ProtoPortal
            const protoPortal = new ProtoPortal(pair, destUrl, this.scene, this.portals);
            
            // Create labels on both sides of the portal
            // When using URLs for labels and CDN, prepend the CDN URL
            const formatLabelUrl = (url) => {
                if (this.config.useUrlsForLabels && this.config.useCdn) {
                    return this.config.urlBase + url;
                }
                return url;
            };
            const destLabelText = this.config.useUrlsForLabels 
                ? formatLabelUrl(destUrl)
                : (portalData.name || destState.name || destUrl);
            const sourceLabelText = this.config.useUrlsForLabels 
                ? formatLabelUrl(sourceUrl)
                : (sourceState.name || sourceUrl);

            console.log("Creating labels: ", destLabelText, " -> ", sourceLabelText);
            console.log("  Dest state name:", destState.name);
            console.log("  Source state name:", sourceState.name);
            console.log("  Dest URL:", destUrl);
            console.log("  Source URL:", sourceUrl);
            console.log("  Portal data name:", portalData.name);
            protoPortal.createLabels(destLabelText, sourceLabelText, this.config.showPortalLabels);
            
            // Create rings on both sides of the portal
            //protoPortal.createRings(1.0);
            
            // Create disks for VR mode (hidden by default, shown when in VR)
            protoPortal.createDisks(1.0, PortalEffects.WAVE);

            // Set up crossing callback
            const protoVerse = this; // Capture this for callback
            pair.onCross = async (pair, fromEntry) => {
                if (fromEntry) {
                    console.log(`Portal crossed: ${sourceLabelText} -> ${destLabelText}`);
                    protoVerse.currentWorldUrl = destUrl;
                    await protoVerse.syncWorldsFromDag(destUrl, sourceUrl);
                    
                    // Call world change callback if provided
                    if (protoVerse.config.onWorldChange) {
                        const destNode = protoVerse.verseDag.getWorld(destUrl);
                        if (destNode && destNode.worldData) {
                            protoVerse.config.onWorldChange(destUrl, destNode.worldData);
                        }
                    }
                } else {
                    console.log(`Portal crossed (reverse): ${destLabelText} -> ${sourceLabelText}`);
                    protoVerse.currentWorldUrl = sourceUrl;
                    await protoVerse.syncWorldsFromDag(sourceUrl, destUrl);
                    
                    // Call world change callback if provided
                    if (protoVerse.config.onWorldChange) {
                        const sourceNode = protoVerse.verseDag.getWorld(sourceUrl);
                        if (sourceNode && sourceNode.worldData) {
                            protoVerse.config.onWorldChange(sourceUrl, sourceNode.worldData);
                        }
                    }
                }
            };

            sourceState.portalPairs.push(protoPortal);
        }

        // Update current world URL
        this.currentWorldUrl = newRootUrl;

        // Debug output
        this.verseDag.debugPrint();
    }

    /**
     * Initialize with a root world
     * @param {string} rootUrl - Root world URL
     * @param {Object} worldData - Root world data
     */
    async initialize(rootUrl, worldData) {
        this.verseDag.loadWorldData(rootUrl, worldData);
        await this.syncWorldsFromDag(rootUrl, null);
        this.currentWorldUrl = rootUrl;
        
        // Call world change callback for initial world
        if (this.config.onWorldChange) {
            this.config.onWorldChange(rootUrl, worldData);
        }
    }

    /**
     * Update portals animation loop hook
     */
    updatePortals() {
        this.portals.animateLoopHook();
    }

    /**
     * Update portal disks, labels, and animations
     * @param {number} time - Current time in milliseconds
     * @param {boolean} isInVR - Whether currently in VR mode
     * @param {boolean} animatePortal - Whether to animate portals
     */
    updatePortalDisks(time, isInVR, animatePortal) {
        // Update global disk animation time
        if (isInVR || animatePortal) {
            updateDiskAnimation(time);
        }
        
        const showAnimatedDisks = isInVR || animatePortal;
        for (const [worldUrl, state] of this.worldState.entries()) {
            for (const protoPortal of state.portalPairs) {
                if (protoPortal instanceof ProtoPortal) {
                    protoPortal.updateLabelRotation(time);
                    // Show/hide animated disks based on VR mode or animatePortal flag
                    protoPortal.setDisksVisible(showAnimatedDisks);
                    // Update disk animations when visible
                    if (showAnimatedDisks) {
                        protoPortal.updateDisks();
                    }
                }
            }
        }
    }
}

