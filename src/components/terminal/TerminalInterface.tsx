"use client";

import { useEffect, useState, useRef } from "react";
import styles from "./TerminalInterface.module.css";
import AudioWaveform from "./AudioWaveform";

const TERMINAL_LINES = [
  "INITIALIZING SECURE CONNECTION...",
  "BYPASSING NEURAL FIREWALL...",
  "HANDSHAKE ESTABLISHED.",
  "WELCOME TO THE MAINFRAME.",
  "AWAITING VOICE INPUT STREAM..."
];

export default function TerminalInterface() {
  const [displayedLines, setDisplayedLines] = useState<string[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const isTypingRef = useRef(false);

  useEffect(() => {
    // Single-execution typing guard to bypass StrictMode double-mounts
    if (isTypingRef.current) return;
    
    if (currentLineIndex < TERMINAL_LINES.length) {
      isTypingRef.current = true;
      
      const currentFullLine = TERMINAL_LINES[currentLineIndex];
      
      const typingInterval = setInterval(() => {
        setCurrentCharIndex((prev) => {
          if (prev >= currentFullLine.length) {
            clearInterval(typingInterval);
            
            // Move to next line after a short pause
            setTimeout(() => {
              setDisplayedLines((lines) => {
                const newLines = [...lines];
                if (newLines[currentLineIndex] !== currentFullLine) {
                  newLines[currentLineIndex] = currentFullLine;
                }
                return newLines;
              });
              setCurrentLineIndex((i) => i + 1);
              setCurrentCharIndex(0);
              isTypingRef.current = false;
            }, 500);
            
            return prev;
          }
          
          setDisplayedLines((lines) => {
            const newLines = [...lines];
            newLines[currentLineIndex] = currentFullLine.substring(0, prev + 1);
            return newLines;
          });
          
          return prev + 1;
        });
      }, 50); // Typing speed
      
      return () => {
        clearInterval(typingInterval);
        isTypingRef.current = false;
      };
    }
  }, [currentLineIndex]);

  const showWaveform = currentLineIndex >= TERMINAL_LINES.length;

  return (
    <div className={styles.terminalContainer}>
      <div className={styles.header}>
        <div className={styles.dots}>
          <div className={`${styles.dot} ${styles.dotRed}`}></div>
          <div className={`${styles.dot} ${styles.dotYellow}`}></div>
          <div className={`${styles.dot} ${styles.dotGreen}`}></div>
        </div>
        <div className={styles.title}>bash - root@mainframe:~</div>
      </div>
      
      <div className={styles.content}>
        <div className={styles.textLines}>
          {displayedLines.map((line, i) => (
            <div key={i} className={styles.line}>{line}</div>
          ))}
          {currentLineIndex < TERMINAL_LINES.length && (
            <span className={styles.cursor}></span>
          )}
        </div>
        
        {showWaveform && (
          <div className={styles.audioSection}>
            <div className={styles.audioLabel}>LIVE SECURE STREAM</div>
            <AudioWaveform />
          </div>
        )}
      </div>
    </div>
  );
}
