import { useState, useEffect } from "react";
import { useAuth } from "~/lib/auth";

interface ManagedFile {
  id: string;
  filename: string;
  filesize: number;
  transfer_id: string;
  transfer_status: string;
  current_expiry: number;
  is_expired: boolean;
  extension_cost_per_day: number;
  total_extensions: number;
  total_extension_cost: number;
  created_at: number;
}

interface FileExtension {
  id: string;
  days_extended: number;
  cost_in_credits: number;
  new_expiry_date: number;
  created_at: number;
}

export function FilesTab() {
  const { user } = useAuth();
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [extendingFile, setExtendingFile] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [extensionDays, setExtensionDays] = useState<number>(1);
  const [extensionHistory, setExtensionHistory] = useState<FileExtension[]>([]);
  const [showExtensionModal, setShowExtensionModal] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      
      if (typeof window === "undefined") {
        setLoading(false);
        return;
      }
      
      const authUser = localStorage.getItem("auth_user");
      const userId = authUser ? JSON.parse(authUser).id : "";
      
      const response = await fetch("/api/files", {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${userId}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
        
        // Show migration message if needed
        if (data.message) {
          console.log(data.message);
        }
      }
    } catch (error) {
      console.error("Error fetching files:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateExtensionCost = (file: ManagedFile, days: number): number => {
    const fileSizeGB = file.filesize / (1024 * 1024 * 1024);
    return Math.ceil(fileSizeGB * days * 2); // ₦2 per GB per day
  };

  const handleExtendFile = async (file: ManagedFile) => {
    if (!extensionDays || extensionDays < 1) return;
    
    try {
      setExtendingFile(file.id);
      
      const authUser = localStorage.getItem("auth_user");
      const userId = authUser ? JSON.parse(authUser).id : "";
      
      const response = await fetch("/api/files/extend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${userId}`,
        },
        body: JSON.stringify({
          fileId: file.id,
          days: extensionDays
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        alert(`File extended successfully! ${data.cost_paid} credits deducted.`);
        fetchFiles(); // Refresh file list
        setShowExtensionModal(false);
        setSelectedFile(null);
        setExtensionDays(1);
      } else {
        alert(data.error || "Failed to extend file");
      }
    } catch (error) {
      console.error("Error extending file:", error);
      alert("An error occurred while extending the file");
    } finally {
      setExtendingFile(null);
    }
  };

  const handleDeleteFile = async (fileId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const authUser = localStorage.getItem("auth_user");
      const userId = authUser ? JSON.parse(authUser).id : "";
      
      const response = await fetch(`/api/files/${fileId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${userId}`,
        },
      });

      if (response.ok) {
        alert("File deleted successfully");
        fetchFiles(); // Refresh file list
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete file");
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      alert("An error occurred while deleting the file");
    }
  };

  const openExtensionModal = (file: ManagedFile) => {
    setSelectedFile(file.id);
    setExtensionDays(1);
    setShowExtensionModal(true);
  };

  const selectedFileData = files.find(f => f.id === selectedFile);

  return (
    <div className="text-white">
      <h2 className="text-xl font-semibold mb-6">File Management</h2>
      
      {loading ? (
        <div className="text-center text-white/70 py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2"></div>
          <p>Loading your files...</p>
        </div>
      ) : files.length === 0 ? (
        <div className="text-center text-white/70 py-8">
          <p>No managed files yet</p>
          <p className="text-sm">Files you upload while logged in will appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {files.map((file) => (
            <div key={file.id} className="bg-white/10 rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-white mb-2">{file.filename}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-white/70">
                    <div>
                      <span className="block">Size</span>
                      <span className="text-white">{formatFileSize(file.filesize)}</span>
                    </div>
                    <div>
                      <span className="block">Status</span>
                      <span className={`${file.is_expired ? 'text-red-400' : 'text-green-400'}`}>
                        {file.is_expired ? 'Expired' : 'Active'}
                      </span>
                    </div>
                    <div>
                      <span className="block">Expires</span>
                      <span className="text-white">{formatDate(file.current_expiry)}</span>
                    </div>
                    <div>
                      <span className="block">Extensions</span>
                      <span className="text-white">{file.total_extensions}</span>
                    </div>
                  </div>
                  
                  {file.total_extension_cost > 0 && (
                    <div className="mt-2 text-sm text-white/60">
                      Total spent on extensions: {file.total_extension_cost} credits
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col space-y-2 ml-4">
                  {!file.is_expired && (
                    <button
                      onClick={() => openExtensionModal(file)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                    >
                      Extend
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteFile(file.id, file.filename)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="text-sm text-white/70">
                  <span>Extension cost: ₦{file.extension_cost_per_day}/day</span>
                  <span className="mx-2">•</span>
                  <span>Upload date: {formatDate(file.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Extension Modal */}
      {showExtensionModal && selectedFileData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">
              Extend File: {selectedFileData.filename}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-2">
                  Extension Period
                </label>
                <select
                  value={extensionDays}
                  onChange={(e) => setExtensionDays(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                >
                  <option value={1}>1 Day</option>
                  <option value={3}>3 Days</option>
                  <option value={7}>1 Week</option>
                  <option value={14}>2 Weeks</option>
                  <option value={30}>1 Month</option>
                  <option value={90}>3 Months</option>
                  <option value={180}>6 Months</option>
                  <option value={365}>1 Year</option>
                </select>
              </div>
              
              <div className="bg-white/5 rounded-lg p-4">
                <div className="text-sm text-white/70 space-y-1">
                  <div>File size: {formatFileSize(selectedFileData.filesize)}</div>
                  <div>Extension period: {extensionDays} day(s)</div>
                  <div className="font-medium text-white">
                    Cost: {calculateExtensionCost(selectedFileData, extensionDays)} credits
                  </div>
                </div>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowExtensionModal(false);
                    setSelectedFile(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleExtendFile(selectedFileData)}
                  disabled={extendingFile === selectedFileData.id}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors"
                >
                  {extendingFile === selectedFileData.id ? "Extending..." : "Extend File"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}