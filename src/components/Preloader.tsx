"use client";

import React, { useState, useEffect, useRef } from "react";
import { scrollState } from "@/utils/scrollState";
import { audio } from "@/utils/audio";
import { useProgress } from "@react-three/drei";

interface PreloaderProps {
  onComplete: () => void;
}

export function Preloader({ onComplete }: PreloaderProps) {
  const [terminalText, setTerminalText] = useState("");
  const [bootPercent, setBootPercent] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [visible, setVisible] = useState(true);
  const [fadeAway, setFadeAway] = useState(false);

  const requestRef = useRef<number | null>(null);
  const textIndexRef = useRef(0);
  const holdProgressRef = useRef(0);
  
  const { progress, active } = useProgress();
  // If progress is 100, or if it's not active anymore but we mounted, it might be cached.
  // We'll give it a tiny delay to ensure active has a chance to be true, or just trust progress === 100.
  // Actually, a safer fallback: if it's 0% but not active for a while, it means nothing is loading.
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (progress === 100) {
      setIsLoaded(true);
    }
  }, [progress]);

  useEffect(() => {
    // Fallback: if we are stuck and not active after 2 seconds, assume loaded
    const timer = setTimeout(() => {
      if (!active) setIsLoaded(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [active]);

  const fullPromptText = "SHASHWAT_MANU // INITIALIZE_SYSTEM_CORE --SECURE_LINK --DEPLOY_PROD";

  // 0. Auto-complete if already booted (e.g., navigating back)
  useEffect(() => {
    if (scrollState.isBooted) {
      setVisible(false);
      onComplete();
    }
  }, [onComplete]);

  // 1. Text typing animation for the terminal prompt
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const type = () => {
      if (textIndexRef.current < fullPromptText.length) {
        setTerminalText((prev) => prev + fullPromptText.charAt(textIndexRef.current));
        textIndexRef.current++;
        timer = setTimeout(type, 35);
      }
    };
    if (!scrollState.isBooted) {
      type();
    }
    return () => clearTimeout(timer);
  }, []);

  // 2. High-precision RequestAnimationFrame loop to handle mouse hold progress
  const updateBootProgress = () => {
    if (scrollState.isBooted) {
      holdProgressRef.current = 1.0;
      scrollState.bootProgress = 1.0;
      return;
    }

    if (isHolding) {
      // Rise from 0 to 1 in 1.4 seconds (approx. 0.012 per frame)
      holdProgressRef.current = Math.min(holdProgressRef.current + 0.012, 1.0);
    } else {
      // Decay from current value to 0 in 0.4 seconds (approx. 0.035 per frame)
      holdProgressRef.current = Math.max(holdProgressRef.current - 0.035, 0.0);
    }

    scrollState.bootProgress = holdProgressRef.current;
    setBootPercent(Math.floor(holdProgressRef.current * 100));

    // Handle Boot Complete
    if (holdProgressRef.current >= 1.0) {
      handleBootComplete();
      return;
    }

    requestRef.current = requestAnimationFrame(updateBootProgress);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(updateBootProgress);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isHolding]);

  const handleBootComplete = () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    scrollState.isBooted = true;
    audio.playTransitionDrop(); // Play deep sub-bass drop sound
    audio.startDrone(); // Loop dark electronic synth drone
    audio.startAmbientLoops(); // Arm all ambient SFX loops (bee, spider, etc.) — only now, post-boot

    // Fade out preloader DOM overlay
    setFadeAway(true);
    setTimeout(() => {
      setVisible(false);
      onComplete();
    }, 700); // match CSS fade-out duration
  };


  const startBooting = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isLoaded) return;
    e.preventDefault();
    audio.init();
    audio.resume();
    setIsHolding(true);
    audio.playRiser(1.4); // 1.4s sweep riser
  };

  const stopBooting = () => {
    if (!isLoaded || scrollState.isBooted) return;
    setIsHolding(false);
    audio.stopRiser();
  };

  if (!visible) return null;

  // Calculate circular SVG progress values
  const radius = 40;
  const strokeWidth = 3;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (bootPercent / 100) * circumference;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-between p-8 bg-[#090909] font-mono text-zinc-500 select-none transition-opacity duration-700 ease-in-out ${
        fadeAway ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Top Bar Status */}
      <div className="flex justify-between text-xs tracking-wider text-zinc-600">
        <div>SYS: DEEP_STACK_OPS // STABLE</div>
        <div>LATENCY: 8ms</div>
      </div>

      {/* Main Terminal Shell */}
      <div className="flex flex-col items-center justify-center flex-1 max-w-lg mx-auto text-center gap-6">
        <div className="text-zinc-400 text-sm md:text-base leading-relaxed h-12">
          <span>&gt; {terminalText}</span>
          <span className="animate-pulse bg-[#00F0FF] text-[#00F0FF] ml-1">_</span>
        </div>

        {/* Hold to Boot Interactive Button */}
        <div className="relative flex flex-col items-center justify-center mt-6">
          <button
            onMouseDown={startBooting}
            onMouseUp={stopBooting}
            onMouseLeave={stopBooting}
            onTouchStart={startBooting}
            onTouchEnd={stopBooting}
            className={`w-28 h-28 rounded-full border border-zinc-800 bg-[#0c0c0e] flex items-center justify-center outline-none cursor-pointer transition-all duration-300 relative overflow-hidden group ${
              isHolding ? "border-[#00F0FF] shadow-[0_0_15px_rgba(0,240,255,0.25)]" : "hover:border-zinc-700"
            }`}
          >
            {/* SVG Circular Progress Loader */}
            <svg className="absolute inset-0 w-full h-full transform -rotate-90">
              <circle
                cx="56"
                cy="56"
                r={radius}
                stroke="#18181b"
                strokeWidth={strokeWidth}
                fill="transparent"
              />
              <circle
                cx="56"
                cy="56"
                r={radius}
                stroke="#00F0FF"
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-75"
              />
            </svg>

            {/* Glowing button label */}
            <span
              className={`text-[10px] tracking-widest transition-colors duration-300 ${
                isHolding ? "text-[#00F0FF] font-bold" : "text-zinc-500 group-hover:text-zinc-300"
              }`}
            >
              {!isLoaded ? `${Math.round(progress)}%` : (isHolding ? `${bootPercent}%` : "HOLD CLICK")}
            </span>
          </button>
          <div className="mt-4 text-[10px] uppercase tracking-widest text-zinc-600">
            {!isLoaded ? "DOWNLOADING 3D ASSETS..." : "Hold trigger to initialize core engine"}
          </div>
        </div>
      </div>

      {/* Bottom Bar Info */}
      <div className="flex justify-between items-end text-[10px] text-zinc-700">
        <div>CORE OS v1.0.0</div>
        <div className="text-right">
          COORDINATES: [40.7128° N, 74.0060° W]
          <br />
          PORT: 3000
        </div>
      </div>
    </div>
  );
}
