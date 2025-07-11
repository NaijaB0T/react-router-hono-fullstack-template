import { useParams } from "react-router";
import React, { useState, useEffect } from "react";
import { BackgroundManager } from "../components/BackgroundManager";
import { Header } from "../components/Header";

interface Transfer {
  id: string;
  status: string;
  expires_at: number;
  created_at: number;
}

interface FileInfo {
  id: string;
  filename: string;
  filesize: number;
  r2_object_key: string;
}

interface DownloadData {
  transfer: Transfer;
  files: FileInfo[];
}

export default function DownloadPage() {
  const { transferId } = useParams();
  const [downloadData, setDownloadData] = useState<DownloadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const fetchDownloadData = async () => {
      try {
        const response = await fetch(`/api/download/${transferId}`);
        if (!response.ok) {
          const errorData = await response.json() as { error?: string };
          throw new Error(errorData.error || 'Failed to fetch download data');
        }
        const data = await response.json() as DownloadData;
        setDownloadData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    if (transferId) {
      fetchDownloadData();
    }
  }, [transferId]);

  // Set up realtime countdown - must be at top level
  useEffect(() => {
    if (!downloadData) return;
    
    const updateTimeLeft = () => {
      const now = Date.now();
      const remaining = downloadData.transfer.expires_at - now;
      setTimeLeft(Math.max(0, remaining));
    };
    
    updateTimeLeft(); // Initial update
    const interval = setInterval(updateTimeLeft, 1000); // Update every second
    
    return () => clearInterval(interval);
  }, [downloadData]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDownload = async (file: FileInfo) => {
    // Check if transfer is expired
    if (timeLeft <= 0) {
      alert('This transfer has expired and files are no longer available for download.');
      return;
    }
    
    setDownloadingFiles(prev => new Set([...prev, file.id]));
    
    try {
      const response = await fetch(`/api/file/${transferId}/${encodeURIComponent(file.filename)}`);
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Download failed (${response.status}): ${errorText}`);
      }
      
      // Check if response is actually a file
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Server returned an error');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up after a short delay to ensure download starts
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
      
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download file: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setDownloadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.id);
        return newSet;
      });
    }
  };

  const downloadAll = async () => {
    if (!downloadData) return;
    
    for (const file of downloadData.files) {
      await handleDownload(file);
      // Add a small delay between downloads to prevent overwhelming the browser
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading transfer details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Transfer Not Found</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <a 
            href="/" 
            className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Create New Transfer
          </a>
        </div>
      </div>
    );
  }

  if (!downloadData) {
    return null;
  }

  const { transfer, files } = downloadData;
  
  const formatTimeRemaining = (milliseconds: number): string => {
    if (milliseconds <= 0) return 'Expired';
    
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };
  
  const getTimeLeftColor = (): string => {
    const hoursLeft = timeLeft / (1000 * 60 * 60);
    if (hoursLeft > 12) return 'text-green-700 bg-green-100';
    if (hoursLeft > 6) return 'text-yellow-700 bg-yellow-100';
    if (hoursLeft > 1) return 'text-orange-700 bg-orange-100';
    return 'text-red-700 bg-red-100';
  };

  return (
    <BackgroundManager>
      <div className="h-screen overflow-hidden">
        <Header />

        {/* Main content area */}
        <div className="flex items-start justify-center min-h-0 px-6 py-8">
          <div className="w-full max-w-3xl">
            <div className="bg-white rounded-2xl shadow-xl p-6 mx-auto max-h-[calc(100vh-140px)] overflow-y-auto">
              <div className="text-center mb-6">
                <h1 className="text-xl font-bold text-gray-900 mb-1">Your files are ready</h1>
                <p className="text-base text-gray-600 font-light">Download them before they expire</p>
              </div>

          {/* Service Information */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-blue-600 text-base">🆓</span>
              <h3 className="text-xs font-semibold text-blue-800">Free Transfer • Paid Storage Available</h3>
            </div>
            <p className="text-sm text-blue-700 font-light">
              Free transfers expire in 24 hours. Need longer storage? Just ₦60/month for 1GB or ₦2/day pay-as-you-use.
            </p>
          </div>

          {/* Transfer Details with Countdown */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h2 className="text-base font-semibold text-gray-900 mb-3">File Transfer Details</h2>
            
            {/* Countdown Timer - Prominent Display */}
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-3 mb-3 text-center">
              <div className="text-sm font-medium text-gray-600 mb-1 font-light">Time Remaining</div>
              <div className={`text-lg font-bold px-2 py-1 rounded-lg inline-block ${getTimeLeftColor()}`}>
                {timeLeft > 0 ? formatTimeRemaining(timeLeft) : '⚠️ EXPIRED'}
              </div>
              {timeLeft > 0 && (
                <div className="text-sm text-gray-500 mt-1 font-light">
                  Files will be automatically deleted when timer reaches zero
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium text-gray-700">Uploaded:</span>
                <p className="text-gray-600 font-light">{formatDate(transfer.created_at)}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Expires:</span>
                <p className="text-gray-600 font-light">{formatDate(transfer.expires_at)}</p>
              </div>
            </div>
          </div>

          {/* Files List */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900">
                Files ({files.length})
              </h2>
              {files.length > 1 && timeLeft > 0 && (
                <button
                  onClick={downloadAll}
                  className="bg-green-600 text-white px-3 py-1 text-sm rounded-md hover:bg-green-700 transition-colors"
                >
                  Download All
                </button>
              )}
            </div>
            
            {timeLeft <= 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-red-600 text-base">⚠️</span>
                  <div>
                    <h3 className="text-sm font-semibold text-red-800">Transfer Expired</h3>
                    <p className="text-sm text-red-700 font-light">
                      This transfer has expired and files have been automatically deleted to manage storage costs.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="text-lg">📄</div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.filename}</p>
                      <p className="text-sm text-gray-500 font-light">{formatFileSize(file.filesize)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(file)}
                    disabled={downloadingFiles.has(file.id) || timeLeft <= 0}
                    className={`px-3 py-1 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      timeLeft <= 0 
                        ? 'bg-gray-400 text-white' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {timeLeft <= 0 
                      ? 'Expired' 
                      : downloadingFiles.has(file.id) 
                        ? 'Downloading...' 
                        : 'Download'
                    }
                  </button>
                </div>
              ))}
            </div>
          </div>

              {/* Footer */}
              <div className="text-center pt-4 border-t border-gray-200">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                  <p className="text-xs font-semibold text-green-800 mb-1">Need longer storage?</p>
                  <p className="text-xs text-green-700 font-light mb-2">Store files for as long as you need with pay-as-you-use pricing</p>
                  <button className="bg-green-600 text-white px-4 py-1.5 rounded text-xs hover:bg-green-700 transition-colors">
                    Upgrade Storage - ₦60/month
                  </button>
                </div>
                <p className="text-gray-400 text-sm mb-2 font-light">
                  Created and Funded by <a href="https://femitaofeeq.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 transition-colors">Femi Taofeeq</a>
                </p>
                <a 
                  href="/" 
                  className="text-blue-600 hover:text-blue-800 text-sm font-light"
                >
                  Send another file
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BackgroundManager>
  );
}