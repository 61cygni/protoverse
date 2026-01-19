/**
 * Projects Index
 * 
 * Registers all project presets.
 * Each project has its own directory with a config.js file.
 */

import theater from './theater/config.js';
import demo from './demo/config.js';
import helloworld from './helloworld/config.js';

export const presets = {
    theater,
    demo,
    helloworld,
};

/**
 * Deep merge utility - merges source into target recursively
 */
export function deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            // Recursively merge objects
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            // Overwrite primitive values and arrays
            result[key] = source[key];
        }
    }
    
    return result;
}
