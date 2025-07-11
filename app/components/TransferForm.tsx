import React, { useState, useRef } from 'react';
import type { ChangeEvent, DragEvent } from 'react';

interface FileInfo {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error';
  uploadId?: string;
  key?: string;
  uploadedParts?: Array<{ partNumber: number; etag: string }>;
  currentPart?: number;
  error?: string;
}

interface TransferFormData {
  files: FileInfo[];
}

export function TransferForm() {
  const [formData, setFormData] = useState<TransferFormData>({
    files: []
  });
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [transferId, setTransferId] = useState<string>('');
  const [pausedUploads, setPausedUploads] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    
    const newFiles: FileInfo[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'pending' as const,
      uploadedParts: [],
      currentPart: 0
    }));
    
    setFormData(prev => ({ ...prev, files: [...prev.files, ...newFiles] }));
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeFile = (fileId: string) => {
    setFormData(prev => ({
      ...prev,
      files: prev.files.filter(file => file.id !== fileId)
    }));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isFormValid = () => {
    return formData.files.length > 0;
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;

    setIsUploading(true);
    
    try {
      // Step 1: Create transfer and get upload URLs
      const transferResponse = await fetch('/api/transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: formData.files.map(f => ({
            filename: f.name,
            filesize: f.size
          }))
        })
      });

      if (!transferResponse.ok) {
        const errorData = await transferResponse.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        console.error('Transfer creation failed:', errorData);
        throw new Error(`Failed to create transfer: ${errorData.error || 'Unknown error'}`);
      }

      const transferData = await transferResponse.json() as {
        transferId: string;
        files: Array<{
          fileId: string;
          filename: string;
          uploadId: string;
          key: string;
        }>;
      };
      
      setTransferId(transferData.transferId);
      
      // Update files with upload metadata
      setFormData(prev => ({
        ...prev,
        files: prev.files.map((file, index) => ({
          ...file,
          uploadId: transferData.files[index].uploadId,
          key: transferData.files[index].key,
          status: 'uploading' as const
        }))
      }));
      
      // Save upload state for resumption
      saveUploadState({ transferId: transferData.transferId, formData });
      
      // Step 2: Upload files in chunks and complete uploads
      const uploadPromises = formData.files.map(async (fileInfo, index) => {
        const fileData = transferData.files[index];
        const uploadParts = await uploadFileInChunks(fileInfo, fileData);
        
        // Complete this file upload
        return await completeFileUpload(transferData.transferId, fileData, uploadParts);
      });

      await Promise.all(uploadPromises);
      
      // Set download URL and completion status
      const baseUrl = window.location.origin;
      const downloadLink = `${baseUrl}/download/${transferData.transferId}`;
      setDownloadUrl(downloadLink);
      setUploadComplete(true);
      clearUploadState();
      
    } catch (error) {
      console.error('Transfer failed:', error);
      alert('Transfer failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const uploadFileInChunks = async (fileInfo: FileInfo, fileData: any) => {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second
    
    const file = fileInfo.file;
    const chunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadParts = [...(fileInfo.uploadedParts || [])];
    const startPart = (fileInfo.currentPart || 0) + 1;

    // Create abort controller for this file
    const abortController = new AbortController();
    abortControllersRef.current.set(fileInfo.id, abortController);

    const uploadChunkWithRetry = async (partNumber: number, chunk: Blob, retryCount = 0): Promise<{ partNumber: number; etag: string }> => {
      // Check if upload is paused
      if (pausedUploads.has(fileInfo.id)) {
        throw new Error('Upload paused');
      }

      // Check if aborted
      if (abortController.signal.aborted) {
        throw new Error('Upload cancelled');
      }

      try {
        const chunkFormData = new FormData();
        chunkFormData.append('key', fileData.key);
        chunkFormData.append('uploadId', fileData.uploadId);
        chunkFormData.append('partNumber', partNumber.toString());
        chunkFormData.append('chunk', chunk);

        const uploadResponse = await fetch('/api/uploads/chunk', {
          method: 'POST',
          body: chunkFormData,
          signal: abortController.signal
        });

        if (!uploadResponse.ok) {
          throw new Error(`HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`);
        }

        return await uploadResponse.json() as { partNumber: number; etag: string };
      } catch (error) {
        if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Upload paused')) {
          throw error;
        }

        if (retryCount < MAX_RETRIES) {
          console.log(`Retrying part ${partNumber} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, retryCount)));
          return uploadChunkWithRetry(partNumber, chunk, retryCount + 1);
        }

        throw new Error(`Failed to upload part ${partNumber} after ${MAX_RETRIES + 1} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    try {
      for (let partNumber = startPart; partNumber <= chunks; partNumber++) {
        // Check if this part was already uploaded
        if (uploadParts.find(p => p.partNumber === partNumber)) {
          continue;
        }

        const start = (partNumber - 1) * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const uploadResult = await uploadChunkWithRetry(partNumber, chunk);
        uploadParts.push({
          partNumber: uploadResult.partNumber,
          etag: uploadResult.etag
        });

        // Update file state with progress and uploaded parts
        const progress = Math.round((partNumber / chunks) * 100);
        setFormData(prev => ({
          ...prev,
          files: prev.files.map(f => 
            f.id === fileInfo.id ? { 
              ...f, 
              progress,
              uploadedParts: uploadParts,
              currentPart: partNumber,
              status: 'uploading' as const
            } : f
          )
        }));

        // Save state after each successful chunk
        saveUploadState({ transferId, formData });
      }

      // Mark file as completed
      setFormData(prev => ({
        ...prev,
        files: prev.files.map(f => 
          f.id === fileInfo.id ? { ...f, status: 'completed' as const } : f
        )
      }));

      return uploadParts;
    } catch (error) {
      // Mark file as error
      setFormData(prev => ({
        ...prev,
        files: prev.files.map(f => 
          f.id === fileInfo.id ? { 
            ...f, 
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Unknown error'
          } : f
        )
      }));
      throw error;
    } finally {
      abortControllersRef.current.delete(fileInfo.id);
    }
  };

  const completeFileUpload = async (transferId: string, fileData: any, uploadParts: any[]) => {
    const completeResponse = await fetch('/api/transfers/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transferId,
        key: fileData.key,
        uploadId: fileData.uploadId,
        parts: uploadParts
      })
    });

    if (!completeResponse.ok) {
      throw new Error('Failed to complete file upload');
    }

    const result = await completeResponse.json();
    
    
    return result;
  };

  // Save upload state to localStorage
  const saveUploadState = (state: { transferId: string; formData: TransferFormData }) => {
    localStorage.setItem('naijatransfer_upload_state', JSON.stringify(state));
  };

  // Load upload state from localStorage
  const loadUploadState = (): { transferId: string; formData: TransferFormData } | null => {
    try {
      const saved = localStorage.getItem('naijatransfer_upload_state');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  };

  // Clear upload state from localStorage
  const clearUploadState = () => {
    localStorage.removeItem('naijatransfer_upload_state');
  };

  const resetForm = () => {
    // Cancel all ongoing uploads
    abortControllersRef.current.forEach(controller => controller.abort());
    abortControllersRef.current.clear();
    
    setFormData({
      files: []
    });
    setUploadComplete(false);
    setDownloadUrl('');
    setTransferId('');
    setPausedUploads(new Set());
    clearUploadState();
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(downloadUrl);
      alert('Download link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  // Pause/Resume functions
  const pauseFileUpload = (fileId: string) => {
    setPausedUploads(prev => new Set([...prev, fileId]));
    setFormData(prev => ({
      ...prev,
      files: prev.files.map(f => 
        f.id === fileId ? { ...f, status: 'paused' as const } : f
      )
    }));
    
    // Abort the current upload for this file
    const controller = abortControllersRef.current.get(fileId);
    if (controller) {
      controller.abort();
    }
  };

  const resumeFileUpload = async (fileInfo: FileInfo) => {
    if (!fileInfo.uploadId || !fileInfo.key) {
      console.error('Cannot resume upload: missing upload metadata');
      return;
    }

    setPausedUploads(prev => {
      const newSet = new Set(prev);
      newSet.delete(fileInfo.id);
      return newSet;
    });

    setFormData(prev => ({
      ...prev,
      files: prev.files.map(f => 
        f.id === fileInfo.id ? { ...f, status: 'uploading' as const, error: undefined } : f
      )
    }));

    try {
      const fileData = {
        uploadId: fileInfo.uploadId,
        key: fileInfo.key
      };
      const uploadParts = await uploadFileInChunks(fileInfo, fileData);
      await completeFileUpload(transferId, fileData, uploadParts);
    } catch (error) {
      console.error('Resume upload failed:', error);
      setFormData(prev => ({
        ...prev,
        files: prev.files.map(f => 
          f.id === fileInfo.id ? { 
            ...f, 
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Resume failed'
          } : f
        )
      }));
    }
  };

  const retryFileUpload = (fileInfo: FileInfo) => {
    resumeFileUpload(fileInfo);
  };

  // Function to load saved upload state on component mount
  const loadSavedUpload = () => {
    const savedState = loadUploadState();
    if (savedState) {
      setFormData(savedState.formData);
      setTransferId(savedState.transferId);
      
      // Show resume dialog or auto-resume
      const hasIncompleteFiles = savedState.formData.files.some(f => f.status !== 'completed');
      if (hasIncompleteFiles) {
        const shouldResume = window.confirm('Found an interrupted upload. Would you like to resume it?');
        if (shouldResume) {
          // Resume incomplete files
          savedState.formData.files.forEach(file => {
            if (file.status === 'uploading' || file.status === 'paused' || file.status === 'error') {
              resumeFileUpload(file);
            }
          });
        } else {
          clearUploadState();
        }
      }
    }
  };

  const [showResumeNotification, setShowResumeNotification] = useState(false);

  // Load saved upload on component mount
  React.useEffect(() => {
    const savedState = loadUploadState();
    if (savedState) {
      const hasIncompleteFiles = savedState.formData.files.some(f => f.status !== 'completed');
      if (hasIncompleteFiles) {
        setShowResumeNotification(true);
        setFormData(savedState.formData);
        setTransferId(savedState.transferId);
      }
    }
  }, []);

  const getStatusIcon = (status: FileInfo['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'uploading': return '📤';
      case 'paused': return '⏸️';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '📄';
    }
  };

  const getStatusColor = (status: FileInfo['status']) => {
    switch (status) {
      case 'pending': return 'text-gray-500';
      case 'uploading': return 'text-blue-600';
      case 'paused': return 'text-yellow-600';
      case 'completed': return 'text-green-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-500';
    }
  };

  if (uploadComplete) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6">
        <div className="text-center">
          <div className="text-green-500 text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Transfer Complete!</h2>
          

          {/* Download Link */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Download Link
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={downloadUrl}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
              />
              <button
                type="button"
                onClick={copyToClipboard}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              This link will expire in 24 hours
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 transition-colors"
            >
              View Download Page
            </a>
            <button
              type="button"
              onClick={resetForm}
              className="block w-full bg-gray-600 text-white py-3 px-4 rounded-md hover:bg-gray-700 transition-colors"
            >
              Send Another Transfer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6">
      {/* Service Information */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <div className="flex items-start space-x-3">
          <div className="text-green-600 text-xl">🆓</div>
          <div>
            <h3 className="text-sm font-semibold text-green-800 mb-1">Free File Transfer Service</h3>
            <p className="text-xs text-green-700 mb-2">
              Upload up to <strong>15GB per file</strong> completely free! Files are automatically deleted after <strong>24 hours</strong> to keep storage costs manageable for our developers.
            </p>
            <p className="text-xs text-green-600">
              This service is provided free of charge. The short duration helps us maintain sustainable hosting costs while serving the community.
            </p>
          </div>
        </div>
      </div>

      {/* Resume Notification */}
      {showResumeNotification && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-yellow-600 text-lg mr-2">⚠️</span>
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  Interrupted upload detected
                </p>
                <p className="text-xs text-yellow-600">
                  You have an unfinished upload. Would you like to resume it?
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => {
                  formData.files.forEach(file => {
                    if (file.status === 'uploading' || file.status === 'paused' || file.status === 'error') {
                      resumeFileUpload(file);
                    }
                  });
                  setShowResumeNotification(false);
                }}
                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => {
                  clearUploadState();
                  resetForm();
                  setShowResumeNotification(false);
                }}
                className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* File Upload Area */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            Select Files
          </label>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragOver
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="space-y-2">
              <div className="text-gray-600">
                <p className="text-lg">Drop files here or click to select</p>
                <p className="text-sm">Multiple files are supported • Max 15GB per file</p>
                <p className="text-xs text-gray-500 mt-2">Files expire automatically after 24 hours</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        </div>

        {/* File List */}
        {formData.files.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Selected Files
            </label>
            <div className="space-y-2">
              {formData.files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{getStatusIcon(file.status)}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                        <p className={`text-xs ${getStatusColor(file.status)}`}>
                          {file.status === 'pending' && 'Waiting to upload'}
                          {file.status === 'uploading' && `Uploading... ${file.progress}%`}
                          {file.status === 'paused' && 'Paused'}
                          {file.status === 'completed' && 'Upload complete'}
                          {file.status === 'error' && `Error: ${file.error || 'Upload failed'}`}
                        </p>
                      </div>
                    </div>
                    {(file.status === 'uploading' || file.status === 'paused') && (
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    {/* Pause/Resume/Retry Controls */}
                    {file.status === 'uploading' && (
                      <button
                        type="button"
                        onClick={() => pauseFileUpload(file.id)}
                        className="px-2 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600"
                        title="Pause upload"
                      >
                        ⏸️
                      </button>
                    )}
                    
                    {(file.status === 'paused' || file.status === 'error') && (
                      <button
                        type="button"
                        onClick={() => resumeFileUpload(file)}
                        className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                        title={file.status === 'paused' ? 'Resume upload' : 'Retry upload'}
                      >
                        {file.status === 'paused' ? '▶️' : '🔄'}
                      </button>
                    )}
                    
                    {/* Remove File Button */}
                    <button
                      type="button"
                      onClick={() => removeFile(file.id)}
                      className="text-red-500 hover:text-red-700"
                      disabled={file.status === 'uploading'}
                      title="Remove file"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* Upload Controls */}
        {isUploading && (
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900">Upload Progress</span>
              <span className="text-sm text-blue-700">
                {formData.files.filter(f => f.status === 'completed').length} / {formData.files.length} files completed
              </span>
            </div>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => {
                  formData.files.forEach(file => {
                    if (file.status === 'uploading') {
                      pauseFileUpload(file.id);
                    }
                  });
                }}
                className="px-3 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600"
              >
                Pause All
              </button>
              <button
                type="button"
                onClick={() => {
                  formData.files.forEach(file => {
                    if (file.status === 'paused' || file.status === 'error') {
                      resumeFileUpload(file);
                    }
                  });
                }}
                className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
              >
                Resume All
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Are you sure you want to cancel all uploads?')) {
                    abortControllersRef.current.forEach(controller => controller.abort());
                    setIsUploading(false);
                    clearUploadState();
                  }
                }}
                className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
              >
                Cancel All
              </button>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isFormValid() || isUploading}
          className={`w-full py-3 px-4 rounded-md font-medium text-white transition-colors ${
            !isFormValid() || isUploading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
          }`}
        >
          {isUploading ? 'Uploading...' : 'Upload Files'}
        </button>
      </form>
    </div>
  );
}
