"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import { scrollState } from "@/utils/scrollState";
import LocalGlitchVFX from "./LocalGlitchVFX";
import { audio } from "@/utils/audio";

// Hoisted to module level — avoids new THREE.Vector3/Euler() per frame (GC jitter)
const _droneTargetPos = new THREE.Vector3();
const _droneTargetRot = new THREE.Vector3();
const _droneFromPos   = new THREE.Vector3(0.2, 0.1, 1.3);
const _droneToPos     = new THREE.Vector3(0.5, 0.2, 1.3);
const _droneEuler     = new THREE.Euler();

export default function FlyingDrone({ 
  strikeActive,
  glitchState = "idle"
}: { 
  strikeActive: boolean; 
  glitchState?: "idle" | "glitching-in" | "tech-revealed" | "glitching-out";
}) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/drone.glb");
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

  // Preserve textures but configure properties for metal/roughness to keep the details looking premium
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false; // Disable shadows to prevent casting onto ground level
        child.receiveShadow = false;
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat) {
          mat.roughness = 0.15; // Sleek industrial plastic/metal finish
          mat.metalness = 0.8; // Semi-metallic texture
          mat.needsUpdate = true;
        }
      }
    });
  }, [scene]);

  // Play the default rotors flight animation
  useEffect(() => {
    const action = actions["C4D Animation Take"];
    if (action) {
      action.reset().fadeIn(0.5).play();
      action.timeScale = 1.0;
    }
    return () => {
      if (action) action.fadeOut(0.5);
    };
  }, [actions]);

  // Handle the strike action (take off and land animation + camera lunge)
  const lastStrikeActive = useRef(false);

  useEffect(() => {
    if (strikeActive && !lastStrikeActive.current && group.current) {
      const action = actions["C4D Animation Take"];

      gsap.killTweensOf(group.current.position);
      gsap.killTweensOf(group.current.rotation);

      if (action) {
        action.timeScale = 1.8; // Speed up rotors during lunge
      }

      // GSAP Lunge Timeline
      const tl = gsap.timeline({
        onComplete: () => {
          if (action) action.timeScale = 1.0;
        }
      });

      tl.to(group.current.position, {
        x: 0,
        y: 0.5,
        z: 3.5, // Lunge closer to the camera
        duration: 0.3,
        ease: "power2.out"
      })
      .to(group.current.rotation, {
        x: -Math.PI / 6,
        y: Math.PI / 8,
        duration: 0.3,
        ease: "power2.out"
      }, "<")
      .to(group.current.position, {
        x: 0,
        y: -0.3,
        z: 0.5, // Return to resting position
        duration: 1.4,
        ease: "power3.inOut"
      })
      .to(group.current.rotation, {
        x: 0,
        y: 0,
        duration: 1.4,
        ease: "power3.inOut"
      }, "<");
    }
    lastStrikeActive.current = strikeActive;
  }, [strikeActive, actions]);

  // Lazy flight bobbing and scroll transitions with dynamic scale transitions
  useFrame((state) => {
    if (!group.current) return;
    const progress = scrollState.dampedProgress;
    const time = state.clock.getElapsedTime();

    // Fast, gentle flutter bobbing to match the bee exactly
    const bobY = Math.sin(time * 1.5) * 0.04; 
    const bobX = Math.cos(time * 1.0) * 0.03;

    // Dynamic scale to fade out the drone cleanly
    let s = 0.22;
    if (progress > 0.05 && progress < 0.30) {
      const t = (progress - 0.05) / 0.25;
      s = 0.22 * (1 - THREE.MathUtils.smoothstep(t, 0, 1));
    } else if (progress >= 0.30) {
      s = 0;
    }
    group.current.scale.set(s, s, s);

    if (!strikeActive) {
      // Reuse pre-allocated vectors — zero heap allocations per frame
      _droneTargetPos.set(0, 0, 0);
      _droneTargetRot.set(0, -Math.PI / 5, 0);

      if (progress < 0.33) {
        const t = progress / 0.33;
        _droneTargetPos.lerpVectors(_droneFromPos, _droneToPos, t);
        _droneTargetRot.x = THREE.MathUtils.lerp(0, -Math.PI / 8, t);
        _droneTargetRot.y = THREE.MathUtils.lerp(-Math.PI / 5, Math.PI / 8, t);
      }

      group.current.position.lerp(_droneTargetPos, 0.05);
      group.current.position.x += bobX;
      group.current.position.y += bobY;

      // Local Jitter & Spider-Verse chromatic split during glitch transition
      const isGlitching = glitchState === "glitching-in" || glitchState === "glitching-out";
      if (isGlitching) {
        group.current.position.x += (Math.random() - 0.5) * 0.15;
        group.current.position.y += (Math.random() - 0.5) * 0.15;
        group.current.position.z += (Math.random() - 0.5) * 0.15;

        const timeStep = Math.floor(state.clock.getElapsedTime() * 24) / 24;
        const shiftX = (Math.sin(timeStep * 50) * 0.08 + (Math.random() - 0.5) * 0.04) / s;
        const shiftY = (Math.cos(timeStep * 40) * 0.08 + (Math.random() - 0.5) * 0.04) / s;
        
        if (cyanCloneRef.current) {
          cyanCloneRef.current.position.set(-shiftX, -shiftY, 0);
          cyanCloneRef.current.scale.setScalar(1.0 + Math.sin(timeStep * 30) * 0.05);
        }
        if (magentaCloneRef.current) {
          magentaCloneRef.current.position.set(shiftX, shiftY, 0);
          magentaCloneRef.current.scale.setScalar(1.0 - Math.sin(timeStep * 30) * 0.05);
        }
      }

      _droneEuler.setFromQuaternion(group.current.quaternion);
      group.current.rotation.set(
        THREE.MathUtils.lerp(_droneEuler.x, _droneTargetRot.x, 0.05),
        THREE.MathUtils.lerp(_droneEuler.y, _droneTargetRot.y, 0.05),
        THREE.MathUtils.lerp(_droneEuler.z, 0, 0.05)
      );
    }
  });

  const isGlitching = glitchState === "glitching-in" || glitchState === "glitching-out";

  return (
    <group ref={group}>
      <primitive
        object={scene}
        position={[0, 0, 0]} // Reset position offset
      />
      {isGlitching && (
        <>
          <primitive ref={cyanCloneRef} object={cyanClone} />
          <primitive ref={magentaCloneRef} object={magentaClone} />
        </>
      )}
      {glitchState !== "idle" && (
        <LocalGlitchVFX state={glitchState} scale={3.5} />
      )}
    </group>
  );
}

useGLTF.preload("/drone.glb");
