"use client";

import { useEffect, useRef } from "react";

export default function AudioWaveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    // We will simulate audio data using a combination of sine waves and noise
    const draw = () => {
      time += 0.05;
      const width = canvas.width;
      const height = canvas.height;

      // Clear with slight trailing effect for smoothness
      ctx.fillStyle = "rgba(10, 10, 10, 0.2)";
      ctx.fillRect(0, 0, width, height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = "#00ff00";
      ctx.beginPath();

      const centerY = height / 2;
      const points = 100;
      
      for (let i = 0; i <= points; i++) {
        const x = (i / points) * width;
        
        // Simulated oscillator + noise
        const noise = (Math.random() - 0.5) * 10;
        const mainWave = Math.sin(i * 0.1 + time) * 20;
        const secondaryWave = Math.cos(i * 0.2 - time * 1.5) * 15;
        
        // Envelope to taper off at the ends
        const envelope = Math.sin((i / points) * Math.PI);
        
        const y = centerY + (mainWave + secondaryWave + noise) * envelope;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();

      // Mirror reflection
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0, 255, 0, 0.3)";
      ctx.beginPath();
      
      for (let i = 0; i <= points; i++) {
        const x = (i / points) * width;
        const noise = (Math.random() - 0.5) * 5;
        const mainWave = Math.sin(i * 0.1 + time) * 20;
        const secondaryWave = Math.cos(i * 0.2 - time * 1.5) * 15;
        const envelope = Math.sin((i / points) * Math.PI);
        const y = centerY - (mainWave + secondaryWave + noise) * envelope;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      width={600} 
      height={150} 
      style={{
        width: '100%',
        maxWidth: '600px',
        height: '150px',
        borderRadius: '8px',
        boxShadow: 'inset 0 0 15px rgba(0, 255, 0, 0.1)'
      }}
    />
  );
}
