'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

import { useRef } from 'react';

interface ScanReceiptAreaProps {
  onDataExtracted?: (data: { amount?: number; description?: string; date?: string }) => void;
}

export function ScanReceiptArea({ onDataExtracted }: ScanReceiptAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedFiles, setScannedFiles] = useState<{name: string, status: 'scanning' | 'done' | 'error'}[]>([]);
  
  const [useCamera, setUseCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    setUseCamera(true);
    setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        toast.error("Camera access denied");
        setUseCamera(false);
      }
    }, 300);
  };

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

  const captureFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Basic preprocess (increase contrast/grayscale on canvas)
    ctx.filter = 'grayscale(100%) contrast(150%)';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';

    canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], "camera-scan.jpg", { type: "image/jpeg" });
        await uploadAndScan(file);
        setUseCamera(false);
        // stop stream
        const stream = video.srcObject as MediaStream;
        stream?.getTracks().forEach(t => t.stop());
      }
    }, 'image/jpeg', 0.8);
  };

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
    const fileList = Array.from(files);
    for (const file of fileList) {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTS.includes(ext)) {
        toast.error(`Invalid file type: ${file.name}`);
        continue;
      }
      await uploadAndScan(file);
    }
  };

  const uploadAndScan = async (file: File) => {
    setIsScanning(true);
    setScannedFiles(prev => [...prev, { name: file.name, status: 'scanning' }]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/expenses/upload', { // Same centralized upload route
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Scan failed');

      setScannedFiles(prev => 
        prev.map(f => f.name === file.name ? { ...f, status: 'done' } : f)
      );
      toast.success(`Receipt scanned: ${json.data.description || file.name}`);

      if (onDataExtracted && json.data) {
        onDataExtracted({
          amount: json.data.amount,
          description: json.data.description,
          date: json.data.date,
        });
      }
    } catch (err: any) {
      setScannedFiles(prev => 
        prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
      );
      toast.error(`Scan failed for ${file.name}: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Card className="p-8 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-foreground">Scan Receipt (OCR)</h2>
        <button 
          onClick={useCamera ? () => setUseCamera(false) : startCamera} 
          className="text-xs font-medium text-primary hover:underline"
        >
          {useCamera ? 'Close Camera' : '📷 Use Camera'}
        </button>
      </div>

      {/* Live Camera View */}
      {useCamera && (
        <div className="relative border rounded-lg bg-black mb-6 overflow-hidden aspect-video">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
            <button 
              onClick={captureFrame} 
              disabled={isScanning}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium shadow-md hover:opacity-90 transition-opacity"
            >
              Capture Frame
            </button>
          </div>
        </div>
      )}

      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        } ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input 
          type="file" 
          id="receipt-upload" 
          multiple 
          accept="image/*,application/pdf" 
          onChange={handleFileInput} 
          disabled={isScanning}
          className="hidden" 
        />
        <div className="text-5xl mb-4">📸</div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Upload Receipt Images</h3>
        <p className="text-muted-foreground mb-4">Drag and drop images or PDFs here for AI-powered data extraction</p>
        <label htmlFor="receipt-upload" className="inline-block">
          <div className={`bg-primary text-primary-foreground px-6 py-2 rounded-lg font-medium transition-opacity ${isScanning ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}>
            {isScanning ? 'Scanning...' : 'Select Images'}
          </div>
        </label>
        <p className="text-xs text-muted-foreground mt-4">Supported formats: JPG, PNG, WebP, PDF</p>
      </div>

      {scannedFiles.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-foreground mb-3">Recent Receipts</h3>
          <ul className="space-y-2">
            {scannedFiles.map((file, idx) => (
              <li key={idx} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm text-foreground"><span className="mr-2">🖼️</span>{file.name}</span>
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
