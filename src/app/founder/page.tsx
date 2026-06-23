"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./Terminal.module.css";
import WebGLFace from "../../components/terminal/WebGLFace";
import StoryOverlay from "../../components/terminal/StoryOverlay";
import SketchOverlay from "../../components/terminal/SketchOverlay";
import TerminalInterface from "../../components/terminal/TerminalInterface";
import LanyardPhysics from "../../components/terminal/Lanyard";
import { audio } from "@/utils/audio";

export default function TerminalPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const scrollAccumulator = useRef(0);
  
  // Space music on /founder — works for both entry paths:
  //   • Via transition  → already playing at full, fade to 0.35 immediately
  //   • Direct page load → browser blocks autoplay; start on first user gesture
  useEffect(() => {
    // Try immediately (works if coming from the transition)
    audio.fadeSpaceTransition(0.35, 1000);

    // Fallback for direct loads: start on the first scroll/touch gesture
    const startOnGesture = () => {
      audio.fadeSpaceTransition(0.35, 800);
      window.removeEventListener('wheel', startOnGesture);
      window.removeEventListener('touchstart', startOnGesture);
    };
    window.addEventListener('wheel', startOnGesture, { once: true });
    window.addEventListener('touchstart', startOnGesture, { once: true });

    return () => {
      window.removeEventListener('wheel', startOnGesture);
      window.removeEventListener('touchstart', startOnGesture);
    };
  }, []);



  // Virtual Scroll setup (Wheel Hijack + Touch Drag)
  useEffect(() => {
    // Stop all audio from previous pages (including space transition)
    audio.stopSFX('face');
    audio.stopSFX('id_card');

    // Completely lock the viewport to prevent mobile pull-to-refresh and macOS rubber-banding
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'none';
    document.body.style.overflow = 'hidden';
    
    document.documentElement.style.overscrollBehavior = 'none';
    document.documentElement.style.overflow = 'hidden';

    let targetProgress = progress;
    let animationFrameId: number;
    let touchStartY = 0;

    const preventNativeScroll = (e: Event) => {
      e.preventDefault();
    };

    const handleWheel = (e: WheelEvent) => {
      // Prevent macOS trackpad rubber-banding and native scroll wobbling
      e.preventDefault();

      
      // Accumulate wheel delta
      scrollAccumulator.current += e.deltaY * 0.001;
      
      // Clamp between 0.0 and 1.0 (or slightly higher to trigger handoff safely)
      scrollAccumulator.current = Math.max(0, Math.min(1.05, scrollAccumulator.current));
      
      targetProgress = scrollAccumulator.current;
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const deltaY = touchStartY - e.touches[0].clientY;
      touchStartY = e.touches[0].clientY;

      // Scale touch delta to match wheel sensitivity
      scrollAccumulator.current += deltaY * 0.003;
      scrollAccumulator.current = Math.max(0, Math.min(1.05, scrollAccumulator.current));
      targetProgress = scrollAccumulator.current;
    };

    const lerpLoop = () => {
      setProgress((prev) => {
        const diff = targetProgress - prev;
        if (Math.abs(diff) < 0.001) return targetProgress;
        return prev + diff * 0.1; // Smooth lerp factor
      });
      animationFrameId = requestAnimationFrame(lerpLoop);
    };

    // Must be non-passive to allow preventDefault
    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    lerpLoop();

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      cancelAnimationFrame(animationFrameId);
      document.body.style.overscrollBehavior = '';
      document.body.style.touchAction = '';
      document.body.style.overflow = '';
      document.documentElement.style.overscrollBehavior = '';
      document.documentElement.style.overflow = '';
      
      // Stop audio on unmount
      audio.stopSFX('space_transition');
      audio.stopSFX('face');
      audio.stopSFX('id_card');
    };
  }, []);


  const isTerminalVisible = progress >= 0.85;

  return (
    <main className={styles.container}>
      {/* Back Button */}
      <button 
        onClick={() => router.push('/?tech=true')}
        className="fixed top-6 left-4 md:top-24 md:left-8 z-[60] px-3 py-1.5 md:px-4 md:py-2 text-[9px] md:text-[10px] tracking-widest text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-500 bg-black/50 backdrop-blur-md rounded-full uppercase transition-all duration-300"
      >
        ← RETURN
      </button>

      {/* iPad-style Touch Scroll Indicator */}
      <AnimatePresence>
        {progress < 0.05 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed top-1/2 -translate-y-1/2 right-1/4 z-50 pointer-events-none flex flex-col items-center gap-4"
          >
            <motion.div
              animate={{
                y: [0, -80, -80],
                opacity: [0, 0.8, 0],
                scale: [1, 0.9, 0.9],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeOut",
                times: [0, 0.6, 1],
                repeatDelay: 1.0
              }}
              className="w-12 h-12 rounded-full bg-white/20 border border-white/50 shadow-[0_0_20px_rgba(255,255,255,0.4)] backdrop-blur-md"
            />
            <motion.span 
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeOut",
                times: [0, 0.6, 1],
                repeatDelay: 1.0
              }}
              className="text-white/70 text-xs tracking-[0.3em] uppercase font-bold"
            >
              Swipe
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seamless Handoff Fade-In Overlay */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        className="fixed inset-0 bg-black z-50 pointer-events-none"
      />

      {/* 3D Canvas Layer */}
      <div className={`${styles.canvasWrapper} ${isTerminalVisible ? styles.hidden : ""}`}>
        {!isTerminalVisible && (
          <Canvas
            camera={{ position: [0, 0, 5], fov: 45 }}
            gl={{ antialias: true, alpha: false }}
            onCreated={({ gl }) => {
              gl.setClearColor("#000000");
            }}
          >
            <ambientLight intensity={1.5} />
            <directionalLight position={[5, 5, 5]} intensity={2.5} />
            <directionalLight position={[-5, 5, 5]} intensity={1.5} color="#8ab4f8" />
            
            <Suspense fallback={null}>
              <WebGLFace progress={progress} />
            </Suspense>
          </Canvas>
        )}
      </div>

      {/* Story Overlay Layer */}
      {!isTerminalVisible && <StoryOverlay progress={progress} />}
      
      {/* SVG Hand-Drawn Sketch Overlay */}
      {!isTerminalVisible && <SketchOverlay progress={progress} />}

      {/* Physics Lanyard Layer */}
      <div className={`${styles.terminalWrapper} ${isTerminalVisible ? styles.visible : ""}`}>
        {isTerminalVisible && <LanyardPhysics />}
      </div>
    </main>
  );
}
