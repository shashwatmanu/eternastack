"use client";

import React, { Suspense, useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import dynamic from "next/dynamic";
import { useGLTF, useAnimations, Text, Environment, MeshReflectorMaterial, Stars, Clouds, Cloud, Sparkles } from "@react-three/drei";
import { EffectComposer, Glitch } from "@react-three/postprocessing";
import { scrollState } from "@/utils/scrollState";
import { audio } from "@/utils/audio";
import LocalGlitchVFX from "./LocalGlitchVFX";

// ─── Lazy sub-components ──────────────────────────────────────────────────────
// Each of these pulls in Three.js, GSAP, its own GLTFs, and custom shaders.
// By code-splitting them we break them out of the initial bundle entirely —
// they are evaluated in parallel while the Preloader is showing, eliminating
// the ~5.5 s scripting block that was blocking the main thread on first load.
const CameraRail = dynamic(() => import("./CameraRail").then(m => ({ default: m.CameraRail })), { ssr: false });
const FlyingBee = dynamic(() => import("./FlyingBee"), { ssr: false });
const GroundAnt = dynamic(() => import("./GroundAnt"), { ssr: false });
const FlyingDrone = dynamic(() => import("./FlyingDrone"), { ssr: false });
const GroundRover = dynamic(() => import("./GroundRover"), { ssr: false });

// Point the Draco WASM decoder at our local /public/draco/ copy (bundled from
// three/examples/jsm/libs/draco/gltf/). Using a local path instead of the
// Google CDN avoids CORS failures, works fully offline, and — critically —
// guarantees the decoder is present before any useGLTF.preload() calls fire,
// which was causing the "No DRACOLoader instance provided" error on Turbopack.
useGLTF.setDecoderPath("/draco/");

// Shared coordinates for procedural web weaving
const webAnchorPoints = {
  spiderLegs: [] as THREE.Vector3[],
  textCorners: [] as THREE.Vector3[],
};

// Module-level scratch vectors for spider/ant leg position tracking.
// Avoids heap allocations inside useFrame (which runs 60x/s) that trigger GC pauses.
let _spiderBodyPos: THREE.Vector3 | null = null;
const _spiderLegOffsets = [
  new THREE.Vector3(-0.5, -0.3, 0.6),
  new THREE.Vector3( 0.5, -0.3, 0.6),
  new THREE.Vector3(-0.6, -0.3, 0.4),
  new THREE.Vector3( 0.6, -0.3, 0.4),
];
// Scratch vectors for WebGLHeroText text-corner tracking inside useFrame
const _tp1 = new THREE.Vector3();
const _tp2 = new THREE.Vector3();
const _tp3 = new THREE.Vector3();
const _tp4 = new THREE.Vector3();

// Pre-triangulate both fonts during the loading screen so the first Text mount
// is instant. Without this Troika does glyph SDF generation on first render,
// blocking the main thread for ~80-200ms — the exact stall visible on 6x CPU throttle.
import("troika-three-text").then(({ preloadFont }) => {
  preloadFont({ font: "/fonts/Outfit-Light.ttf", characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?/-_()&%# " }, () => {});
  preloadFont({ font: "/fonts/PlayfairDisplay-Italic.ttf", characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?/-_()&%# " }, () => {});
});

// Immersive Depth 3D Editorial Text Overlay
// Shaders for WebGLHeroText interactive chrome silver-gold hover shine
const webGLHeroTextVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal = normalize(normalMatrix * normal);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const webGLHeroTextFragmentShader = `
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  uniform float uOpacity;
  uniform float uTime;
  uniform float uIsMachine;
  uniform float uSectionIndex;

  // Hexagon distance field
  float hexagon(vec2 p) {
    vec2 q = abs(p);
    return max(q.x, dot(q, normalize(vec2(1.0, 1.732))));
  }

  // 1. Honeycomb pattern (Sky Level - Insect Mode: Bee)
  float hexPattern(vec2 p, float scale) {
    vec2 grid = vec2(1.0, 1.73205) * scale;
    vec2 h = grid * 0.5;
    vec2 p1 = mod(p, grid) - h;
    vec2 p2 = mod(p - h, grid) - h;
    vec2 localP = dot(p1, p1) < dot(p2, p2) ? p1 : p2;
    float d = hexagon(localP);
    float edge = smoothstep(scale * 0.40, scale * 0.46, d);
    return edge;
  }

  // 2. HUD Reticle Grid pattern (Sky Level - Mech Mode: Drone)
  float hudPattern(vec2 p, float scale) {
    vec2 localP = mod(p, vec2(scale)) - vec2(scale * 0.5);
    float grid = 1.0 - smoothstep(0.002, 0.012, min(abs(localP.x), abs(localP.y)));
    
    // Concentric scanner rings centered near local centers
    float r = length(p);
    float circles = 1.0 - smoothstep(0.005, 0.015, abs(mod(r, 0.5) - 0.25));
    
    // Minimal crosshairs
    float crosshair = (abs(p.x) < 0.003 || abs(p.y) < 0.003) ? 0.7 : 0.0;
    
    return max(grid * 0.4, max(circles * 0.6, crosshair));
  }

  // 3. Tunnel Matrix / Mycelium Pattern (Ground Level - Insect Mode: Ant)
  float myceliumPattern(vec2 p, float scale) {
    // Intersecting sin/cos curves creating an organic network path
    float n1 = sin(p.x * 20.0 + sin(p.y * 14.0)) * 0.5 + 0.5;
    float n2 = cos(p.y * 22.0 + cos(p.x * 16.0)) * 0.5 + 0.5;
    float lines = abs(n1 - n2);
    return 1.0 - smoothstep(0.0, 0.05, lines);
  }

  // 4. Rugged Topographical Map Contour lines (Ground Level - Mech Mode: Rover)
  float topoPattern(vec2 p, float scale) {
    // Height map based on sine fields
    float elevation = sin(p.x * 8.0 + sin(p.y * 5.0)) * 0.5 + sin(p.y * 9.0 + cos(p.x * 4.0)) * 0.5;
    float contours = abs(mod(elevation * 6.0, 1.0) - 0.5);
    return 1.0 - smoothstep(0.0, 0.07, contours);
  }

  // 5. Geometric Web Lattice (Core Level - Insect Mode: Spider)
  float webPattern(vec2 p, float scale) {
    // Tile the web designs just like the honeycomb hexagons
    vec2 localP = mod(p, vec2(scale)) - vec2(scale * 0.5);
    float r = length(localP);
    float angle = atan(localP.y, localP.x);
    
    // Radial spokes (8 radial strands per spiderweb tile)
    float spokes = abs(sin(angle * 8.0));
    float spokesLines = 1.0 - smoothstep(0.0, 0.08, spokes);
    
    // Concentric web rings
    float concentric = abs(mod(r, scale * 0.22) - scale * 0.11);
    float concentricLines = 1.0 - smoothstep(0.0, scale * 0.02, concentric);
    
    // Blend radial spokes and web rings, masked slightly at the boundary of each web cell
    float web = max(spokesLines * 0.5, concentricLines * 0.85);
    float cellMask = smoothstep(scale * 0.48, scale * 0.42, r);
    return web * cellMask;
  }

  // 6. Printed Circuit Board (PCB) Trace Layout (Core Level - Mech Mode: Spy Mech)
  float pcbPattern(vec2 p, float scale) {
    // Trace layouts using 45-degree angle waves
    float trace1 = sin(p.x * 25.0 + p.y * 25.0);
    float trace2 = cos(p.x * 25.0 - p.y * 25.0);
    float path = abs(trace1 * trace2);
    float lines = 1.0 - smoothstep(0.0, 0.02, path);
    
    // Solder pads
    vec2 localP = mod(p, vec2(scale)) - vec2(scale * 0.5);
    float dots = 1.0 - smoothstep(0.008, 0.018, length(localP));
    
    return max(lines * 0.6, dots * 0.8);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPosition);
    
    // Light source from top-right-front
    vec3 L = normalize(vec3(0.5, 0.8, 0.5));
    vec3 H = normalize(L + V);
    
    // Diagonal position for gold sweep (combining X and Y creates a diagonal band)
    float linePos = vWorldPosition.x + vWorldPosition.y * 0.4;
    
    // Continuous smooth diagonal sweep (slow, elegant speed but with high recurrence frequency)
    float sweepSpeed = 1.6; // Elegant slow speed
    float sweepRange = 7.0;  // Tighter loop range to minimize delay/dead time between sweeps
    float sweepTime = mod(uTime * sweepSpeed, sweepRange) - (sweepRange * 0.5);
    
    float distToSweep = abs(linePos - sweepTime);
    float goldFactor = 1.0 - smoothstep(0.0, 1.2, distToSweep); // 1.2 units wide light sheen band
    
    // Apply procedural patterns based on section index and machine mode
    vec2 patternUV = vWorldPosition.xy;
    float pattern = 0.0;
    
    if (uSectionIndex < 0.5) {
      // Sky Level: Honeycomb Mesh -> HUD Scanner Grid
      float honey = hexPattern(patternUV, 0.06);
      float drone = hudPattern(patternUV, 0.08);
      pattern = mix(honey, drone, uIsMachine);
    } else if (uSectionIndex < 1.5) {
      // Ground Level: Mycelium Tunnel -> Topo Contours
      float mycelium = myceliumPattern(patternUV, 0.08);
      float topo = topoPattern(patternUV, 0.08);
      pattern = mix(mycelium, topo, uIsMachine);
    } else {
      // Core Level: Web Lattice -> PCB Traces
      float web = webPattern(patternUV, 0.08);
      float pcb = pcbPattern(patternUV, 0.08);
      pattern = mix(web, pcb, uIsMachine);
    }
    
    // Sweep is modulated by pattern so the pattern glows intensely within the shine band
    float finalSweep = goldFactor * (0.2 + 0.8 * pattern);
    
    // Base metal colors (rich gold base, bright white/silver sweep)
    vec3 goldColor = vec3(1.0, 0.72, 0.22);    // Rich gold chrome base
    vec3 silverColor = vec3(1.0, 1.0, 1.0);    // Bright shining white/silver light sweep
    
    vec3 baseColor = mix(goldColor, silverColor, finalSweep);
    
    // Specular reflection (metallic look)
    float ndl = max(dot(N, L), 0.0);
    float ndh = max(dot(N, H), 0.0);
    float specular = pow(ndh, 32.0) * mix(1.5, 2.5, finalSweep);
    
    // Fake reflection mapping (warm gold environment reflections)
    vec3 R = reflect(-V, N);
    float horizon = R.y * 0.5 + 0.5;
    vec3 envGlow = mix(vec3(0.12, 0.08, 0.02), vec3(1.0, 0.85, 0.6), pow(horizon, 4.0)); // warm gold horizon
    envGlow += finalSweep * vec3(0.5, 0.45, 0.4); // bright sweep highlight
    
    // Final color
    vec3 finalColor = baseColor * (ndl * 0.4 + 0.4) + vec3(specular) * mix(0.8, 1.2, finalSweep) + envGlow * 0.4;
    
    // Emissive glows to keep it always shining golden and glowing
    vec3 baseGlow = vec3(1.0, 0.6, 0.15) * 0.25; // Constant premium golden ambient glow
    vec3 sweepGlow = vec3(1.0, 0.9, 0.7) * finalSweep * 0.6; // Pulsing sweep sheen
    sweepGlow *= (1.0 + 0.12 * sin(uTime * 6.0));
    
    finalColor += baseGlow + sweepGlow;
    
    gl_FragColor = vec4(finalColor, uOpacity);
  }
`;

function useTextScramble(targetText: string, duration = 800) {
  const [displayText, setDisplayText] = useState(targetText);
  const oldTextRef = useRef(targetText);
  const animationRef = useRef<number | null>(null);
  // Throttle to ~20fps max — the scramble is a visual effect, not physics.
  // At 60fps, each Text node triggers a Troika worker re-layout 60x/s which is
  // the exact cause of the hero-text stall seen on 6x CPU throttle.
  const lastFrameRef = useRef(0);

  useEffect(() => {
    const oldText = oldTextRef.current;
    if (oldText === targetText) return;

    const startTime = performance.now();
    const chars = "01XZ$%#@!+?_█░▒▓<>[]{}";

    const animate = (now: number) => {
      // Skip frame if less than 50ms since last update (~20fps cap)
      if (now - lastFrameRef.current < 50) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameRef.current = now;

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const currentLength = Math.round(
        oldText.length + (targetText.length - oldText.length) * progress
      );

      let result = "";
      for (let i = 0; i < currentLength; i++) {
        const charProgress = i / Math.max(currentLength, 1);
        const decryptThreshold = progress;
        const isSpace = (i < targetText.length && targetText[i] === ' ') || (i < oldText.length && oldText[i] === ' ');
        if (isSpace) {
          result += ' ';
        } else if (charProgress < decryptThreshold - 0.1) {
          result += i < targetText.length ? targetText[i] : ' ';
        } else if (charProgress > decryptThreshold + 0.1) {
          result += i < oldText.length ? oldText[i] : chars[Math.floor(Math.random() * chars.length)];
        } else {
          result += chars[Math.floor(Math.random() * chars.length)];
        }
      }

      setDisplayText(result);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayText(targetText);
        oldTextRef.current = targetText;
      }
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [targetText, duration]);

  return displayText;
}

function WebGLHeroText({
  label,
  line1A,
  line1B,
  line2,
  position,
  activeRange,
  align = "left",
  animationType = "materialize",
  sectionIndex,
  fontSize1 = 0.42,
  fontSize2 = 0.26, // Increased subtext font size for readability
  isMachine = false,
}: {
  label: string;
  line1A: string;
  line1B: string;
  line2: string;
  position: [number, number, number];
  activeRange: [number, number, number, number];
  align?: "left" | "right";
  animationType?: "flyUp" | "sinkDown" | "materialize";
  sectionIndex: number;
  fontSize1?: number;
  fontSize2?: number;
  isMachine?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const initialPos = useMemo(() => new THREE.Vector3(...position), [position]);

  const scrambledLine1A = useTextScramble(line1A, 800);
  const scrambledLine1B = useTextScramble(line1B, 800);
  const scrambledLine2 = useTextScramble(line2, 800);

  // Shader uniforms
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uOpacity: { value: 0.0 },
    uIsMachine: { value: 0.0 },
    uSectionIndex: { value: 0.0 },
  }), []);

  // Set transparent=true only once to avoid re-uploading the material every frame
  const materialBootstrapped = useRef(false);

  useFrame((state) => {
    if (!groupRef.current) return;
    const progress = scrollState.dampedProgress;
    const [inStart, inEnd, outStart, outEnd] = activeRange;

    let activeSection = 0;
    if (progress < 0.15) {
      activeSection = 0;
    } else if (progress < 0.348) {
      activeSection = 1;
    } else {
      activeSection = 2;
    }

    // Ground text (sectionIndex 1) stays visible when scrolling down to cavern (activeSection >= 1)
    const isCurrentlyActive = sectionIndex === 1 ? (activeSection >= 1) : (activeSection === sectionIndex);

    let opacity = 0;
    let yOffset = 0;
    let zOffset = 0;

    if (isCurrentlyActive && progress >= inStart && progress <= outEnd) {
      if (progress < inEnd) {
        // Entrance phase
        opacity = (progress - inStart) / (inEnd - inStart);
        const t = 1.0 - opacity;
        zOffset = -t * 0.5;
      } else if (progress < outStart) {
        // Active phase
        opacity = 1.0;
      } else {
        // Exit phase
        if (sectionIndex === 1) {
          // Do not transition or fade Ground text, let it rest on the surface
          opacity = 1.0;
          yOffset = 0;
          zOffset = 0;
        } else {
          const t = (progress - outStart) / (outEnd - outStart);
          opacity = 1.0 - t;
          if (animationType === "flyUp") {
            yOffset = t * 3.5;
            zOffset = t * 3.0;
          } else if (animationType === "sinkDown") {
            yOffset = -t * 2.5;
            zOffset = -t * 2.0;
          } else {
            zOffset = -t * 1.5;
          }
        }
      }
    }

    // Apply translation relative to initial coordinates
    groupRef.current.position.set(
      initialPos.x,
      initialPos.y + yOffset,
      initialPos.z + zOffset
    );

    // Track text corners for web anchors if cavern level (using localToWorld to account for kinetic tilt)
    if (sectionIndex === 2 && groupRef.current.visible) {
      groupRef.current.updateMatrixWorld(true);
      // Reuse pre-allocated module-level vectors — avoids 4 heap allocations per frame
      _tp1.set(0.05, 0.45, 0); groupRef.current.localToWorld(_tp1);
      _tp2.set(1.7,  0.45, 0); groupRef.current.localToWorld(_tp2);
      _tp3.set(0.05, 0.05, 0); groupRef.current.localToWorld(_tp3);
      _tp4.set(2.3,  0.05, 0); groupRef.current.localToWorld(_tp4);
      webAnchorPoints.textCorners = [_tp1, _tp2, _tp3, _tp4];
    }

    // Interactive mouse cursor parallax tilt
    const targetRotX = -state.pointer.y * 0.15;
    const targetRotY = state.pointer.x * 0.15;

    // Kinetic scroll speed tilt
    const speedTilt = scrollState.speed * 0.20;

    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotX + speedTilt, 0.05);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, 0.05);

    // Smoothly transition the machine-mode uniform
    const targetIsMachine = isMachine ? 1.0 : 0.0;
    uniforms.uIsMachine.value = THREE.MathUtils.lerp(uniforms.uIsMachine.value, targetIsMachine, 0.1);

    // Pass the section index uniform value
    uniforms.uSectionIndex.value = sectionIndex;

    const elapsedTime = state.clock.getElapsedTime();
    uniforms.uTime.value = elapsedTime;
    uniforms.uOpacity.value = opacity;

    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as any;
        // Set transparent=true only once — re-setting needsUpdate every frame
        // triggers a full GPU material re-upload which is extremely expensive.
        if (!materialBootstrapped.current) {
          mat.transparent = true;
          mat.needsUpdate = true;
          materialBootstrapped.current = true;
        }
        mat.opacity = opacity;
        if (mat.uniforms) {
          if (mat.uniforms.uOpacity) mat.uniforms.uOpacity.value = opacity;
          if (mat.uniforms.uTime) mat.uniforms.uTime.value = elapsedTime;
          if (mat.uniforms.uIsMachine) mat.uniforms.uIsMachine.value = uniforms.uIsMachine.value;
          if (mat.uniforms.uSectionIndex) mat.uniforms.uSectionIndex.value = uniforms.uSectionIndex.value;
        }
      }
    });

    groupRef.current.visible = opacity > 0;
  });

  const anchorX = align;
  const textAlign = align;

  return (
    <group ref={groupRef} position={position}>
      {/* Label */}
      <Text
        font="/fonts/Outfit-Light.ttf"
        fontSize={0.07}
        letterSpacing={0.25}
        color="#a1a1aa"
        anchorX={anchorX}
        anchorY="middle"
        position={[0, 0.55, 0]}
      >
        {/* castShadow/receiveShadow removed: Troika text is a thin plane mesh —
            shadows are invisible but force the shadow map renderer to process every
            glyph mesh at 60fps, adding significant GPU overhead. */}
        {label}
      </Text>

      {/* Line 1A */}
      <Text
        font="/fonts/Outfit-Light.ttf"
        fontSize={fontSize1}
        letterSpacing={-0.03}
        color="#ffffff"
        anchorX={anchorX}
        anchorY="middle"
        position={[0, 0.45, 0]}
        textAlign={textAlign}
      >
        {scrambledLine1A}
        <shaderMaterial
          attach="material"
          uniforms={uniforms}
          transparent
          vertexShader={webGLHeroTextVertexShader}
          fragmentShader={webGLHeroTextFragmentShader}
        />
      </Text>

      {/* Line 1B */}
      <Text
        font="/fonts/Outfit-Light.ttf"
        fontSize={fontSize1}
        letterSpacing={-0.03}
        color="#ffffff"
        anchorX={anchorX}
        anchorY="middle"
        position={[0, 0.05, 0]}
        textAlign={textAlign}
      >
        {scrambledLine1B}
        <shaderMaterial
          attach="material"
          uniforms={uniforms}
          transparent
          vertexShader={webGLHeroTextVertexShader}
          fragmentShader={webGLHeroTextFragmentShader}
        />
      </Text>

      {/* Line 2 — subheading */}
      <Text
        font="/fonts/PlayfairDisplay-Italic.ttf"
        fontSize={fontSize2}
        color={sectionIndex === 2 ? "#ffe6d5" : "#0f172a"}
        anchorX={anchorX}
        anchorY="middle"
        position={[0, -0.32, 0]}
        textAlign={textAlign}
      >
        {scrambledLine2}
      </Text>
    </group>
  );
}

// Soft drifting wind/cloud particles representing sky atmospheric details for Stage 1
// function CinematicClouds({ isAscending }: { isAscending?: boolean }) {
//   if (isAscending) return null;
//   return (
//     <group position={[0, 10, -12]}>
//       {/* <Clouds material={THREE.MeshLambertMaterial}> */}
//       <Clouds material={THREE.MeshBasicMaterial}>
//         <Cloud seed={1} segments={40} bounds={[15, 3, 3]} volume={15} color="#e0e8f5" position={[0, 0, 0]} speed={0.1} opacity={0.5} />
//         <Cloud seed={2} segments={30} bounds={[12, 3, 3]} volume={12} color="#c5d8f7" position={[-10, 3, -5]} speed={0.15} opacity={0.3} />
//         <Cloud seed={3} segments={30} bounds={[12, 3, 3]} volume={12} color="#dbe5f7" position={[10, 2, -8]} speed={0.12} opacity={0.3} />
//       </Clouds>
//     </group>
//   );
// }
// Soft drifting wind/cloud particles representing sky atmospheric details for Stage 1
function CinematicClouds({ isAscending, isMobile }: { isAscending?: boolean; isMobile?: boolean }) {
  if (isAscending) return null;
  // Halve cloud polygon count on mobile — each Cloud segment is a mesh primitive.
  // Desktop: 30/20/20 segments. Mobile: 15/10/10.
  const s = isMobile ? 0.5 : 1;
  return (
    <group position={[0, 0, 0]}>
      <Clouds>
        <Cloud seed={1} segments={Math.round(30 * s)} bounds={[8, 1, 1]} volume={6} color="#e0e8f5" position={[0, 5, -3.5]} speed={0.1} opacity={0.35} />
        <Cloud seed={2} segments={Math.round(20 * s)} bounds={[6, 1, 1]} volume={4} color="#c5d8f7" position={[-4.5, 3, -4]} speed={0.15} opacity={0.2} />
        <Cloud seed={3} segments={Math.round(20 * s)} bounds={[6, 1, 1]} volume={4} color="#dbe5f7" position={[4.5, 4, -4]} speed={0.12} opacity={0.2} />
      </Clouds>
    </group>
  );
}


function WindParticles({ isMobile }: { isMobile?: boolean }) {
  return (
    <Sparkles
      count={isMobile ? 75 : 150}
      scale={25}
      size={5}
      speed={0.6}
      opacity={0.4}
      color="#ffffff"
      position={[0, 3, -8]}
    />
  );
}

// Subterranean floating dust/spore particles system for Stage 3 & 4
function DustParticles({ isMobile }: { isMobile?: boolean }) {
  return (
    <Sparkles
      count={isMobile ? 125 : 250}
      scale={25}
      size={6}
      speed={0.2}
      opacity={0.5}
      color="#ffcc88"
      position={[0, -5, 0]}
    />
  );
}

// Shared hook — builds a cloned+configured scene from the single cached GLTF.
// Avoids duplicating the clone+traverse+mat.clone work that previously ran
// independently in both Ground and SubterraneanGround on the same asset.
function useGroundScene(variant: "surface" | "cavern") {
  const { scene } = useGLTF("/ground%20(1).glb");
  return useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;
      child.receiveShadow = true;
      const src = child.material as THREE.MeshStandardMaterial;
      if (!src) return;
      const mat = src.clone();

      // ── Texture resolution budget ────────────────────────────────────────────
      // The base-color texture is 2048×2048 WebP (701 KB on disk, 22 MB VRAM).
      // By enabling proper mip-mapping and capping anisotropy we:
      //   • Let the GPU automatically use lower mip levels at distance (halves
      //     effective VRAM to ~6 MB on mid-range devices).
      //   • Cap anisotropic filtering at 4x — beyond that the quality gain is
      //     imperceptible for a tileable ground texture viewed at oblique angles.
      if (mat.map) {
        mat.map.minFilter = THREE.LinearMipmapLinearFilter; // Trilinear — best mip quality
        mat.map.magFilter = THREE.LinearFilter;
        mat.map.anisotropy = Math.min(4, mat.map.anisotropy); // Cap at 4x (16x is GPU-costly)
        mat.map.generateMipmaps = true;
        mat.map.needsUpdate = true;
      }
      if (mat.normalMap) {
        mat.normalMap.minFilter = THREE.LinearMipmapLinearFilter;
        mat.normalMap.anisotropy = Math.min(4, mat.normalMap.anisotropy);
        mat.normalMap.generateMipmaps = true;
        mat.normalMap.needsUpdate = true;
      }

      if (variant === "surface") {
        mat.transparent = true;
        mat.color.set("#e0e5ea");
        mat.roughness = 0.35;
        mat.metalness = 0.2;
        mat.normalScale.set(2.5, 2.5);
      } else {
        mat.transparent = false;
        child.frustumCulled = false;
        mat.color.set("#4a3525");
        mat.roughness = 0.6;
        mat.metalness = 0.1;
        mat.normalScale.set(4.5, 4.5);
      }
      mat.needsUpdate = true;
      child.material = mat;
    });
    return clone;
  }, [scene, variant]);
}

function Ground() {
  const clonedScene = useGroundScene("surface");

  // Cache the meshes once on mount — avoids scene-graph traversal every useFrame.
  const groundMeshes = useRef<THREE.Mesh[]>([]);
  // Track last opacity to avoid setting material dirty flag every frame when value is stable.
  const lastOpacity = useRef(-1);
  useEffect(() => {
    const meshes: THREE.Mesh[] = [];
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });
    groundMeshes.current = meshes;
  }, [clonedScene]);

  useFrame(() => {
    const currentDamped = scrollState.dampedProgress;
    const opacity = currentDamped > 0.42
      ? Math.max(1.0 - (currentDamped - 0.42) / 0.04, 0.0)
      : 1.0;
    // Early-out: don't touch materials when opacity is identical to last frame.
    // Avoids dirtying the material uniform every tick when the value is stable.
    if (Math.abs(opacity - lastOpacity.current) < 0.001) return;
    lastOpacity.current = opacity;
    for (const child of groundMeshes.current) {
      const mat = child.material as THREE.MeshStandardMaterial;
      if (mat) mat.opacity = opacity;
    }
  });

  return (
    <primitive
      object={clonedScene}
      position={[0, -2.60, 0]}
      scale={[1.5, 1, 1.5]}
    />
  );
}

// Actual subterranean rocky geometry for Stage 3 & 4
function SubterraneanGround() {
  const clonedScene = useGroundScene("cavern");

  return (
    <primitive
      object={clonedScene}
      position={[0, -2.60, 0]}
      rotation={[Math.PI, 0, 0]} // Flip the mesh upside down so the jagged rocky underside becomes the cavern floor!
      scale={[1, 1, 1]}
    />
  );
}

// 3D animated Spider crawling inside Stage 3 & 4 Subterranean cave
function SubterraneanSpider({
  isMachineRevealed = false,
  glitchState = "idle"
}: {
  isMachineRevealed?: boolean;
  glitchState?: "idle" | "glitching-in" | "tech-revealed" | "glitching-out";
}) {
  const group = useRef<THREE.Group>(null);
  const gltf = useGLTF("/spider.glb");
  const { scene, animations, parser } = gltf;
  const { actions } = useAnimations(animations, group);

  // Clone the scene for Spider-Verse chromatic silhouettes
  const cyanClone = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshBasicMaterial({
          color: "#00FFFF",
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
        });
      }
    });
    return clone;
  }, [scene]);

  const magentaClone = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshBasicMaterial({
          color: "#FF00FF",
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
        });
      }
    });
    return clone;
  }, [scene]);

  const cyanCloneRef = useRef<THREE.Group>(null);
  const magentaCloneRef = useRef<THREE.Group>(null);

  // Play default animation if it exists
  useEffect(() => {
    if (animations.length > 0) {
      const firstAction = actions[Object.keys(actions)[0]];
      if (firstAction) {
        firstAction.reset().fadeIn(0.5).play();
        firstAction.timeScale = 1.0;
      }
    }
  }, [actions, animations]);

  // Resolve textures from the already-loaded GLTF parser.
  // This is safe post-DRACOLoader fix: the spider.glb is fully decoded during the
  // preloader, so getDependency() resolves instantly with no scroll-time hitch.
  // useEffect(() => {
  //   if (!parser) return;
  //   Promise.all([
  //     parser.getDependency("texture", 0).catch(() => null) as Promise<THREE.Texture | null>,
  //     parser.getDependency("texture", 2).catch(() => null) as Promise<THREE.Texture | null>,
  //   ]).then(([diffuseTex, normalTex]) => {
  //     scene.traverse((child) => {
  //       if (!(child instanceof THREE.Mesh)) return;
  //       child.castShadow    = true;
  //       child.receiveShadow = true;
  //       if (child.material.name === "Mat_Spiderbody.001") {
  //         if (diffuseTex) {
  //           diffuseTex.colorSpace = THREE.SRGBColorSpace;
  //           diffuseTex.needsUpdate = true;
  //         }
  //         child.material = new THREE.MeshStandardMaterial({
  //           map:       diffuseTex ?? null,
  //           normalMap: normalTex  ?? null,
  //           roughness: 0.8,
  //           metalness: 0.1,
  //         });
  //       } else if (child.material.name === "MAT_Spider_eyes.001") {
  //         child.material = new THREE.MeshStandardMaterial({
  //           color: "#080200",
  //           roughness: 0.15,
  //           metalness: 0.9,
  //         });
  //       }
  //     });
  //   });
  // }, [scene, parser]);
  useEffect(() => {
    if (!parser) return;
    Promise.all([
      parser.getDependency("texture", 0).catch(() => null) as Promise<THREE.Texture | null>,
      parser.getDependency("texture", 2).catch(() => null) as Promise<THREE.Texture | null>,
    ]).then(([diffuseTex, normalTex]) => {
      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;

        if (diffuseTex) {
          diffuseTex.colorSpace = THREE.SRGBColorSpace;
          diffuseTex.needsUpdate = true;
        }
        if (normalTex) {
          normalTex.needsUpdate = true;
        }

        if (child.name.toLowerCase().includes("eye") || (child.material && child.material.name.toLowerCase().includes("eye"))) {
          child.material = new THREE.MeshStandardMaterial({
            color: "#080200",
            roughness: 0.15,
            metalness: 0.9,
          });
        } else {
          child.material = new THREE.MeshStandardMaterial({
            map: diffuseTex ?? null,
            normalMap: normalTex ?? null,
            roughness: 0.6,
            metalness: 0.2,
          });
        }
      });
    });
  }, [scene, parser]);



  const frontLegsRef = useRef<THREE.Object3D[]>([]);
  useEffect(() => {
    const legs: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (child.name.toLowerCase().includes("leg") || child.name.toLowerCase().includes("claw") || child.name.toLowerCase().includes("foot")) {
        legs.push(child);
      }
    });
    frontLegsRef.current = legs.slice(0, 4);
    if (frontLegsRef.current.length === 0) {
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          frontLegsRef.current.push(child);
        }
      });
      frontLegsRef.current = frontLegsRef.current.slice(0, 4);
    }
  }, [scene]);

  // Fade-in/out scale and wiggling in useFrame
  useFrame((state) => {
    if (!group.current) return;
    const progress = scrollState.dampedProgress;
    const time = state.clock.getElapsedTime();

    // Scale logic to render spider instantly upon camera teleportation at 0.348 progress
    const s = progress < 0.348 ? 0 : 1.2;
    group.current.scale.set(s, s, s);

    // Apply local Jitter & Spider-Verse chromatic split during transition
    const isGlitching = glitchState === "glitching-in" || glitchState === "glitching-out";
    if (isGlitching && s > 0) {
      group.current.position.set(
        0.8 + (Math.random() - 0.5) * 0.12,
        -2.85 + Math.sin(time * 1.5) * 0.008 + (Math.random() - 0.5) * 0.12,
        1.9 + (Math.random() - 0.5) * 0.12
      );

      // Posterized, jerky Spider-Verse silhouette splitting scaled by local model size s
      const timeStep = Math.floor(time * 24) / 24;
      const shiftX = (Math.sin(timeStep * 50) * 0.06 + (Math.random() - 0.5) * 0.03) / s;
      const shiftY = (Math.cos(timeStep * 40) * 0.06 + (Math.random() - 0.5) * 0.03) / s;

      if (cyanCloneRef.current) {
        cyanCloneRef.current.position.set(-shiftX, -shiftY, 0);
        cyanCloneRef.current.scale.setScalar(1.0 + Math.sin(timeStep * 30) * 0.04);
      }
      if (magentaCloneRef.current) {
        magentaCloneRef.current.position.set(shiftX, shiftY, 0);
        magentaCloneRef.current.scale.setScalar(1.0 - Math.sin(timeStep * 30) * 0.04);
      }
    } else {
      group.current.position.set(0.8, -2.85 + Math.sin(time * 1.5) * 0.008, 1.9);
    }

    if (s > 0) {
      if (frontLegsRef.current.length >= 2) {
        // Grow the pool only when leg count changes (rare), never on a typical frame
        if (webAnchorPoints.spiderLegs.length !== frontLegsRef.current.length) {
          webAnchorPoints.spiderLegs = frontLegsRef.current.map(() => new THREE.Vector3());
        }
        frontLegsRef.current.forEach((leg, i) => leg.getWorldPosition(webAnchorPoints.spiderLegs[i]));
      } else {
        if (!_spiderBodyPos) _spiderBodyPos = new THREE.Vector3();
        group.current.getWorldPosition(_spiderBodyPos);
        if (webAnchorPoints.spiderLegs.length !== 4) {
          webAnchorPoints.spiderLegs = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        }
        webAnchorPoints.spiderLegs[0].copy(_spiderBodyPos).add(_spiderLegOffsets[0]);
        webAnchorPoints.spiderLegs[1].copy(_spiderBodyPos).add(_spiderLegOffsets[1]);
        webAnchorPoints.spiderLegs[2].copy(_spiderBodyPos).add(_spiderLegOffsets[2]);
        webAnchorPoints.spiderLegs[3].copy(_spiderBodyPos).add(_spiderLegOffsets[3]);
      }
    }
  });

  const isGlitching = glitchState === "glitching-in" || glitchState === "glitching-out";

  return (
    <group ref={group} position={[0.8, -2.85, 1.9]}>
      <primitive
        object={scene}
        rotation={[0, -Math.PI * 0.1, 0]} // Rotated 180 degrees to face the camera/user
      />
      {isGlitching && (
        <>
          <primitive ref={cyanCloneRef} object={cyanClone} rotation={[0, -Math.PI * 0.1, 0]} />
          <primitive ref={magentaCloneRef} object={magentaClone} rotation={[0, -Math.PI * 0.1, 0]} />
        </>
      )}
      {/* Only glitch the body as requested, no external shapes/rings */}
    </group>
  );
}

// 3D animated Spy drone crawling inside Stage 3 & 4 Subterranean cave
function SubterraneanSpy({
  glitchState = "idle"
}: {
  glitchState?: "idle" | "glitching-in" | "tech-revealed" | "glitching-out";
}) {
  const group = useRef<THREE.Group>(null);
  const gltf = useGLTF("/spy.glb");


  const { scene, animations } = gltf;
  const { actions } = useAnimations(animations, group);

  // Clone the scene for Spider-Verse chromatic silhouettes
  const cyanClone = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshBasicMaterial({
          color: "#00FFFF",
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
        });
      }
    });
    return clone;
  }, [scene]);

  const magentaClone = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshBasicMaterial({
          color: "#FF00FF",
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
        });
      }
    });
    return clone;
  }, [scene]);

  const cyanCloneRef = useRef<THREE.Group>(null);
  const magentaCloneRef = useRef<THREE.Group>(null);

  // Play default animation if it exists
  useEffect(() => {
    if (animations.length > 0) {
      const firstAction = actions[Object.keys(actions)[0]] || actions["Idle"];
      if (firstAction) {
        firstAction.reset().fadeIn(0.5).play();
        firstAction.timeScale = 1.0;
      }
    }
  }, [actions, animations]);

  // Enable shadows and customize materials to look premium
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat) {
          mat.roughness = 0.2; // Glossy black finish
          mat.metalness = 0.85; // Metallic reflections
          mat.needsUpdate = true;
        }
      }
    });
  }, [scene]);

  const frontLegsRef = useRef<THREE.Object3D[]>([]);
  useEffect(() => {
    const legs: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (child.name.toLowerCase().includes("leg") || child.name.toLowerCase().includes("claw") || child.name.toLowerCase().includes("foot")) {
        legs.push(child);
      }
    });
    frontLegsRef.current = legs.slice(0, 4);
    if (frontLegsRef.current.length === 0) {
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          frontLegsRef.current.push(child);
        }
      });
      frontLegsRef.current = frontLegsRef.current.slice(0, 4);
    }
  }, [scene]);

  // Fade-in/out scale and wiggling in useFrame
  useFrame((state) => {
    if (!group.current) return;
    const progress = scrollState.dampedProgress;
    const time = state.clock.getElapsedTime();

    // Scale logic to render spy instantly upon camera teleportation at 0.348 progress
    const s = progress < 0.348 ? 0 : 0.45;
    group.current.scale.set(s, s, s);

    // Apply local Jitter & Spider-Verse chromatic split during transition
    const isGlitching = glitchState === "glitching-in" || glitchState === "glitching-out";
    if (isGlitching && s > 0) {
      group.current.position.set(
        0.8 + (Math.random() - 0.5) * 0.12,
        -2.85 + Math.sin(time * 1.5) * 0.008 + (Math.random() - 0.5) * 0.12,
        1.9 + (Math.random() - 0.5) * 0.12
      );

      // Posterized, jerky Spider-Verse silhouette splitting scaled by local model size s
      const timeStep = Math.floor(time * 24) / 24;
      const shiftX = (Math.sin(timeStep * 50) * 0.06 + (Math.random() - 0.5) * 0.03) / s;
      const shiftY = (Math.cos(timeStep * 40) * 0.06 + (Math.random() - 0.5) * 0.03) / s;

      if (cyanCloneRef.current) {
        cyanCloneRef.current.position.set(-shiftX, -shiftY, 0);
        cyanCloneRef.current.scale.setScalar(1.0 + Math.sin(timeStep * 30) * 0.04);
      }
      if (magentaCloneRef.current) {
        magentaCloneRef.current.position.set(shiftX, shiftY, 0);
        magentaCloneRef.current.scale.setScalar(1.0 - Math.sin(timeStep * 30) * 0.04);
      }
    } else {
      group.current.position.set(0.8, -2.85 + Math.sin(time * 1.5) * 0.008, 1.9);
    }

    if (s > 0) {
      if (frontLegsRef.current.length >= 2) {
        if (webAnchorPoints.spiderLegs.length !== frontLegsRef.current.length) {
          webAnchorPoints.spiderLegs = frontLegsRef.current.map(() => new THREE.Vector3());
        }
        frontLegsRef.current.forEach((leg, i) => leg.getWorldPosition(webAnchorPoints.spiderLegs[i]));
      } else {
        if (!_spiderBodyPos) _spiderBodyPos = new THREE.Vector3();
        group.current.getWorldPosition(_spiderBodyPos);
        if (webAnchorPoints.spiderLegs.length !== 4) {
          webAnchorPoints.spiderLegs = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        }
        webAnchorPoints.spiderLegs[0].copy(_spiderBodyPos).add(_spiderLegOffsets[0]);
        webAnchorPoints.spiderLegs[1].copy(_spiderBodyPos).add(_spiderLegOffsets[1]);
        webAnchorPoints.spiderLegs[2].copy(_spiderBodyPos).add(_spiderLegOffsets[2]);
        webAnchorPoints.spiderLegs[3].copy(_spiderBodyPos).add(_spiderLegOffsets[3]);
      }
    }
  });

  const isGlitching = glitchState === "glitching-in" || glitchState === "glitching-out";

  return (
    <group ref={group} position={[0.8, -2.85, 1.9]}>
      <primitive
        object={scene}
        rotation={[0, -Math.PI * 0.1, 0]} // Oriented to face camera/user
      />
      {isGlitching && (
        <>
          <primitive ref={cyanCloneRef} object={cyanClone} rotation={[0, -Math.PI * 0.1, 0]} />
          <primitive ref={magentaCloneRef} object={magentaClone} rotation={[0, -Math.PI * 0.1, 0]} />
        </>
      )}
      {/* Only glitch the body as requested, no external shapes/rings */}
    </group>
  );
}

// Pre-allocated point pool for ProceduralWebs — avoids 12 new Vector3() per line per frame.
// With 8 lines at 60fps this was 5760 allocations/second driving GC pauses.
const WEB_POINT_COUNT = 12;
const _webPointPool: THREE.Vector3[][] = Array.from({ length: 8 }, () =>
  Array.from({ length: WEB_POINT_COUNT + 1 }, () => new THREE.Vector3())
);

// Procedural glowing silk threads connecting spider legs to the text corners
function ProceduralWebs() {
  const lineRefs = useRef<any[]>([]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const legs = webAnchorPoints.spiderLegs;
    const corners = webAnchorPoints.textCorners;

    if (legs.length > 0 && corners.length > 0) {
      lineRefs.current.forEach((line, idx) => {
        if (!line) return;
        const start = legs[idx % legs.length];
        const end = corners[idx % corners.length];
        const pool = _webPointPool[idx % _webPointPool.length];

        for (let i = 0; i <= WEB_POINT_COUNT; i++) {
          const t = i / WEB_POINT_COUNT;
          // Re-use pooled vector — lerpVectors writes into the existing object
          pool[i].lerpVectors(start, end, t);
          const sway = Math.sin(t * Math.PI) * Math.sin(time * 2.5 + idx) * 0.08;
          pool[i].y += sway;
          pool[i].x += sway * 0.3;
        }
        line.geometry.setFromPoints(pool);
      });
    }
  });

  const LineComp = "line" as any;

  return (
    <>
      {[...Array(4)].map((_, i) => (
        <LineComp key={i} ref={(el: any) => { if (el) lineRefs.current[i] = el; }} frustumCulled={false}>
          <bufferGeometry />
          <lineBasicMaterial
            color="#ffe6d5" // glowing warm amber web color
            transparent
            opacity={0.8}
            depthWrite={false}
          />
        </LineComp>
      ))}
    </>
  );
}

function EnvironmentalPipeline({ isAscending }: { isAscending?: boolean }) {
  const spotLightRef = useRef<THREE.SpotLight>(null);
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);

  // Cache the bgEl DOM reference once on mount so we never call getElementById() inside useFrame.
  // A DOM query inside a 60fps render loop forces a full style recalculation every frame.
  const bgElRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    bgElRef.current = document.getElementById("webgl-bg");
  }, []);

  useFrame((state) => {
    if (isAscending) return;
    const progress = scrollState.dampedProgress;

    if (progress < 0.348) {
      // STAGE 1 & 2 (Sky & Ground)
      if (bgElRef.current) bgElRef.current.style.backgroundColor = "#8ab9ff";
      state.gl.setClearColor(0x000000, 0);

      if (state.scene.fog) {
        (state.scene.fog as THREE.FogExp2).color.set("#8ab9ff");
        (state.scene.fog as THREE.FogExp2).density = progress < 0.20 ? 0.008 : 0.012;
      }
      if (ambientLightRef.current) {
        ambientLightRef.current.intensity = 0.35;
        ambientLightRef.current.color.set("#dce9ff");
      }
      if (dirLightRef.current) {
        dirLightRef.current.intensity = 1.8;
        dirLightRef.current.color.set("#ffffff");
        dirLightRef.current.position.set(5, 12, 5);
      }
      if (spotLightRef.current) {
        spotLightRef.current.intensity = progress < 0.20 ? 0 : 5.0;
        spotLightRef.current.color.set("#8bc4ff");
        spotLightRef.current.position.set(0, 10, 0);
      }
    } else {
      // STAGE 3 & 4 (Subterranean Cavern)
      if (bgElRef.current) bgElRef.current.style.backgroundColor = "#0c0908";
      state.gl.setClearColor(0x000000, 0);

      if (state.scene.fog) {
        (state.scene.fog as THREE.FogExp2).color.set("#0c0908");
        (state.scene.fog as THREE.FogExp2).density = 0.075;
      }
      if (ambientLightRef.current) {
        ambientLightRef.current.intensity = 0.2;
        ambientLightRef.current.color.set("#241710");
      }
      if (dirLightRef.current) dirLightRef.current.intensity = 0;
      if (spotLightRef.current) spotLightRef.current.intensity = 0;
    }
  });

  return (
    <>
      <ambientLight ref={ambientLightRef} intensity={0.4} color="#dce9ff" />

      {/* STAGE 1 & 2 Directional daylight fill */}
      <directionalLight
        ref={dirLightRef}
        position={[5, 12, 5]}
        intensity={1.8}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />

      {/* STAGE 2: Spotlight for Ground Ant */}
      <spotLight
        ref={spotLightRef}
        position={[0, 10, 0]}
        angle={1.2}
        penumbra={0.8}
        intensity={5}
        color="#8bc4ff"
        castShadow={false}
      />

      {/* STAGE 3 & 4: Cavern ambient glow — castShadow removed (each shadow-casting point
          light adds a cube-map pass = 6 depth renders; 3 lights = 18 extra passes/frame) */}
      <pointLight position={[6, -3.2, -8]}  intensity={6} distance={30} decay={1.8} color="#ff7733" />
      <pointLight position={[-6, -3.2, -8]} intensity={4} distance={30} decay={1.8} color="#ff4411" />
    </>
  );
}

// Dynamically adjusts camera FOV for mobile portrait viewports
function MobileCamera() {
  const { camera, viewport } = useThree();
  useEffect(() => {
    const isMobile = viewport.aspect < 0.85;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = isMobile ? 75 : 50;
      camera.updateProjectionMatrix();
    }
  }, [camera, viewport.aspect]);
  return null;
}

function PipelineAssets({
  strikeActive,
  isMachineRevealed = false,
  modelGlitchState = "idle",
  isAscending = false
}: {
  strikeActive: boolean;
  isMachineRevealed?: boolean;
  modelGlitchState?: "idle" | "glitching-in" | "tech-revealed" | "glitching-out";
  isAscending?: boolean;
}) {
  const stage1Ref = useRef<THREE.Group>(null);
  const stage2Ref = useRef<THREE.Group>(null);
  const stage3Ref = useRef<THREE.Group>(null);
  const light1Ref = useRef<THREE.PointLight>(null);
  const light2Ref = useRef<THREE.PointLight>(null);
  const light3Ref = useRef<THREE.PointLight>(null);

  // Detect mobile / portrait viewport from the Three.js viewport size
  const { viewport } = useThree();
  const isMobile = viewport.aspect < 0.85;

  const progress = scrollState.dampedProgress;
  const activeSlide = progress < 0.15 ? 1 : (progress < 0.348 ? 2 : 3);

  const showStage1Tech = isMachineRevealed || (activeSlide === 1 && (modelGlitchState === "tech-revealed" || modelGlitchState === "glitching-out"));
  const showStage2Tech = isMachineRevealed || (activeSlide === 2 && (modelGlitchState === "tech-revealed" || modelGlitchState === "glitching-out"));

  // Animate and toggle values dynamically inside useFrame to coordinate with scroll changes
  useFrame(() => {
    const currentDamped = scrollState.dampedProgress;

    // 1. Zoom factor for Stage 2 Y offset (zoom-in swoop-in without scaling/stretching texture)
    if (stage2Ref.current) {
      const zoomFactor = Math.min(currentDamped / 0.31, 1.0);
      const ease = 3 * zoomFactor * zoomFactor - 2 * zoomFactor * zoomFactor * zoomFactor; // smoothstep
      stage2Ref.current.position.y = -0.6 * (1.0 - ease); // Shift up from Y = -0.6 to Y = 0.0
    }

    // 2. Dynamic group visibilities
    if (stage1Ref.current) {
      stage1Ref.current.visible = currentDamped < 0.348;
    }
    if (stage2Ref.current) {
      stage2Ref.current.visible = true; // Keep stage 2 visible always so the ground and its text stay on the surface above as we scroll down
    }
    if (stage3Ref.current) {
      stage3Ref.current.visible = currentDamped >= 0.348;
    }

    // 3. Cavern lights fade in quickly after camera teleports into view at 0.348 progress
    const cavernLightIntensity = currentDamped < 0.348
      ? 0
      : Math.min((currentDamped - 0.348) / 0.05, 1.0);

    // Intensities tuned for castShadow=false: without shadow maps, the raw intensity
    // hits the spider and surrounding geometry unoccluded, so values are lower than
    // the original 15/10/8 that were designed for shadowed (blocked) light.
    if (light1Ref.current) light1Ref.current.intensity = 6 * cavernLightIntensity;
    if (light2Ref.current) light2Ref.current.intensity = 4 * cavernLightIntensity;
    if (light3Ref.current) light3Ref.current.intensity = 3 * cavernLightIntensity;
  });

  return (
    <>
      {/* STAGE 1 (Sky): Wind Particles & Flying Bee / Flying Drone */}
      <group ref={stage1Ref}>
        <CinematicClouds isAscending={isAscending} isMobile={isMobile} />
        <WindParticles isMobile={isMobile} />
        {showStage1Tech ? (
          <FlyingDrone strikeActive={strikeActive} glitchState={activeSlide === 1 ? modelGlitchState : "idle"} />
        ) : (
          <FlyingBee strikeActive={strikeActive} isMachineRevealed={isMachineRevealed} glitchState={activeSlide === 1 ? modelGlitchState : "idle"} />
        )}
        <WebGLHeroText
          label="PROLOGUE // THE SURFACE LAYER"
          line1A={showStage1Tech ? "AUTONOMOUS" : "WEIGHTLESS"}
          line1B={showStage1Tech ? "DELIVERY." : "FRONTENDS."}
          line2={showStage1Tech ? "Scaling cross-platform ecosystems from concept to production." : "Engineering frictionless, high-fidelity web experiences."}
          position={isMobile ? [0, -0.3, -1.0] : [-3.5, 0.4, -1.0]}
          activeRange={[-0.1, 0.0, 0.10, 0.20]}
          align={(isMobile ? "center" : "left") as any}
          animationType="flyUp"
          sectionIndex={0}
          fontSize1={isMobile ? 0.38 : 0.70}
          fontSize2={isMobile ? 0.16 : 0.25}
          isMachine={showStage1Tech}
        />
      </group>

      {/* STAGE 2 (Ground): Ant / Rover walking along Grass plane */}
      <group ref={stage2Ref}>
        <Ground />
        {showStage2Tech ? (
          <GroundRover glitchState={activeSlide === 2 ? modelGlitchState : "idle"} />
        ) : (
          <GroundAnt isMachineRevealed={isMachineRevealed} glitchState={activeSlide === 2 ? modelGlitchState : "idle"} />
        )}
        <WebGLHeroText
          label="INTERLUDE // SYSTEM TRANSIT"
          line1A={showStage2Tech ? "INTELLIGENT" : "IMMENSE"}
          line1B={showStage2Tech ? "AUTOMATION." : "CAPACITY."}
          line2={showStage2Tech ? "Deep learning models optimize system metrics." : "Robust architectures built to handle heavy data weight."}
          position={isMobile ? [0, -1.0, -1.5] : [-3.5, -0.9, -1.5]}
          activeRange={[0.10, 0.20, 1.0, 1.0]}
          // align={isMobile ? "center" : "left"}
          align={(isMobile ? "center" : "left") as any}
          animationType="sinkDown"
          sectionIndex={1}
          fontSize1={isMobile ? 0.38 : 0.70}
          fontSize2={isMobile ? 0.16 : 0.25}
          isMachine={showStage2Tech}
        />
      </group>

      {/* STAGE 3 & 4 (Subterranean Cavern): Spider / Spy on Subterranean Ground */}
      <group ref={stage3Ref} position={[0, -2.9, 0]}>
        <SubterraneanGround />

        {/* Removed Cavern Backup Floor to reveal the true SubterraneanGround geometry */}

        {/* Cavern Ceiling — MeshBasicMaterial so it ignores all scene lights.
            It's a near-black cave ceiling: it should always render as #0a0705 regardless
            of what the point lights below are doing. MeshStandardMaterial was being lit
            bright white by the close-range point lights once castShadow was removed. */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.6, 0]}>
          <planeGeometry args={[100, 100]} />
          <meshBasicMaterial color="#0a0705" />
        </mesh>

        {/* Cavern floating dust spores system */}
        <DustParticles isMobile={isMobile} />

        <WebGLHeroText
          label="DEEP CAVERN // CORE ENGINE"
          line1A={isMachineRevealed ? "IRONCLAD" : "COMPLEX"}
          line1B={isMachineRevealed ? "SECURITY." : "NETWORKS."}
          line2={isMachineRevealed ? "Enterprise-grade system protection." : "Weaving intricate backend logic securely in the dark"}
          position={isMobile ? [0, -3.1, -0.5] : [-1.5, -2.5, -0.5]}
          activeRange={[0.348, 0.408, 1.0, 1.0]}
          // align={isMobile ? "center" : "left"}
          align={(isMobile ? "center" : "left") as any}
          animationType="materialize"
          sectionIndex={2}
          fontSize1={isMobile ? 0.32 : 0.45}
          fontSize2={isMobile ? 0.14 : 0.20}
          isMachine={isMachineRevealed}
        />


        {/* Cavern lights to keep the underground lighted beautifully without cursor spotlight */}
        {/* castShadow removed from all 3 point lights: each shadow-casting point light requires
            a full cube-map shadow pass (6 depth renders). 3 lights = 18 extra render passes/frame.
            The warm amber glow is entirely from color + intensity — point-light shadows at this scale
            are invisible to the naked eye but burn ~3ms/frame on a mid-range GPU. */}
        <pointLight
          ref={light1Ref}
          position={[0.8, -0.5, 2.8]}
          intensity={0}
          distance={12}
          decay={1.5}
          color="#ffe3cc"
        />
        <pointLight
          ref={light2Ref}
          position={[-1.5, 0.5, 2.2]}
          intensity={0}
          distance={12}
          decay={1.5}
          color="#ffaa66"
        />
        <pointLight
          ref={light3Ref}
          position={[2.5, 0.5, 2.2]}
          intensity={0}
          distance={12}
          decay={1.5}
          color="#ff8844"
        />

        {isMachineRevealed ? (
          <SubterraneanSpy glitchState={modelGlitchState} />
        ) : (
          <SubterraneanSpider isMachineRevealed={isMachineRevealed} glitchState={modelGlitchState} />
        )}
      </group>

      <ProceduralWebs />
    </>
  );
}

// Controls the global HDRI environment, fading it out to be moody in the cavern
function DynamicEnvironment() {
  const { scene } = useThree();
  // Track last intensity to avoid writing the same value every frame (GPU uniform dirty).
  const lastIntensity = useRef(-1);
  useFrame(() => {
    const progress = scrollState.dampedProgress;
    const intensity = progress < 0.30 ? 0.45 : Math.max(0.05, 0.45 - (progress - 0.30) * 10.0);
    // Early-out: only write when the value actually changed by a meaningful amount.
    if (Math.abs(intensity - lastIntensity.current) < 0.005) return;
    lastIntensity.current = intensity;
    const s = scene as any;
    if ('environmentIntensity' in s) s.environmentIntensity = intensity;
  });
  return <Environment preset="studio" environmentRotation={[0, Math.PI, 0]} />;
}

// Controls the matrix reveal transition sequence when the camera enters Fold 3 (cavern)
function GlitchSequenceController({
  isMachineRevealed,
  setIsMachineRevealed,
  setGlitchActive,
  modelGlitchState,
  setModelGlitchState,
}: {
  isMachineRevealed: boolean;
  setIsMachineRevealed: (val: boolean) => void;
  setGlitchActive: (val: boolean) => void;
  modelGlitchState: "idle" | "glitching-in" | "tech-revealed" | "glitching-out";
  setModelGlitchState: (val: any) => void;
}) {
  const glitchTriggered = useRef(false);
  const miniGlitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use a reference-stable value to prevent stale closures in useFrame
  const currentGlitchPhase = useRef<"idle" | "glitching-in" | "tech-revealed" | "glitching-out">("idle");

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (miniGlitchTimeoutRef.current) {
        clearTimeout(miniGlitchTimeoutRef.current);
      }
      currentGlitchPhase.current = "idle";
    };
  }, []);

  useFrame(() => {
    const progress = scrollState.dampedProgress;

    // 1. Permanent Matrix Reveal Sequence in Cavern (Fold 3, progress >= 0.410)
    // Pushed trigger scroll progress to 0.410 so spider is fully visible before glitching
    if (progress >= 0.410 && !isMachineRevealed && !glitchTriggered.current) {
      glitchTriggered.current = true;

      // Cancel any pending timeouts and reset local state
      if (miniGlitchTimeoutRef.current) {
        clearTimeout(miniGlitchTimeoutRef.current);
        miniGlitchTimeoutRef.current = null;
      }

      // Delay transition by 2.5 seconds to let user view clean spider
      setTimeout(() => {
        // Trigger glitch sequence
        currentGlitchPhase.current = "glitching-in";
        setModelGlitchState("glitching-in");
        audio.playGlitch();

        // Step B: After 250ms (midway through local glitch-in), trigger screen break
        miniGlitchTimeoutRef.current = setTimeout(() => {
          setGlitchActive(true);

          // Step C: After 200ms (450ms total), swap model to Spy Drone and start its glitch-out
          miniGlitchTimeoutRef.current = setTimeout(() => {
            setIsMachineRevealed(true);
            currentGlitchPhase.current = "glitching-out";
            setModelGlitchState("glitching-out");
            audio.playGlitch();

            // Step D: After 200ms (650ms total), turn off screen break
            miniGlitchTimeoutRef.current = setTimeout(() => {
              setGlitchActive(false);

              // Step E: After 250ms (900ms total), clear local glitch and stabilize cleanly
              miniGlitchTimeoutRef.current = setTimeout(() => {
                currentGlitchPhase.current = "idle";
                setModelGlitchState("idle");
                miniGlitchTimeoutRef.current = null;
              }, 250);

            }, 200);

          }, 200);

        }, 250);
      }, 2500);
    }
  });

  return null;
}

export default function WebGLCanvas({
  strikeActive,
  isMachineRevealed = false,
  setIsMachineRevealed,
  isAscending = false,
  terminalReady = false,
  onTerminalReady,
  onFinalZoomComplete,
  onSpaceReady
}: {
  strikeActive?: boolean;
  isMachineRevealed?: boolean;
  setIsMachineRevealed?: (val: boolean) => void;
  isAscending?: boolean;
  terminalReady?: boolean;
  onTerminalReady?: () => void;
  onFinalZoomComplete?: () => void;
  onSpaceReady?: () => void;
}) {
  useEffect(() => {
    audio.setMachineState(isMachineRevealed ?? false);
    audio.setAscendingState(isAscending ?? false);
  }, [isMachineRevealed, isAscending]);

  const [glitchActive, setGlitchActive] = useState(false);
  const [modelGlitchState, setModelGlitchState] = useState<"idle" | "glitching-in" | "tech-revealed" | "glitching-out">("idle");

  useEffect(() => {
    if (modelGlitchState === "glitching-in" || modelGlitchState === "glitching-out") {
      audio.playGlitch();
    }
  }, [modelGlitchState]);

  const glitchDelayVector = useMemo(() => new THREE.Vector2(0, 0), []);
  const glitchDurationVector = useMemo(() => new THREE.Vector2(0.8, 0.8), []);
  const glitchStrengthVector = useMemo(() => new THREE.Vector2(0.8, 1.0), []);

  return (
    <>
      {/* Background div at z-0 */}
      <div id="webgl-bg" className="fixed inset-0 w-full h-full z-0 bg-[#a6c8ff]" />

      {/* Ground canvas at z-2 — below hero text (z-10) so text floats above the ground */}
      <div id="webgl-canvas-container" className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2 }}>
        <Canvas
          shadows
          gl={{
            antialias: typeof window !== 'undefined' && window.innerWidth > 768,
            powerPreference: "high-performance",
            alpha: true,
            stencil: false,
            depth: true,
          }}
          dpr={typeof window !== 'undefined' && window.innerWidth <= 768 ? [1, 1.2] : [1, 1.8]}
          camera={{ fov: 50, near: 0.1, far: 2000, position: [0, 0, 4] }}
        >
          <fogExp2 attach="fog" args={["#a6c8ff", 0.04]} />

          <Suspense fallback={null}>
            {/* Eagerly compile all scene shaders during preloader so first scroll has zero compile stalls */}
            <EagerShaderCompiler />
            {onSpaceReady && <SpaceAssetCompiler onReady={onSpaceReady} />}
            {isAscending && onTerminalReady && (
              <TerminalAssetLoader onLoaded={onTerminalReady} />
            )}
            <DynamicEnvironment />
            <EnvironmentalPipeline isAscending={isAscending} />
            <SpaceBackground isAscending={isAscending} />
            <MobileCamera />
            <CameraRail
              isAscending={isAscending}
              terminalReady={terminalReady}
              onFinalZoomComplete={onFinalZoomComplete}
            />
            <PipelineAssets
              strikeActive={strikeActive ?? false}
              isMachineRevealed={isMachineRevealed}
              modelGlitchState={modelGlitchState}
              isAscending={isAscending}
            />

            <GlitchSequenceController
              isMachineRevealed={isMachineRevealed}
              setIsMachineRevealed={setIsMachineRevealed ?? (() => { })}
              setGlitchActive={setGlitchActive}
              modelGlitchState={modelGlitchState}
              setModelGlitchState={setModelGlitchState}
            />

            {glitchActive && (
              <EffectComposer>
                <Glitch
                  active={glitchActive}
                  delay={glitchDelayVector}
                  duration={glitchDurationVector}
                  strength={glitchStrengthVector}
                  mode={2} // GlitchMode.CONSTANT_WILD
                  ratio={0.85}
                />
              </EffectComposer>
            )}

            <SpaceWarp isAscending={isAscending} />
            {/* <Preload all /> removed — EagerShaderCompiler handles all shader
                 warming via gl.compile() during the loading screen, making the
                 Preload off-screen render pass redundant and wasteful on old GPUs */}
          </Suspense>
        </Canvas>
      </div>
    </>
  );
}

useGLTF.preload("/ground%20(1).glb");
useGLTF.preload("/spider.glb");
useGLTF.preload("/spy.glb");
useGLTF.preload("/drone.glb");
useGLTF.preload("/rover.glb");
useGLTF.preload("/space.glb");
useGLTF.preload("/me.glb");
useGLTF.preload("/card.glb");
useGLTF.preload("/flying-bee/source/Flying bee.glb"); // Bee textures are embedded in GLB (Draco+WebP)

// ─── Eager Shader Compiler ───────────────────────────────────────────────────
// During the loading screen every GLTF scene is already in memory (useGLTF.preload
// above fetched them all). But the browser hasn't compiled any GLSL shaders yet —
// that work happens lazily the first time a mesh enters the frustum, causing a
// visible hitch. This component calls gl.compile() on every loaded scene while the
// preloader is still showing, so by the time the user clicks through ALL shaders
// are pre-warmed on the GPU and every stage is stutter-free from frame 1.
function EagerShaderCompiler() {
  const { gl, camera } = useThree();
  const compiledRef = useRef(false);

  const groundScene = useGLTF("/ground%20(1).glb").scene;
  const spiderScene = useGLTF("/spider.glb").scene;
  const spyScene    = useGLTF("/spy.glb").scene;
  const droneScene  = useGLTF("/drone.glb").scene;
  const roverScene  = useGLTF("/rover.glb").scene;
  const spaceScene  = useGLTF("/space.glb").scene;

  useEffect(() => {
    if (compiledRef.current) return;
    compiledRef.current = true;

    requestAnimationFrame(() => {
      // 1. Compile all GLTF scenes (meshes, PBR materials, textures)
      const gltfScenes = [groundScene, spiderScene, spyScene, droneScene, roverScene, spaceScene];
      gltfScenes.forEach(scene => {
        try { gl.compile(scene, camera); } catch (_) { /* non-fatal */ }
      });

      // 2. Compile the custom hero-text ShaderMaterial.
      //    This is the #1 source of first-scroll hitches on laptops: the shader
      //    compiles lazily the moment WebGLHeroText first becomes visible.
      //    We create a minimal dummy scene with the same ShaderMaterial so the
      //    GLSL is already compiled by the time the user reaches it.
      try {
        const dummyScene = new THREE.Scene();
        const dummyGeo = new THREE.PlaneGeometry(0.001, 0.001);
        const dummyMat = new THREE.ShaderMaterial({
          vertexShader: webGLHeroTextVertexShader,
          fragmentShader: webGLHeroTextFragmentShader,
          uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0 },
            uIsMachine: { value: 0 },
            uSectionIndex: { value: 0 },
          },
          transparent: true,
        });
        dummyScene.add(new THREE.Mesh(dummyGeo, dummyMat));
        gl.compile(dummyScene, camera);
        dummyGeo.dispose();
        dummyMat.dispose();
      } catch (_) { /* non-fatal */ }

      // 3. Compile Stars, Sparkles, and Clouds shader materials.
      //    These use built-in ShaderMaterials from drei/three — we force them
      //    to compile by creating the exact same material types off-screen.
      try {
        const dummyScene2 = new THREE.Scene();
        // PointsMaterial covers Stars and Sparkles (both are THREE.Points under the hood)
        const ptsMat = new THREE.PointsMaterial({ size: 0.01 });
        const ptsGeo = new THREE.BufferGeometry();
        ptsGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
        dummyScene2.add(new THREE.Points(ptsGeo, ptsMat));
        // MeshStandardMaterial with envMap covers the environment-lit ground reflector
        const stdMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
        const stdGeo = new THREE.PlaneGeometry(0.001, 0.001);
        dummyScene2.add(new THREE.Mesh(stdGeo, stdMat));
        gl.compile(dummyScene2, camera);
        ptsGeo.dispose(); ptsMat.dispose(); stdGeo.dispose(); stdMat.dispose();
      } catch (_) { /* non-fatal */ }
    });
  }, [gl, camera, groundScene, spiderScene, spyScene, droneScene, roverScene, spaceScene]);

  return null;
}

function TerminalAssetLoader({ onLoaded }: { onLoaded: () => void }) {
  // Suspend while loading assets
  useGLTF("/me.glb");
  useGLTF("/card.glb");

  useEffect(() => {
    // This runs only after both assets are successfully loaded and the component mounts
    onLoaded();
  }, [onLoaded]);

  return null;
}

function SpaceAssetCompiler({ onReady }: { onReady: () => void }) {
  const { scene } = useGLTF("/space.glb");
  const { gl, camera } = useThree();
  const compiledRef = useRef(false);

  useEffect(() => {
    if (!compiledRef.current && scene) {
      // Force compile the scene assets into the GPU before ascent starts
      gl.compile(scene, camera);
      compiledRef.current = true;
      onReady();
    }
  }, [scene, gl, camera, onReady]);

  // Render extremely far out of view to ensure it is in the WebGL context
  return (
    <group position={[0, -10000, 0]} scale={[10, 10, 10]}>
      <primitive object={scene} />
    </group>
  );
}

function SpaceBackground({ isAscending }: { isAscending: boolean }) {
  const ref = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (ref.current && isAscending) {
      ref.current.rotation.y += delta * 0.05; // Slow majestic rotation
      ref.current.rotation.x += delta * 0.02;
    }
  });

  return (
    <group ref={ref} position={[0, 50, -80]} visible={isAscending}>
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
    </group>
  );
}

function SpaceWarp({ isAscending }: { isAscending: boolean }) {
  const { scene, animations } = useGLTF("/space.glb");
  const { actions } = useAnimations(animations, scene);
  const group = useRef<THREE.Group>(null);

  // Generate custom stylized texture for the hull decal.
  // Lazy-allocated only when isAscending becomes true — avoids an unnecessary
  // 1024×512 GPU texture upload on every page load.
  const customDecalTexture = useMemo(() => {
    if (!isAscending) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#010A15";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#FF9900";
      ctx.font = "bold 80px 'Arial', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SHASHWAT MANU", 512, 200);

      ctx.font = "40px 'Arial', sans-serif";
      ctx.fillStyle = "#00F0FF";
      ctx.fillText("// TERMINAL", 512, 300);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  }, [isAscending]);

  // Play embedded animations perfectly synchronized with the flight
  useEffect(() => {
    if (actions && isAscending) {
      Object.values(actions).forEach(action => {
        if (action) {
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
          // Reset precisely when ascent starts to guarantee we don't hit loop boundaries during flight
          action.reset().fadeIn(1.0).play();
        }
      });
    }
  }, [actions, isAscending]);

  // Inject the custom decal texture directly into the spaceship hull's material
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat) {
          const matName = (mat.name || "").toLowerCase();
          const meshName = (child.name || "").toLowerCase();

          // Target the G5 VALVE ACCESS sub-mesh/material heuristically
          if (
            matName.includes("g5") || matName.includes("valve") || matName.includes("logo") || matName.includes("decal") || matName.includes("text") ||
            meshName.includes("g5") || meshName.includes("valve") || meshName.includes("logo") || meshName.includes("decal") || meshName.includes("text")
          ) {
            mat.map = customDecalTexture;
            mat.emissiveMap = customDecalTexture;
            mat.emissive = new THREE.Color("#FF9900");
            mat.emissiveIntensity = 2.0;
            mat.needsUpdate = true;
          }
        }
      }
    });
  }, [scene, customDecalTexture]);

  // Position space scene in the sky where camera will ascend
  return (
    <group ref={group} position={[0, 50, -100]} scale={[10, 10, 10]} visible={isAscending}>
      <primitive object={scene} />

      {/* High-contrast lighting for the space rocks */}
      <ambientLight intensity={0.5} color="#ffffff" />
      <directionalLight position={[10, 20, 10]} intensity={2.5} color="#00F0FF" />
      <directionalLight position={[-10, 0, -10]} intensity={1.5} color="#FF9900" />
    </group>
  );
}
