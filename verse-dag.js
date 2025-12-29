/**
 * VerseDag - A Directed Acyclic Graph for managing world connections
 * 
 * Stores worlds as nodes and portals as directed edges between them.
 * Supports traversal-based policies for preloading and flushing worlds.
 */

/**
 * Represents a portal connection between two worlds
 */
export class PortalEdge {
  constructor(sourceUrl, destinationUrl, portalData) {
    this.sourceUrl = sourceUrl;
    this.destinationUrl = destinationUrl;
    this.portalData = portalData; // Original portal data from world.json
  }
}

/**
 * Represents a world node in the DAG
 */
export class WorldNode {
  constructor(url, worldData = null) {
    this.url = url;
    this.worldData = worldData;
    this.outgoingPortals = []; // PortalEdge[] - portals FROM this world
    this.incomingPortals = []; // PortalEdge[] - portals TO this world
  }

  /**
   * Add an outgoing portal from this world
   * @param {PortalEdge} edge 
   */
  addOutgoingPortal(edge) {
    this.outgoingPortals.push(edge);
  }

  /**
   * Add an incoming portal to this world
   * @param {PortalEdge} edge 
   */
  addIncomingPortal(edge) {
    this.incomingPortals.push(edge);
  }

  /**
   * Get all neighboring world URLs (both directions)
   * @returns {string[]}
   */
  getNeighborUrls() {
    const neighbors = new Set();
    for (const edge of this.outgoingPortals) {
      neighbors.add(edge.destinationUrl);
    }
    for (const edge of this.incomingPortals) {
      neighbors.add(edge.sourceUrl);
    }
    return Array.from(neighbors);
  }
}

/**
 * DAG for managing world connections and traversal policies
 */
export class VerseDag {
  constructor() {
    this.nodes = new Map(); // Map<url, WorldNode>
    this.rootUrl = null;
  }

  /**
   * Add a world to the DAG
   * @param {string} url - World URL (key)
   * @param {object} worldData - World data from JSON
   * @returns {WorldNode}
   */
  addWorld(url, worldData = null) {
    if (this.nodes.has(url)) {
      const node = this.nodes.get(url);
      if (worldData && !node.worldData) {
        node.worldData = worldData;
      }
      return node;
    }
    const node = new WorldNode(url, worldData);
    this.nodes.set(url, node);
    return node;
  }

  /**
   * Get a world node by URL
   * @param {string} url 
   * @returns {WorldNode|null}
   */
  getWorld(url) {
    return this.nodes.get(url) || null;
  }

  /**
   * Check if a world exists in the DAG
   * @param {string} url 
   * @returns {boolean}
   */
  hasWorld(url) {
    return this.nodes.has(url);
  }

  /**
   * Add a portal connection between two worlds
   * @param {string} sourceUrl - Source world URL
   * @param {string} destinationUrl - Destination world URL
   * @param {object} portalData - Portal data from world.json
   * @returns {PortalEdge}
   */
  addPortal(sourceUrl, destinationUrl, portalData = null) {
    // Ensure both nodes exist
    const sourceNode = this.addWorld(sourceUrl);
    const destNode = this.addWorld(destinationUrl);

    // Check if this exact portal already exists (same source, dest, AND position)
    // This allows multiple portals between the same two worlds at different positions
    const existingEdge = sourceNode.outgoingPortals.find(e => {
      if (e.destinationUrl !== destinationUrl) return false;
      // If no portal data, check by URL only
      if (!portalData || !e.portalData) return true;
      // Check if start positions match (same portal)
      const existingStart = e.portalData.start?.position;
      const newStart = portalData.start?.position;
      if (!existingStart || !newStart) return true;
      return existingStart[0] === newStart[0] && 
             existingStart[1] === newStart[1] && 
             existingStart[2] === newStart[2];
    });
    if (existingEdge) {
      return existingEdge;
    }

    // Create edge
    const edge = new PortalEdge(sourceUrl, destinationUrl, portalData);
    sourceNode.addOutgoingPortal(edge);
    destNode.addIncomingPortal(edge);

    return edge;
  }

  /**
   * Set the root world (current player location)
   * @param {string} url 
   */
  setRoot(url) {
    this.rootUrl = url;
  }

  /**
   * Get the current root world URL
   * @returns {string|null}
   */
  getRoot() {
    return this.rootUrl;
  }

  /**
   * Calculate distance from root to all reachable nodes using BFS
   * Traverses both outgoing and incoming edges (bidirectional)
   * @param {string} rootUrl - Starting world URL (defaults to current root)
   * @returns {Map<string, number>} Map of worldUrl -> distance from root
   */
  calculateDistances(rootUrl = this.rootUrl) {
    if (!rootUrl || !this.nodes.has(rootUrl)) {
      console.warn("calculateDisatances called with no root node");
      return new Map();
    }

    const distances = new Map();
    const queue = [rootUrl];
    distances.set(rootUrl, 0);

    while (queue.length > 0) {
      const currentUrl = queue.shift();
      const currentNode = this.nodes.get(currentUrl);
      const currentDistance = distances.get(currentUrl);

      if (!currentNode) continue;

      // Traverse all neighbors (bidirectional)
      for (const neighborUrl of currentNode.getNeighborUrls()) {
        if (!distances.has(neighborUrl)) {
          distances.set(neighborUrl, currentDistance + 1);
          queue.push(neighborUrl);
        }
      }
    }

    return distances;
  }

  /**
   * Get all worlds within N hops of the root
   * @param {number} maxHops - Maximum distance from root
   * @param {string} rootUrl - Starting world URL (defaults to current root)
   * @returns {WorldNode[]} List of world nodes within range
   */
  getWorldsWithinHops(maxHops, rootUrl = this.rootUrl) {
    const distances = this.calculateDistances(rootUrl);
    const result = [];

    for (const [url, distance] of distances.entries()) {
      if (distance <= maxHops) {
        const node = this.nodes.get(url);
        if (node) {
          result.push(node);
        }
      }
    }

    return result;
  }

  /**
   * Get all worlds beyond N hops from the root (candidates for flushing)
   * @param {number} minHops - Minimum distance to be considered for flushing
   * @param {string} rootUrl - Starting world URL (defaults to current root)
   * @returns {WorldNode[]} List of world nodes beyond range
   */
  getWorldsBeyondHops(minHops, rootUrl = this.rootUrl) {
    const distances = this.calculateDistances(rootUrl);
    const result = [];

    for (const [url, distance] of distances.entries()) {
      if (distance > minHops) {
        const node = this.nodes.get(url);
        if (node) {
          result.push(node);
        }
      }
    }

    return result;
  }

  /**
   * Get portals that should be set up based on distance policy
   * Returns portals FROM worlds within preloadHops TO worlds within preloadHops
   * @param {number} preloadHops - Maximum distance for preloading
   * @param {string} rootUrl - Starting world URL (defaults to current root)
   * @returns {PortalEdge[]} List of portals to set up
   */
  getPortalsToSetup(preloadHops, rootUrl = this.rootUrl) {
    const distances = this.calculateDistances(rootUrl);
    const portals = [];

    for (const [url, distance] of distances.entries()) {
      if (distance < preloadHops) { // Portals from worlds closer than max
        const node = this.nodes.get(url);
        if (node) {
          for (const edge of node.outgoingPortals) {
            if(edge.portalData.name === '__stub'){
              console.log(" - stub to ",edge.destinationUrl," skipping")
              continue;
            }
            const destDistance = distances.get(edge.destinationUrl);
            // Only include if destination is also within range
            if (destDistance !== undefined && destDistance <= preloadHops) {
              portals.push(edge);
            }
          }
          for (const edge of node.incomingPortals) {
            const sourceDistance = distances.get(edge.sourceUrl);
            // Only include if destination is also within range
            if (sourceDistance !== undefined && sourceDistance <= preloadHops) {
              portals.push(edge);
            }
          }
        }
      }
    }

    return portals;
  }

  /**
   * Get a traversal plan for loading worlds and setting up portals
   * @param {number} preloadHops - How many hops to preload
   * @param {string} rootUrl - Starting world URL (defaults to current root)
   * @returns {{worldsToLoad: WorldNode[], portalsToSetup: PortalEdge[], worldsToFlush: WorldNode[]}}
   */
  getTraversalPlan(preloadHops, rootUrl = this.rootUrl) {
    const distances = this.calculateDistances(rootUrl);
    
    const worldsToLoad = [];
    const worldsToFlush = [];
    const portalsToSetup = [];

    // Categorize worlds by distance
    for (const [url, distance] of distances.entries()) {
      const node = this.nodes.get(url);
      if (!node) continue;

      if (distance <= preloadHops) {
        worldsToLoad.push(node);
        
        // Add portals from this world to other worlds within range
        if (distance < preloadHops) {
          for (const edge of node.outgoingPortals) {
            if(edge.portalData.name === '__stub'){
              console.log(" - __stub portal to ",edge.destinationUrl,' skipping');
              continue;
            }
            const destDistance = distances.get(edge.destinationUrl);
            if (destDistance !== undefined && destDistance <= preloadHops) {
              portalsToSetup.push(edge);
            }
          }
        }
      } else {
        worldsToFlush.push(node);
      }
    }

    // Sort worlds by distance (load closer worlds first)
    worldsToLoad.sort((a, b) => {
      return (distances.get(a.url) || 0) - (distances.get(b.url) || 0);
    });

    return {
      worldsToLoad,
      portalsToSetup,
      worldsToFlush
    };
  }

  /**
   * Load world data and its portals into the DAG from a world.json structure
   * @param {string} url - World URL
   * @param {object} worldData - Parsed world.json data
   */
  loadWorldData(url, worldData) {
    const node = this.addWorld(url, worldData);

    // Add portals from this world
    if (worldData.portals && Array.isArray(worldData.portals)) {
      for (const portalData of worldData.portals) {
        if (portalData.destination && portalData.destination.url) {
          this.addPortal(url, portalData.destination.url, portalData);
        }
      }
    }

    return node;
  }

  /**
   * Debug: Print the DAG structure
   */
  debugPrint() {
    console.log("=== VerseDag Debug ===");
    console.log("Root:", this.rootUrl);
    console.log("Nodes:", this.nodes.size);
    
    for (const [url, node] of this.nodes.entries()) {
      console.log(`\n[${url}]`);
      console.log("  Name:", node.worldData?.name || "unknown");
      console.log("  Outgoing:", node.outgoingPortals.map(e => e.destinationUrl));
      console.log("  Incoming:", node.incomingPortals.map(e => e.sourceUrl));
    }

    if (this.rootUrl) {
      console.log("\nDistances from root:");
      const distances = this.calculateDistances();
      for (const [url, dist] of distances.entries()) {
        console.log(`  ${url}: ${dist} hops`);
      }
    }
  }
}

