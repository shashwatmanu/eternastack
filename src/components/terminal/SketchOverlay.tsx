"use client";

import React, { useEffect, useRef } from 'react';
import styles from './SketchOverlay.module.css';

interface SketchOverlayProps {
  progress: number;
}

export default function SketchOverlay({ progress }: SketchOverlayProps) {
  const arrowGroupRef = useRef<SVGGElement>(null);
  const arrowRef = useRef<SVGPathElement>(null);
  const arrowHead1Ref = useRef<SVGPathElement>(null);
  const arrowHead2Ref = useRef<SVGPathElement>(null);
  
  const circleGroupRef = useRef<SVGGElement>(null);
  const circleRef = useRef<SVGPathElement>(null);
  
  const textRef = useRef<SVGTextElement>(null);

  useEffect(() => {
    const setPathProgress = (path: SVGPathElement | null, pStart: number, pEnd: number) => {
      if (!path) return;
      const length = path.getTotalLength();
      path.style.strokeDasharray = `${length}`;
      
      let localP = (progress - pStart) / (pEnd - pStart);
      localP = Math.max(0, Math.min(1, localP));
      
      path.style.strokeDashoffset = `${length * (1 - localP)}`;
    };

    // Draw combined arrow pointing to text (Phase 1)
    setPathProgress(arrowRef.current, 0.1, 0.3);
    setPathProgress(arrowHead1Ref.current, 0.3, 0.32);
    setPathProgress(arrowHead2Ref.current, 0.31, 0.33);
    
    // Draw circle looping text (Phase 2)
    setPathProgress(circleRef.current, 0.45, 0.65);

    // Fade out first fold elements past 0.45
    if (arrowGroupRef.current && textRef.current) {
      if (progress > 0.15 && progress < 0.45) {
        arrowGroupRef.current.style.opacity = '1';
        textRef.current.style.opacity = '1';
      } else {
        arrowGroupRef.current.style.opacity = '0';
        textRef.current.style.opacity = '0';
      }
    }

    // Fade out second fold elements past 0.85
    if (circleGroupRef.current) {
      if (progress > 0.45 && progress < 0.85) {
        circleGroupRef.current.style.opacity = '1';
      } else {
        circleGroupRef.current.style.opacity = '0';
      }
    }
  }, [progress]);

  return (
    <div className={styles.sketchContainer}>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
        
        {/* FIRST FOLD ELEMENTS */}
        <g ref={arrowGroupRef} style={{ opacity: 0, transition: 'opacity 0.4s' }}>
          {/* Main Arrow Shaft */}
          <path
            ref={arrowRef}
            className={styles.path}
            d="M 1100 250 Q 800 150, 550 450"
          />
          {/* Arrowhead Prongs pointing perfectly back along the curve's tangent */}
          <path ref={arrowHead1Ref} className={styles.path} d="M 550 450 L 575 410" />
          <path ref={arrowHead2Ref} className={styles.path} d="M 550 450 L 595 435" />
          
          <text
            ref={textRef}
            x="1120"
            y="230"
            className={styles.text}
            style={{ opacity: 0, fontFamily: 'monospace', transition: 'opacity 0.4s' }}
          >
            [tgt_x: 104.2, tgt_y: 55.8] // Read geometry
          </text>
        </g>

        {/* SECOND FOLD ELEMENTS */}
        <g ref={circleGroupRef} style={{ opacity: 0, transition: 'opacity 0.4s' }}>
          {/* Precise handwritten circle encircling the right header "The Synthetic Canvas" */}
          <path
            ref={circleRef}
            className={styles.path}
            d="M 1600 460 C 1820 440, 1880 490, 1820 530 C 1720 570, 1360 550, 1380 490 C 1400 450, 1500 450, 1620 465"
          />
        </g>
        
      </svg>
    </div>
  );
}
