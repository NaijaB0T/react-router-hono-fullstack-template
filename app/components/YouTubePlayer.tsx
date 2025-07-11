import React, { useState, useEffect } from 'react';

interface YouTubePlayerProps {
  videoId?: string;
  className?: string;
}

export function YouTubePlayer({ videoId, className = "" }: YouTubePlayerProps) {
  const [currentVideoId, setCurrentVideoId] = useState(videoId || 'dQw4w9WgXcQ'); // Default to a popular video
  const [customVideoUrl, setCustomVideoUrl] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Featured videos
  const featuredVideos = [
    { id: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up', duration: '3:33' },
    { id: 'L_jWHffIx5E', title: 'Smash Mouth - All Star', duration: '3:20' },
    { id: 'ZZ5LpwO-An4', title: 'HEYYEYAAEYAAAEYAEYAA', duration: '0:32' },
    { id: 'hFZFjoX2cGg', title: 'Rebecca Black - Friday', duration: '3:48' },
    { id: 'kffacxfA7G4', title: 'Baby Shark Dance', duration: '2:17' },
    { id: 'y6120QOlsfU', title: 'Darude - Sandstorm', duration: '3:33' }
  ];

  const extractVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleCustomVideo = () => {
    if (customVideoUrl) {
      const videoId = extractVideoId(customVideoUrl);
      if (videoId) {
        setCurrentVideoId(videoId);
        setCustomVideoUrl('');
        setShowCustomInput(false);
      } else {
        alert('Please enter a valid YouTube URL');
      }
    }
  };

  return (
    <div className={`bg-black rounded-lg overflow-hidden shadow-2xl flex flex-col ${className}`}>
      {/* Video Player - flex-1 to take available space */}
      <div className="flex-1 relative">
        <iframe
          src={`https://www.youtube.com/embed/${currentVideoId}?autoplay=0&controls=1&rel=0&modestbranding=1`}
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>

      {/* Controls - fixed height, compact */}
      <div className="bg-gray-900 p-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold text-sm">Video Showcase</h3>
          <button
            onClick={() => setShowCustomInput(!showCustomInput)}
            className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs transition-colors"
          >
            Custom URL
          </button>
        </div>

        {/* Custom URL Input */}
        {showCustomInput && (
          <div className="mb-3 space-y-2">
            <input
              type="text"
              value={customVideoUrl}
              onChange={(e) => setCustomVideoUrl(e.target.value)}
              placeholder="Paste YouTube URL here..."
              className="w-full px-2 py-1 text-sm bg-gray-800 text-white rounded border border-gray-700 focus:border-red-500 focus:outline-none"
              onKeyPress={(e) => e.key === 'Enter' && handleCustomVideo()}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCustomVideo}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs transition-colors"
              >
                Load
              </button>
              <button
                onClick={() => {setShowCustomInput(false); setCustomVideoUrl('');}}
                className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Featured Videos Grid - compact */}
        {!showCustomInput && (
          <div className="space-y-1">
            <h4 className="text-gray-300 text-xs font-medium mb-1">Featured Videos</h4>
            <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto">
              {featuredVideos.slice(0, 4).map((video) => (
                <button
                  key={video.id}
                  onClick={() => setCurrentVideoId(video.id)}
                  className={`text-left p-2 rounded transition-colors ${
                    currentVideoId === video.id 
                      ? 'bg-red-600 text-white' 
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate pr-2">{video.title}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{video.duration}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}