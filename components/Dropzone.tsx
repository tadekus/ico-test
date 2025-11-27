
import React, { useCallback, useState } from 'react';
import { FileData } from '../types';
import { readFile } from '../utils/fileUtils';

interface DropzoneProps {
  onFileLoaded: (data: FileData[]) => void;
  disabled?: boolean;
}

const Dropzone: React.FC<DropzoneProps> = ({ onFileLoaded, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFiles = async (files: FileList) => {
    setError(null);
    const validExtensions = ['pdf', 'xlsx', 'xls', 'csv', 'png', 'jpg', 'jpeg'];
    
    const processedFiles: FileData[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase();

        if (!ext || !validExtensions.includes(ext)) {
            errors.push(`${file.name}: Unsupported file type.`);
            continue;
        }

        try {
            const fileDataRaw = await readFile(file);
            processedFiles.push({
                ...fileDataRaw,
                id: Math.random().toString(36).substring(2, 9), // Temp ID
                status: 'uploading'
            });
        } catch (err) {
            console.error(err);
            errors.push(`${file.name}: Failed to read.`);
        }
    }

    if (errors.length > 0) {
        setError(errors.join(' '));
    }

    if (processedFiles.length > 0) {
        onFileLoaded(processedFiles);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [disabled, onFileLoaded]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-4 transition-all duration-300 ease-in-out
          flex flex-col items-center justify-center text-center cursor-pointer min-h-[140px]
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200' : ''}
          ${isDragging 
            ? 'border-indigo-500 bg-indigo-50 scale-[1.01]' 
            : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 bg-white'}
        `}
      >
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          onChange={handleInputChange}
          disabled={disabled}
          multiple
          accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
        />
        
        <div className="pointer-events-none flex flex-col items-center space-y-2">
          <div className={`p-2 rounded-full ${isDragging ? 'bg-indigo-100' : 'bg-slate-100'}`}>
            <svg className={`w-6 h-6 ${isDragging ? 'text-indigo-600' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">
              {isDragging ? "Drop here" : "Drag & drop invoices"}
            </p>
            <p className="text-xs text-slate-500">
              PDF, Excel, Images
            </p>
          </div>
        </div>
      </div>
      {error && (
        <div className="mt-2 text-xs text-red-500 flex items-center animate-pulse">
          <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
};

export default Dropzone;
