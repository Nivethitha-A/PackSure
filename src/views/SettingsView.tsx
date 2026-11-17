import React, { useState, useRef, useEffect } from 'react';
import {
  Cpu,
  Upload,
  CheckCircle2,
  AlertCircle,
  Shield,
  Sliders,
  Database,
  Users,
  RefreshCw,
  FolderOpen,
  Info,
  Server,
  Layers,
  Sparkles
} from 'lucide-react';
import { auth } from '../firebase';
import { ModelInfoResponse, SystemSettings, User, UserRole } from '../types';

interface SettingsViewProps {
  modelInfo: ModelInfoResponse | null;
  settings: SystemSettings | null;
  currentUser: User | null;
  users: User[];
  onUpdateSettings: (settings: Partial<SystemSettings>) => Promise<void>;
  onRefreshModel: () => Promise<void>;
  onResetDemo: () => Promise<void>;
  onUpdateUserRole: (user: User, role: UserRole) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  modelInfo,
  settings,
  currentUser,
  users,
  onUpdateSettings,
  onRefreshModel,
  onResetDemo,
  onUpdateUserRole
}) => {
  const [confThreshold, setConfThreshold] = useState(
    settings ? Math.round(settings.confidence_threshold * 100) : 50
  );
  const [iouThreshold, setIouThreshold] = useState(
    settings ? Math.round(settings.iou_threshold * 100) : 45
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState('');
  const [settingsError, setSettingsError] = useState('');

  // Model upload state
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const modelFileInputRef = useRef<HTMLInputElement>(null);

  // Demo reset & RBAC status
  const [isResettingDemo, setIsResettingDemo] = useState(false);
  const [demoResetMsg, setDemoResetMsg] = useState('');
  const [roleUpdatingUid, setRoleUpdatingUid] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setConfThreshold(Math.round(settings.confidence_threshold * 100));
      setIouThreshold(Math.round(settings.iou_threshold * 100));
    }
  }, [settings]);

  const isAdmin = currentUser?.role === 'admin';

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setSettingsSavedMessage('');
    setSettingsError('');
    try {
      await onUpdateSettings({
        confidence_threshold: Number((confThreshold / 100).toFixed(2)),
        iou_threshold: Number((iouThreshold / 100).toFixed(2))
      });
      setSettingsSavedMessage('Settings successfully saved to Firestore.');
      setTimeout(() => setSettingsSavedMessage(''), 3000);
    } catch (err: any) {
      setSettingsError(err.message || 'Unable to save settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleModelFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pt') && !file.name.endsWith('.onnx')) {
      setUploadError('Invalid model file format. Expected a YOLO weights file ending in .onnx or .pt.');
      return;
    }

    setIsUploadingModel(true);
    setUploadError(null);
    setUploadMessage(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) {
          throw new Error('Authentication session required to upload model weights.');
        }

        const res = await fetch('/api/model/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify({ file_base64: dataUrl, filename: file.name })
        });
        const data = await res.json();
        if (res.ok) {
          setUploadMessage(`Successfully uploaded and loaded custom model "${file.name}".`);
          await onRefreshModel();
        } else {
          setUploadError(data.error || 'Failed to upload model file.');
        }
      } catch (err: any) {
        setUploadError(`Upload failure: ${err.message}`);
      } finally {
        setIsUploadingModel(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRoleChange = async (targetUser: User, newRole: UserRole) => {
    setRoleUpdatingUid(targetUser.id);
    try {
      await onUpdateUserRole(targetUser, newRole);
    } catch (err: any) {
      setSettingsError(`Role update failed: ${err.message}`);
    } finally {
      setRoleUpdatingUid(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">System Settings & AI Model Management</h2>
        <p className="text-xs text-slate-500">
          Configure YOLO11 inference parameters, upload custom weights, and manage station credentials
        </p>
      </div>

      {/* Model Weights Manager (Focal Section) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-sm font-bold">Custom YOLO11 Mechanical Model (best.pt)</h3>
              <p className="text-[11px] text-slate-400">Ultralytics YOLO11 trained on industrial mechanical components</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold ${
                modelInfo?.model_loaded
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {modelInfo?.model_loaded ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Model Loaded & Active</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Model Not Loaded</span>
                </>
              )}
            </span>

            <button
              onClick={onRefreshModel}
              title="Re-check model file on disk"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Configured Model Path
              </span>
              <p className="font-mono font-bold text-slate-800 mt-0.5 truncate" title={modelInfo?.model_path}>
                {modelInfo?.configured_path || modelInfo?.model_path || 'models/best.onnx'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                File status:{' '}
                <strong className={modelInfo?.file_exists_on_disk && modelInfo?.file_readable !== false ? 'text-emerald-600' : 'text-rose-600'}>
                  {modelInfo?.file_exists_on_disk
                    ? modelInfo?.file_readable !== false
                      ? `Readable (${((modelInfo.file_size_bytes || 0) / (1024 * 1024)).toFixed(1)} MB)`
                      : 'Exists (Not Readable)'
                    : 'Not Found'}
                </strong>
              </p>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Inference Framework
              </span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {modelInfo?.framework || 'ONNX Runtime (Node.js - Ultralytics YOLO11)'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Execution: <strong className="text-emerald-600">In-Process Node.js Engine</strong>
              </p>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Supported Trained Classes (4)
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {['Bearing', 'Bolt', 'Gear', 'Nut'].map((c) => (
                  <span
                    key={c}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-semibold"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Model Upload Area */}
          <div className="p-5 border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-400 bg-slate-50/50 transition-colors text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                Upload or Replace Model Weights (best.pt)
              </h4>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto mt-0.5">
                Select your trained PyTorch YOLO model weights file. Once uploaded, PackSure AI will automatically reload the model into memory.
              </p>
            </div>

            <input
              ref={modelFileInputRef}
              type="file"
              accept=".pt,.onnx"
              onChange={handleModelFileUpload}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => modelFileInputRef.current?.click()}
              disabled={isUploadingModel}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 shadow-xs transition-colors"
            >
              {isUploadingModel ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Uploading & Initializing YOLO11...</span>
                </>
              ) : (
                <>
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Select best.pt File</span>
                </>
              )}
            </button>

            {uploadMessage && (
              <p className="text-xs text-emerald-600 font-medium">{uploadMessage}</p>
            )}
            {uploadError && (
              <p className="text-xs text-rose-600 font-medium">{uploadError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Verification Engine Thresholds */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6 shadow-2xs">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Verification Engine Thresholds</h3>
            <p className="text-xs text-slate-500">Tune industrial quality-assurance tolerance limits</p>
          </div>
          {settingsSavedMessage && (
            <span className="text-xs text-emerald-600 font-semibold">{settingsSavedMessage}</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Confidence Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-700">Minimum Confidence Threshold</label>
              <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                {confThreshold}%
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="95"
              step="5"
              value={confThreshold}
              onChange={(e) => setConfThreshold(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <p className="text-[11px] text-slate-400">
              Detections scored below this percentage will trigger <span className="font-semibold text-amber-600">NEEDS REVIEW</span> status.
            </p>
          </div>

          {/* IoU NMS Threshold */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-700">IoU (Non-Max Suppression) Threshold</label>
              <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                {iouThreshold}%
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="80"
              step="5"
              value={iouThreshold}
              onChange={(e) => setIouThreshold(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <p className="text-[11px] text-slate-400">
              Controls overlap suppression between tightly grouped mechanical components.
            </p>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between gap-4">
          <div className="text-xs">
            {settingsError && <span className="text-rose-600 font-semibold">{settingsError}</span>}
            {!isAdmin && !settingsError && (
              <span className="text-slate-500">
                Administrator role required to persist global threshold updates.
              </span>
            )}
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={isSavingSettings || !isAdmin}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors shadow-2xs"
          >
            {isSavingSettings ? 'Saving...' : 'Apply Threshold Changes'}
          </button>
        </div>
      </div>

      {/* Admin User Management */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">User Access Control (RBAC)</h3>
              <p className="text-xs text-slate-500">
                Station personnel sign in with Google Authentication; assign operational roles here
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded">
              {users.length} Registered
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {users.map((u) => {
              const isSelf = u.id === currentUser?.id;
              return (
                <div key={u.id} className="py-2.5 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center gap-2">
                      <span>{u.name}</span>
                      {isSelf && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">{u.email}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={u.role}
                      disabled={isSelf || roleUpdatingUid === u.id}
                      onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                      className="px-2.5 py-1 border border-slate-200 rounded bg-slate-50 text-[11px] font-semibold text-slate-700 disabled:opacity-60"
                    >
                      <option value="operator">Operator</option>
                      <option value="inspector">Inspector</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Demo Reset */}
      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs gap-4">
        <div>
          <h4 className="font-bold text-slate-900">Reset Demonstration Records</h4>
          <p className="text-[11px] text-slate-500">
            Restores the 5 factory demonstration orders and sample inspections in your Firestore workspace.
          </p>
          {demoResetMsg && (
            <p className="text-[11px] text-emerald-600 font-semibold mt-1">{demoResetMsg}</p>
          )}
        </div>
        <button
          disabled={isResettingDemo}
          onClick={async () => {
            setIsResettingDemo(true);
            setDemoResetMsg('');
            try {
              await onResetDemo();
              setDemoResetMsg('Demonstration records restored in Firestore.');
              setTimeout(() => setDemoResetMsg(''), 3000);
            } finally {
              setIsResettingDemo(false);
            }
          }}
          className="px-3 py-1.5 border border-slate-300 hover:bg-white disabled:opacity-50 text-slate-700 rounded font-semibold text-xs transition-colors shrink-0"
        >
          {isResettingDemo ? 'Restoring...' : 'Reset Demo Data'}
        </button>
      </div>
    </div>
  );
};
