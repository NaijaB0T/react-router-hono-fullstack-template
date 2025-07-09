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
      
      alert('Transfer completed successfully!');
      
      // Reset form
      setFormData({
        senderEmail: '',
        recipientEmails: '',
        message: '',
        files: []
      });
      
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

    return await completeResponse.json();
  };

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
