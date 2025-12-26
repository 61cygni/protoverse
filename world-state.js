import { worldNoAllocator } from "./worldno.js";

/**
 * Represents the state for a single world
 */
export class WorldStateEntry {
  constructor(worldData, worldno = 0) {
    this.data = worldData;
    this.mesh = null;
    this.portalPairs = [];
    this.worldno = worldno;
  }
}

/**
 * Manages state for all loaded worlds
 */
export class WorldState {
  constructor() {
    this.worlds = new Map(); // Map<worldUrl, WorldStateEntry>
  }

  /**
   * Get world state entry by URL
   * @param {string} worldUrl 
   * @returns {WorldStateEntry|null}
   */
  get(worldUrl) {
    return this.worlds.get(worldUrl) || null;
  }

  /**
   * Get or create world state entry
   * @param {string} worldUrl 
   * @param {object} worldData 
   * @param {number} worldno 
   * @returns {WorldStateEntry}
   */
  getOrCreate(worldUrl, worldData, worldno = 0) {
    let state = this.worlds.get(worldUrl);
    if (!state) {
      state = new WorldStateEntry(worldData, worldno);
      this.worlds.set(worldUrl, state);
    }
    return state;
  }

  /**
   * Set world state entry
   * @param {string} worldUrl 
   * @param {WorldStateEntry} state 
   */
  set(worldUrl, state) {
    this.worlds.set(worldUrl, state);
  }

  /**
   * Delete world state entry and release its worldno
   * @param {string} worldUrl 
   */
  delete(worldUrl) {
    const state = this.worlds.get(worldUrl);
    if (state) {
      // Return worldno to allocator
      if (state.worldno !== undefined) {
        worldNoAllocator.release(state.worldno);
      }
      this.worlds.delete(worldUrl);
    }
  }

  /**
   * Check if world exists
   * @param {string} worldUrl 
   * @returns {boolean}
   */
  has(worldUrl) {
    return this.worlds.has(worldUrl);
  }

  /**
   * Get all world entries
   * @returns {IterableIterator<[string, WorldStateEntry]>}
   */
  entries() {
    return this.worlds.entries();
  }

  /**
   * Get all world URLs
   * @returns {IterableIterator<string>}
   */
  keys() {
    return this.worlds.keys();
  }

  /**
   * Get all world state entries
   * @returns {IterableIterator<WorldStateEntry>}
   */
  values() {
    return this.worlds.values();
  }
}

