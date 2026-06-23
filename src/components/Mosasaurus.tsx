"use client";

import React, { useEffect, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import { scrollState } from "@/utils/scrollState";

export default function Mosasaurus() {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/mosasaurus/source/canglong.glb");
  const { actions } = useAnimations(animations, group);

  // Traverse meshes to clear dark/green tints but preserve native texture coordinates/maps
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat) {
          mat.color.set("#ffffff"); // Reset material color to white to clear green/black tints
          mat.roughness = 0.25;     // Highly glossy wet skin look
          mat.metalness = 0.10;
          mat.needsUpdate = true;
        }
      }
    });
  }, [scene]);

  // Play the default swimming "Animation" loop
  useEffect(() => {
    const action = actions["Animation"];
    if (action) {
      action.reset().fadeIn(0.5).play();
      action.timeScale = 0.8;
    }
    return () => {
      if (action) action.fadeOut(0.5);
    };
  }, [actions]);

  // Lazy bobbing & Scroll tracking with dynamic scale transitions
  useFrame((state) => {
    if (!group.current) return;

    const progress = scrollState.dampedProgress;
    const time = state.clock.getElapsedTime();

    const bobY = Math.sin(time * 0.6) * 0.15;
    const bobX = Math.cos(time * 0.4) * 0.1;
    const tiltZ = Math.sin(time * 0.3) * 0.03;

    // Dynamic scale to fade in Mosasaurus cleanly in Stage 4
    let s = 0.038;
    if (progress < 0.78) {
      s = 0;
    } else if (progress < 0.84) {
      const t = (progress - 0.78) / 0.06;
      s = 0.038 * THREE.MathUtils.smoothstep(t, 0, 1);
    }
    group.current.scale.set(s, s, s);

    let targetPos = new THREE.Vector3(0, 0, 0);
    let targetRot = new THREE.Vector3(0, -Math.PI / 5, 0);

    if (progress >= 0.80) {
      const t = (progress - 0.80) / 0.20;
      targetPos.lerpVectors(new THREE.Vector3(-0.6, -1.0, -1.5), new THREE.Vector3(0, -0.3, 0.5), t);
      targetRot.x = THREE.MathUtils.lerp(Math.PI / 6, 0, t);
      targetRot.y = THREE.MathUtils.lerp(-Math.PI / 3, 0, t);
      targetRot.z = THREE.MathUtils.lerp(Math.PI / 10, 0, t);
    }

    group.current.position.lerp(targetPos, 0.05);
    group.current.position.x += bobX * (1 - progress * 0.5);
    group.current.position.y += bobY * (1 - progress * 0.5);

    const currentEuler = new THREE.Euler().setFromQuaternion(group.current.quaternion);
    const lerpedEuler = new THREE.Euler(
      THREE.MathUtils.lerp(currentEuler.x, targetRot.x, 0.05),
      THREE.MathUtils.lerp(currentEuler.y, targetRot.y, 0.05),
      THREE.MathUtils.lerp(currentEuler.z, targetRot.z + tiltZ, 0.05)
    );
    group.current.quaternion.setFromEuler(lerpedEuler);
  });

  return (
    <group ref={group}>
      <primitive
        object={scene}
        position={[0, -0.8, 0]}
        rotation={[0, 0, 0]}
      />
    </group>
  );
}

useGLTF.preload("/mosasaurus/source/canglong.glb");
