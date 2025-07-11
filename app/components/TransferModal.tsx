import React, { useState } from 'react';
import { TransferForm } from './TransferForm';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TransferModal({ isOpen, onClose }: TransferModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl transform transition-transform duration-300 ease-in-out">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">NaijaTransfer</h2>
              <p className="text-blue-100 text-sm">Fast & secure file transfer</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Service info badges */}
          <div className="flex flex-wrap gap-2 mt-4">
            <div className="bg-white bg-opacity-20 rounded-full px-3 py-1 text-xs font-medium">
              🆓 100% Free
            </div>
            <div className="bg-white bg-opacity-20 rounded-full px-3 py-1 text-xs font-medium">
              📦 Up to 15GB
            </div>
            <div className="bg-white bg-opacity-20 rounded-full px-3 py-1 text-xs font-medium">
              ⏰ 24-hour storage
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="h-[calc(100%-140px)] overflow-y-auto">
          <div className="p-6">
            <TransferForm />
          </div>
        </div>
      </div>
    </div>
  );
}