import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Boxes, ShieldCheck, ScanEye, Lock, RefreshCw } from 'lucide-react';
import { auth, googleProvider } from '../firebase';

interface LoginViewProps {
  authError?: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({ authError }) => {
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError('');
    setIsLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Sign-in popup was closed before completing authentication.');
      } else if (err?.code === 'auth/popup-blocked') {
        setError('Sign-in popup was blocked by your browser. Please allow popups for this station.');
      } else {
        setError(err?.message || 'Google authentication failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const displayError = error || authError;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-blue-600 selection:text-white">
      <div className="max-w-md w-full space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white shadow-lg mb-2">
            <Boxes className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            PackSure<span className="text-blue-500">.AI</span>
          </h1>
          <p className="text-xs text-slate-400">
            Intelligent AI-Powered Packing Verification System
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="space-y-1 text-center">
            <h2 className="text-sm font-bold text-white">Operator & QA Station Sign In</h2>
            <p className="text-xs text-slate-400">
              Authenticate with your verified Google account to access orders, run YOLO11 inspections, and sign off dispatches.
            </p>
          </div>

          {displayError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              {displayError}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3 px-4 bg-white hover:bg-slate-100 disabled:bg-slate-700 disabled:text-slate-400 text-slate-900 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-3 shadow-sm cursor-pointer"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Verifying Station Credentials...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 gap-2.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Firebase Authentication & Zero-Trust Firestore Rules</span>
            </div>
            <div className="flex items-center gap-2">
              <ScanEye className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Custom YOLO11 Inference (Bearing, Bolt, Gear, Nut)</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Fail-Safe Dispatch Lock Enforced at Database Layer</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
