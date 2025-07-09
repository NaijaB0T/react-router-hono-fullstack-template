import { useParams } from "react-router";
import { useState, useEffect } from "react";

interface Transfer {
  id: string;
  sender_email: string;
  recipient_emails: string;
  message: string;
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
    setDownloadingFiles(prev => new Set([...prev, file.id]));
    
    try {
      const response = await fetch(`/api/file/${transferId}/${file.filename}`);
      if (!response.ok) {
        throw new Error('Failed to download file');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
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
  const recipientEmails = JSON.parse(transfer.recipient_emails);
  const expiresAt = new Date(transfer.expires_at);
  const timeLeft = expiresAt.getTime() - Date.now();
  const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">📦 NaijaTransfer</h1>
            <p className="text-gray-600">Your files are ready for download</p>
          </div>

          {/* Transfer Details */}
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">Transfer Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-blue-800">From:</span>
                <p className="text-blue-700">{transfer.sender_email}</p>
              </div>
              <div>
                <span className="font-medium text-blue-800">To:</span>
                <p className="text-blue-700">{recipientEmails.join(', ')}</p>
              </div>
              <div>
                <span className="font-medium text-blue-800">Sent:</span>
                <p className="text-blue-700">{formatDate(transfer.created_at)}</p>
              </div>
              <div>
                <span className="font-medium text-blue-800">Expires:</span>
                <p className="text-blue-700">
                  {formatDate(transfer.expires_at)}
                  {daysLeft > 0 && (
                    <span className="text-xs ml-2 bg-blue-200 px-2 py-1 rounded">
                      {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
                    </span>
                  )}
                </p>
              </div>
            </div>
            {transfer.message && (
              <div className="mt-4">
                <span className="font-medium text-blue-800">Message:</span>
                <p className="text-blue-700 mt-1 p-2 bg-blue-100 rounded">{transfer.message}</p>
              </div>
            )}
          </div>

          {/* Files List */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Files ({files.length})
              </h2>
              {files.length > 1 && (
                <button
                  onClick={downloadAll}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
                >
                  Download All
                </button>
              )}
            </div>
            
            <div className="space-y-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">📄</div>
                    <div>
                      <p className="font-medium text-gray-900">{file.filename}</p>
                      <p className="text-sm text-gray-500">{formatFileSize(file.filesize)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(file)}
                    disabled={downloadingFiles.has(file.id)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloadingFiles.has(file.id) ? 'Downloading...' : 'Download'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center pt-6 border-t border-gray-200">
            <p className="text-gray-500 text-sm mb-2">
              Powered by NaijaTransfer
            </p>
            <a 
              href="/" 
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              Create your own transfer
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}