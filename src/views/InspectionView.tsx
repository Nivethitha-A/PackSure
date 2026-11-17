import React, { useState, useRef, useEffect } from 'react';
import {
  ScanEye,
  Camera,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileCheck,
  ShieldAlert,
  ArrowRight,
  Eye,
  Download,
  AlertCircle,
  HelpCircle,
  Maximize2,
  Sliders,
  ChevronRight,
  Sparkles,
  Layers
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { auth } from '../firebase';
import {
  saveInspectionAtomic,
  approveInspectionInFirestore
} from '../services/firestoreService';
import { Order, Inspection, ModelInfoResponse, ImageQualityMetrics, SystemSettings, User } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { analyzeImageQuality } from '../utils/imageQuality';
import { generateInspectionPdf } from '../utils/pdfExport';

interface InspectionViewProps {
  orders: Order[];
  selectedOrder: Order | null;
  onSelectOrder: (order: Order) => void;
  onNavigate: (tab: string) => void;
  modelInfo: ModelInfoResponse | null;
  settings: SystemSettings | null;
  currentUser: User;
  onInspectionComplete: (inspection: Inspection) => void;
}

export const InspectionView: React.FC<InspectionViewProps> = ({
  orders,
  selectedOrder,
  onSelectOrder,
  onNavigate,
  modelInfo,
  settings,
  currentUser,
  onInspectionComplete
}) => {
  // Capture & Image state
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [imageQuality, setImageQuality] = useState<ImageQualityMetrics | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInferenceRunning, setIsInferenceRunning] = useState(false);
  const [inferenceError, setInferenceError] = useState<string | null>(null);

  // Results state
  const [currentInspection, setCurrentInspection] = useState<Inspection | null>(null);
  const [viewMode, setViewMode] = useState<'annotated' | 'original' | 'split'>('annotated');
  const [isApproved, setIsApproved] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // Reinspection linkage
  const [parentInspection, setParentInspection] = useState<Inspection | null>(null);
  const [reinspectionNotes, setReinspectionNotes] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // If order changes, check if it has a previous inspection that failed for reinspection
  useEffect(() => {
    if (selectedOrder) {
      setActiveImage(null);
      setCurrentInspection(null);
      setInferenceError(null);
      setIsApproved(false);
    }
  }, [selectedOrder]);

  const handleStartCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera device not supported by this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      setCameraError(err.message || 'Unable to access camera.');
      setIsCameraActive(false);
    }
  };

  const handleStopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      processSelectedImage(dataUrl);
    }
    handleStopCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        processSelectedImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const processSelectedImage = async (dataUrl: string) => {
    setActiveImage(dataUrl);
    setCurrentInspection(null);
    setInferenceError(null);
    setIsApproved(false);

    // Run client-side pre-flight quality checks
    const quality = await analyzeImageQuality(dataUrl);
    setImageQuality(quality);
  };

  const handleRunInference = async () => {
    if (!selectedOrder) {
      setInferenceError('Please select a packing order before running inspection.');
      return;
    }
    if (!activeImage) {
      setInferenceError('Please provide an image of the packed components.');
      return;
    }

    setIsInferenceRunning(true);
    setInferenceError(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Authentication session expired. Please sign in again.');
      }

      const res = await fetch('/api/inspections/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          order_id: selectedOrder.order_id,
          product_name: selectedOrder.product_name,
          expected_components: selectedOrder.expected_components,
          confidence_threshold: settings?.confidence_threshold,
          iou_threshold: settings?.iou_threshold,
          image_base64: activeImage,
          parent_inspection_id: parentInspection?.inspection_id || null,
          reinspection_notes: reinspectionNotes || undefined,
          inspector_id: currentUser?.id,
          inspector_name: currentUser?.name
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'MODEL_NOT_LOADED') {
          setInferenceError(
            `Inference blocked: Custom YOLO11 model weights file "best.pt" is not loaded.\n\n` +
            `Expected Path: ${data.details?.expected_model_path || '/app/applet/models/best.pt'}\n\n` +
            `Please upload "best.pt" via Settings -> Model Manager, or place the file directly in the models directory.`
          );
        } else {
          setInferenceError(data.message || data.error || 'YOLO inspection execution failed.');
        }
        setIsInferenceRunning(false);
        return;
      }

      // Persist inspection & order status update atomically in Firestore
      const savedInspection = await saveInspectionAtomic(
        { ...data, image_quality: imageQuality || undefined },
        selectedOrder,
        currentUser
      );

      setCurrentInspection(savedInspection);
      onInspectionComplete(savedInspection);
      if (savedInspection.inspection_status === 'PASS') {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 }
        });
      }
    } catch (err: any) {
      setInferenceError(`Verification failed: ${err.message}`);
    } finally {
      setIsInferenceRunning(false);
    }
  };

  const handleApproveDispatch = async () => {
    if (!currentInspection) return;
    if (currentInspection.inspection_status !== 'PASS') {
      setInferenceError('Fail-safe rule violation: Only 100% verified PASS packages can be approved for dispatch.');
      return;
    }

    setIsApproving(true);
    try {
      const updated = await approveInspectionInFirestore(currentInspection, currentUser);
      setCurrentInspection(updated);
      setIsApproved(true);
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.5 }
      });
    } catch (err: any) {
      setInferenceError(`Approval error: ${err.message}`);
    } finally {
      setIsApproving(false);
    }
  };

  const handleInitiateReinspection = () => {
    if (!currentInspection) return;
    setParentInspection(currentInspection);
    setActiveImage(null);
    setImageQuality(null);
    setCurrentInspection(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Order Selector */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <ScanEye className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">
              AI Packing Verification Station
            </h2>
            <p className="text-xs text-slate-500">
              Custom YOLO11 Mechanical Component Detection & Order Compliance
            </p>
          </div>
        </div>

        {/* Order Selector Dropdown */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-700">Active Order:</span>
          <select
            value={selectedOrder?.id || ''}
            onChange={(e) => {
              const ord = orders.find((o) => o.id === e.target.value);
              if (ord) onSelectOrder(ord);
            }}
            className="px-3 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Choose Order to Verify --</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_id} – {o.product_name} ({o.status.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Verification Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Expected Checklist & Input (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Expected Bill of Materials Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Step 1 & 2: Bill of Materials
                </span>
                <h3 className="text-sm font-bold text-slate-900">Required Components</h3>
              </div>
              {selectedOrder && <StatusBadge status={selectedOrder.status} size="sm" />}
            </div>

            {selectedOrder ? (
              <div className="space-y-3">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 text-xs">
                  <div className="text-[11px] text-slate-500">Target Product:</div>
                  <div className="font-semibold text-slate-900">{selectedOrder.product_name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                    Ref: {selectedOrder.customer_reference}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Packing Checklist
                  </div>
                  {Object.entries(selectedOrder.expected_components).map(([comp, count]) => (
                    <div
                      key={comp}
                      className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between text-xs"
                    >
                      <span className="font-semibold text-slate-800">{comp}</span>
                      <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {count} required
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                Please select an order above to load expected packing requirements.
              </div>
            )}
          </div>

          {/* Pre-Flight Image Quality Assistant Card */}
          {imageQuality && (
            <div
              className={`p-4 rounded-xl border text-xs space-y-2 ${
                imageQuality.quality_passed
                  ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50/60 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {imageQuality.quality_passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                )}
                <span>
                  {imageQuality.quality_passed
                    ? 'Pre-Flight Image Quality Passed'
                    : 'Image Quality Advisories'}
                </span>
              </div>

              <div className="text-[11px] space-y-1">
                <div>
                  Resolution: <span className="font-mono">{imageQuality.width}x{imageQuality.height}px</span> (Aspect {imageQuality.aspect_ratio}:1)
                </div>
                {imageQuality.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-amber-800">
                    <span>•</span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Capture / Upload Action Controls */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Step 3: Capture Package Image
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleStartCamera}
                className="py-2.5 px-3 rounded-lg border border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Camera className="w-4 h-4 text-blue-600" />
                <span>Station Camera</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="py-2.5 px-3 rounded-lg border border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Upload className="w-4 h-4 text-blue-600" />
                <span>Upload Image</span>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Reinspection linkage indicator if active */}
            {parentInspection && (
              <div className="p-2.5 rounded bg-blue-50 border border-blue-200 text-[11px] text-blue-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                  <span>Linked Reinspection to {parentInspection.inspection_id}</span>
                </div>
                <input
                  type="text"
                  placeholder="Optional notes on parts corrected..."
                  value={reinspectionNotes}
                  onChange={(e) => setReinspectionNotes(e.target.value)}
                  className="w-full mt-1 px-2 py-1 text-[11px] border border-blue-200 rounded bg-white"
                />
              </div>
            )}

            {/* Run Inference Button */}
            <button
              onClick={handleRunInference}
              disabled={!activeImage || !selectedOrder || isInferenceRunning}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              {isInferenceRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Executing YOLO11 Mechanical Inference...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Run AI Packing Verification</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Visual Stage & Verification Decision (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Inference Error Notification */}
          {inferenceError && (
            <div className="p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                <span>Verification Error</span>
              </div>
              <p className="whitespace-pre-line text-[11px] leading-relaxed text-rose-800 font-sans">
                {inferenceError}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => onNavigate('settings')}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-semibold text-xs"
                >
                  Open Model Settings
                </button>
                <button
                  onClick={handleRunInference}
                  className="px-3 py-1.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 rounded font-semibold text-xs"
                >
                  Retry Inference
                </button>
              </div>
            </div>
          )}

          {/* Interactive Inspection Canvas Viewport */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* Viewport Top Bar */}
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-semibold">
                <Eye className="w-4 h-4 text-blue-400" />
                <span>Package Inspection Viewport</span>
              </div>

              {/* View Mode Switcher if Inspection completed */}
              {currentInspection && (
                <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-md">
                  <button
                    onClick={() => setViewMode('annotated')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                      viewMode === 'annotated' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    YOLO Boxes
                  </button>
                  <button
                    onClick={() => setViewMode('original')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                      viewMode === 'original' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Raw Image
                  </button>
                </div>
              )}
            </div>

            {/* Video Stream or Image Display */}
            <div className="relative min-h-[380px] bg-slate-950 flex items-center justify-center overflow-hidden">
              {isCameraActive ? (
                <div className="relative w-full h-full flex flex-col items-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="max-h-[480px] w-full object-contain"
                  />
                  <div className="absolute bottom-4 flex items-center gap-3">
                    <button
                      onClick={handleCaptureSnapshot}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Capture Image for AI</span>
                    </button>
                    <button
                      onClick={handleStopCamera}
                      className="px-4 py-2 bg-slate-800/90 text-white text-xs rounded-full"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : activeImage ? (
                <div className="relative max-h-[500px] w-full flex items-center justify-center p-2">
                  <img
                    src={
                      currentInspection && viewMode === 'annotated'
                        ? currentInspection.annotated_image_path
                        : activeImage
                    }
                    alt="Package verification subject"
                    className="max-h-[480px] max-w-full object-contain rounded"
                  />

                  {/* Inference Completed Watermark overlay tag */}
                  {currentInspection && (
                    <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-xs text-white text-[11px] font-mono px-2.5 py-1 rounded border border-slate-700/60 flex items-center gap-2">
                      <span>Objects: {currentInspection.detections.length}</span>
                      <span>·</span>
                      <span>Model: Custom YOLO11</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center p-12 text-slate-500 space-y-3">
                  <ScanEye className="w-12 h-12 text-slate-700 mx-auto" />
                  <p className="text-xs font-semibold text-slate-400">
                    Ready for Packaging Compartment Image
                  </p>
                  <p className="text-[11px] text-slate-600 max-w-sm">
                    Activate the station camera or upload a package photo to evaluate mechanical parts.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Verification Decision & Compliance Report */}
          {currentInspection && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-5">
              {/* Decision Header Banner */}
              <div
                className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
                  currentInspection.inspection_status === 'PASS'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : currentInspection.inspection_status === 'FAIL'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-amber-50 border-amber-300 text-amber-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={currentInspection.inspection_status} size="lg" />
                  <div>
                    <h3 className="text-sm font-bold leading-tight">
                      {currentInspection.inspection_status === 'PASS'
                        ? 'Package Verification Passed – 100% Match'
                        : currentInspection.inspection_status === 'FAIL'
                        ? 'Verification Failed – Component Count Mismatch'
                        : 'Supervisor Review Required – Ambiguous Verification'}
                    </h3>
                    <p className="text-xs mt-0.5 opacity-90 font-mono">
                      Inspection ID: {currentInspection.inspection_id}
                    </p>
                  </div>
                </div>

                {/* Dispatch Sign-Off Action Button */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => generateInspectionPdf(currentInspection)}
                    className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>Download PDF Certificate</span>
                  </button>

                  {currentInspection.inspection_status === 'PASS' && (
                    <button
                      onClick={handleApproveDispatch}
                      disabled={isApproved || isApproving}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isApproved ? 'Dispatch Authorized' : 'Authorize Dispatch'}</span>
                    </button>
                  )}

                  {currentInspection.inspection_status !== 'PASS' && (
                    <button
                      onClick={handleInitiateReinspection}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Correct & Re-inspect</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Component Audit Table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Component-Wise Breakdown
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Component</th>
                        <th className="py-2.5 px-3 text-right">Expected</th>
                        <th className="py-2.5 px-3 text-right">Detected</th>
                        <th className="py-2.5 px-3 text-right">Confidence</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentInspection.verification_result?.component_results?.map((cr) => (
                        <tr key={cr.component_name} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {cr.component_name}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {cr.expected}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                            {cr.detected}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">
                            {cr.avg_confidence > 0
                              ? `${Math.round(cr.avg_confidence * 100)}%`
                              : '–'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <StatusBadge status={cr.status} size="sm" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Smart Correction Assistant Panel */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>Smart Correction Assistant</span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-700">
                  {currentInspection.verification_result?.corrective_actions?.map((action, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-blue-600 font-bold">•</span>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
