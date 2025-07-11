import React, { useState, useRef } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useBackgroundProgress } from './BackgroundManager';

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
  
  // Background progress integration
  const { setProgress, setIsUploading: setBackgroundUploading } = useBackgroundProgress();

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
    setBackgroundUploading(true);
    setProgress(0);
    
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
        
        // Only complete upload if we have parts (not paused)
        if (uploadParts.length > 0) {
          return await completeFileUpload(transferData.transferId, fileData, uploadParts);
        }
        return null; // Paused upload
      });

      const results = await Promise.allSettled(uploadPromises);
      
      // Check if any uploads completed successfully
      const completedUploads = results.filter(result => 
        result.status === 'fulfilled' && result.value !== null
      );
      
      // Only show completion if at least one file completed
      if (completedUploads.length > 0) {
        // Set download URL and completion status
        const baseUrl = window.location.origin;
        const downloadLink = `${baseUrl}/download/${transferData.transferId}`;
        setDownloadUrl(downloadLink);
        setUploadComplete(true);
        setProgress(100);
        setTimeout(() => {
          setBackgroundUploading(false);
          setProgress(0);
        }, 2000); // Show completion for 2 seconds
        clearUploadState();
      }
      
    } catch (error) {
      // Don't show error for pause/abort operations
      if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Upload paused')) {
        console.log('Upload paused by user');
      } else {
        console.error('Transfer failed:', error);
        alert('Transfer failed. Please try again.');
      }
    } finally {
      setIsUploading(false);
      if (!uploadComplete) {
        setBackgroundUploading(false);
        setProgress(0);
      }
    }
  };

  const uploadFileInChunks = async (fileInfo: FileInfo, fileData: any) => {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second
    const CONCURRENT_UPLOADS = 4; // Number of concurrent chunk uploads
    
    const file = fileInfo.file;
    const chunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadParts = [...(fileInfo.uploadedParts || [])];
    const startPart = (fileInfo.currentPart || 0) + 1;

    // Track real-time progress for each chunk
    const chunkProgress = new Map<number, number>(); // partNumber -> bytes uploaded
    const chunkSizes = new Map<number, number>(); // partNumber -> total chunk size

    // Create abort controller for this file
    const abortController = new AbortController();
    abortControllersRef.current.set(fileInfo.id, abortController);

    // Function to update real-time progress
    const updateRealTimeProgress = () => {
      // Calculate total bytes uploaded (completed chunks + partial progress)
      let totalBytesUploaded = 0;
      
      // Add bytes from completed chunks
      for (const part of uploadParts) {
        const chunkSize = Math.min(CHUNK_SIZE, file.size - (part.partNumber - 1) * CHUNK_SIZE);
        totalBytesUploaded += chunkSize;
      }
      
      // Add partial progress from currently uploading chunks
      for (const [partNumber, bytesUploaded] of chunkProgress) {
        // Only count if this chunk isn't already completed
        if (!uploadParts.find(p => p.partNumber === partNumber)) {
          totalBytesUploaded += bytesUploaded;
        }
      }
      
      const progress = Math.min(Math.round((totalBytesUploaded / file.size) * 100), 100);
      
      // Update background progress
      setProgress(progress);
      
      setFormData(prev => ({
        ...prev,
        files: prev.files.map(f => 
          f.id === fileInfo.id ? { 
            ...f, 
            progress,
            uploadedParts: [...uploadParts],
            currentPart: uploadParts.length > 0 ? Math.max(...uploadParts.map(p => p.partNumber)) : 0,
            status: 'uploading' as const
          } : f
        )
      }));
    };

    const uploadChunkWithRetry = async (partNumber: number, chunk: Blob, retryCount = 0): Promise<{ partNumber: number; etag: string }> => {
      try {
        // Store chunk size for progress calculation
        chunkSizes.set(partNumber, chunk.size);
        chunkProgress.set(partNumber, 0);

        return await new Promise<{ partNumber: number; etag: string }>((resolve, reject) => {
          // Check for pause/abort before starting each upload
          const checkPauseOrAbort = () => {
            if (pausedUploads.has(fileInfo.id)) {
              chunkProgress.delete(partNumber);
              reject(new Error('Upload paused'));
              return true;
            }
            if (abortController.signal.aborted) {
              chunkProgress.delete(partNumber);
              reject(new Error('Upload cancelled'));
              return true;
            }
            return false;
          };

          if (checkPauseOrAbort()) return;

          const xhr = new XMLHttpRequest();
          
          // Set up progress tracking with pause checks
          xhr.upload.addEventListener('progress', (event) => {
            // Check for pause during upload
            if (pausedUploads.has(fileInfo.id)) {
              xhr.abort();
              return;
            }
            
            if (event.lengthComputable) {
              chunkProgress.set(partNumber, event.loaded);
              updateRealTimeProgress();
            }
          });

          // Handle completion
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const result = JSON.parse(xhr.responseText);
                // Mark this chunk as fully uploaded
                chunkProgress.delete(partNumber);
                resolve(result);
              } catch (e) {
                chunkProgress.delete(partNumber);
                reject(new Error('Invalid JSON response'));
              }
            } else {
              chunkProgress.delete(partNumber);
              reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          });

          // Handle errors
          xhr.addEventListener('error', () => {
            chunkProgress.delete(partNumber);
            reject(new Error('Network error'));
          });

          // Handle abort - check if it's pause or cancel
          xhr.addEventListener('abort', () => {
            chunkProgress.delete(partNumber);
            if (pausedUploads.has(fileInfo.id)) {
              reject(new Error('Upload paused'));
            } else {
              reject(new Error('Upload cancelled'));
            }
          });

          // Handle abort controller
          abortController.signal.addEventListener('abort', () => {
            xhr.abort();
          });

          // Prepare form data
          const chunkFormData = new FormData();
          chunkFormData.append('key', fileData.key);
          chunkFormData.append('uploadId', fileData.uploadId);
          chunkFormData.append('partNumber', partNumber.toString());
          chunkFormData.append('chunk', chunk);

          // Start upload
          xhr.open('POST', '/api/uploads/chunk');
          xhr.send(chunkFormData);
        });

      } catch (error) {
        chunkProgress.delete(partNumber);
        
        if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Upload paused' || error.message === 'Upload cancelled')) {
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

    // Helper function to limit concurrent promises - batch approach
    const limitConcurrency = async (
      tasks: (() => Promise<any>)[],
      limit: number
    ): Promise<any[]> => {
      const results: any[] = [];
      
      for (let i = 0; i < tasks.length; i += limit) {
        const batch = tasks.slice(i, i + limit);
        const batchResults = await Promise.all(batch.map(task => task()));
        results.push(...batchResults);
      }
      
      return results;
    };

    let newPartsUploaded = 0;
    let completedParts = uploadParts.length; // Start with already completed parts
    
    // Set initial progress based on already completed chunks
    updateRealTimeProgress();
    
    try {
      // Create tasks for all parts that need to be uploaded
      const uploadTasks = [];
      
      for (let partNumber = startPart; partNumber <= chunks; partNumber++) {
        // Check if this part was already uploaded
        if (uploadParts.find(p => p.partNumber === partNumber)) {
          continue; // Skip already completed parts
        }

        const start = (partNumber - 1) * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        // Create upload task
        uploadTasks.push(async () => {
          const uploadResult = await uploadChunkWithRetry(partNumber, chunk);
          
          // Update parts array and increment counters
          uploadParts.push({
            partNumber: uploadResult.partNumber,
            etag: uploadResult.etag
          });
          newPartsUploaded++;
          completedParts++;

          // Update progress one final time for this completed chunk
          updateRealTimeProgress();

          // Save state after each successful chunk
          saveUploadState({ transferId, formData });
          
          return uploadResult;
        });
      }

      // Execute uploads with concurrency limit
      if (uploadTasks.length > 0) {
        console.log(`Starting concurrent upload of ${uploadTasks.length} parts with ${CONCURRENT_UPLOADS} concurrent streams`);
        await limitConcurrency(uploadTasks, CONCURRENT_UPLOADS);
      }

      // Sort upload parts by part number for completion
      uploadParts.sort((a, b) => a.partNumber - b.partNumber);

      // Only mark as completed if we have all parts
      const allPartsUploaded = uploadParts.length === chunks;
      if (allPartsUploaded) {
        setFormData(prev => ({
          ...prev,
          files: prev.files.map(f => 
            f.id === fileInfo.id ? { ...f, status: 'completed' as const, progress: 100 } : f
          )
        }));
      }

      console.log(`Concurrent upload session completed: ${newPartsUploaded} new parts uploaded, ${uploadParts.length}/${chunks} total parts`);
      return uploadParts;
    } catch (error) {
      // Check if this is a pause operation (not an actual error)
      if (error instanceof Error && error.message === 'Upload paused') {
        // This is expected - user paused the upload
        console.log(`Upload paused for file ${fileInfo.id}`);
        
        // Update file status to paused, not error
        setFormData(prev => ({
          ...prev,
          files: prev.files.map(f => 
            f.id === fileInfo.id ? { 
              ...f, 
              status: 'paused' as const,
              uploadedParts: [...uploadParts], // Save current progress
              currentPart: uploadParts.length > 0 ? Math.max(...uploadParts.map(p => p.partNumber)) : 0
            } : f
          )
        }));
        
        return []; // Return empty array to avoid completing the upload
      }
      
      // Check if this is an abort/cancel operation
      if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Upload cancelled')) {
        console.log(`Upload cancelled for file ${fileInfo.id}`);
        return []; // Return empty array to avoid completing the upload
      }
      
      // Mark file as error only for real errors
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
      // Clean up progress tracking
      chunkProgress.clear();
      chunkSizes.clear();
      abortControllersRef.current.delete(fileInfo.id);
    }
  };

  const completeFileUpload = async (transferId: string, fileData: any, uploadParts: any[]) => {
    // Don't complete if no parts (paused upload)
    if (!uploadParts || uploadParts.length === 0) {
      return null;
    }
    
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
    // Create a serializable version of the state (without File objects)
    const serializedFiles = state.formData.files.map(file => ({
      id: file.id,
      name: file.name,
      size: file.size,
      progress: file.progress,
      status: file.status,
      uploadId: file.uploadId,
      key: file.key,
      uploadedParts: file.uploadedParts,
      currentPart: file.currentPart,
      error: file.error
      // Note: we can't save the actual File object
    }));
    
    const serializableState = {
      transferId: state.transferId,
      formData: {
        files: serializedFiles
      }
    };
    
    localStorage.setItem('naijatransfer_upload_state', JSON.stringify(serializableState));
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

  const convertToFreshUpload = async (fileInfo: FileInfo) => {
    setFormData(prev => ({
      ...prev,
      files: prev.files.map(f => 
        f.id === fileInfo.id ? { 
          ...f, 
          status: 'pending' as const,
          error: undefined,
          progress: 0,
          uploadedParts: [],
          currentPart: 0,
          uploadId: undefined,
          key: undefined
        } : f
      )
    }));
    
    // Clear any stale transfer state
    setTransferId('');
    clearUploadState();
    setShowResumeNotification(false);
    
    alert('Previous upload is no longer valid. File will start as a fresh upload.\nClick "Upload Files" to begin.');
  };

  const promptFileReselection = async (fileInfo: FileInfo): Promise<void> => {
    return new Promise((resolve) => {
      // Create a temporary file input
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.style.display = 'none';
      
      // Set up file selection handler
      fileInput.onchange = (event) => {
        const selectedFiles = (event.target as HTMLInputElement).files;
        if (selectedFiles && selectedFiles.length > 0) {
          const selectedFile = selectedFiles[0];
          
          // Validate the file matches the original
          if (selectedFile.name === fileInfo.name && selectedFile.size === fileInfo.size) {
            // Update the file info with the new File object
            setFormData(prev => ({
              ...prev,
              files: prev.files.map(f => 
                f.id === fileInfo.id ? { 
                  ...f, 
                  file: selectedFile,
                  status: 'paused' as const,
                  error: undefined
                } : f
              )
            }));
            
            // Now resume the upload with the file object
            setTimeout(() => {
              const updatedFileInfo = { ...fileInfo, file: selectedFile };
              resumeFileUpload(updatedFileInfo);
            }, 100);
            
            alert(`File "${selectedFile.name}" selected! Resuming upload from ${fileInfo.progress}%...`);
          } else {
            alert(`File mismatch! Please select the exact same file:\nExpected: ${fileInfo.name} (${formatFileSize(fileInfo.size)})\nSelected: ${selectedFile.name} (${formatFileSize(selectedFile.size)})`);
            setFormData(prev => ({
              ...prev,
              files: prev.files.map(f => 
                f.id === fileInfo.id ? { 
                  ...f, 
                  status: 'error' as const,
                  error: 'Wrong file selected. Please select the exact same file to resume.'
                } : f
              )
            }));
          }
        }
        
        // Clean up
        document.body.removeChild(fileInput);
        resolve();
      };
      
      // Set up cancel handler
      fileInput.oncancel = () => {
        document.body.removeChild(fileInput);
        setFormData(prev => ({
          ...prev,
          files: prev.files.map(f => 
            f.id === fileInfo.id ? { 
              ...f, 
              status: 'error' as const,
              error: 'File selection cancelled. Cannot resume without file.'
            } : f
          )
        }));
        resolve();
      };
      
      // Add to DOM and trigger file selection
      document.body.appendChild(fileInput);
      
      // Show user instruction
      alert(`To resume uploading "${fileInfo.name}" from ${fileInfo.progress}%, please select the same file again.`);
      
      fileInput.click();
    });
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
    // Check if file is already completed
    if (fileInfo.status === 'completed') {
      console.log('File already completed, no need to resume');
      return;
    }

    // First, validate the transfer exists and hasn't expired
    if (transferId) {
      try {
        const validateResponse = await fetch(`/api/transfers/validate/${transferId}`);
        const validation = await validateResponse.json() as { valid: boolean; reason?: string };
        
        if (!validation.valid) {
          console.log('Transfer validation failed:', validation.reason);
          setFormData(prev => ({
            ...prev,
            files: prev.files.map(f => 
              f.id === fileInfo.id ? { 
                ...f, 
                status: 'error' as const,
                error: `Cannot resume: ${validation.reason}. Please start a fresh upload.`
              } : f
            )
          }));
          
          // Clear stale state
          setTransferId('');
          clearUploadState();
          setShowResumeNotification(false);
          
          alert(`Cannot resume upload: ${validation.reason}\nPlease start a fresh upload.`);
          return;
        }
      } catch (error) {
        console.error('Error validating transfer:', error);
        alert('Unable to validate transfer. Please start a fresh upload.');
        return;
      }
    }

    // Check if we have the actual File object (needed for resume)
    if (!fileInfo.file) {
      console.log('File object missing, prompting user to re-select file');
      await promptFileReselection(fileInfo);
      return;
    }

    // Remove from paused uploads and start resuming
    setPausedUploads(prev => {
      const newSet = new Set(prev);
      newSet.delete(fileInfo.id);
      return newSet;
    });

    // Update status to uploading
    setFormData(prev => ({
      ...prev,
      files: prev.files.map(f => 
        f.id === fileInfo.id ? { ...f, status: 'uploading' as const } : f
      )
    }));

    // Resume the upload from where it left off
    try {
      const fileData = {
        key: fileInfo.key,
        uploadId: fileInfo.uploadId
      };
      
      console.log(`Resuming upload for ${fileInfo.name} from part ${(fileInfo.currentPart || 0) + 1}`);
      const uploadParts = await uploadFileInChunks(fileInfo, fileData);
      
      // Complete upload if we have all parts
      if (uploadParts.length > 0) {
        await completeFileUpload(transferId, fileData, uploadParts);
      }
    } catch (error) {
      console.error('Resume failed:', error);
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

  // Browser close/refresh warning
  React.useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Check if there are active uploads
      const hasActiveUploads = formData.files.some(file => 
        file.status === 'uploading' || file.status === 'paused'
      );
      
      if (hasActiveUploads || isUploading) {
        const message = 'You have uploads in progress. If you leave this page, you\'ll need to re-select your files and start fresh. Are you sure you want to leave?';
        event.preventDefault();
        event.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [formData.files, isUploading]);

  // Load saved upload on component mount
  React.useEffect(() => {
    const savedState = loadUploadState();
    if (savedState) {
      const hasIncompleteFiles = savedState.formData.files.some(f => f.status !== 'completed');
      if (hasIncompleteFiles) {
        setShowResumeNotification(true);
        
        // Mark files without File objects as needing re-selection
        const updatedFiles = savedState.formData.files.map(file => {
          return {
            ...file,
            status: file.status === 'completed' ? 'completed' as const : 'error' as const,
            error: file.status !== 'completed' ? 'Click the 🔄 button to re-select this file for fresh upload.' : undefined
          };
        });
        
        setFormData({
          files: updatedFiles
        });
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
      <div className="text-center">
        <div className="text-green-500 text-2xl mb-2">✅</div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">Transfer Complete!</h2>
        

        {/* Download Link */}
        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Download Link
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={downloadUrl}
              readOnly
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md bg-white text-xs"
            />
            <button
              type="button"
              onClick={copyToClipboard}
              className="px-2 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1 font-light">
            This link will expire in 24 hours
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-green-600 text-white py-2 px-3 rounded-md hover:bg-green-700 transition-colors text-xs"
          >
            View Download Page
          </a>
          <button
            type="button"
            onClick={resetForm}
            className="block w-full bg-gray-600 text-white py-2 px-3 rounded-md hover:bg-gray-700 transition-colors text-xs"
          >
            Send Another Transfer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Resume Notification */}
      {showResumeNotification && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-orange-600 text-lg mr-2">🔄</span>
              <div>
                <p className="text-sm font-medium text-orange-800">
                  Previous upload detected
                </p>
                <p className="text-sm text-orange-600 font-light">
                  Upload will restart fresh for reliability. Click "Restore Files" to re-select your files and upload again.
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => {
                  formData.files.forEach(file => {
                    if (file.status === 'error') {
                      resumeFileUpload(file);
                    }
                  });
                  setShowResumeNotification(false);
                }}
                className="px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700"
              >
                Restore Files
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
        {/* File Upload Area - Simplified */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {/* Add files button */}
            <div
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
                isDragOver
                  ? 'border-blue-500 bg-blue-50 scale-105'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="space-y-2">
                <div className="text-2xl">📄</div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">+ Add files</p>
                  <p className="text-xs text-gray-500 mt-1 font-light">Up to 15GB</p>
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

            {/* Add folder button */}
            <div className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 border-gray-300 hover:border-blue-400 hover:bg-gray-50 opacity-50">
              <div className="space-y-2">
                <div className="text-2xl">📁</div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">+ Add folders</p>
                  <p className="text-xs text-gray-500 mt-1 font-light">Coming soon</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* File List */}
        {formData.files.length > 0 && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">
              Selected Files
            </label>
            <div className="space-y-2">
              {formData.files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-base">{getStatusIcon(file.status)}</span>
                      <div>
                        <p className="text-xs font-medium text-gray-900">{file.name}</p>
                        <p className="text-xs text-gray-500 font-light">{formatFileSize(file.size)}</p>
                        <p className={`text-xs font-light ${getStatusColor(file.status)}`}>
                          {file.status === 'pending' && 'Waiting to upload'}
                          {file.status === 'uploading' && `Uploading... ${file.progress}%`}
                          {file.status === 'paused' && 'Paused'}
                          {file.status === 'completed' && 'Upload complete'}
                          {file.status === 'error' && `Error: ${file.error || 'Upload failed'}`}
                        </p>
                      </div>
                    </div>
                    {(file.status === 'uploading' || file.status === 'paused') && (
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
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
                        className="px-1.5 py-0.5 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600"
                        title="Pause upload"
                      >
                        ⏸️
                      </button>
                    )}
                    
                    {(file.status === 'paused' || file.status === 'error') && (
                      <button
                        type="button"
                        onClick={() => resumeFileUpload(file)}
                        className="px-1.5 py-0.5 text-xs bg-green-500 text-white rounded hover:bg-green-600"
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
          <div className="bg-blue-50 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-blue-900">Upload Progress</span>
              <span className="text-sm text-blue-700 font-light">
                {formData.files.filter(f => f.status === 'completed').length} / {formData.files.length} files completed
              </span>
            </div>
            
            {/* Resume Warning */}
            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-2">
              <div className="flex items-center space-x-2">
                <span className="text-yellow-600 text-xs">⚠️</span>
                <p className="text-xs text-yellow-700 font-light">
                  <strong>Stay on this page</strong> to use pause/resume. Closing or refreshing will require re-uploading.
                </p>
              </div>
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
                className="px-2 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600"
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
                className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
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
                className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
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
          className={`w-full py-3 px-4 rounded-lg font-semibold text-sm text-white transition-all duration-200 ${
            !isFormValid() || isUploading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200'
          }`}
        >
          {isUploading ? 'Uploading...' : 'Transfer'}
        </button>
      </form>
    </div>
  );
}
