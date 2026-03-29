'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

export function UploadArea() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{name: string, status: 'processing' | 'done' | 'error'}[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ALLOWED_TYPES = [
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ];
  const ALLOWED_EXTS = ['.pdf', '.csv', '.xlsx', '.xls'];

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
  };

  const handleFiles = async (files: FileList) => {
    setError(null);
    const fileList = Array.from(files);
    
    for (const file of fileList) {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTS.includes(ext)) {
        toast.error(`Invalid file type: ${file.name}`);
        continue;
      }

      await uploadAndProcess(file);
    }
  };

  const uploadAndProcess = async (file: File) => {
    setIsUploading(true);
    const fileId = Math.random().toString(36).substring(7);
    setUploadedFiles(prev => [...prev, { name: file.name, status: 'processing' }]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/expenses/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Upload failed');

      setUploadedFiles(prev => 
        prev.map(f => f.name === file.name ? { ...f, status: 'done' } : f)
      );
      toast.success(`Successfully processed ${json.data.processedCount} items from ${file.name}`);
      
      // Refresh dashboard if handled by context - but here we just notify
    } catch (err: any) {
      setUploadedFiles(prev => 
        prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
      );
      toast.error(`Failed to process ${file.name}: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="p-8 mb-8">
      <h2 className="text-2xl font-bold text-foreground mb-6">Automatic Entry</h2>

      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          type="file"
          id="file-upload"
          multiple
          accept=".pdf,.csv,.xlsx,.xls"
          onChange={handleFileInput}
          disabled={isUploading}
          className="hidden"
        />
        
        <div className="text-5xl mb-4">📄</div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Upload Bank Statements
        </h3>
        <p className="text-muted-foreground mb-4">
          Drag and drop PDF, CSV, or Excel files here, or click to browse
        </p>
        <label htmlFor="file-upload" className="inline-block">
          <div className={`bg-primary text-primary-foreground px-6 py-2 rounded-lg font-medium transition-opacity ${isUploading ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}>
            {isUploading ? 'Processing...' : 'Select Files'}
          </div>
        </label>
        <p className="text-xs text-muted-foreground mt-4">
          Supported formats: PDF, CSV, XLSX
        </p>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-foreground mb-3">Recent Uploads</h3>
          <ul className="space-y-2">
            {uploadedFiles.map((file, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <span className="text-sm text-foreground">
                  <span className="mr-2">📎</span>
                  {file.name}
                </span>
                <span className={`text-xs px-2 py-1 rounded ${
                  file.status === 'done' ? 'bg-green-100 text-green-700' : 
                  file.status === 'error' ? 'bg-red-100 text-red-700' : 
                  'bg-accent text-accent-foreground animate-pulse'
                }`}>
                  {file.status.toUpperCase()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
