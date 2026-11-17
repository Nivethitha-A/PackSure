import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, QrCode, AlertCircle, Search, ArrowRight } from 'lucide-react';
import { Order } from '../types';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  onSelectOrder: (order: Order) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  orders,
  onSelectOrder
}) => {
  const [manualId, setManualId] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    setIsScanning(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn('Camera initialization error:', err);
      setCameraError(err.message || 'Camera permission denied or camera device unavailable.');
      setIsScanning(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualId.trim()) return;

    const matched = orders.find(
      (o) =>
        o.order_id.toLowerCase() === manualId.trim().toLowerCase() ||
        o.id.toLowerCase() === manualId.trim().toLowerCase()
    );

    if (matched) {
      stopCamera();
      onSelectOrder(matched);
      onClose();
    } else {
      setCameraError(`Order ID "${manualId}" was not found in the system catalogue.`);
    }
  };

  const handleQuickPick = (order: Order) => {
    stopCamera();
    onSelectOrder(order);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-sm font-bold">Scan Packing Order QR / Barcode</h3>
              <p className="text-[11px] text-slate-400">Position the QR code on the packaging box or enter Order ID</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Viewfinder */}
        <div className="p-5 space-y-4">
          <div className="relative aspect-video bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center border border-slate-800">
            {cameraError ? (
              <div className="text-center p-6 text-slate-400">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-300">Camera Unavailable</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xs">{cameraError}</p>
                <p className="text-[11px] text-blue-400 mt-2">Use manual order entry below or click a quick order</p>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Target Reticle */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-blue-400/80 rounded-lg relative">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-blue-400 -mt-0.5 -ml-0.5"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-blue-400 -mt-0.5 -mr-0.5"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-blue-400 -mb-0.5 -ml-0.5"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-blue-400 -mb-0.5 -mr-0.5"></div>
                    <div className="absolute inset-x-0 top-1/2 h-0.5 bg-blue-400/30 animate-pulse"></div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Quick Select Available Orders */}
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Select Staged Order:
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
              {orders.slice(0, 6).map((o) => (
                <button
                  key={o.id}
                  onClick={() => handleQuickPick(o)}
                  className="text-left p-2 rounded border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors group"
                >
                  <div className="font-mono text-xs font-bold text-slate-900 group-hover:text-blue-600">
                    {o.order_id}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{o.product_name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Manual ID Input Fallback */}
          <form onSubmit={handleManualSubmit} className="pt-2 border-t border-slate-100 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Enter Order ID manually (e.g. ORD-1001)"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors shrink-0"
            >
              <span>Load Order</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
