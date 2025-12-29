import * as THREE from "three";
import { SplatMesh } from "@sparkjsdev/spark";

/**
 * Creates a ring/torus using procedural gaussian splats
 * Similar to THREE.TorusGeometry but rendered as splats
 */
export class SparkRing {
  constructor(options = {}) {
    const {
      radius = 1.0,           // Major radius (ring radius)
      tubeRadius = 0.05,      // Minor radius (thickness of the ring)
      radialSegments = 64,    // Number of segments around the ring
      tubularSegments = 16,   // Number of segments around the tube
      color = new THREE.Color(0xffd700), // Gold color
      opacity = 1.0
    } = options;

    this.radius = radius;
    this.tubeRadius = tubeRadius;
    this.radialSegments = radialSegments;
    this.tubularSegments = tubularSegments;
    this.color = color;
    this.opacity = opacity;

    // Create the splat mesh with procedural splats
    this.mesh = new SplatMesh({
      constructSplats: (splats) => {
        this._constructRingSplats(splats);
      },
    });
  }

  _constructRingSplats(splats) {
    const center = new THREE.Vector3();
    const scales = new THREE.Vector3();
    const quaternion = new THREE.Quaternion(); // Identity quaternion (splats are roughly spherical)

    // Splat scale - make it proportional to tube radius
    const splatScale = this.tubeRadius * 0.5;

    // Generate splats around the torus in XY plane (vertical, like a portal frame)
    // Modified torus parametric equations for vertical orientation:
    // x = (R + r * cos(v)) * cos(u)
    // y = (R + r * cos(v)) * sin(u)  <- swapped y and z
    // z = r * sin(v)                  <- swapped y and z
    // Where R = radius (major), r = tubeRadius (minor)
    // u goes around the major circle (0 to 2π)
    // v goes around the minor circle/tube (0 to 2π)
    for (let i = 0; i < this.radialSegments; i++) {
      const u = (i / this.radialSegments) * Math.PI * 2;
      
      for (let j = 0; j < this.tubularSegments; j++) {
        const v = (j / this.tubularSegments) * Math.PI * 2;

        // Calculate position on the torus surface (vertical orientation in XY plane)
        const x = (this.radius + this.tubeRadius * Math.cos(v)) * Math.cos(u);
        const y = (this.radius + this.tubeRadius * Math.cos(v)) * Math.sin(u);
        const z = this.tubeRadius * Math.sin(v);

        center.set(x, y, z);

        // Set scale - splats are roughly spherical, so use same scale for all axes
        scales.setScalar(splatScale);

        // Push the splat (using identity quaternion since splats look good from all angles)
        splats.pushSplat(center, scales, quaternion, this.opacity, this.color);
      }
    }
  }

  /**
   * Get the THREE.Object3D mesh (SplatMesh instance)
   * Can be positioned, rotated, scaled, and added to scene
   */
  getMesh() {
    return this.mesh;
  }

  /**
   * Position the ring at the given location
   * @param {THREE.Vector3|number[]} position 
   */
  setPosition(position) {
    if (Array.isArray(position)) {
      this.mesh.position.fromArray(position);
    } else {
      this.mesh.position.copy(position);
    }
  }

  /**
   * Set the rotation of the ring
   * @param {THREE.Quaternion|number[]} rotation - Quaternion or [x, y, z, w] array
   */
  setRotation(rotation) {
    if (Array.isArray(rotation)) {
      this.mesh.quaternion.fromArray(rotation);
    } else {
      this.mesh.quaternion.copy(rotation);
    }
  }

  /**
   * Dispose of the ring mesh
   */
  dispose() {
    if (this.mesh && this.mesh.dispose) {
      this.mesh.dispose();
    }
  }
}

