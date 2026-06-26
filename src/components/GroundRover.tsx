"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { scrollState } from "@/utils/scrollState";
import LocalGlitchVFX from "./LocalGlitchVFX";
import { audio } from "@/utils/audio";

export default function GroundRover({
  glitchState = "idle"
}: {
  glitchState?: "idle" | "glitching-in" | "tech-revealed" | "glitching-out";
}) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/rover.glb");
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

  // Play the walk animation loop ("Take 01")
  useEffect(() => {
    const action = actions["Take 01"];
    if (action) {
      action.reset().fadeIn(0.5).play();
      action.timeScale = 1.0; // Normal walking speed
    }
    return () => {
      if (action) action.fadeOut(0.5);
    };
  }, [actions]);

  // Enable shadow casting and receiving for the rover meshes
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [scene]);

  // Ground contact scale logic: keep it full scale right away, only fading it to 0 as we descend to cavern
  useFrame(() => {
    if (!group.current) return;
    const progress = scrollState.dampedProgress;

    let s = 1.0;

    if (progress > 0.42 && progress < 0.48) {
      // Scale down to hide it as we descend into the cavern
      const t = (progress - 0.42) / 0.06;
      s = 1 - THREE.MathUtils.smoothstep(t, 0, 1);
    } else if (progress >= 0.48) {
      s = 0;
    }

    group.current.scale.set(s, s, s);

    // Apply local jitter & Spider-Verse chromatic split during glitch transition
    const isGlitching = glitchState === "glitching-in" || glitchState === "glitching-out";
    if (isGlitching) {
      group.current.position.set(
        0.8 + (Math.random() - 0.5) * 0.15,
        -1.46 + (Math.random() - 0.5) * 0.15,
        1.4 + (Math.random() - 0.5) * 0.15
      );
      // Posterized, jerky Spider-Verse silhouette splitting
      const time = Date.now() / 1000;
      const timeStep = Math.floor(time * 24) / 24;
      const shiftX = Math.sin(timeStep * 50) * 0.08 + (Math.random() - 0.5) * 0.04;
      const shiftY = Math.cos(timeStep * 40) * 0.08 + (Math.random() - 0.5) * 0.04;
      if (cyanCloneRef.current) {
        cyanCloneRef.current.position.set(-shiftX, -shiftY, 0);
        cyanCloneRef.current.scale.setScalar(0.25 * (1.0 + Math.sin(timeStep * 30) * 0.05));
      }
      if (magentaCloneRef.current) {
        magentaCloneRef.current.position.set(shiftX, shiftY, 0);
        magentaCloneRef.current.scale.setScalar(0.25 * (1.0 - Math.sin(timeStep * 30) * 0.05));
      }
    } else {
      group.current.position.set(0.8, -1.46, 1.4);
    }
  });

  const isGlitching = glitchState === "glitching-in" || glitchState === "glitching-out";

  return (
    <group ref={group} position={[0.8, -1.46, 1.4]}> {/* Elevated Y to -1.46 to sit perfectly on the terrain surface */}
      <primitive
        object={scene}
        scale={[0.25, 0.25, 0.25]} // Scaled down to match scene proportions
        rotation={[0, -Math.PI / 4, 0]} // angled three-quarter view
      />
      {isGlitching && (
        <>
          <primitive
            ref={cyanCloneRef}
            object={cyanClone}
            scale={[0.25, 0.25, 0.25]}
            rotation={[0, -Math.PI / 4, 0]}
          />
          <primitive
            ref={magentaCloneRef}
            object={magentaClone}
            scale={[0.25, 0.25, 0.25]}
            rotation={[0, -Math.PI / 4, 0]}
          />
        </>
      )}
      {glitchState !== "idle" && (
        <LocalGlitchVFX state={glitchState} scale={0.7} />
      )}
    </group>
  );
}

useGLTF.preload("/rover.glb");
