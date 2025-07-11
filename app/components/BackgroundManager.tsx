import React from 'react';

interface BackgroundManagerProps {
  children: React.ReactNode;
}

export function BackgroundManager({ children }: BackgroundManagerProps) {
  // Fixed WeTransfer-inspired gradient background
  const backgroundImage = 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)';

  const backgroundStyle: React.CSSProperties = {
    backgroundImage: backgroundImage,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed'
  };

  return (
    <div 
      className="min-h-screen relative transition-all duration-300"
      style={backgroundStyle}
    >
      {/* Background overlay for better readability */}
      <div className="absolute inset-0 bg-black bg-opacity-20"></div>
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}