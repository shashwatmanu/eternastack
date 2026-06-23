"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

interface WebGLFaceProps {
  progress: number;
}

// Helper to crop a BufferGeometry based on a bounding box
function cropGeometry(originalGeometry: THREE.BufferGeometry, bbox: THREE.Box3) {
  const geometry = originalGeometry.clone();
  
  const posAttr = geometry.attributes.position;
  const uvAttr = geometry.attributes.uv;
  const normalAttr = geometry.attributes.normal;
  const indices = geometry.index ? geometry.index.array : null;

  if (!indices) return geometry;

  const newPositions: number[] = [];
  const newUvs: number[] = [];
  const newNormals: number[] = [];
  const newIndices: number[] = [];

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  // Map old vertex index to new vertex index to avoid duplicates
  const indexMap = new Map<number, number>();
  let nextIndex = 0;

  const addVertex = (oldIndex: number) => {
    if (indexMap.has(oldIndex)) return indexMap.get(oldIndex)!;
    
    newPositions.push(posAttr.getX(oldIndex), posAttr.getY(oldIndex), posAttr.getZ(oldIndex));
    if (uvAttr) newUvs.push(uvAttr.getX(oldIndex), uvAttr.getY(oldIndex));
    if (normalAttr) newNormals.push(normalAttr.getX(oldIndex), normalAttr.getY(oldIndex), normalAttr.getZ(oldIndex));
    
    indexMap.set(oldIndex, nextIndex);
    return nextIndex++;
  };

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];

    vA.fromBufferAttribute(posAttr, a);
    vB.fromBufferAttribute(posAttr, b);
    vC.fromBufferAttribute(posAttr, c);

    if (bbox.containsPoint(vA) && bbox.containsPoint(vB) && bbox.containsPoint(vC)) {
      newIndices.push(addVertex(a), addVertex(b), addVertex(c));
    }
  }

  const cropped = new THREE.BufferGeometry();
  cropped.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  if (uvAttr) cropped.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
  if (normalAttr) cropped.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
  cropped.setIndex(newIndices);

  // Re-center and auto-scale to ensure it fills the cinematic frame
  cropped.computeBoundingBox();
  cropped.computeBoundingSphere();
  cropped.center();
  
  const radius = cropped.boundingSphere?.radius || 1.0;
  if (radius > 0) {
    const scale = 2.0 / radius; // Scale up to fill the camera
    cropped.scale(scale, scale, scale);
  }
  
  return cropped;
}

export default function WebGLFace({ progress }: WebGLFaceProps) {
  const { scene } = useGLTF("/me.glb") as any;
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  // Isolate and crop the geometry once
  const { croppedGeometry, originalMaterial } = useMemo(() => {
    let mainGeometry: THREE.BufferGeometry | null = null;
    let mainMaterial: THREE.Material | null = null;
    let maxVertices = 0;
    
    // Find the largest mesh in the file
    scene.traverse((child: any) => {
      if (child.isMesh) {
        const vertexCount = child.geometry.attributes.position.count;
        if (vertexCount > maxVertices) {
          maxVertices = vertexCount;
          mainGeometry = child.geometry;
          mainMaterial = child.material;
        }
      }
    });

    if (!mainGeometry) {
      return { croppedGeometry: new THREE.BufferGeometry(), originalMaterial: null };
    }

    const geom = mainGeometry as THREE.BufferGeometry;
    geom.computeBoundingBox();
    const fullBox = geom.boundingBox!;
    
    const width = fullBox.max.x - fullBox.min.x;
    
    // We want the bottom row (y < midY)
    const midY = (fullBox.min.y + fullBox.max.y) / 2;
    
    // To isolate the BOTTOM-LEFT face without catching the middle face:
    // We take from min.x up to min.x + 35% of the width
    const cropBox = new THREE.Box3(
      new THREE.Vector3(fullBox.min.x, fullBox.min.y, fullBox.min.z),
      new THREE.Vector3(fullBox.min.x + width * 0.35, midY, fullBox.max.z)
    );

    const cropped = cropGeometry(geom, cropBox);
    
    const croppedFaceCount = cropped.index ? cropped.index.array.length / 3 : 0;

    // Fallback: If cropping resulted in an empty geometry, use the original geometry
    if (croppedFaceCount === 0) {
      geom.computeBoundingSphere();
      geom.center();
      const radius = geom.boundingSphere?.radius || 1.0;
      if (radius > 0) {
        geom.scale(1.5 / radius, 1.5 / radius, 1.5 / radius);
      }
      return { croppedGeometry: geom.clone(), originalMaterial: mainMaterial };
    }

    return { croppedGeometry: cropped, originalMaterial: mainMaterial };
  }, [scene]);

  const customMaterial = useMemo(() => {
    if (!originalMaterial) return new THREE.MeshStandardMaterial({ color: 0xffffff });
    
    const mat = (originalMaterial as THREE.Material).clone() as THREE.MeshStandardMaterial;
    mat.transparent = true;
    
    mat.onBeforeCompile = (shader: any) => {
      shader.uniforms.uProgress = { value: 0 };
      shader.uniforms.uTime = { value: 0 };
      
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vLocalPos;
        `
      );
      
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vLocalPos = position;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uProgress;
         uniform float uTime;
         varying vec3 vLocalPos;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         
         // Color Correction
         vec3 customColor = gl_FragColor.rgb;
         customColor = pow(customColor, vec3(0.9)); 
         customColor *= 1.1; 
         
         // TV Static Noise that constantly animates based on time
         float staticNoise = fract(sin(dot(vLocalPos.xy + vec2(uTime * 0.1), vec2(12.9898,78.233))) * 43758.5453);
         customColor -= staticNoise * 0.15; // Subtle noise overlay all the time
         
         // Subtle constant scanlines
         float scanline = sin(vLocalPos.y * 300.0 - uTime * 5.0) * 0.05 + 0.95;
         customColor *= scanline;
         
         // Dissolve effect driven by uProgress (uses the same animated noise so the edges dance!)
         float dissolveThreshold = uProgress * 1.5;
         if (staticNoise < dissolveThreshold) {
             discard;
         }
         
         float alpha = 1.0 - smoothstep(0.4, 0.85, uProgress);
         
         gl_FragColor = vec4(customColor, gl_FragColor.a * alpha);
        `
      );
      
      mat.userData.shader = shader;
    };
    
    return mat;
  }, [originalMaterial]);

  // A pure energy aura using Fresnel (rim lighting) - NO threads
  const auraMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 }
      },
      vertexShader: `
        uniform float uProgress;
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        
        void main() {
          vec3 p = position;
          
          // Gently undulate the aura
          float noise = sin(p.y * 10.0 + uTime * 2.0) * 0.02;
          p += normal * noise;
          
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          vViewPosition = -mvPosition.xyz;
          vNormal = normalize(normalMatrix * normal);
          
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uProgress;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        
        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          
          // Fresnel effect - glow only on the edges
          float rim = 1.0 - max(dot(viewDir, normal), 0.0);
          // Sharpen to keep it strictly as an outline/aura
          rim = smoothstep(0.6, 1.0, rim);
          
          vec3 color = vec3(1.0, 0.8, 0.3); // Golden energy color
          
          // Fade out aura as the face dissolves
          float alpha = rim * 0.8 * (1.0 - smoothstep(0.4, 0.85, uProgress));
          
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide // Render inside-out for a cleaner rim
    });
  }, []);

  const groupRef = useRef<THREE.Group>(null);

  // Update uniforms and apply rotation
  useFrame((state) => {
    if (customMaterial.userData.shader) {
      customMaterial.userData.shader.uniforms.uProgress.value = progress;
      customMaterial.userData.shader.uniforms.uTime.value = state.clock.elapsedTime;
    }
    if (auraMaterial) {
      auraMaterial.uniforms.uProgress.value = progress;
      auraMaterial.uniforms.uTime.value = state.clock.elapsedTime;
    }
    if (groupRef.current) {
      groupRef.current.rotation.y = progress * Math.PI * 0.5;
    }
  });

  return (
    <group ref={groupRef}>
      {/* The solid textured face */}
      <mesh geometry={croppedGeometry} material={customMaterial} position={[0, -0.5, 0]} />
      {/* The smooth golden energy aura (scaled up slightly) */}
      <mesh geometry={croppedGeometry} material={auraMaterial} position={[0, -0.5, 0]} scale={1.03} />
    </group>
  );
}

// Preload the model
useGLTF.preload("/me.glb");
