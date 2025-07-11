import React from 'react';
import { Link } from 'react-router';
import { useAuth } from '~/lib/auth';

export function Header() {
  const { user, logout, isAuthenticated } = useAuth();

  return (
    <header className="relative z-10 p-6">
      <div className="flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="text-2xl font-bold text-white hover:opacity-80 transition-opacity font-logo">
          AA r o k OOO
        </Link>
        
        {/* Navigation */}
        <nav className="hidden md:flex items-center space-x-8 text-white text-base">
          <a href="#" className="hover:opacity-80 transition-opacity font-light">Storage</a>
          <a href="#" className="hover:opacity-80 transition-opacity font-light">Pricing</a>
          <a href="#" className="hover:opacity-80 transition-opacity font-light">Transfer</a>
          <a href="#" className="hover:opacity-80 transition-opacity font-light">Help</a>
        </nav>
        
        {/* Auth buttons */}
        <div className="flex items-center space-x-3">
          {isAuthenticated ? (
            <>
              <Link 
                to="/account"
                className="text-white hover:opacity-80 transition-opacity px-4 py-2 font-light text-base"
              >
                Account
              </Link>
              <span className="text-white/70 text-sm">
                {user?.email}
              </span>
              <button 
                onClick={logout}
                className="text-white hover:opacity-80 transition-opacity px-4 py-2 font-light text-base"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link 
                to="/auth/login"
                className="text-white hover:opacity-80 transition-opacity px-4 py-2 font-light text-base"
              >
                Log in
              </Link>
              <Link 
                to="/auth/register"
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors font-light text-base"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}