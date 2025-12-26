import * as THREE from "three";
import { universeToWorld } from "./coordinate-transform.js";

// ========== Position HUD ==========
const hud = document.createElement("div");
hud.style.cssText = `
  position: fixed;
  bottom: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: #0f0;
  font-family: monospace;
  font-size: 14px;
  padding: 8px 12px;
  border-radius: 4px;
  z-index: 1000;
  white-space: pre;
`;
document.body.appendChild(hud);

const worldPos = new THREE.Vector3();
const worldQuat = new THREE.Quaternion();
const euler = new THREE.Euler();
const wpos = new THREE.Vector3();

export function updateHUD(camera, currentWorldUrl, worldno) {
  // Update HUD with camera world position and orientation
  camera.getWorldPosition(worldPos);
  camera.getWorldQuaternion(worldQuat);
  euler.setFromQuaternion(worldQuat, 'YXZ');
  
  // Calculate world position: transform from universe coordinates to world coordinates
  const worldPosVec = universeToWorld(worldPos, worldno);
  wpos.copy(worldPosVec);
  
  hud.textContent = `pos: ${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}\nwpos: ${wpos.x.toFixed(2)}, ${wpos.y.toFixed(2)}, ${wpos.z.toFixed(2)}\nrot: ${euler.x.toFixed(2)}, ${euler.y.toFixed(2)}, ${euler.z.toFixed(2)}\nworld: ${currentWorldUrl} [${worldno}]`;
}

