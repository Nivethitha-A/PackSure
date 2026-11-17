import React from 'react';
import { User, ModelInfoResponse } from '../types';
import {
  Boxes,
  Cpu,
  CheckCircle2,
  AlertCircle,
  User as UserIcon,
  LogOut,
  ChevronDown
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  currentUser: User | null;
  onLogout: () => void;
  modelInfo: ModelInfoResponse | null;
  onOpenSettings: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  currentUser,
  onLogout,
  modelInfo,
  onOpenSettings
}) => {
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'orders', label: 'Orders' },
    { id: 'inspect', label: 'AI Inspection' },
    { id: 'history', label: 'History & Traceability' },
    { id: 'analytics', label: 'Quality Analytics' },
    { id: 'settings', label: 'Settings & Model' }
  ];

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 shrink-0 z-30">
      {/* Zone 1: Single element brand mark */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => onTabChange('dashboard')}
          className="flex items-center gap-2.5 text-left focus:outline-none group"
        >
          <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold shadow-sm transition-transform group-hover:scale-105">
            <Boxes className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-slate-900 leading-tight">
              PackSure<span className="text-blue-600">.AI</span>
            </div>
            <div className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">
              Intelligent Packing QA
            </div>
          </div>
        </button>
      </div>

      {/* Zone 2: Navigation links */}
      <nav className="hidden lg:flex items-center gap-1">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action / system health & account info */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Model Status Indicator */}
        <button
          onClick={onOpenSettings}
          title="Click to manage YOLO11 model weights (best.pt)"
          className={`flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
            modelInfo?.model_loaded
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
              : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>
            {modelInfo?.model_loaded ? 'YOLO11: Ready' : 'Model: best.pt Missing'}
          </span>
          {modelInfo?.model_loaded ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
          )}
        </button>

        {/* User Profile & Role */}
        {currentUser && (
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-slate-100 transition-colors text-xs text-slate-700"
            >
              <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs uppercase">
                {currentUser.name.slice(0, 2)}
              </div>
              <div className="hidden sm:block text-left">
                <div className="font-semibold text-slate-900 leading-none truncate max-w-[120px]">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-slate-500 capitalize">
                  {currentUser.role}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1.5 z-50">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-900">{currentUser.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
                  <div className="mt-1">
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      Role: {currentUser.role}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  Account & Settings
                </button>

                <div className="border-t border-slate-100 my-1"></div>

                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Log Out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
