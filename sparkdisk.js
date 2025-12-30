import * as THREE from "three";
import { SplatMesh, dyno } from "@sparkjsdev/spark";

// Shared time uniform for all animated disks
const globalTime = dyno.dynoFloat(0);

// Available portal effects
export const PortalEffects = {
  SWIRL: 'swirl',   // Original swirling vortex effect
  WAVE: 'wave',     // Fractal brownian noise wavy surface
};

/**
 * Update the global animation time for all SparkDisks
 * Call this once per frame in your animation loop
 * @param {number} time - Time in milliseconds
 */
export function updateDiskAnimation(time) {
  globalTime.value = time / 1000;
}

/**
 * Creates an animated filled disk using procedural gaussian splats
 * Used to cover portal openings in VR mode with cool effects
 */
export class SparkDisk {
  constructor(options = {}) {
    const {
      radius = 1.0,              // Radius of the disk
      radialSegments = 48,       // Number of segments around the disk (for swirl)
      concentricRings = 24,      // Number of concentric rings from center to edge (for swirl)
      gridDensity = 40,          // Grid density for wave effect (splats per diameter)
      color = new THREE.Color(0x4400ff), // Deep purple/blue for portal effect
      opacity = 0.9,
      effect = PortalEffects.SWIRL  // Effect type: 'swirl' or 'wave'
    } = options;

    this.radius = radius;
    this.radialSegments = radialSegments;
    this.concentricRings = concentricRings;
    this.gridDensity = gridDensity;
    this.color = color;
    this.opacity = opacity;
    this.effect = effect;

    // Create the splat mesh with procedural splats
    this.mesh = new SplatMesh({
      constructSplats: (splats) => {
        this._constructDiskSplats(splats);
      },
    });

    // Set up the animation modifier based on effect type
    this._setupAnimation();
  }

  _constructDiskSplats(splats) {
    if (this.effect === PortalEffects.WAVE) {
      this._constructGridSplats(splats);
    } else {
      this._constructRadialSplats(splats);
    }
  }

  /**
   * Create splats in a radial pattern (concentric rings) - good for swirl effect
   */
  _constructRadialSplats(splats) {
    const center = new THREE.Vector3();
    const scales = new THREE.Vector3();
    const quaternion = new THREE.Quaternion(); // Identity quaternion

    // Calculate splat size to ensure good coverage
    const ringSpacing = this.radius / this.concentricRings;
    const splatScale = ringSpacing * 0.5;

    // Generate splats in concentric rings (disk is in XY plane, facing +Z)
    for (let ring = 0; ring <= this.concentricRings; ring++) {
      const ringRadius = (ring / this.concentricRings) * this.radius;
      
      // Number of splats in this ring (more splats in outer rings)
      const splatsInRing = ring === 0 ? 1 : Math.max(8, Math.floor(this.radialSegments * (ring / this.concentricRings)));
      
      for (let i = 0; i < splatsInRing; i++) {
        const angle = (i / splatsInRing) * Math.PI * 2;
        
        // Calculate position on the disk surface (XY plane)
        const x = ringRadius * Math.cos(angle);
        const y = ringRadius * Math.sin(angle);
        const z = 0;

        center.set(x, y, z);

        // Scale splats
        const scaleFactor = ring === 0 ? splatScale * 1.2 : splatScale;
        scales.setScalar(scaleFactor);

        // Push the splat with base color
        splats.pushSplat(center, scales, quaternion, this.opacity, this.color);
      }
    }
  }

  /**
   * Create splats in a uniform grid pattern - better for wave effect
   * Uses smaller, more densely packed splats for smooth wave surface
   */
  _constructGridSplats(splats) {
    const center = new THREE.Vector3();
    const scales = new THREE.Vector3();
    const quaternion = new THREE.Quaternion(); // Identity quaternion

    // Calculate splat spacing and size based on grid density
    const spacing = (this.radius * 2) / this.gridDensity;
    const splatScale = spacing * 0.6; // Slight overlap for smooth coverage

    // Generate splats in a grid pattern, clipped to disk shape
    for (let i = 0; i <= this.gridDensity; i++) {
      for (let j = 0; j <= this.gridDensity; j++) {
        // Map grid coordinates to disk space
        const x = (i / this.gridDensity - 0.5) * 2 * this.radius;
        const y = (j / this.gridDensity - 0.5) * 2 * this.radius;
        
        // Only include splats within the disk radius
        const dist = Math.sqrt(x * x + y * y);
        if (dist <= this.radius) {
          center.set(x, y, 0);
          scales.setScalar(splatScale);
          splats.pushSplat(center, scales, quaternion, this.opacity, this.color);
        }
      }
    }
  }

  _setupAnimation() {
    if (this.effect === PortalEffects.WAVE) {
      this._setupWaveAnimation();
    } else {
      this._setupSwirlAnimation();
    }
    this.mesh.updateGenerator();
  }

  _setupSwirlAnimation() {
    // Original swirling vortex effect
    this.mesh.objectModifier = dyno.dynoBlock(
      { gsplat: dyno.Gsplat },
      { gsplat: dyno.Gsplat },
      ({ gsplat }) => {
        const portalEffect = new dyno.Dyno({
          inTypes: { 
            gsplat: dyno.Gsplat, 
            t: "float",
            diskRadius: "float"
          },
          outTypes: { gsplat: dyno.Gsplat },
          globals: () => [
            dyno.unindent(`
              // Rotation matrix in 2D
              mat2 rot2D(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
              }
              
              // Smooth noise for organic motion
              float hash(float n) {
                return fract(sin(n) * 43758.5453);
              }
              
              // Portal swirl effect
              vec4 portalSwirl(vec3 pos, float t, float radius) {
                // Distance from center (in XY plane)
                float dist = length(pos.xy);
                float normalizedDist = dist / radius;
                
                // Swirling rotation - faster in center, slower at edges
                float swirlSpeed = 2.0;
                float swirlAmount = (1.0 - normalizedDist) * 3.0;
                float angle = swirlAmount * sin(t * swirlSpeed) + t * 0.5;
                
                // Apply rotation
                vec2 rotated = rot2D(angle) * pos.xy;
                
                // Inward pull animation
                float pullStrength = 0.15;
                float pull = sin(t * 3.0 + normalizedDist * 6.28) * pullStrength * (1.0 - normalizedDist);
                rotated *= (1.0 - pull);
                
                // Z-axis wobble for depth
                float zWobble = sin(t * 2.0 + dist * 5.0) * 0.05 * normalizedDist;
                
                return vec4(rotated.x, rotated.y, pos.z + zWobble, normalizedDist);
              }
              
              // Color cycling for portal energy
              vec3 swirlColor(float dist, float t) {
                // Base colors: deep purple -> cyan -> white at center
                vec3 outer = vec3(0.2, 0.0, 0.4);  // Deep purple
                vec3 mid = vec3(0.0, 0.5, 1.0);     // Cyan
                vec3 inner = vec3(0.8, 0.9, 1.0);   // Bright white-blue
                
                // Blend based on distance
                vec3 color;
                if (dist < 0.3) {
                  color = mix(inner, mid, dist / 0.3);
                } else if (dist < 0.7) {
                  color = mix(mid, outer, (dist - 0.3) / 0.4);
                } else {
                  color = outer;
                }
                
                // Add energy pulses
                float pulse = sin(t * 5.0 + dist * 8.0) * 0.3 + 0.7;
                color *= pulse;
                
                // Add sparkle at random positions
                float sparkle = step(0.97, hash(dist * 100.0 + floor(t * 10.0))) * 0.5;
                color += sparkle;
                
                return color;
              }
            `)
          ],
          statements: ({ inputs, outputs }) => dyno.unindentLines(`
            ${outputs.gsplat} = ${inputs.gsplat};
            
            vec3 localPos = ${inputs.gsplat}.center;
            vec4 splatColor = ${inputs.gsplat}.rgba;
            
            // Apply portal swirl effect
            vec4 swirl = portalSwirl(localPos, ${inputs.t}, ${inputs.diskRadius});
            ${outputs.gsplat}.center = vec3(swirl.xy, swirl.z);
            
            // Apply animated color
            vec3 newColor = swirlColor(swirl.w, ${inputs.t});
            ${outputs.gsplat}.rgba.rgb = newColor;
            
            // Fade alpha at edges
            float edgeFade = smoothstep(1.0, 0.7, swirl.w);
            ${outputs.gsplat}.rgba.a = splatColor.a * edgeFade;
          `),
        });

        gsplat = portalEffect.apply({ 
          gsplat, 
          t: globalTime,
          diskRadius: dyno.dynoFloat(this.radius)
        }).gsplat;
        
        return { gsplat };
      }
    );
  }

  _setupWaveAnimation() {
    // Fractal Brownian noise wavy surface effect
    this.mesh.objectModifier = dyno.dynoBlock(
      { gsplat: dyno.Gsplat },
      { gsplat: dyno.Gsplat },
      ({ gsplat }) => {
        const waveEffect = new dyno.Dyno({
          inTypes: { 
            gsplat: dyno.Gsplat, 
            t: "float",
            diskRadius: "float"
          },
          outTypes: { gsplat: dyno.Gsplat },
          globals: () => [
            dyno.unindent(`
              // Hash functions for noise
              float hash21(vec2 p) {
                p = fract(p * vec2(234.34, 435.345));
                p += dot(p, p + 34.23);
                return fract(p.x * p.y);
              }
              
              vec2 hash22(vec2 p) {
                vec3 a = fract(p.xyx * vec3(234.34, 435.345, 765.234));
                a += dot(a, a + 34.23);
                return fract(vec2(a.x * a.y, a.y * a.z));
              }
              
              // Smooth noise
              float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f); // Smoothstep
                
                float a = hash21(i);
                float b = hash21(i + vec2(1.0, 0.0));
                float c = hash21(i + vec2(0.0, 1.0));
                float d = hash21(i + vec2(1.0, 1.0));
                
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
              }
              
              // Fractal Brownian Motion
              float fbm(vec2 p, int octaves) {
                float value = 0.0;
                float amplitude = 0.5;
                float frequency = 1.0;
                
                for (int i = 0; i < 6; i++) {
                  if (i >= octaves) break;
                  value += amplitude * noise(p * frequency);
                  frequency *= 2.0;
                  amplitude *= 0.5;
                }
                return value;
              }
              
              // Domain warping for more organic look
              float warpedFbm(vec2 p, float t) {
                vec2 q = vec2(
                  fbm(p + vec2(0.0, 0.0) + t * 0.3, 4),
                  fbm(p + vec2(5.2, 1.3) + t * 0.2, 4)
                );
                
                vec2 r = vec2(
                  fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.15, 4),
                  fbm(p + 4.0 * q + vec2(8.3, 2.8) + t * 0.25, 4)
                );
                
                return fbm(p + 4.0 * r, 5);
              }
              
              // Wave displacement
              vec3 waveDisplace(vec3 pos, float t, float radius) {
                float dist = length(pos.xy);
                float normalizedDist = dist / radius;
                
                // Use fBm for organic wave displacement
                vec2 uv = pos.xy * 2.0;
                float wave = warpedFbm(uv, t);
                
                // Height displacement along Z
                float zDisplace = (wave - 0.5) * 0.3;
                
                // Reduce displacement at edges for smooth falloff
                zDisplace *= (1.0 - normalizedDist * normalizedDist);
                
                // Add ripples emanating from center
                float ripple = sin(dist * 8.0 - t * 3.0) * 0.05 * (1.0 - normalizedDist);
                zDisplace += ripple;
                
                // Subtle XY movement
                vec2 flow = hash22(pos.xy * 10.0 + t * 0.5) - 0.5;
                flow *= 0.02 * (1.0 - normalizedDist);
                
                return vec3(pos.x + flow.x, pos.y + flow.y, pos.z + zDisplace);
              }
              
              // Wave colors - deep oceanic feel
              vec3 waveColor(vec3 pos, float t, float radius) {
                float dist = length(pos.xy);
                float normalizedDist = dist / radius;
                
                // Get wave height for color variation
                vec2 uv = pos.xy * 2.0;
                float wave = warpedFbm(uv, t);
                
                // Color palette: deep blue -> teal -> bright cyan
                vec3 deep = vec3(0.0, 0.1, 0.3);      // Deep ocean blue
                vec3 mid = vec3(0.0, 0.4, 0.5);       // Teal
                vec3 bright = vec3(0.3, 0.8, 0.9);    // Bright cyan
                vec3 foam = vec3(0.9, 0.95, 1.0);     // White foam/highlight
                
                // Blend based on wave height
                vec3 color = mix(deep, mid, wave);
                color = mix(color, bright, wave * wave);
                
                // Add foam on peaks
                float foamMask = smoothstep(0.6, 0.8, wave);
                color = mix(color, foam, foamMask * 0.5);
                
                // Darker at edges
                color *= (1.0 - normalizedDist * 0.5);
                
                // Pulsing glow from center
                float glow = sin(t * 2.0) * 0.1 + 0.9;
                color *= mix(1.0, glow, 1.0 - normalizedDist);
                
                // Occasional bright sparkles
                float sparkle = step(0.98, hash21(pos.xy * 50.0 + floor(t * 8.0))) * 0.4;
                color += sparkle * bright;
                
                return color;
              }
            `)
          ],
          statements: ({ inputs, outputs }) => dyno.unindentLines(`
            ${outputs.gsplat} = ${inputs.gsplat};
            
            vec3 localPos = ${inputs.gsplat}.center;
            vec4 splatColor = ${inputs.gsplat}.rgba;
            float dist = length(localPos.xy);
            float normalizedDist = dist / ${inputs.diskRadius};
            
            // Apply wave displacement
            ${outputs.gsplat}.center = waveDisplace(localPos, ${inputs.t}, ${inputs.diskRadius});
            
            // Apply wave colors
            vec3 newColor = waveColor(localPos, ${inputs.t}, ${inputs.diskRadius});
            ${outputs.gsplat}.rgba.rgb = newColor;
            
            // Fade alpha at edges
            float edgeFade = smoothstep(1.0, 0.7, normalizedDist);
            ${outputs.gsplat}.rgba.a = splatColor.a * edgeFade;
          `),
        });

        gsplat = waveEffect.apply({ 
          gsplat, 
          t: globalTime,
          diskRadius: dyno.dynoFloat(this.radius)
        }).gsplat;
        
        return { gsplat };
      }
    );
  }

  /**
   * Update the animation - call this every frame when visible
   */
  update() {
    if (this.mesh.visible) {
      this.mesh.updateVersion();
    }
  }

  /**
   * Change the effect type and rebuild the animation
   * @param {string} effect - Effect type from PortalEffects
   */
  setEffect(effect) {
    if (this.effect !== effect) {
      this.effect = effect;
      this._setupAnimation();
    }
  }

  /**
   * Get the current effect type
   * @returns {string}
   */
  getEffect() {
    return this.effect;
  }

  /**
   * Get the THREE.Object3D mesh (SplatMesh instance)
   */
  getMesh() {
    return this.mesh;
  }

  /**
   * Position the disk at the given location
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
   * Set the rotation of the disk
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
   * Show or hide the disk
   * @param {boolean} visible 
   */
  setVisible(visible) {
    this.mesh.visible = visible;
  }

  /**
   * Dispose of the disk mesh
   */
  dispose() {
    if (this.mesh && this.mesh.dispose) {
      this.mesh.dispose();
    }
  }
}

