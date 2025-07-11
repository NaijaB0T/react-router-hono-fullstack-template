import React, { useEffect, useState } from 'react';

interface ProgressBackgroundProps {
  progress: number; // 0-100
  isActive: boolean;
}

export function ProgressBackground({ progress, isActive }: ProgressBackgroundProps) {
  const [particles, setParticles] = useState<Array<{id: number, x: number, y: number, delay: number, color: string}>>([]);

  useEffect(() => {
    // Generate particles based on progress
    const particleCount = Math.floor((progress / 100) * 150); // Max 150 particles
    const newParticles = [];
    
    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * 100, // 0-100%
        y: Math.random() * 100, // 0-100%
        delay: Math.random() * 2, // 0-2 seconds delay
        color: getRandomColor()
      });
    }
    
    setParticles(newParticles);
  }, [progress]);

  const getRandomColor = () => {
    const colors = [
      'rgba(102, 126, 234, 0.3)', // Blue
      'rgba(118, 75, 162, 0.3)',  // Purple
      'rgba(240, 147, 251, 0.3)', // Pink
      'rgba(129, 230, 217, 0.3)', // Teal
      'rgba(252, 176, 64, 0.3)',  // Orange
      'rgba(56, 189, 248, 0.3)',  // Light blue
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  if (!isActive) {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-5">
      {/* Animated gradient wave based on progress */}
      <div 
        className="absolute inset-0 transition-all duration-1000 ease-out"
        style={{
          background: `linear-gradient(45deg, 
            rgba(102, 126, 234, ${progress * 0.003}) 0%, 
            rgba(118, 75, 162, ${progress * 0.002}) 25%, 
            rgba(240, 147, 251, ${progress * 0.003}) 50%, 
            rgba(129, 230, 217, ${progress * 0.002}) 75%, 
            transparent 100%)`
        }}
      />

      {/* Floating particles */}
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute w-2 h-2 rounded-full animate-pulse"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            backgroundColor: particle.color,
            animationDelay: `${particle.delay}s`,
            animationDuration: '3s',
            boxShadow: `0 0 20px ${particle.color}`
          }}
        />
      ))}

      {/* Progress wave effect */}
      <div 
        className="absolute bottom-0 left-0 h-full transition-all duration-500 ease-out"
        style={{
          width: `${progress}%`,
          background: `linear-gradient(to right, 
            rgba(102, 126, 234, 0.1) 0%, 
            rgba(118, 75, 162, 0.15) 25%, 
            rgba(240, 147, 251, 0.1) 50%, 
            rgba(129, 230, 217, 0.15) 75%, 
            rgba(56, 189, 248, 0.1) 100%)`
        }}
      />

      {/* Animated border glow */}
      <div 
        className="absolute top-0 left-0 h-full border-r-2 transition-all duration-500"
        style={{
          width: `${progress}%`,
          borderColor: progress > 50 
            ? 'rgba(129, 230, 217, 0.6)' 
            : 'rgba(102, 126, 234, 0.6)',
          filter: 'drop-shadow(0 0 10px currentColor)'
        }}
      />
    </div>
  );
}