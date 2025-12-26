
// Simple 3D grid approach to mapping worlds to the univere so they don't overlap. 
// Roughly approach is to map the world number to a 3D grid position. Grids
// are 256x256x256 and are laid out in a 16x16 grid along the x,z. And then
// layered along the y axis. 
import * as THREE from "three";

const yGridSize = 256;
const xGridSize = 256;
const numXGrids = 16;
const zGridSize = 256;
const numZGrids = 16;

export function worldToUniverse(position, worldno) {
    const vec = position instanceof THREE.Vector3
        ? position.clone()
        : new THREE.Vector3().fromArray(position);

    vec.x += (worldno % numXGrids) * xGridSize;
    vec.z += (Math.floor(worldno / numXGrids) % numZGrids) * zGridSize;
    vec.y += (Math.floor(worldno / (numXGrids * numZGrids))) * yGridSize;

    return vec;
}

export function universeToWorld(position, worldno) {
  const vec = position instanceof THREE.Vector3 
    ? position.clone() 
    : new THREE.Vector3().fromArray(position);
  
    vec.x -= (worldno % numXGrids) * xGridSize;
    vec.z -= (Math.floor(worldno / numXGrids) % numZGrids) * zGridSize;
    vec.y -= (Math.floor(worldno / (numXGrids * numZGrids))) * yGridSize;

  return vec;
}

