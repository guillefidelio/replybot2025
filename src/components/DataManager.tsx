import React, { useState } from 'react';

interface DataManagerProps {
  onClose?: () => void;
}

interface ExportData {
  version: string;
  exportDate: string;
  settings: any;
  prompts: any;
  usageStats: any;
}

interface ImportResult {
  success: boolean;
  errors: string[];
}

// Utility function to send messages to background script
const sendMessage = (message: any): Promise<any> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
};

const DataManager: React.FC<DataManagerProps> = ({ onClose }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Export all data
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await sendMessage({ type: 'EXPORT_DATA' });
      if (response.success) {
        setExportData(response.data);
        
        // Automatically download the file
        const blob = new Blob([JSON.stringify(response.data, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-review-responder-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        console.error('Export failed:', response.error);
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle file selection for import
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportResult(null);
    }
  };

  // Import data from file
  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    try {
      const text = await selectedFile.text();
      const data = JSON.parse(text);
      
      // Validate the data structure
      if (!data.version || !data.exportDate) {
        setImportResult({
          success: false,
          errors: ['Invalid backup file format']
        });
        return;
      }

      const response = await sendMessage({ 
        type: 'IMPORT_DATA', 
        data: data 
      });
      
      setImportResult({
        success: response.success,
        errors: response.errors || []
      });

    } catch (error) {
      setImportResult({
        success: false,
        errors: ['Failed to read or parse file: ' + (error instanceof Error ? error.message : String(error))]
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Clear import state
  const handleClearImport = () => {
    setSelectedFile(null);
    setImportResult(null);
    const fileInput = document.getElementById('import-file') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Data Management</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-xl"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>

        <div className="space-y-6">
          {/* Export Section */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-md font-medium text-gray-800 mb-3">📤 Export Data</h3>
            <p className="text-sm text-gray-600 mb-4">
              Export all your settings, prompts, and usage statistics to a backup file.
            </p>
            
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
            >
              {isExporting ? (
                <span className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Exporting...
                </span>
              ) : (
                'Export All Data'
              )}
            </button>

            {exportData && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800">
                  ✅ Export completed successfully!
                </p>
                <p className="text-xs text-green-600 mt-1">
                  File downloaded: ai-review-responder-backup-{exportData.exportDate.split('T')[0]}.json
                </p>
              </div>
            )}
          </div>

          {/* Import Section */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-md font-medium text-gray-800 mb-3">📥 Import Data</h3>
            <p className="text-sm text-gray-600 mb-4">
              Import settings and prompts from a previously exported backup file.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Backup File
                </label>
                <input
                  id="import-file"
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  aria-label="Select backup file for import"
                />
              </div>

              {selectedFile && (
                <div className="text-sm text-gray-600">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </div>
              )}

              <div className="flex space-x-2">
                <button
                  onClick={handleImport}
                  disabled={!selectedFile || isImporting}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
                >
                  {isImporting ? (
                    <span className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Importing...
                    </span>
                  ) : (
                    'Import Data'
                  )}
                </button>

                {selectedFile && (
                  <button
                    onClick={handleClearImport}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-md transition-colors duration-200"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {importResult && (
              <div className={`mt-3 p-3 border rounded-md ${
                importResult.success 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}>
                <p className={`text-sm font-medium ${
                  importResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {importResult.success ? '✅ Import successful!' : '❌ Import failed'}
                </p>
                {importResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-600 mb-1">Issues:</p>
                    <ul className="text-xs text-red-600 space-y-1">
                      {importResult.errors.map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {importResult.success && (
                  <p className="text-xs text-green-600 mt-1">
                    Please refresh the extension popup to see imported data.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Important Notes */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-yellow-800 mb-2">⚠️ Important Notes</h4>
            <ul className="text-xs text-yellow-700 space-y-1">
              <li>• Import will overwrite existing settings and prompts</li>
              <li>• API keys are not included in exports for security</li>
              <li>• You'll need to reconfigure your API key after import</li>
              <li>• Keep your backup files in a secure location</li>
              <li>• Regular backups are recommended before major changes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataManager; 