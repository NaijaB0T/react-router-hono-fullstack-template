import { useState, useRef } from 'react';
import type { ChangeEvent, DragEvent } from 'react';

interface FileInfo {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
}

interface TransferFormData {
  senderEmail: string;
  recipientEmails: string;
  message: string;
  files: FileInfo[];
}

export function TransferForm() {
  const [formData, setFormData] = useState<TransferFormData>({
    senderEmail: '',
    recipientEmails: '',
    message: '',
    files: []
  });
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [emailStatus, setEmailStatus] = useState<'sending' | 'sent' | 'failed' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      progress: 0
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
    return formData.senderEmail &&
           formData.recipientEmails &&
           formData.files.length > 0 &&
           isValidEmail(formData.senderEmail) &&
           formData.recipientEmails.split(',').every(email => isValidEmail(email.trim()));
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
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
          senderEmail: formData.senderEmail,
          recipientEmails: formData.recipientEmails,
          message: formData.message,
          files: formData.files.map(f => ({
            filename: f.name,
            filesize: f.size
          }))
        })
      });

      if (!transferResponse.ok) {
        const errorData = await transferResponse.json().catch(() => ({ error: 'Unknown error' }));
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
      setEmailStatus('sending');
      
    } catch (error) {
      console.error('Transfer failed:', error);
      alert('Transfer failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const uploadFileInChunks = async (fileInfo: FileInfo, fileData: any) => {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const file = fileInfo.file;
    const chunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadParts = [];

    for (let partNumber = 1; partNumber <= chunks; partNumber++) {
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      // Upload the chunk directly
      const chunkFormData = new FormData();
      chunkFormData.append('key', fileData.key);
      chunkFormData.append('uploadId', fileData.uploadId);
      chunkFormData.append('partNumber', partNumber.toString());
      chunkFormData.append('chunk', chunk);

      const uploadResponse = await fetch('/api/uploads/chunk', {
        method: 'POST',
        body: chunkFormData
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload part ${partNumber}`);
      }

      const uploadResult = await uploadResponse.json() as { partNumber: number; etag: string };
      uploadParts.push({
        partNumber: uploadResult.partNumber,
        etag: uploadResult.etag
      });

      // Update progress
      const progress = Math.round((partNumber / chunks) * 100);
      setFormData(prev => ({
        ...prev,
        files: prev.files.map(f => 
          f.id === fileInfo.id ? { ...f, progress } : f
        )
      }));
    }

    return uploadParts;
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
    
    // Check if email was sent successfully
    if (result.emailSent) {
      setEmailStatus('sent');
    } else {
      setEmailStatus('failed');
    }
    
    return result;
  };

  const resetForm = () => {
    setFormData({
      senderEmail: '',
      recipientEmails: '',
      message: '',
      files: []
    });
    setUploadComplete(false);
    setDownloadUrl('');
    setEmailStatus(null);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(downloadUrl);
      alert('Download link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  if (uploadComplete) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6">
        <div className="text-center">
          <div className="text-green-500 text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Transfer Complete!</h2>
          
          {/* Email Status */}
          <div className="mb-6">
            {emailStatus === 'sending' && (
              <div className="flex items-center justify-center text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                Sending email notifications...
              </div>
            )}
            {emailStatus === 'sent' && (
              <div className="text-green-600">
                ✅ Email notifications sent successfully!
              </div>
            )}
            {emailStatus === 'failed' && (
              <div className="text-red-600">
                ⚠️ Email notifications failed to send. You can still share the download link manually.
              </div>
            )}
          </div>

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
              This link will expire in 7 days
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
                <p className="text-sm">Multiple files are supported</p>
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
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                    {isUploading && (
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    className="ml-4 text-red-500 hover:text-red-700"
                    disabled={isUploading}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sender Email */}
        <div>
          <label htmlFor="senderEmail" className="block text-sm font-medium text-gray-700 mb-1">
            Your Email
          </label>
          <input
            type="email"
            id="senderEmail"
            name="senderEmail"
            value={formData.senderEmail}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="your@email.com"
            required
            disabled={isUploading}
          />
        </div>

        {/* Recipient Emails */}
        <div>
          <label htmlFor="recipientEmails" className="block text-sm font-medium text-gray-700 mb-1">
            Recipient Email(s)
          </label>
          <input
            type="text"
            id="recipientEmails"
            name="recipientEmails"
            value={formData.recipientEmails}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="recipient@email.com, another@email.com"
            required
            disabled={isUploading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Separate multiple emails with commas
          </p>
        </div>

        {/* Message */}
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
            Message (Optional)
          </label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleInputChange}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Add a message to your recipients..."
            disabled={isUploading}
          />
        </div>

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
          {isUploading ? 'Uploading...' : 'Send Transfer'}
        </button>
      </form>
    </div>
  );
}
