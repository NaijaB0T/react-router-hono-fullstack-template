import React from 'react';

export function Header() {
  return (
    <header className="relative z-10 p-6">
      <div className="flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="text-2xl font-bold text-white hover:opacity-80 transition-opacity font-logo">
          AA r o k OOO
        </a>
        
        {/* Navigation */}
        <nav className="hidden md:flex items-center space-x-8 text-white text-base">
          <a href="#" className="hover:opacity-80 transition-opacity font-light">Storage</a>
          <a href="#" className="hover:opacity-80 transition-opacity font-light">Pricing</a>
          <a href="#" className="hover:opacity-80 transition-opacity font-light">Transfer</a>
          <a href="#" className="hover:opacity-80 transition-opacity font-light">Help</a>
        </nav>
        
        {/* Auth buttons */}
        <div className="flex items-center space-x-3">
          <button className="text-white hover:opacity-80 transition-opacity px-4 py-2 font-light text-base">
            Log in
          </button>
          <button className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors font-light text-base">
            Start Storing
          </button>
        </div>
      </div>
    </header>
  );
}