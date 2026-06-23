"use client";

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { curlNoise } from "../../utils/glsl/curlNoise";

interface FiberMeltProps {
  geometry: THREE.BufferGeometry;
  progress: number;
  materialMap?: THREE.Texture | null;
}

export default function FiberMelt({ geometry, progress, materialMap }: FiberMeltProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const instancedGeometry = useMemo(() => {
    if (!geometry.attributes.position) return null;

    const originalPositions = geometry.attributes.position.array;
    const vertexCount = originalPositions.length / 3;

    // 1. Fiber Geometry (Anchored Threads)
    // 5 segments per thread for smooth curling
    const SEGMENTS = 5;
    const linePositions = new Float32Array((SEGMENTS + 1) * 3);
    for (let i = 0; i <= SEGMENTS; i++) {
      linePositions[i * 3 + 2] = i / SEGMENTS; // Z goes 0 -> 1 representing root to tip
    }

    const indices = [];
    for (let i = 0; i < SEGMENTS; i++) {
      indices.push(i, i + 1);
    }

    const instGeo = new THREE.InstancedBufferGeometry();
    instGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    instGeo.setIndex(indices);
    instGeo.instanceCount = vertexCount;
    
    instGeo.setAttribute("aStartPos", new THREE.InstancedBufferAttribute(originalPositions, 3));
    
    if (geometry.attributes.uv) {
      instGeo.setAttribute("aUv", new THREE.InstancedBufferAttribute(geometry.attributes.uv.array, 2));
    }
    if (geometry.attributes.normal) {
      instGeo.setAttribute("aNormal", new THREE.InstancedBufferAttribute(geometry.attributes.normal.array, 3));
    }

    const seeds = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      seeds[i] = Math.random();
    }
    instGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));

    return instGeo;
  }, [geometry]);

  useFrame(() => {
    // Lerp progress for flawless smoothness even if they stop scrolling abruptly
    if (materialRef.current) {
      const target = progress;
      const current = materialRef.current.uniforms.uProgress.value;
      materialRef.current.uniforms.uProgress.value += (target - current) * 0.1;
    }
  });

  // VERTEX SHADER FOR THREADS
  const fiberVertexShader = `
    ${curlNoise}
    
    uniform float uProgress;
    attribute vec3 aStartPos;
    attribute float aSeed;
    attribute vec2 aUv;
    attribute vec3 aNormal;
    
    varying float vOpacity;
    varying float vZ; 
    varying vec2 vUv;
    
    void main() {
      vZ = position.z;
      vUv = aUv;
      
      // Fixed short length to create the 'aura' / fur look
      float auraLength = 0.08 + (aSeed * 0.06);
      
      // How far along the segment we are
      float moveT = position.z * auraLength;
      
      vec3 p = aStartPos;
      
      // Gentle waving animation based on scroll progress
      vec3 noiseDisp = curlNoise(p * 5.0 + uProgress * 3.0);
      
      // Push out along normal, plus noise for waving
      p += (aNormal + noiseDisp * 0.5) * moveT;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      
      // Fade out as the main face dissolves
      float fade = 1.0 - smoothstep(0.6, 1.0, uProgress);
      vOpacity = fade * (0.4 + aSeed * 0.6);
    }
  `;

  // FRAGMENT SHADER FOR THREADS
  const fiberFragmentShader = `
    uniform sampler2D uMap;
    uniform bool uHasMap;
    
    varying float vOpacity;
    varying float vZ;
    varying vec2 vUv;
    
    void main() {
      if (vOpacity < 0.01) discard;
      
      vec3 color = vec3(1.0, 0.8, 0.4); // Golden aura
      if (uHasMap) {
        vec3 texColor = texture2D(uMap, vUv).rgb;
        color = mix(texColor, color, pow(vZ, 1.5)); // Tips are more golden
        color = pow(color, vec3(0.8)) * 1.5; // Boost vibrancy
      }
      
      gl_FragColor = vec4(color, vOpacity * vZ); // Fade roots into the mesh
    }
  `;

  if (!instancedGeometry) return null;

  return (
    <group position={[0, -0.5, 0]}>
      {/* Golden Aura Threads Layer */}
      <lineSegments geometry={instancedGeometry}>
        <shaderMaterial
          ref={materialRef}
          vertexShader={fiberVertexShader}
          fragmentShader={fiberFragmentShader}
          uniforms={{ 
            uProgress: { value: 0 },
            uMap: { value: materialMap },
            uHasMap: { value: !!materialMap }
          }}
          transparent={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}
