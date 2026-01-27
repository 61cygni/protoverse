/**
 * Projects Index
 * 
 * Registers all project presets.
 * Each project has its own directory with a config.js file.
 */

import theater from './theater/config.js';
import demo from './demo/config.js';
import helloworld from './helloworld/config.js';
import bigworld from './bigworld/config.js';
import sunken from './sunken/config.js';
import worldship from './worldship/config.js';
import codeverse from './codeverse/config.js';
import helloportal from './helloportal/config.js';

export const presets = {
    theater,
    demo,
    helloworld,
    bigworld,
    sunken,
    worldship,
    codeverse,
    helloportal,
};

/**
 * Deep merge utility - merges source into target recursively
 * Preserves getters/setters from target object
 */
export function deepMerge(target, source) {
    // Start with target's property descriptors to preserve getters
    const targetDescriptors = Object.getOwnPropertyDescriptors(target);
    const result = Object.defineProperties({}, targetDescriptors);
    
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            // Recursively merge objects, preserving target's getters
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            // Overwrite primitive values and arrays
            result[key] = source[key];
        }
    }
    
    return result;
}
