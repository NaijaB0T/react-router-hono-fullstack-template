import React, { createContext, useContext, useState } from 'react';
import { ProgressBackground } from './ProgressBackground';
import { ThreeBackground } from './ThreeBackground';

interface BackgroundManagerProps {
  children: React.ReactNode;
}

interface ProgressContextType {
  setProgress: (progress: number) => void;
  setIsUploading: (isUploading: boolean) => void;
}

const ProgressContext = createContext<ProgressContextType | null>(null);

export const useBackgroundProgress = () => {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useBackgroundProgress must be used within BackgroundManager');
  }
  return context;
};

export function BackgroundManager({ children }: BackgroundManagerProps) {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  // Base gradient background
  const backgroundImage = 'linear-gradient(135deg, #1a1a1a 0%, #2d1b69 50%, #1a1a1a 100%)';

  const backgroundStyle: React.CSSProperties = {
    backgroundImage: backgroundImage,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed'
  };

  return (
    <ProgressContext.Provider value={{ setProgress, setIsUploading }}>
      <div 
        className="min-h-screen relative transition-all duration-300"
        style={backgroundStyle}
      >
        {/* 3D Interactive Background */}
        <ThreeBackground uploadProgress={progress} isUploading={isUploading} />
        
        {/* Animated progress background */}
        <ProgressBackground progress={progress} isActive={isUploading} />
        
        {/* Background overlay for better readability */}
        <div className="absolute inset-0 bg-black bg-opacity-20"></div>
        
        {/* Content */}
        <div className="relative z-10">
          {children}
        </div>
      </div>
    </ProgressContext.Provider>
  );
}