"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scrollState } from "@/utils/scrollState";
import { audio } from "@/utils/audio";
import { Preloader } from "@/components/Preloader";

// Register GSAP ScrollTrigger plugin
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Dynamically import WebGLCanvas with SSR disabled to prevent hydration mismatches
const WebGLCanvas = dynamic(() => import("@/components/WebGLCanvas"), {
  ssr: false,
});

const RevealText = ({ text, delay = 0, className = "" }: { text: string; delay?: number; className?: string }) => {
  return (
    <motion.span
      className={`inline-block overflow-hidden ${className}`}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-10%" }}
      variants={{
        visible: { transition: { staggerChildren: 0.03, delayChildren: delay } },
        hidden: {},
      }}
    >
      {text.split("").map((char, index) => (
        <motion.span
          key={index}
          className="inline-block"
          variants={{
            hidden: { y: "100%", opacity: 0, rotateZ: 10 },
            visible: { y: "0%", opacity: 1, rotateZ: 0, transition: { type: "spring", damping: 12, stiffness: 200 } },
          }}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </motion.span>
  );
};

export default function MainPage({ isTech = false }: { isTech?: boolean }) {
  const [isMachineRevealed, setIsMachineRevealed] = useState(isTech);
  const [isBooted, setIsBooted] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [stageKey, setStageKey] = useState("sky");

  const warpContainerRef = useRef<HTMLDivElement>(null);
  const blackoutRef = useRef<HTMLDivElement>(null);
  const depthCoordsRef = useRef<HTMLDivElement>(null);
  const stageKeyRef = useRef("sky");
  const [audioMuted, setAudioMuted] = useState(false);
  const [strikeActive, setStrikeActive] = useState(false);
  const [isAscending, setIsAscending] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [finalZoomComplete, setFinalZoomComplete] = useState(false);
  const [spaceReady, setSpaceReady] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  
  const router = useRouter();

  // RAG Interactive Search States
  const [ragInput, setRagInput] = useState("");
  const [ragOutput, setRagOutput] = useState<string[]>([]);
  const [isSearchingRAG, setIsSearchingRAG] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Custom premium cyber target cursor
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const springConfig = { damping: 28, stiffness: 240, mass: 0.7 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  // Initialize audio engine on mount
  useEffect(() => {
    audio.init();
    audio.resume(); // Unconditionally attempt to resume in case of back-navigation
    setAudioMuted(audio.isMuted);
  }, []);

  // Page Visibility API Hook to suspend/resume procedural audio context
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        audio.suspend();
      } else {
        if (scrollState.isBooted) {
          audio.resume();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Track cursor movement for premium cyber target cursor
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      cursorX.set(e.clientX - 10);
      cursorY.set(e.clientY - 10);
    };
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [cursorX, cursorY]);

  // Idle detection for main page to trigger swipe tutorial
  useEffect(() => {
    if (!isBooted) return;
    let idleTimer: NodeJS.Timeout;
    let hideTimer: NodeJS.Timeout;
    
    const scheduleIdle = () => {
      idleTimer = setTimeout(() => {
        setIsIdle(true);
        hideTimer = setTimeout(() => {
          setIsIdle(false);
          scheduleIdle(); // Wait another 5 seconds before showing again
        }, 3000); // Hide after showing for 3 seconds (1 swipe animation)
      }, 5000); // Show after 5 seconds of idle
    };

    const resetActivity = () => {
      setIsIdle(false);
      clearTimeout(idleTimer);
      clearTimeout(hideTimer);
      scheduleIdle();
    };

    window.addEventListener('scroll', resetActivity, { passive: true });
    
    scheduleIdle();

    return () => {
      clearTimeout(idleTimer);
      clearTimeout(hideTimer);
      window.removeEventListener('scroll', resetActivity);
    };
  }, [isBooted]);

  // Reset scroll and manual restoration
  useEffect(() => {
    if (isBooted) {
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
        if ("scrollRestoration" in window.history) {
          window.history.scrollRestoration = "manual";
        }
      }
    }
  }, [isBooted]);

  // Handle Ascent Sequence Routing
  useEffect(() => {
    if (isAscending && finalZoomComplete) {
      // The absolute millisecond the final dive into the ship is complete,
      // instantly trigger the route handoff to /terminal.
      const timer = setTimeout(() => {
        // Don't stop space_transition here — it keeps playing on /founder
        router.push('/founder');
      }, 50); // Tiny delay to allow React state batching and immediate blackout
      return () => clearTimeout(timer);
    }
  }, [isAscending, finalZoomComplete, router]);


  // Sync scrollState directly to DOM refs to bypass React render cycle entirely and prevent max update depth crashes
  useEffect(() => {
    if (!isBooted) return;
    let animId: number;
    const sync = () => {
      const dp = scrollState.dampedProgress;
      const sp = scrollState.speed;
      
      const newStageKey = dp < 0.15 ? "sky" : (dp < 0.348 ? "ground" : "cavern");
      if (newStageKey !== stageKeyRef.current) {
        stageKeyRef.current = newStageKey;
        setStageKey(newStageKey);
      }

      let yTranslate = 0;
      if (dp < 0.10) {
        yTranslate = 0;
      } else if (dp < 0.20) {
        const t = (dp - 0.10) / 0.10;
        const ease = 3 * t * t - 2 * t * t * t;
        yTranslate = -ease * 100;
      } else if (dp < 0.348) {
        yTranslate = -100;
      } else if (dp < 0.80) {
        yTranslate = -200;
      } else {
        const t = (dp - 0.80) / 0.20;
        const ease = 3 * t * t - 2 * t * t * t;
        yTranslate = -200 - ease * 40;
      }

      let opacity = 0;
      if (dp >= 0.327 && dp <= 0.408) {
        if (dp < 0.348) {
          opacity = (dp - 0.327) / (0.348 - 0.327);
        } else if (dp < 0.368) {
          opacity = 1.0;
        } else {
          opacity = 1.0 - (dp - 0.368) / 0.04;
        }
      }

      const skewAmount = sp * 3.5;
      const scaleAmount = 1.0 - sp * 0.04;

      if (warpContainerRef.current) {
        warpContainerRef.current.style.transform = `translateY(${yTranslate}vh) skewY(${skewAmount}deg) scale(${scaleAmount})`;
      }
      if (blackoutRef.current) {
        blackoutRef.current.style.opacity = opacity.toString();
      }
      if (depthCoordsRef.current) {
        depthCoordsRef.current.innerText = `DEPTH COORDINATES: ${(scrollState.progress * 100).toFixed(0)}%`;
      }

      animId = requestAnimationFrame(sync);
    };
    animId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(animId);
  }, [isBooted]);

  // Hook ScrollTrigger to map viewport scroll progress into scrollState
  useEffect(() => {
    if (!isBooted) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: containerRef.current,
        start: "top top",
        end: "bottom bottom",
        scrub: 2.2, // Heavy inertia damping
        onUpdate: (self) => {
          scrollState.progress = self.progress;
          setIsAtTop(self.progress < 0.1);
        },
      });
    });

    return () => ctx.revert();
  }, [isBooted]);

  const handleToggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextMute = audio.toggleMute();
    setAudioMuted(nextMute);
  };

  const triggerStrike = () => {
    if (strikeActive) return;
    setStrikeActive(true);

    // Play procedural sounds
    audio.playTransitionDrop();
    audio.playGlitchClick();

    // Reset indicator
    setTimeout(() => {
      setStrikeActive(false);
    }, 1800);
  };

  const handleRAGSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragInput.trim() || isSearchingRAG) return;

    triggerStrike();
    setIsSearchingRAG(true);
    setRagOutput([`QUERY: "${ragInput.toUpperCase()}"`, "COMMENCING SUBTERRANEAN CAVERN VECTOR SEARCH..."]);

    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step === 1) {
        setRagOutput((prev) => [...prev, "✓ HASH LOCATED: [SHA-256] SUB_CAVERN_VEC"]);
        audio.playGlitchClick();
      } else if (step === 2) {
        setRagOutput((prev) => [...prev, "✓ COSINE DISTANCE MATCH: 0.9914"]);
        audio.playGlitchClick();
      } else if (step === 3) {
        setRagOutput((prev) => [
          ...prev,
          "✓ TARGET ACQUIRED: CAVERN LIGHT SCAN ACTIVE",
          `SYSTEM: Context injected. Cavern ${isMachineRevealed ? "spy drone" : "spider"} coordinates mapped.`,
        ]);
        audio.playGlitchClick();
        setIsSearchingRAG(false);
        setRagInput("");
        clearInterval(interval);
      }
    }, 500);
  };

  const handleType = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRagInput(e.target.value);
    audio.playKeypressClick();
  };

  // Determine scroll indicator logic based on user journey
  const showScrollIndicator = !(isMachineRevealed && stageKey === "sky");
  const scrollDirection = (!isMachineRevealed) ? "down" : "up";



  return (
    <main className="relative bg-[#010A15] text-[#f4f4f5] min-h-screen overflow-x-hidden select-none">
      {/* Cyber target cursor */}
      <motion.div
        style={{
          x: cursorXSpring,
          y: cursorYSpring,
        }}
        className="fixed top-0 left-0 w-5 h-5 rounded-full border border-[#00F0FF]/80 pointer-events-none z-50 mix-blend-difference hidden md:block"
      >
        <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 bg-[#00F0FF] rounded-full" />
      </motion.div>

      {/* Cinematic Transition Blackout Overlay */}
      <div
        ref={blackoutRef}
        className={`fixed inset-0 bg-black pointer-events-none z-40 transition-opacity duration-75 ease-out ${(isAscending && finalZoomComplete) ? 'animate-fade-to-black' : 'opacity-0'}`}
      />
      {(isAscending && finalZoomComplete) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.0 }} // Instant hard blackout cut at the end of the warp punch
          className="fixed inset-0 bg-black z-50 pointer-events-none"
        />
      )}

      {/* Ascent CTA Button */}
      <AnimatePresence>
        {spaceReady && isAtTop && !isAscending && isMachineRevealed && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
          >
            <button
              onClick={() => {
                document.body.style.overflow = "hidden";
                document.documentElement.style.overflow = "hidden";
                audio.playSFX('space_transition', 1.0); // Synchronous to user gesture, max volume!
                setIsAscending(true);
              }}
              className="flex flex-col items-center gap-4 text-white transition-all duration-300 hover:-translate-y-2 group"
              aria-label="Initiate Ascent"
            >
              <motion.div
                initial={{ opacity: 0.4 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                className="drop-shadow-[0_2px_4px_rgba(0,0,0,1)] drop-shadow-[0_0_15px_rgba(0,0,0,0.9)]"
              >
                <svg width="80" height="24" viewBox="0 0 32 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 10l14-8 14 8" />
                </svg>
              </motion.div>
              <motion.div
                initial={{ opacity: 0.7 }}
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ repeat: Infinity, duration: 2, delay: 0.5, ease: "easeInOut" }}
                className="text-[12px] tracking-[0.4em] font-sans font-bold uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,1)] drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]"
              >
                ASCENT
              </motion.div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idle Swipe Indicator (Main Page) */}
      <AnimatePresence>
        {isBooted && isIdle && showScrollIndicator && !isAscending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed top-1/2 -translate-y-1/2 right-1/4 z-50 pointer-events-none flex flex-col items-center gap-4"
          >
            <motion.div
              animate={{
                y: scrollDirection === "down" ? [0, -80, -80] : [0, 80, 80],
                opacity: [0, 0.8, 0],
                scale: [1, 0.9, 0.9],
              }}
              transition={{
                duration: 2.5,
                ease: "easeOut",
                times: [0, 0.6, 1]
              }}
              className="w-12 h-12 rounded-full bg-white/20 border border-white/50 shadow-[0_0_20px_rgba(0,0,0,0.6)] backdrop-blur-md"
            />
            <motion.span 
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: 2.5,
                ease: "easeOut",
                times: [0, 0.6, 1]
              }}
              className="text-white/90 text-xs tracking-[0.3em] uppercase font-bold drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]"
            >
              {scrollDirection === "down" ? "SWIPE" : "SWIPE"}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terminal Preloader for Asset Masking */}
      <Preloader onComplete={() => setIsBooted(true)} />

      {/* Global Scroll Indicator */}
      <AnimatePresence>
        {isBooted && showScrollIndicator && !isAscending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-8 right-8 z-40 flex flex-col items-center opacity-90"
          >
            <div 
              className="flex flex-col -space-y-2 cursor-pointer hover:scale-110 transition-transform duration-300"
              onClick={() => {
                setIsIdle(false);
                const maxScroll = document.body.scrollHeight - window.innerHeight;
                const current = scrollState.progress;
                const checkpoints = [0, 0.25, 0.50, 0.65];
                
                if (scrollDirection === "down") {
                  const next = checkpoints.find(cp => cp > current + 0.05);
                  if (next !== undefined) {
                    window.scrollTo({ top: next * maxScroll, behavior: 'smooth' });
                  }
                } else {
                  const prev = [...checkpoints].reverse().find(cp => cp < current - 0.05);
                  if (prev !== undefined) {
                    window.scrollTo({ top: prev * maxScroll, behavior: 'smooth' });
                  }
                }
              }}
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={`${scrollDirection}-${i}`}
                  initial={{ opacity: 0.15 }}
                  animate={{ opacity: [0.15, 0.8, 0.15] }}
                  transition={{
                    repeat: Infinity,
                    duration: 2.5,
                    delay: scrollDirection === "down" ? i * 0.4 : (2 - i) * 0.4,
                    ease: "easeInOut",
                  }}
                  className="text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                >
                  <svg width="80" height="24" viewBox="0 0 32 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    {scrollDirection === "down" ? (
                      <path d="M2 2l14 8 14-8" />
                    ) : (
                      <path d="M2 10l14-8 14 8" />
                    )}
                  </svg>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed WebGL Canvas ALWAYS renders to trigger asset loading in background */}
      <WebGLCanvas 
        strikeActive={strikeActive} 
        isMachineRevealed={isMachineRevealed} 
        setIsMachineRevealed={setIsMachineRevealed} 
        isAscending={isAscending}
        terminalReady={terminalReady}
        onTerminalReady={() => setTerminalReady(true)}
        onFinalZoomComplete={() => setFinalZoomComplete(true)}
        onSpaceReady={() => setSpaceReady(true)}
      />

      {/* Viewport and Content Grid with expanded depth for a tight, polished scroll experience */}
      {isBooted && (
        <div ref={containerRef} className="relative h-[240vh] w-full z-20 pointer-events-none">
          
          {/* Rigid Background Grid Lines Overlay */}
          <div className="fixed inset-0 grid grid-cols-12 pointer-events-none z-10 opacity-15">
            {[...Array(11)].map((_, i) => (
              <div key={i} className="col-span-1 border-r border-white/20 h-full" />
            ))}
          </div>
          <div className="fixed inset-0 grid grid-rows-6 pointer-events-none z-10 opacity-15">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="row-span-1 border-b border-white/20 w-full" />
            ))}
          </div>

          {/* Fixed Top Header Bar */}
          <div className="fixed top-0 left-0 w-full z-30 pointer-events-auto bg-[#010A15]/40 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] border-b border-white/10 grid grid-cols-12 text-[10px] tracking-[0.25em] p-4 text-white/50 font-sans uppercase transition-colors duration-500 hover:bg-[#010A15]/60">
            <div className="col-span-4 font-bold text-white tracking-widest flex items-center">
              SHASHWAT MANU // NARRATIVE LABS
            </div>
            <div className="col-span-4 text-center hidden md:flex items-center justify-center gap-4">
              <span>MODEL: {isMachineRevealed ? "SPY_DRONE_SUBSTRUCTURE" : "ARACHNID_SUBSTRUCTURE"}</span>
              <button
                onClick={handleToggleMute}
                className="flex items-end h-3 px-2 py-0.5 cursor-pointer outline-none hover:text-white transition-colors"
                title={audioMuted ? "Unmute sound" : "Mute sound"}
              >
                <div className={`soundwave-bar ${audioMuted ? "muted" : ""}`} />
                <div className={`soundwave-bar ${audioMuted ? "muted" : ""}`} />
                <div className={`soundwave-bar ${audioMuted ? "muted" : ""}`} />
                <div className={`soundwave-bar ${audioMuted ? "muted" : ""}`} />
              </button>
            </div>
            <div ref={depthCoordsRef} className="col-span-8 md:col-span-4 text-right flex items-center justify-end">
              DEPTH COORDINATES: 0%
            </div>
          </div>

          {/* Fixed Sub-Header Bar (Cross-fading section details) */}
          <div className="fixed top-14 left-0 w-full z-30 pointer-events-none px-8 md:px-16 py-4">
            <div className="border-b border-white/5 pb-4 w-full overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={stageKey}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="grid grid-cols-12 text-[10px] tracking-[0.25em] text-white/40 font-sans uppercase w-full"
                >
                  {stageKey === "sky" && (
                    <>
                      <div className="col-span-6 md:col-span-4">SEC_01 // THE ATMOSPHERE // SKY LEVEL</div>
                      <div className="col-span-4 text-center hidden md:block">LOC: [HIGH-ALTITUDE ORBIT]</div>
                      <div className="col-span-6 md:col-span-4 text-right">STAGE: CHROME_FRONTEND</div>
                    </>
                  )}
                  {stageKey === "ground" && (
                    <>
                      <div className="col-span-6 md:col-span-4">SEC_02 // SYSTEM GRID // GROUND LEVEL</div>
                      <div className="col-span-4 text-center hidden md:block">LOC: [SYSTEM PATHS]</div>
                      <div className="col-span-6 md:col-span-4 text-right">STAGE: TECH_FLOW</div>
                    </>
                  )}
                  {stageKey === "cavern" && (
                    <>
                      <div className="col-span-6 md:col-span-4">SEC_03 // CORE ENGINE // SUBTERRANEAN CAVERN</div>
                      <div className="col-span-4 text-center hidden md:block">LOC: [CAVERN DEPTHS]</div>
                      <div className="col-span-6 md:col-span-4 text-right">STAGE: SUBTERRANEAN_CAVERN</div>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Fixed viewport window containing sliding panels */}
          <div className="fixed inset-0 w-full h-full overflow-hidden pt-14" style={{ zIndex: 10 }}>
            
            {/* Sliding panels with elastic scroll warp */}
            <div
              ref={warpContainerRef}
              style={{
                transformOrigin: "center center",
              }}
              className="absolute top-0 left-0 w-full h-[340vh] transition-transform duration-100 ease-out"
            >
              {/* ACT 1: SKY / FRONTEND (0vh - 100vh) */}
              <div className="h-screen w-full flex flex-col justify-between p-[6vw] relative">
                <div className="h-16" /> {/* Spacer */}

                {/* Structural placeholder for WebGL depth layout */}
                <div className="flex flex-col items-start text-left w-full pointer-events-none h-40" />

                <div className="grid grid-cols-12 text-[10px] tracking-[0.2em] text-white/30 font-sans uppercase pb-4 border-t border-white/5 items-center">
                  <div className="col-span-6 text-sm font-bold tracking-[0.3em] text-white">
                    <RevealText text="NARRATIVE LABS // EST. 2026" />
                  </div>
                  <div className="col-span-6 text-right">
                  </div>
                </div>
              </div>

              {/* ACT 2: GROUND / PIPELINES (100vh - 200vh) */}
              <div className="h-screen w-full flex flex-col justify-between p-[6vw] relative">
                <div className="h-16" /> {/* Spacer */}

                {/* Structural placeholder for WebGL depth layout */}
                <div className="flex flex-col items-end text-right w-full pointer-events-none h-40" />

                <div className="grid grid-cols-12 text-[10px] tracking-[0.2em] text-white/30 font-sans uppercase pb-4 border-t border-white/5 items-center">
                  <div className="col-span-6 text-sm font-bold tracking-[0.3em] text-white">
                    <RevealText text="SYSTEM GRID // ACTIVE_NODE_02" />
                  </div>
                  <div className="col-span-6 text-right">
                  </div>
                </div>
              </div>

              {/* ACT 3: SUBTERRANEAN CAVERN / BACKEND (200vh - 300vh) */}
              <div className="h-screen w-full flex flex-col justify-between p-[6vw] relative">
                <div className="h-16" /> {/* Spacer */}

                {/* Structural placeholder for WebGL depth layout */}
                <div className="flex flex-col items-start text-left w-full pointer-events-none h-40">
                  {/* Interactive Terminal interface for user query input in Stage 4 */}
                  {/* Cavern RAG Agent terminal card removed */}
                </div>

                <div className="grid grid-cols-12 text-[10px] tracking-[0.2em] text-white/30 font-sans uppercase pb-4 border-t border-white/5 items-center">
                  <div className="col-span-6 font-mono text-[#ff7733] text-sm">
                    <RevealText text="SYSTEM: SECURE SUBTERRANEAN CORE STATUS // READY" />
                  </div>
                  <div className="col-span-6 text-right">
                  </div>
                </div>
              </div>

              {/* FOOTER (240vh max translate) */}
              <div className="h-[40vh] w-full flex flex-col justify-end p-8 md:p-16 relative">
                {/* Brand Branding Info & Links */}
                <div className="flex flex-col md:flex-row gap-8 justify-between items-end pointer-events-auto w-full border-t border-white/10 pt-8">
                  <div className="flex flex-col gap-4 text-left">
                    <span className="text-[10px] tracking-[0.3em] text-[#ff7733] font-sans uppercase">
                      COLLABORATION // LABS
                    </span>
                    <h2 className="text-2xl md:text-3xl uppercase leading-none font-serif italic text-white drop-shadow-lg">
                      <RevealText text="Let's Build Together" />
                    </h2>
                    <div className="flex gap-4 font-mono text-[10px] text-white/50 pt-2">
                      <div>EMAIL: <a href="mailto:hello@narrativelabs.io" className="text-white hover:text-[#ff7733] transition-colors">hello@narrativelabs.io</a></div>
                      <div>PHONE: <span className="text-white">+1 (800) COD-ING-0</span></div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 text-right">
                    <div className="text-[9px] tracking-[0.2em] text-white/30 font-sans uppercase">
                      © 2026 SHASHWAT MANU // NARRATIVE LABS.
                    </div>
                    <div className="flex justify-end gap-6 text-[9px] tracking-[0.2em] font-sans uppercase text-white/50">
                      <a href="#twitter" className="hover:text-[#ff7733] transition-colors">TWITTER</a>
                      <a href="#github" className="hover:text-[#ff7733] transition-colors">GITHUB</a>
                      <a href="#linkedin" className="hover:text-[#ff7733] transition-colors">LINKEDIN</a>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      )}
    </main>
  );
}
