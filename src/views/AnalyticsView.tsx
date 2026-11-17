import React from 'react';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
  BarChart2,
  PieChart as PieIcon,
  Layers,
  Info
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { AnalyticsData } from '../types';

interface AnalyticsViewProps {
  analytics: AnalyticsData | null;
}

const BAR_COLORS = ['#2563EB', '#16A34A', '#D97706', '#9333EA'];

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ analytics }) => {
  if (!analytics) {
    return (
      <div className="py-12 text-center text-xs text-slate-400">
        Loading industrial quality analytics...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-500 shrink-0" />
          <span>
            <strong>Statistical Calculation Basis:</strong> All metrics, Pareto bars, and daily trends are computed in real time from the persistent Firebase Firestore audit log.
          </span>
        </div>
      </div>

      {/* Top Statistical KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Packing Accuracy */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Packing Accuracy
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold font-mono tabular-nums text-slate-900">
            {analytics.packing_accuracy_percentage}%
          </div>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">
            Compliant first-time inspections
          </p>
        </div>

        {/* Reinspection Recovery Rate */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Reinspection Yield
            </span>
            <RefreshCw className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-extrabold font-mono tabular-nums text-blue-600">
            {analytics.reinspection_success_rate}%
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Resolved on correction attempt
          </p>
        </div>

        {/* Most Commonly Missing Part */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Top Missing Part
            </span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-600 truncate">
            {analytics.most_frequently_missing?.component || 'None'}
          </div>
          <p className="text-[11px] text-slate-500 font-mono mt-1">
            {analytics.most_frequently_missing
              ? `${analytics.most_frequently_missing.count} occurrences flagged`
              : 'Zero missing parts'}
          </p>
        </div>

        {/* Most Commonly Extra Part */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Top Extra Part
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600 truncate">
            {analytics.most_frequently_extra?.component || 'None'}
          </div>
          <p className="text-[11px] text-slate-500 font-mono mt-1">
            {analytics.most_frequently_extra
              ? `${analytics.most_frequently_extra.count} occurrences flagged`
              : 'Zero extra parts'}
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Missing Components Pareto Analysis */}
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-slate-900">
              Missing Components Distribution (Defect Pareto)
            </h3>
            <span className="text-xs text-rose-600 font-mono font-semibold">Underfilled</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Frequency of items omitted by packing line operators
          </p>
          <div className="h-64">
            {analytics.missing_components_distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.missing_components_distribution}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                  <Bar dataKey="value" name="Missing Count" fill="#DC2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Zero missing component errors recorded!
              </div>
            )}
          </div>
        </div>

        {/* Extra Components Distribution */}
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-slate-900">
              Extra Components Distribution (Overfill Pareto)
            </h3>
            <span className="text-xs text-amber-600 font-mono font-semibold">Overfilled</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Surplus components accidentally included in packaging kits
          </p>
          <div className="h-64">
            {analytics.extra_components_distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.extra_components_distribution}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                  <Bar dataKey="value" name="Extra Count" fill="#D97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Zero surplus components recorded!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
