import * as THREE from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";

// Load font for text labels (promise-based)
const fontLoader = new FontLoader();
const fontPromise = new Promise((resolve, reject) => {
  fontLoader.load(
    "https://threejs.org/examples/fonts/helvetiker_regular.typeface.json",
    resolve,
    undefined,
    reject
  );
});

export class ProtoPortal {
  constructor(portalPair, destinationUrl, scene, portals) {
    this.pair = portalPair;
    this.destinationUrl = destinationUrl;
    this.scene = scene;
    this.portals = portals;
    this.label = null;
    this.ring = null;
  }

  async createLabel(worldName, position, rotation) {
    const font = await fontPromise;

    const textGeometry = new TextGeometry(worldName, {
      font: font,
      size: 0.2,
      depth: 0.02,
      curveSegments: 8,
      bevelEnabled: false,
    });

    // Center the text horizontally
    textGeometry.computeBoundingBox();
    const centerOffsetX = -0.5 * (textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x);
    textGeometry.translate(centerOffsetX, 0, 0);

    const textMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });

    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    
    // Position above portal
    textMesh.position.fromArray(position);
    textMesh.position.y += 1.3;
    
    // Apply same rotation as portal entry
    textMesh.quaternion.fromArray(rotation);

    this.scene.add(textMesh);
    this.label = textMesh;
    return textMesh;
  }

  createRing(position, rotation, radius = 1.0) {
    // Create a torus (ring) geometry
    const torusGeometry = new THREE.TorusGeometry(radius, 0.05, 16, 64);
    
    // Gold material with metallic look
    const torusMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0xffd700,
      emissiveIntensity: 0.3,
    });

    const ring = new THREE.Mesh(torusGeometry, torusMaterial);
    
    // Position at portal location
    ring.position.fromArray(position);
    
    // Apply portal rotation
    ring.quaternion.fromArray(rotation);

    this.scene.add(ring);
    this.ring = ring;
    return ring;
  }

  updateLabelRotation(time) {
    if (this.label) {
      const rotationSpeed = 0.0005; // radians per millisecond
      this.label.rotation.y = time * rotationSpeed;
    }
  }

  async updateLabelText(newText) {
    if (!this.label) return;
    
    // Save current position, rotation, and material
    const position = this.label.position.clone();
    const quaternion = this.label.quaternion.clone();
    const material = this.label.material;
    
    // Remove old geometry
    if (this.label.geometry) {
      this.label.geometry.dispose();
    }
    
    // Create new geometry with new text
    const font = await fontPromise;
    const textGeometry = new TextGeometry(newText, {
      font: font,
      size: 0.2,
      depth: 0.02,
      curveSegments: 8,
      bevelEnabled: false,
    });
    
    // Center the text horizontally
    textGeometry.computeBoundingBox();
    const centerOffsetX = -0.5 * (textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x);
    textGeometry.translate(centerOffsetX, 0, 0);
    
    // Update the mesh with new geometry
    this.label.geometry = textGeometry;
    this.label.position.copy(position);
    this.label.quaternion.copy(quaternion);
  }

  dispose() {
    // Remove portal pair
    if (this.pair && this.portals) {
      this.portals.removePortalPair(this.pair);
    }

    // Remove and dispose label
    if (this.label) {
      this.scene.remove(this.label);
      if (this.label.geometry) {
        this.label.geometry.dispose();
      }
      if (this.label.material) {
        this.label.material.dispose();
      }
      this.label = null;
    }

    // Remove and dispose ring
    if (this.ring) {
      this.scene.remove(this.ring);
      if (this.ring.geometry) {
        this.ring.geometry.dispose();
      }
      if (this.ring.material) {
        this.ring.material.dispose();
      }
      this.ring = null;
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

