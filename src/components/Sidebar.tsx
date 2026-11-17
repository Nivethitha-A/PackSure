import React from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  ScanEye,
  History,
  BarChart3,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Package,
  Layers,
  ArrowRight
} from 'lucide-react';
import { ModelInfoResponse, Order } from '../types';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  orders: Order[];
  modelInfo: ModelInfoResponse | null;
  onStartInspection: (order?: Order) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  orders,
  modelInfo,
  onStartInspection
}) => {
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'in_inspection');

  const menuItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'orders', label: 'Packing Orders', icon: ClipboardList, badge: orders.length },
    { id: 'inspect', label: 'AI Inspection', icon: ScanEye, highlight: true },
    { id: 'history', label: 'Digital Traceability', icon: History },
    { id: 'analytics', label: 'Quality Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings & Model', icon: Sliders }
  ];

  const trainedClasses = [
    { name: 'Bearing', color: '#2563EB', desc: 'Ball Bearings' },
    { name: 'Bolt', color: '#16A34A', desc: 'M8/M10 Hex' },
    { name: 'Gear', color: '#D97706', desc: 'Spur Gears' },
    { name: 'Nut', color: '#9333EA', desc: 'Hex Locknuts' }
  ];

  return (
    <aside className="w-64 bg-slate-950 text-slate-300 border-r border-slate-800 flex flex-col shrink-0 min-h-screen">
      {/* Quick Launch CTA */}
      <div className="p-4 border-b border-slate-800/80">
        <button
          onClick={() => onStartInspection()}
          className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all hover:shadow-blue-900/30"
        >
          <ScanEye className="w-4 h-4" />
          <span>New Inspection</span>
          <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-70" />
        </button>
      </div>

      {/* Main Navigation */}
      <div className="p-3 flex-1 overflow-y-auto space-y-6">
        <div>
          <div className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Workspace
          </div>
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                      {item.badge}
                    </span>
                  )}
                  {item.highlight && !isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Trained YOLO Classes Catalogue */}
        <div className="pt-2 border-t border-slate-800/80">
          <div className="px-3 pb-2 flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            <span>Model Classes (4)</span>
            <span className="text-[9px] text-blue-400 font-mono">best.pt</span>
          </div>
          <div className="space-y-1">
            {trainedClasses.map((cls) => (
              <div
                key={cls.name}
                className="flex items-center justify-between px-3 py-1.5 rounded text-[11px] bg-slate-900/60 border border-slate-800/40"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: cls.color }}
                  ></span>
                  <span className="font-medium text-slate-200">{cls.name}</span>
                </div>
                <span className="text-[10px] text-slate-400">{cls.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Orders Queue */}
        {pendingOrders.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80">
            <div className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase flex items-center justify-between">
              <span>Pending Queue</span>
              <span className="font-mono text-[9px] text-amber-400">{pendingOrders.length}</span>
            </div>
            <div className="space-y-1">
              {pendingOrders.slice(0, 3).map((o) => (
                <button
                  key={o.id}
                  onClick={() => onStartInspection(o)}
                  className="w-full text-left p-2 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800/60 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-slate-200 group-hover:text-blue-400">
                      {o.order_id}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {Object.values(o.expected_components).reduce((a, b) => a + b, 0)} parts
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {o.product_name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* System Diagnostic Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-900/40 text-xs">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-slate-400">YOLO11 Model</span>
          <span
            className={`font-semibold flex items-center gap-1 ${
              modelInfo?.model_loaded ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {modelInfo?.model_loaded ? (
              <>
                <CheckCircle2 className="w-3 h-3" /> Ready
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3" /> Missing best.pt
              </>
            )}
          </span>
        </div>
        <div className="text-[10px] text-slate-400 truncate font-mono">
          {modelInfo?.model_path || 'models/best.pt'}
        </div>
      </div>
    </aside>
  );
};
