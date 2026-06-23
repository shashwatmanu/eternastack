"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { scrollState } from "@/utils/scrollState";
import LocalGlitchVFX from "./LocalGlitchVFX";
import { audio } from "@/utils/audio";

export default function GroundAnt({ 
  isMachineRevealed = false,
  glitchState = "idle"
}: { 
  isMachineRevealed?: boolean; 
  glitchState?: "idle" | "glitching-in" | "tech-revealed" | "glitching-out";
}) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/ant.glb");
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

  // Play the walk animation loop ("Take 001")
  useEffect(() => {
    const action = actions["Take 001"];
    if (action) {
      action.reset().fadeIn(0.5).play();
      action.timeScale = 1.4; // Walking speed
    }
    return () => {
      if (action) action.fadeOut(0.5);
    };
  }, [actions]);

  // Traverse the mesh to clear vertex tints, set color to dark brown/black, and enable shadow casting
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat) {
          mat.color.set("#2c1b12"); // Dark natural chitin color (dark brown/black)
          mat.roughness = 0.25; // Shiny insect shell
          mat.metalness = 0.4; // Subtle metallic reflection
          mat.needsUpdate = true;
        }
      }
    });
  }, [scene]);



  // Scale the parent group dynamically from 0 to 1 on scroll to control visibility smoothly
  useFrame(() => {
    if (!group.current) return;
    const progress = scrollState.dampedProgress;

    let s = 1.0;

    if (progress < 0.12) {
      s = 0;
    } else if (progress < 0.32) {
      // Fade-in scale earlier (starting at 12% progress) to align with camera panning down
      const t = (progress - 0.12) / 0.20;
      s = THREE.MathUtils.smoothstep(t, 0, 1);
    } else if (progress > 0.42 && progress < 0.48) {
      // Fade-out scale quickly as Stage 2 transitions to Stage 3
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

      // Posterized, jerky Spider-Verse silhouette splitting in parent space coordinates
      const stateObj = (group.current as any).__r3f?.state; // Get three-fiber clock state indirectly or construct a new time if not in state
      const time = stateObj ? stateObj.clock.getElapsedTime() : Date.now() / 1000;
      const timeStep = Math.floor(time * 24) / 24;
      const shiftX = Math.sin(timeStep * 50) * 0.08 + (Math.random() - 0.5) * 0.04;
      const shiftY = Math.cos(timeStep * 40) * 0.08 + (Math.random() - 0.5) * 0.04;

      if (cyanCloneRef.current) {
        cyanCloneRef.current.position.set(-shiftX, -shiftY, 0);
        cyanCloneRef.current.scale.setScalar(0.0007 * (1.0 + Math.sin(timeStep * 30) * 0.05));
      }
      if (magentaCloneRef.current) {
        magentaCloneRef.current.position.set(shiftX, shiftY, 0);
        magentaCloneRef.current.scale.setScalar(0.0007 * (1.0 - Math.sin(timeStep * 30) * 0.05));
      }
    } else {
      group.current.position.set(0.8, -1.46, 1.4);
    }


  });

  const isGlitching = glitchState === "glitching-in" || glitchState === "glitching-out";

  return (
    <group ref={group} position={[0.8, -1.46, 1.4]}>
      <primitive
        object={scene}
        scale={[0.0007, 0.0007, 0.0007]} // Adjusted scale to look proportionate on the terrain
        rotation={[0, -Math.PI / 4, 0]} // angled three-quarter view
      />
      {isGlitching && (
        <>
          <primitive
            ref={cyanCloneRef}
            object={cyanClone}
            scale={[0.0007, 0.0007, 0.0007]}
            rotation={[0, -Math.PI / 4, 0]}
          />
          <primitive
            ref={magentaCloneRef}
            object={magentaClone}
            scale={[0.0007, 0.0007, 0.0007]}
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

useGLTF.preload("/ant.glb");
