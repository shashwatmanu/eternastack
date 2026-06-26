"use client";

import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function LocalGlitchVFX({
  state,
  scale = 1.0,
}: {
  state: "idle" | "glitching-in" | "tech-revealed" | "glitching-out";
  scale?: number;
}) {
  const cyanRingRef = useRef<THREE.Mesh>(null);
  const magentaRingRef = useRef<THREE.Mesh>(null);
  const whiteRingRef = useRef<THREE.Mesh>(null);
  const blocksRef = useRef<THREE.Group>(null);
  const cardsRef = useRef<THREE.Group>(null);

  const blockCount = 12;
  const cardCount = 8;

  // Generate random block and card coordinates once
  const offsets = useMemo(() => {
    const blocks = [];
    for (let i = 0; i < blockCount; i++) {
      blocks.push({
        x: (Math.random() - 0.5) * 1.6,
        y: (Math.random() - 0.5) * 1.6,
        z: (Math.random() - 0.5) * 1.6,
        size: 0.08 + Math.random() * 0.10,
        speed: 25 + Math.random() * 30,
        channel: i % 3, // 0 = cyan, 1 = magenta, 2 = white
      });
    }

    const cards = [];
    for (let i = 0; i < cardCount; i++) {
      cards.push({
        x: (Math.random() - 0.5) * 1.2,
        y: (Math.random() - 0.5) * 1.6,
        z: (Math.random() - 0.5) * 1.2,
        width: 0.4 + Math.random() * 0.8,
        height: 0.04 + Math.random() * 0.08,
        speed: 18 + Math.random() * 22,
        channel: i % 2, // 0 = cyan, 1 = magenta
      });
    }

    return { blocks, cards };
  }, []);

  useFrame((clockState) => {
    const time = clockState.clock.getElapsedTime();
    const isGlitching = state === "glitching-in" || state === "glitching-out";

    // Early-out: skip ALL computation when not glitching.
    // Previously Math.random() and 20+ position mutations ran every frame at 60fps
    // even when every ref had visible=false, burning CPU unnecessarily.
    if (!isGlitching) {
      if (cyanRingRef.current)    cyanRingRef.current.visible    = false;
      if (magentaRingRef.current) magentaRingRef.current.visible = false;
      if (whiteRingRef.current)   whiteRingRef.current.visible   = false;
      if (blocksRef.current)      blocksRef.current.visible      = false;
      if (cardsRef.current)       cardsRef.current.visible       = false;
      return;
    }

    // Stepped (posterized) chromatic split timing to match Spider-Verse animation style
    const stepTime = Math.floor(time * 24) / 24;
    const splitAmount = (0.12 + Math.sin(stepTime * 80) * 0.08) * scale;

    const ringYPos = Math.sin(stepTime * 15.0) * 0.6;
    const ringScale = scale * (1.1 + Math.sin(stepTime * 35.0) * 0.15);

    if (cyanRingRef.current) {
      cyanRingRef.current.visible = true;
      cyanRingRef.current.position.set(-splitAmount, ringYPos, 0);
      cyanRingRef.current.scale.setScalar(ringScale);
    }
    if (magentaRingRef.current) {
      magentaRingRef.current.visible = true;
      magentaRingRef.current.position.set(splitAmount, ringYPos, 0);
      magentaRingRef.current.scale.setScalar(ringScale);
    }
    if (whiteRingRef.current) {
      whiteRingRef.current.visible = true;
      whiteRingRef.current.position.set(0, ringYPos, 0);
      whiteRingRef.current.scale.setScalar(ringScale);
    }

    if (blocksRef.current) {
      blocksRef.current.visible = true;
      blocksRef.current.children.forEach((child, i) => {
        const offset = offsets.blocks[i];
        if (!offset) return;
        child.visible = Math.sin(stepTime * offset.speed + i) > -0.1;
        let bx = offset.x;
        let by = offset.y;
        let bz = offset.z;
        if (offset.channel === 0) bx -= splitAmount * 1.8;
        else if (offset.channel === 1) bx += splitAmount * 1.8;
        child.position.set(
          bx + (Math.random() - 0.5) * 0.05,
          by + (Math.random() - 0.5) * 0.05,
          bz + (Math.random() - 0.5) * 0.05
        );
      });
    }

    if (cardsRef.current) {
      cardsRef.current.visible = true;
      cardsRef.current.children.forEach((child, i) => {
        const offset = offsets.cards[i];
        if (!offset) return;
        child.visible = Math.sin(stepTime * offset.speed + i) > 0.2;
        let cx = offset.x;
        let cy = offset.y;
        let cz = offset.z;
        if (offset.channel === 0) cx -= splitAmount * 2.2;
        else cx += splitAmount * 2.2;
        child.position.set(
          cx + (Math.random() - 0.5) * 0.06,
          cy + (Math.random() - 0.5) * 0.06,
          cz + (Math.random() - 0.5) * 0.06
        );
        child.rotation.y = stepTime * 10;
      });
    }
  });

  const doubleSide = THREE.DoubleSide;

  return (
    <group>
      {/* Cyan Ring */}
      <mesh ref={cyanRingRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.75 * scale, 0.88 * scale, 32]} />
        <meshBasicMaterial
          color="#00FFFF"
          transparent
          opacity={0.8}
          side={doubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Magenta Ring */}
      <mesh ref={magentaRingRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.75 * scale, 0.88 * scale, 32]} />
        <meshBasicMaterial
          color="#FF00FF"
          transparent
          opacity={0.8}
          side={doubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* White Ring */}
      <mesh ref={whiteRingRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.77 * scale, 0.86 * scale, 32]} />
        <meshBasicMaterial
          color="#FFFFFF"
          transparent
          opacity={0.3}
          side={doubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Voxel Glitch Blocks */}
      <group ref={blocksRef}>
        {offsets.blocks.map((offset, i) => (
          <mesh key={i}>
            <boxGeometry args={[offset.size * scale, offset.size * scale, offset.size * scale]} />
            <meshBasicMaterial
              color={offset.channel === 0 ? "#00FFFF" : offset.channel === 1 ? "#FF00FF" : "#FFFFFF"}
              transparent
              opacity={offset.channel === 2 ? 0.4 : 0.8}
              blending={THREE.AdditiveBlending}
              wireframe={i % 3 === 0}
            />
          </mesh>
        ))}
      </group>

      {/* Glitch Cards/Bars (Flat Horizontal Strips) */}
      <group ref={cardsRef}>
        {offsets.cards.map((offset, i) => (
          <mesh key={i}>
            <planeGeometry args={[offset.width * scale, offset.height * scale]} />
            <meshBasicMaterial
              color={offset.channel === 0 ? "#00FFFF" : "#FF00FF"}
              transparent
              opacity={0.8}
              side={doubleSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
