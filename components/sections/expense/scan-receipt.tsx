'use client';

import { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

export interface ExtractedData {
  amount: number | null;
  date: string | null;
  merchant: string | null;
  category: string | null;
  raw_text?: string;
}

interface ScanReceiptAreaProps {
  onDataExtracted?: (data: ExtractedData) => void;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_IMAGE_EXTS  = ['.jpg', '.jpeg', '.png', '.webp'];

export function ScanReceiptArea({ onDataExtracted }: ScanReceiptAreaProps) {
  const [isDragging,  setIsDragging]  = useState(false);
  const [isScanning,  setIsScanning]  = useState(false);
  const [useCamera,   setUseCamera]   = useState(false);
  const [scannedList, setScannedList] = useState<{ name: string; status: 'scanning' | 'done' | 'error' }[]>([]);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const startCamera = async () => {
    setUseCamera(true);
    await new Promise(r => setTimeout(r, 100));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      toast.error('Camera access denied');
      setUseCamera(false);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(t => t.stop());
    setUseCamera(false);
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.filter = 'grayscale(100%) contrast(140%)';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'camera-scan.jpg', { type: 'image/jpeg' });
      stopCamera();
      await processFile(file);
    }, 'image/jpeg', 0.85);
  };

  // ── Drag & drop / file input ────────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
  };

  const handleFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.includes(file.type) && !ALLOWED_IMAGE_EXTS.includes(ext)) {
        toast.error(`Unsupported file type: ${file.name}. Please upload a JPG, PNG or WebP image.`);
        continue;
      }
      await processFile(file);
    }
  };

  // ── Core: send to /api/expenses/scan, get extracted JSON back ─────────────
  const processFile = async (file: File) => {
    setIsScanning(true);
    setScannedList(prev => [...prev, { name: file.name, status: 'scanning' }]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res  = await fetch('/api/expenses/scan', { method: 'POST', body: formData });
      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error || 'Parsing failed');
      }

      const extracted:     ExtractedData = json.data?.extracted;
      const amountWarning: string | null = json.data?.amountWarning ?? null;
      const confidence:    string        = json.data?.confidence ?? 'low';
      const needsReview:   boolean       = json.data?.needsReview ?? true;

      setScannedList(prev =>
        prev.map(f => f.name === file.name ? { ...f, status: 'done' } : f)
      );

      if (!extracted) {
        throw new Error('No data could be extracted from this image');
      }

      if (amountWarning) {
        toast.warning(amountWarning);
      } else if (needsReview || confidence === 'low') {
        toast.warning('Receipt scanned with low confidence — please verify all fields.');
      } else if (confidence === 'medium') {
        toast.info('Receipt scanned. Please review the pre-filled details.');
      } else {
        toast.success('Receipt scanned successfully. Review and confirm the details.');
      }

      // Pass data to parent (AddExpensePage) for pre-filling the form
      onDataExtracted?.(extracted);

    } catch (err: any) {
      setScannedList(prev =>
        prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
      );
      toast.error(err.message || 'OCR processing failed');
    } finally {
      setIsScanning(false);
    }
  };


  return (
    <Card className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-foreground">Scan Receipt</h2>
        <button
          type="button"
          onClick={useCamera ? stopCamera : startCamera}
          className="text-sm font-medium text-primary hover:underline bg-primary/10 px-3 py-1 rounded-full"
        >
          {useCamera ? 'Close Camera' : '📷 Use Camera'}
        </button>
      </div>

      {/* Live camera view */}
      {useCamera && (
        <div className="relative border rounded-lg bg-black mb-6 overflow-hidden aspect-video shadow-inner">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <button
              type="button"
              onClick={captureFrame}
              disabled={isScanning}
              className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
            >
              {isScanning ? 'Processing…' : 'Capture Receipt'}
            </button>
          </div>
        </div>
      )}

      {/* Drag-and-drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
          isDragging ? 'border-primary bg-primary/10 scale-[0.99] shadow-inner' : 'border-border hover:border-primary/50'
        } ${isScanning ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input
          type="file"
          id="receipt-upload"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileInput}
          disabled={isScanning}
          className="hidden"
        />
        <div className="text-6xl mb-6 drop-shadow-sm">📸</div>
        <h3 className="text-xl font-bold text-foreground mb-2">Upload Receipt Picture</h3>
        <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
          Drop your receipt here or click to browse. Supported: JPG, PNG, WebP.
        </p>
        <label htmlFor="receipt-upload" className="inline-block">
          <div className={`bg-primary text-primary-foreground px-8 py-3 rounded-lg font-bold shadow-md transition-all ${isScanning ? 'cursor-not-allowed' : 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0'}`}>
            {isScanning ? 'Analyzing…' : 'Select Image'}
          </div>
        </label>
      </div>

      {scannedList.length > 0 && (
        <div className="mt-8 space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Processing History</h4>
          <ul className="space-y-2">
            {scannedList.map((f, i) => (
              <li key={i} className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border/50">
                <span className="text-sm font-medium text-foreground flex items-center gap-2">
                  <span className="opacity-70">🖼️</span> {f.name}
                </span>
                <span className={`text-[10px] uppercase tracking-tighter px-2.5 py-1 rounded-full font-bold shadow-sm ${
                  f.status === 'done'    ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                  f.status === 'error'   ? 'bg-red-500/10 text-red-600 dark:text-red-400'       :
                  'bg-blue-500/10 text-blue-600 animate-pulse'
                }`}>
                  {f.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
