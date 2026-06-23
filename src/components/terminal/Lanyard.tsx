"use client";

import * as THREE from 'three';
import React, { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { Environment, Lightformer, useGLTF, useTexture } from '@react-three/drei';
import { Physics, RigidBody, BallCollider, CuboidCollider, useRopeJoint, useSphericalJoint } from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';

extend({ MeshLineGeometry, MeshLineMaterial });

// ReactBits Constants
const BLANK_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZdEVYdFNvZnR3YXJlAFBhaW50Lk5FVCB2My41LjbQg61aAAAADUlEQVQYV2P4//8/AwAI/AL+XvdLkQAAAABJRU5ErkJggg==';
const FRONT_UV_RECT = { x: 0, y: 0, w: 0.5, h: 1 };
const BACK_UV_RECT = { x: 0.5, y: 0, w: 0.5, h: 1 };

export default function LanyardPhysics() {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 50 }}>
      <Canvas camera={{ position: [0, 0, 13], fov: 25 }} gl={{ alpha: true }}>
        <Suspense fallback={null}>
          {/* Use fixed timeStep instead of 'vary' to prevent physics explosion on tab switch */}
          <Physics gravity={[0, -40, 0]} timeStep={1/60}>
            <Band frontImage="/profile.jpg" lanyardWidth={0.4} />
          </Physics>
        </Suspense>
        <Environment blur={0.75}>
          <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={10} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
        </Environment>
      </Canvas>
    </div>
  );
}

function Band({ maxSpeed = 50, minSpeed = 0, isMobile = false, frontImage = null, backImage = null, imageFit = 'cover', lanyardImage = null, lanyardWidth = 1 }: any) {
  const band = useRef<any>(null);
  const fixed = useRef<any>(null);
  const j1 = useRef<any>(null);
  const j2 = useRef<any>(null);
  const j3 = useRef<any>(null);
  const card = useRef<any>(null);
  
  const vec = new THREE.Vector3();
  const ang = new THREE.Vector3();
  const rot = new THREE.Vector3();
  const dir = new THREE.Vector3();
  
  const segmentProps = { type: 'dynamic' as const, canSleep: true, colliders: false as const, angularDamping: 4, linearDamping: 4 };
  const { nodes, materials } = useGLTF('/card.glb') as any;
  const texture = useTexture(lanyardImage || '/lanyard.png') as THREE.Texture;
  const frontTex = useTexture(frontImage || BLANK_PIXEL) as THREE.Texture;
  const backTex = useTexture(backImage || BLANK_PIXEL) as THREE.Texture;

  const { cardMap, emissiveMap } = useMemo(() => {
    const baseMap = materials.base.map;
    if (!frontImage && !backImage) return { cardMap: baseMap, emissiveMap: null };

    const baseImg = baseMap.image;
    const W = baseImg.width;
    const H = baseImg.height;
    
    // Base Color Canvas
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    
    // Emissive Mask Canvas
    const emCanvas = document.createElement('canvas');
    emCanvas.width = W;
    emCanvas.height = H;
    const emCtx = emCanvas.getContext('2d');

    if (!ctx || !emCtx) return { cardMap: baseMap, emissiveMap: null };
    
    // Draw the base card texture first
    ctx.drawImage(baseImg, 0, 0, W, H);
    
    // Make the entire emissive mask white by default (so the rest of the card glows)
    emCtx.fillStyle = '#ffffff';
    emCtx.fillRect(0, 0, W, H);

    // Helper to draw a rounded rectangle
    const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    // Draw Premium Front Layout
    if (frontImage && frontTex.image) {
      const rx = FRONT_UV_RECT.x * W;
      const ry = FRONT_UV_RECT.y * H;
      const rw = FRONT_UV_RECT.w * W;
      const rh = FRONT_UV_RECT.h * H;

      // 1. Premium Dark Gold/Yellow background
      const gradient = ctx.createLinearGradient(rx, ry, rx, ry + rh);
      gradient.addColorStop(0, '#2a2110'); // Dark gold/brown at top
      gradient.addColorStop(1, '#0a0805'); // Deep black at bottom
      ctx.fillStyle = gradient;
      ctx.fillRect(rx, ry, rw, rh);

      // --- Subtle HUD Reticle Pattern (Drone-style) ---
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 170, 0, 0.12)'; // Faint glowing gold lines
      ctx.lineWidth = 1.5;
      
      // Grid
      const gridSize = rw * 0.1;
      ctx.beginPath();
      for(let x = rx; x <= rx + rw; x += gridSize) {
        ctx.moveTo(x, ry);
        ctx.lineTo(x, ry + rh);
      }
      for(let y = ry; y <= ry + rh; y += gridSize) {
        ctx.moveTo(rx, y);
        ctx.lineTo(rx + rw, y);
      }
      ctx.stroke();

      // Concentric circles (Reticle style)
      const centerX = rx + rw / 2;
      const centerY = ry + rh * 0.55;
      ctx.beginPath();
      ctx.arc(centerX, centerY, rw * 0.25, 0, Math.PI * 2);
      ctx.arc(centerX, centerY, rw * 0.40, 0, Math.PI * 2);
      ctx.arc(centerX, centerY, rw * 0.60, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(centerX, ry);
      ctx.lineTo(centerX, ry + rh);
      ctx.moveTo(rx, centerY);
      ctx.lineTo(rx + rw, centerY);
      ctx.stroke();
      ctx.restore();
      // ------------------------------------------------

      // 2. Premium Tech Header (Gold Accent)
      ctx.fillStyle = '#ffaa00'; // Gold accent
      ctx.fillRect(rx, ry, rw, 15);
      
      ctx.fillStyle = 'rgba(255, 170, 0, 0.1)';
      ctx.fillRect(rx, ry + 15, rw, 40);

      ctx.fillStyle = '#ffaa00';
      ctx.font = 'bold 24px "Inter", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NARRATIVE LABS // AUTHORIZED PERSONNEL', rx + rw / 2, ry + 35);

      // 3. Draw the profile photo in a rounded rectangle
      const photoSize = rw * 0.65;
      const photoX = rx + (rw - photoSize) / 2;
      const photoY = ry + rh * 0.20;
      
      ctx.save();
      roundRect(ctx, photoX, photoY, photoSize, photoSize, 40);
      ctx.clip();
      
      const img = frontTex.image as HTMLImageElement;
      const scale = Math.max(photoSize / img.width, photoSize / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = photoX + (photoSize - dw) / 2;
      const dy = photoY + (photoSize - dh) / 2;
      
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();

      // Add a gold border to the photo
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 6;
      roundRect(ctx, photoX, photoY, photoSize, photoSize, 40);
      ctx.stroke();
      
      // Black out the photo area on the emissive map so the photo itself doesn't glow yellow
      emCtx.fillStyle = '#000000';
      roundRect(emCtx, photoX, photoY, photoSize, photoSize, 40);
      emCtx.fill();

      // 4. Draw Name (One Line)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 70px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('SHASHWAT MANU', rx + rw / 2, photoY + photoSize + 60);

      // 5. Draw Role
      ctx.fillStyle = '#eab308'; // Yellow 500
      ctx.font = '500 45px "Inter", sans-serif';
      ctx.fillText('FOUNDER & ENGINEER', rx + rw / 2, photoY + photoSize + 160);

      // 6. Draw Bottom Details
      ctx.fillStyle = '#ffaa00';
      ctx.font = 'bold 35px "Inter", monospace';
      ctx.fillText('ACCESS: LVL 9', rx + rw / 2, ry + rh * 0.88);
    }

    const drawFitted = (img: HTMLImageElement, rect: any) => {
      const rx = rect.x * W;
      const ry = rect.y * H;
      const rw = rect.w * W;
      const rh = rect.h * H;
      const pick = imageFit === 'contain' ? Math.min : Math.max;
      const scale = pick(rw / img.width, rh / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = rx + (rw - dw) / 2;
      const dy = ry + (rh - dh) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    };

    if (backImage && backTex.image) drawFitted(backTex.image as HTMLImageElement, BACK_UV_RECT);

    const composite = new THREE.CanvasTexture(canvas);
    composite.colorSpace = THREE.SRGBColorSpace;
    composite.flipY = baseMap.flipY;
    composite.anisotropy = 16;
    composite.needsUpdate = true;
    
    const emComposite = new THREE.CanvasTexture(emCanvas);
    emComposite.colorSpace = THREE.SRGBColorSpace;
    emComposite.flipY = baseMap.flipY;
    emComposite.anisotropy = 16;
    emComposite.needsUpdate = true;
    
    return { cardMap: composite, emissiveMap: emComposite };
  }, [frontImage, backImage, imageFit, frontTex, backTex, materials.base.map]);

  const [curve] = useState(() => new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]));
  const [dragged, drag] = useState<false | THREE.Vector3>(false);
  const [hovered, hover] = useState(false);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.5, 0]]);

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab';
      return () => { document.body.style.cursor = 'auto'; };
    }
  }, [hovered, dragged]);

  const lightRef = useRef<THREE.PointLight>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);

  useFrame((state, delta) => {
    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      [card, j1, j2, j3, fixed].forEach(ref => ref.current?.wakeUp());
      card.current?.setNextKinematicTranslation({ x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z });
    }
    if (fixed.current) {
      [j1, j2].forEach(ref => {
        if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation());
        const clampedDistance = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())));
        ref.current.lerped.lerp(
          ref.current.translation(),
          delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed))
        );
      });
      curve.points[0].copy(j3.current.translation());
      curve.points[1].copy(j2.current.lerped);
      curve.points[2].copy(j1.current.lerped);
      curve.points[3].copy(fixed.current.translation());
      
      if (band.current) {
        band.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32));
      }
      ang.copy(card.current.angvel());
      rot.copy(card.current.rotation());
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });
    }

    if (lightRef.current) {
      // Strong pulsating background aura behind the card
      lightRef.current.intensity = 2.0 + Math.sin(state.clock.elapsedTime * 4) * 3.0;
    }
    if (matRef.current) {
      // Very slow, extremely subtle cinematic breathing for the yellow hue
      matRef.current.emissiveIntensity = 0.015 + Math.sin(state.clock.elapsedTime * 0.5) * 0.01;
    }
  });

  (curve as any).curveType = 'chordal';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

  return (
    <>
      <group position={[0, 4, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[2, 0, 0]} ref={card} {...segmentProps} type={dragged ? 'kinematicPosition' : 'dynamic'}>
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group
            scale={2.25}
            position={[0, -1.2, -0.05]}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={e => ((e.target as any).releasePointerCapture(e.pointerId), drag(false))}
            onPointerDown={e => (
              (e.target as any).setPointerCapture(e.pointerId),
              drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())))
            )}
          >
            <mesh geometry={nodes.card.geometry}>
              <meshPhysicalMaterial
                ref={matRef}
                map={cardMap}
                map-anisotropy={16}
                emissiveMap={emissiveMap}
                emissive="#ffaa00"
                clearcoat={isMobile ? 0 : 1}
                clearcoatRoughness={0.15}
                roughness={0.9}
                metalness={0.8}
              />
            </mesh>
            {/* Background pulsating light (placed slightly behind the card) */}
            <pointLight ref={lightRef} position={[0, 0, -0.5]} distance={4} decay={2} color="#ffaa00" intensity={0} />
            <mesh geometry={nodes.clip.geometry} material={materials.metal} material-roughness={0.3} />
            <mesh geometry={nodes.clamp.geometry} material={materials.metal} />
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        {/* @ts-ignore */}
        <meshLineGeometry />
        {/* @ts-ignore */}
        <meshLineMaterial
          color="white"
          depthTest={false}
          resolution={isMobile ? [1000, 2000] : [1000, 1000]}
          useMap
          map={texture}
          repeat={[-4, 1]}
          lineWidth={lanyardWidth}
        />
      </mesh>
    </>
  );
}
