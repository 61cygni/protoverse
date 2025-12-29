import * as THREE from "three";
import { textSplats } from "@sparkjsdev/spark";
import { SparkRing } from "./sparkring.js";

export class ProtoPortal {
  constructor(portalPair, destinationUrl, scene, portals) {
    this.pair = portalPair;
    this.destinationUrl = destinationUrl;
    this.scene = scene;
    this.portals = portals;
    this.entryLabel = null;  // Label on entry side (shows destination name)
    this.exitLabel = null;   // Label on exit side (shows source name)
    this.entryRing = null;   // Ring on entry side
    this.exitRing = null;    // Ring on exit side
  }

  /**
   * Create labels on both sides of the portal
   * @param {string} entryLabelText - Text shown on entry side (destination name)
   * @param {string} exitLabelText - Text shown on exit side (source name)
   */
  createLabels(entryLabelText, exitLabelText) {
    // Get positions and rotations from the portal pair
    const entryPos = this.pair.entryPortal.position;
    const entryRot = this.pair.entryPortal.quaternion;
    const exitPos = this.pair.exitPortal.position;
    const exitRot = this.pair.exitPortal.quaternion;

    // Create entry label (shows where portal leads to)
    this.entryLabel = this._createTextSplat(entryLabelText, entryPos, entryRot);
    
    // Create exit label (shows where you came from)
    this.exitLabel = this._createTextSplat(exitLabelText, exitPos, exitRot);
  }

  _createTextSplat(text, position, quaternion) {
    const textMesh = textSplats({
      text: text,
      font: "Arial",
      fontSize: 60,
      color: new THREE.Color(0xffffff),
    });
    
    // Scale to appropriate size (reduced by 50%)
    textMesh.scale.setScalar(0.25 / 80);
    
    // Position above portal
    textMesh.position.copy(position);
    textMesh.position.y += 1.3;
    
    // Apply same rotation as portal
    textMesh.quaternion.copy(quaternion);

    this.scene.add(textMesh);
    return textMesh;
  }

  updateLabelRotation(time) {
    const rotationSpeed = 0.0005; // radians per millisecond
    if (this.entryLabel) {
      this.entryLabel.rotation.y = time * rotationSpeed;
    }
    if (this.exitLabel) {
      this.exitLabel.rotation.y = time * rotationSpeed;
    }
  }

  /**
   * Create rings on both sides of the portal
   * @param {number} radius - Radius of the rings (default 1.0)
   */
  createRings(radius = 1.0) {
    // Get positions and rotations from the portal pair
    const entryPos = this.pair.entryPortal.position;
    const entryRot = this.pair.entryPortal.quaternion;
    const exitPos = this.pair.exitPortal.position;
    const exitRot = this.pair.exitPortal.quaternion;

    // Create entry ring
    this.entryRing = this._createRing(entryPos, entryRot, radius);
    
    // Create exit ring
    this.exitRing = this._createRing(exitPos, exitRot, radius);
  }

  _createRing(position, quaternion, radius) {
    // Create a ring using procedural splats
    const sparkRing = new SparkRing({
      radius: radius,
      tubeRadius: 0.05,
      radialSegments: 64,
      tubularSegments: 16,
      color: new THREE.Color(0xffd700), // Gold color
      opacity: 1.0
    });

    const ringMesh = sparkRing.getMesh();
    
    // Position at portal location
    ringMesh.position.copy(position);
    
    // Apply portal rotation
    ringMesh.quaternion.copy(quaternion);

    this.scene.add(ringMesh);
    return sparkRing;
  }

  dispose() {
    // Remove portal pair
    if (this.pair && this.portals) {
      this.portals.removePortalPair(this.pair);
    }

    // Remove and dispose entry label
    if (this.entryLabel) {
      this.scene.remove(this.entryLabel);
      if (this.entryLabel.dispose) {
        this.entryLabel.dispose();
      }
      this.entryLabel = null;
    }

    // Remove and dispose exit label
    if (this.exitLabel) {
      this.scene.remove(this.exitLabel);
      if (this.exitLabel.dispose) {
        this.exitLabel.dispose();
      }
      this.exitLabel = null;
    }

    // Remove and dispose entry ring
    if (this.entryRing) {
      const ringMesh = this.entryRing.getMesh();
      this.scene.remove(ringMesh);
      this.entryRing.dispose();
      this.entryRing = null;
    }

    // Remove and dispose exit ring
    if (this.exitRing) {
      const ringMesh = this.exitRing.getMesh();
      this.scene.remove(ringMesh);
      this.exitRing.dispose();
      this.exitRing = null;
    }
  }
}

// Setup lighting for portal materials
export function setupPortalLighting(scene, camera) {
  // Add lighting for metallic materials
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0xffffff, 1, 100);
  camera.add(pointLight); // Light follows camera
}

