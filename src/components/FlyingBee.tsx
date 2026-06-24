"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import { scrollState } from "@/utils/scrollState";
import LocalGlitchVFX from "./LocalGlitchVFX";
import { audio } from "@/utils/audio";

// Hoisted to module level — avoids new THREE.Vector3/Euler() per frame (GC jitter)
const _beeTargetPos = new THREE.Vector3();
const _beeTargetRot = new THREE.Vector3();
const _beeFromPos = new THREE.Vector3(0.2, 0.1, 1.3);
const _beeToPos = new THREE.Vector3(0.5, 0.2, 1.3);
const _beeEuler = new THREE.Euler();

// Draco decoder — must match the path set in WebGLCanvas.tsx (/draco/ local copy)
useGLTF.setDecoderPath("/draco/");

export default function FlyingBee({
  strikeActive,
  isMachineRevealed = false,
  glitchState = "idle"
}: {
  strikeActive: boolean;
  isMachineRevealed?: boolean;
  glitchState?: "idle" | "glitching-in" | "tech-revealed" | "glitching-out";
}) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/flying-bee/source/Flying bee.glb");
  const { actions } = useAnimations(animations, group);


  // Clone the scene for Spider-Verse chromatic silhouettes
  const cyanClone = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child: THREE.Object3D) => {
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
    clone.traverse((child: THREE.Object3D) => {
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

  // Apply chrome/metallic overrides on top of the embedded WebP textures.
  // After metalrough conversion the material is standard MR — Three.js populates
  // src.map, src.normalMap, src.roughnessMap directly from the GLB binary.
  // useEffect(() => {
  //   scene.traverse((child: THREE.Object3D) => {
  //     if (!(child instanceof THREE.Mesh)) return;
  //     child.castShadow = false;
  //     child.receiveShadow = false;
  //     const src = child.material as THREE.MeshStandardMaterial;
  //     if (!src) return;
  //     const map          = src.map          ?? null;
  //     const normalMap    = src.normalMap    ?? null;
  //     const roughnessMap = src.roughnessMap ?? null;
  //     if (map)       { map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true; }
  //     if (normalMap) { normalMap.needsUpdate = true; }
  //     child.material = new THREE.MeshStandardMaterial({
  //       color:        "#e5e7eb",
  //       map,
  //       normalMap,
  //       roughnessMap,
  //       metalnessMap: roughnessMap,
  //       roughness:    0.08,
  //       metalness:    0.95,
  //     });
  //   });
  // }, [scene]);
  // Apply chrome/metallic overrides on top of the embedded WebP textures.
  useEffect(() => {
    scene.traverse((child: THREE.Object3D) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;
      child.receiveShadow = false;

      const src = child.material as THREE.MeshStandardMaterial;
      if (!src) return;

      // Preserve the exact texture maps parsed natively from the GLB
      const map = src.map ?? null;
      const normalMap = src.normalMap ?? null;
      const roughnessMap = src.roughnessMap ?? null;
      const metalnessMap = src.metalnessMap ?? null;

      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.needsUpdate = true;
      }
      if (normalMap) {
        normalMap.needsUpdate = true;
      }

      // Re-assign material honoring native map hierarchies with clear gloss tuning
      child.material = new THREE.MeshStandardMaterial({
        color: "#ffffff", // Change from #e5e7eb to pure white so your map colors show accurately
        map: map,
        normalMap: normalMap,
        roughnessMap: roughnessMap,
        metalnessMap: metalnessMap,
        roughness: 0.15,      // Slightly bumped up from 0.08 so it doesn't blindingly reflect background environment colors
        metalness: 0.95,
      });
    });
  }, [scene]);



  // Bounding box logged only in dev, not in production
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !scene) return;
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    console.log("Bee Bounding Box Size:", size);
    console.log("Bee Bounding Box Center:", box.getCenter(new THREE.Vector3()));
  }, [scene]);

  // Play the default flight "hover" animation loop
  useEffect(() => {
    const action = actions["hover"];
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
      const hoverAction = actions["hover"];
      const takeoffAction = actions["take_off_and_land"];

      gsap.killTweensOf(group.current.position);
      gsap.killTweensOf(group.current.rotation);

      if (takeoffAction) {
        takeoffAction.reset().fadeIn(0.2).play();
        takeoffAction.timeScale = 1.8;
        if (hoverAction) hoverAction.fadeOut(0.2);
      }

      // GSAP Lunge Timeline
      const tl = gsap.timeline({
        onComplete: () => {
          if (takeoffAction) takeoffAction.fadeOut(0.3);
          if (hoverAction) hoverAction.reset().fadeIn(0.3).play();
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
          z: 0.5, // Return to Act 4 position
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

    // Fast, gentle flutter bobbing for insect flight
    const bobY = Math.sin(time * 1.5) * 0.04;
    const bobX = Math.cos(time * 1.0) * 0.03;

    // Dynamic scale to fade out the bee cleanly to simulate it flying away
    let s = 0.05;
    if (progress > 0.05 && progress < 0.30) {
      const t = (progress - 0.05) / 0.25;
      s = 0.05 * (1 - THREE.MathUtils.smoothstep(t, 0, 1));
    } else if (progress >= 0.30) {
      s = 0;
    }
    group.current.scale.set(s, s, s);



    if (!strikeActive) {
      // Reuse pre-allocated vectors — zero heap allocations per frame
      _beeTargetPos.set(0, 0, 0);
      _beeTargetRot.set(0, -Math.PI / 5, 0);

      if (progress < 0.33) {
        const t = progress / 0.33;
        _beeTargetPos.lerpVectors(_beeFromPos, _beeToPos, t);
        _beeTargetRot.x = THREE.MathUtils.lerp(0, -Math.PI / 8, t);
        _beeTargetRot.y = THREE.MathUtils.lerp(-Math.PI / 5, Math.PI / 8, t);
      }

      group.current.position.lerp(_beeTargetPos, 0.05);
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

      _beeEuler.setFromQuaternion(group.current.quaternion);
      group.current.rotation.set(
        THREE.MathUtils.lerp(_beeEuler.x, _beeTargetRot.x, 0.05),
        THREE.MathUtils.lerp(_beeEuler.y, _beeTargetRot.y, 0.05),
        THREE.MathUtils.lerp(_beeEuler.z, 0, 0.05)
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
        <LocalGlitchVFX state={glitchState} scale={16.0} />
      )}
    </group>
  );
}

useGLTF.preload("/flying-bee/source/Flying bee.glb");

