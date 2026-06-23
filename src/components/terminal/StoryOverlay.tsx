import React from 'react';
import styles from './StoryOverlay.module.css';

interface StoryOverlayProps {
  progress: number;
}

export default function StoryOverlay({ progress }: StoryOverlayProps) {
  // Define the phases of the story based on scroll progress
  // 0.0 - 0.2: Nothing
  // 0.2 - 0.5: Phase 1 (Left block)
  // 0.5 - 0.8: Phase 2 (Right block)
  
  const phase1Visible = progress > 0.05 && progress < 0.45;
  const phase2Visible = progress > 0.45 && progress < 0.85;
  const overlayVisible = progress < 0.95; // Fade everything out at climax

  return (
    <div className={`${styles.overlay} ${overlayVisible ? '' : styles.hidden}`}>
      {/* Micro Data Accents */}
      <div className={styles.microDataTopLeft}>[ENV: NEXT.JS / R3F]</div>
      <div className={styles.microDataBottomLeft}>[LOCATION: GHAZIABAD, IN]</div>
      <div className={styles.microDataBottomRight}>[MEM_ALLOC: 1024MB]</div>

      {/* Phase 1: Left Side Story Block */}
      <div className={`${styles.storyBlock} ${styles.left} ${phase1Visible ? styles.visible : ''}`}>
        <div className={styles.eyebrow}>— ARCHITECTURE INITIALIZED</div>
        <h2 className={styles.title}>The Human Element</h2>
        <p className={styles.body}>
          Forging digital narratives through raw logic and creative intuition. 
          I don't just build websites; I engineer interactive, high-performance 
          WebGL ecosystems where every shader, vertex, and line of code is a direct extension of intent.
        </p>
      </div>

      {/* Phase 2: Right Side Story Block */}
      <div className={`${styles.storyBlock} ${styles.right} ${phase2Visible ? styles.visible : ''}`}>
        <div className={styles.eyebrow}>— COMPILE & EXECUTE</div>
        <h2 className={styles.title}>The Synthetic Canvas</h2>
        <p className={styles.body}>
          Translating thought into spatial web environments. Bypassing the traditional 
          DOM to construct fluid, scroll-driven experiences that react in real-time. 
          Welcome to the mainframe.
        </p>
      </div>
    </div>
  );
}
