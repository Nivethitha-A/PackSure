import React from 'react';
import {
  Boxes,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ClipboardList,
  ScanEye,
  QrCode,
  ArrowRight,
  TrendingUp,
  FileCheck,
  RefreshCw,
  Info
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { Order, Inspection, AnalyticsData, ModelInfoResponse } from '../types';
import { StatusBadge } from '../components/StatusBadge';

interface DashboardViewProps {
  orders: Order[];
  inspections: Inspection[];
  analytics: AnalyticsData | null;
  modelInfo: ModelInfoResponse | null;
  onNavigate: (tab: string) => void;
  onStartInspection: (order?: Order) => void;
  onOpenQrScanner: () => void;
  onViewInspection: (inspection: Inspection) => void;
}

const STATUS_COLORS: Record<string, string> = {
  PASS: '#16A34A',
  FAIL: '#DC2626',
  NEEDS_REVIEW: '#D97706'
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  orders,
  inspections,
  analytics,
  modelInfo,
  onNavigate,
  onStartInspection,
  onOpenQrScanner,
  onViewInspection
}) => {
  const recentInspections = inspections.slice(0, 5);
  const failedInspections = inspections.filter((i) => i.inspection_status === 'FAIL').slice(0, 3);

  const pieData = analytics
    ? [
        { name: 'PASS', value: analytics.pass_count },
        { name: 'FAIL', value: analytics.fail_count },
        { name: 'NEEDS REVIEW', value: analytics.review_count }
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-6">
      {/* Demo Data Notice Banner */}
      <div className="bg-blue-50/60 border border-blue-200/80 rounded-lg p-3 text-xs text-blue-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            <strong className="font-semibold">Demonstration Mode Active:</strong> Initial orders and inspection logs are realistic industrial demo records. Real YOLO11 inference occurs on newly captured images.
          </span>
        </div>
        <button
          onClick={() => onNavigate('settings')}
          className="text-blue-700 hover:text-blue-900 font-semibold underline whitespace-nowrap shrink-0 ml-4"
        >
          Manage Data & Model
        </button>
      </div>

      {/* Model Status Notification if Not Loaded */}
      {!modelInfo?.model_loaded && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-900">
                Custom YOLO11 Model Weight File (best.pt) Not Yet Loaded
              </h4>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Place your custom trained <code className="bg-amber-100 px-1 py-0.2 rounded font-mono">best.pt</code> in <code className="bg-amber-100 px-1 py-0.2 rounded font-mono">/models/best.pt</code> or upload it via Settings to enable real-time inference.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('settings')}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold whitespace-nowrap shrink-0"
          >
            Upload best.pt
          </button>
        </div>
      )}

      {/* Hero KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Total Orders */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total Orders</span>
            <ClipboardList className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {orders.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {orders.filter((o) => o.status === 'passed').length} verified ready
          </div>
        </div>

        {/* Total Inspections */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Inspections</span>
            <ScanEye className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {inspections.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {inspections.filter((i) => !!i.parent_inspection_id).length} reinspections
          </div>
        </div>

        {/* Packing Accuracy */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Accuracy Rate</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {analytics?.packing_accuracy_percentage ?? 100}%
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1">
            Compliant packaging
          </div>
        </div>

        {/* Passed Inspections */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Passed (PASS)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600">
            {analytics?.pass_count ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Cleared for dispatch
          </div>
        </div>

        {/* Failed Inspections */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Failed (FAIL)</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-rose-600">
            {analytics?.fail_count ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Discrepancies flagged
          </div>
        </div>

        {/* Needs Review */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Needs Review</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-600">
            {analytics?.review_count ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Confidence or image blur
          </div>
        </div>
      </div>

      {/* Quick Industrial Actions Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Station Quick Actions</h3>
          <p className="text-xs text-slate-500">Fast triggers for packaging line operators and QA inspectors</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenQrScanner}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors"
          >
            <QrCode className="w-4 h-4 text-slate-600" />
            <span>Scan Order QR / Barcode</span>
          </button>
          <button
            onClick={() => onNavigate('orders')}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors"
          >
            <Boxes className="w-4 h-4 text-slate-600" />
            <span>Create Packing Order</span>
          </button>
          <button
            onClick={() => onStartInspection()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 shadow-xs transition-colors"
          >
            <ScanEye className="w-4 h-4" />
            <span>Launch AI Inspection</span>
          </button>
        </div>
      </div>

      {/* Visual Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Verification Status Distribution */}
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Inspection Decisions</h3>
          <p className="text-xs text-slate-500 mb-4">Proportion of PASS vs FAIL vs NEEDS REVIEW</p>
          <div className="h-64 flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry) => (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={STATUS_COLORS[entry.name] || '#64748B'}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`${val} inspections`, 'Count']}
                    contentStyle={{ fontSize: '12px', borderRadius: '6px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400">No inspection records logged</div>
            )}
          </div>
        </div>

        {/* Daily Inspection Activity Trends */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-slate-900">7-Day Inspection Volume</h3>
            <span className="text-xs text-slate-500 font-mono">Last 7 Operating Days</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">Inspection throughput categorized by compliance result</p>
          <div className="h-64">
            {analytics?.daily_trends && analytics.daily_trends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.daily_trends}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ fontSize: '12px', borderRadius: '6px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="pass" name="PASS" fill="#16A34A" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="fail" name="FAIL" fill="#DC2626" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="review" name="NEEDS REVIEW" fill="#D97706" stackId="a" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Awaiting daily activity
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Inspections & Active Discrepancy Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Inspections Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden lg:col-span-2">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Packing Inspections</h3>
              <p className="text-xs text-slate-500">Live feed of computer vision verification events</p>
            </div>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <span>View All History</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentInspections.map((insp) => (
              <div
                key={insp.id}
                onClick={() => onViewInspection(insp)}
                className="p-3.5 hover:bg-slate-50/80 transition-colors cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={insp.inspection_status} size="sm" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {insp.inspection_id}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="font-mono text-xs text-slate-600">{insp.order_id}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-sm">
                      {insp.product_name}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {new Date(insp.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Inspector: {insp.inspected_by_name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Failed Inspection Quick-Action / Reinspection Priority */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Reinspection Queue</h3>
              <p className="text-xs text-slate-500">Failed packages awaiting corrective packaging</p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-50 text-rose-700 font-bold">
              {failedInspections.length} Open
            </span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto">
            {failedInspections.length === 0 ? (
              <div className="h-32 flex flex-col items-center justify-center text-center text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-1" />
                <p className="text-xs font-medium text-slate-600">Zero Pending Failures</p>
                <p className="text-[11px] text-slate-400">All inspected packages currently passed</p>
              </div>
            ) : (
              failedInspections.map((fi) => {
                const targetOrder = orders.find((o) => o.order_id === fi.order_id);
                return (
                  <div
                    key={fi.id}
                    className="p-3 rounded-lg border border-rose-200 bg-rose-50/30 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-900">{fi.order_id}</span>
                      <span className="text-[10px] text-rose-600 font-medium">FAIL Flagged</span>
                    </div>

                    <div className="text-[11px] text-slate-600">
                      {fi.verification_result?.corrective_actions?.[0] || 'Discrepancy detected in component count.'}
                    </div>

                    <button
                      onClick={() => onStartInspection(targetOrder)}
                      className="w-full py-1.5 px-2 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Re-inspect Package</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
