"use client";

import React, { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import { scrollState } from "@/utils/scrollState";
import { audio } from "@/utils/audio";
import { cameraSync } from "@/utils/cameraSync";

// The spaceship model itself is anchored at [0, 50, -100] but it's massive.
// We will center our camera directly on the main body of the station.
export const STATION_CENTER = new THREE.Vector3(0, 100, -100);
export const TARGET_HOVER_POS = new THREE.Vector3(0, 80, -30); // Right in front of the hull

export function CameraRail({ 
  isAscending = false,
  terminalReady = false,
  onFinalZoomComplete
}: { 
  isAscending?: boolean;
  terminalReady?: boolean;
  onFinalZoomComplete?: () => void;
}) {
  const { camera } = useThree();
  const ascentTriggered = useRef(false);
  const isAtDestination = useRef(false);
  const finalZoomTriggered = useRef(false);
  const idleTime = useRef(0);
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const lastProgress = useRef(0);

  // Pre-calculated camera positions for the cinematic scroll path
  const p0 = useMemo(() => new THREE.Vector3(0, 0, 4.0), []);          // Stage 1 (Sky): Close-up zoom
  const p1 = useMemo(() => new THREE.Vector3(0, -1.6, 3.5), []);       // Stage 2 (Ground): Eye-level front view of ant
  const p2 = useMemo(() => new THREE.Vector3(1.8, -4.8, 4.2), []);     // Stage 3 (Subterranean Side): Three-quarter view of spider
  const p3 = useMemo(() => new THREE.Vector3(0.0, -4.8, 3.5), []);     // Stage 4 (Subterranean Front): Frontal focus zoomed in on spider
  
  // Pre-calculated target lookAt focus vectors
  const l0 = useMemo(() => new THREE.Vector3(0, 0, 0), []);            // Stage 1: Bee center
  const l1 = useMemo(() => new THREE.Vector3(0.4, -1.46, 0.7), []);    // Stage 2: Ant center
  const l2 = useMemo(() => new THREE.Vector3(0.4, -4.95, 0.7), []);    // Stage 3: Spider center (aligned to cavern depth)
  const l3 = useMemo(() => new THREE.Vector3(0.4, -5.15, 0.7), []);    // Stage 4: Spider head focus

  useFrame((state, delta) => {
    if (isAscending) {
      if (!ascentTriggered.current) {
        ascentTriggered.current = true;
        
        // Simple GSAP animation
        import("gsap").then(({ gsap }) => {
          const tl = gsap.timeline();
          
          // Fade out only the ambient/creature SFX, but let space_transition keep playing
          try {
            if ((audio as any).sfxTracks) {
              const tracks = (audio as any).sfxTracks as { [key: string]: HTMLAudioElement };
              ['bee', 'drone', 'ant', 'spider', 'rover', 'spy'].forEach(key => {
                const t = tracks[key];
                if (t) { t.volume = 0; t.pause(); }
              });
            }
            // Also suspend the Web Audio context (procedural hum)
            if ((audio as any).ctx) (audio as any).ctx.suspend();
          } catch (e) {}
          
          // Step A: The Sky Shift
          const fog = state.scene.fog as THREE.FogExp2;
          if (fog) {
            tl.to(fog.color, { r: 0, g: 0, b: 0, duration: 0.6, ease: "power2.inOut" }, 0);
            tl.to(fog, { density: 0.0005, duration: 0.6, ease: "power2.inOut" }, 0); // Fade fog to prevent distance clipping
          }
          const bgEl = document.getElementById("webgl-bg");
          if (bgEl) {
            tl.to(bgEl.style, { backgroundColor: "#000000", duration: 0.6, ease: "power2.inOut" }, 0);
          }

          tl.to(camera.rotation, {
            x: Math.PI / 6, // Tilt up
            duration: 0.6,
            ease: "power2.inOut"
          }, 0);

          // Step B: Unbroken Fly-Through Down the Z-Axis
          tl.to(camera.position, {
            x: TARGET_HOVER_POS.x,
            y: TARGET_HOVER_POS.y, 
            z: TARGET_HOVER_POS.z,
            duration: 4.5, // Smooth, cinematic continuous flight
            ease: "power3.inOut"
          }, 0.6);
          
          // AAA Camera FOV Warp Effect
          const persCamera = camera as THREE.PerspectiveCamera;
          tl.to(persCamera, {
            fov: 85,
            duration: 2.0, // Swell up as we launch
            ease: "power4.in",
            onUpdate: () => persCamera.updateProjectionMatrix()
          }, 0.6);
          
          tl.to(persCamera, {
            fov: 50,
            duration: 2.5, // Ease back down as we brake near the hull
            ease: "power3.out",
            onUpdate: () => persCamera.updateProjectionMatrix()
          }, 2.6);
          
          tl.to(camera.rotation, {
            x: 0, // Level out completely to look straight at the station body
            y: 0, 
            z: 0,
            duration: 4.5, // Match the position approach
            ease: "power3.inOut",
            onComplete: () => {
              isAtDestination.current = true;
              idleTime.current = 0; 
            }
          }, 0.6);
        });
      }
      
      // Final Warp Dive (When Next.js cache is ready)
      if (isAtDestination.current && terminalReady && !finalZoomTriggered.current) {
        finalZoomTriggered.current = true;
        
        const diveTl = gsap.timeline();
        // Covert Blank Crossover: Plunge directly inside the spaceship core geometry for organic blackout
        diveTl.to(camera.position, {
          x: 0,
          y: 70, // Maintain logo height trajectory
          z: -100, // Punch deep into the actual internal structure shadows
          duration: 0.8,
          ease: "power4.in"
        }, 0);
        
        diveTl.to(camera.rotation, {
          x: 0, // Level with the logo
          y: 0,
          z: 0,
          duration: 0.8,
          ease: "power4.in",
          onComplete: () => {
            if (onFinalZoomComplete) onFinalZoomComplete();
          }
        }, 0);
      }
      
      // Idle panning (Drifting right against the detailed section)
      if (isAtDestination.current && !finalZoomTriggered.current) {
        idleTime.current += delta * 0.5;
        // Gently drift around the immediate front of the station
        camera.position.x = TARGET_HOVER_POS.x + Math.sin(idleTime.current) * 15;
        camera.position.z = TARGET_HOVER_POS.z + Math.cos(idleTime.current) * 5;
        camera.position.y = TARGET_HOVER_POS.y + Math.sin(idleTime.current * 1.5) * 8;
        camera.lookAt(STATION_CENTER);
      }
      
      return; // Skip normal scroll tracking during ascent
    }

    // 1. MathUtils.damp applies responsive scroll inertia
    scrollState.dampedProgress = THREE.MathUtils.damp(
      scrollState.dampedProgress,
      scrollState.progress,
      1.8, // Heavy luxurious damping
      delta
    );

    const progress = scrollState.dampedProgress;

    // 2. Linear interpolation between path segments
    let segmentProgress = 0;
    const startPos = new THREE.Vector3();
    const endPos = new THREE.Vector3();
    const startLook = new THREE.Vector3();
    const endLook = new THREE.Vector3();

    if (progress < 0.348) {
      // Sky -> Ground (restored to original 0.45 travel speed scale)
      segmentProgress = progress / 0.45;
      startPos.copy(p0);
      endPos.copy(p1);
      startLook.copy(l0);
      endLook.copy(l1);
    } else {
      // Instant camera teleportation to Cavern at progress >= 0.348 (during blackout)
      // Remaining scroll (0.348 to 1.0) controls the side-to-front pan within the cave.
      segmentProgress = (progress - 0.348) / 0.652;
      startPos.copy(p2);
      endPos.copy(p3);
      startLook.copy(l2);
      endLook.copy(l3);
    }

    // Smoothstep interpolation easing
    const t = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(segmentProgress, 0, 1), 0, 1);

    targetPos.current.lerpVectors(startPos, endPos, t);
    targetLook.current.lerpVectors(startLook, endLook, t);

    // 3. Set coordinates (no mouse controls parallax to ensure pure scroll choreography)
    camera.position.copy(targetPos.current);
    camera.lookAt(targetLook.current);

    // 4. Update Web Audio speed synthesizer tempo
    const deltaProgress = Math.abs(progress - lastProgress.current);
    const rawSpeed = Math.min((deltaProgress / (delta + 0.0001)) * 0.35, 1.0);
    scrollState.speed = THREE.MathUtils.damp(scrollState.speed, rawSpeed, 3.5, delta);
    
    audio.updateState(progress, scrollState.speed);

    lastProgress.current = progress;

    // Write final camera state so the foreground bee canvas can sync
    cameraSync.px = camera.position.x;
    cameraSync.py = camera.position.y;
    cameraSync.pz = camera.position.z;
    cameraSync.qx = camera.quaternion.x;
    cameraSync.qy = camera.quaternion.y;
    cameraSync.qz = camera.quaternion.z;
    cameraSync.qw = camera.quaternion.w;
  });

  return null;
}
