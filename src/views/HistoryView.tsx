import React, { useState } from 'react';
import {
  History,
  Search,
  Filter,
  Download,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  X,
  FileCheck,
  ShieldCheck
} from 'lucide-react';
import { Inspection } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { generateInspectionPdf } from '../utils/pdfExport';

interface HistoryViewProps {
  inspections: Inspection[];
  onViewInspection: (inspection: Inspection) => void;
  onReinspect: (inspection: Inspection) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  inspections,
  onViewInspection,
  onReinspect
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);

  const filtered = inspections.filter((insp) => {
    const term = search.toLowerCase();
    const matchesSearch =
      insp.inspection_id.toLowerCase().includes(term) ||
      insp.order_id.toLowerCase().includes(term) ||
      insp.product_name.toLowerCase().includes(term) ||
      insp.inspected_by_name.toLowerCase().includes(term);

    const matchesStatus = statusFilter === 'all' || insp.inspection_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Digital Quality Traceability Audit Log
          </h2>
          <p className="text-xs text-slate-500">
            Immutable log of all AI packing inspections, visual bounding box artifacts, and compliance decisions
          </p>
        </div>

        <div className="text-xs text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
          Total Records: <strong className="font-mono text-slate-900">{inspections.length}</strong>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by Inspection ID, Order, Product, Inspector..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
          {['all', 'PASS', 'FAIL', 'NEEDS_REVIEW'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 capitalize ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'all' ? 'All' : st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
              <tr>
                <th className="py-3 px-4">Inspection ID</th>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Decision</th>
                <th className="py-3 px-4">Detections</th>
                <th className="py-3 px-4">Inspector</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-right">Certificate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No inspection records found.
                  </td>
                </tr>
              ) : (
                filtered.map((insp) => (
                  <tr
                    key={insp.id}
                    onClick={() => setSelectedInspection(insp)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>{insp.inspection_id}</span>
                        {insp.parent_inspection_id && (
                          <span
                            title={`Reinspection of ${insp.parent_inspection_id}`}
                            className="p-0.5 rounded bg-blue-50 text-blue-600"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-700">
                      {insp.order_id}
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-medium">
                      {insp.product_name}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={insp.inspection_status} size="sm" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600">
                        <span>{insp.detections?.length || 0} items</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {insp.inspected_by_name}
                    </td>
                    <td className="py-3 px-4 text-slate-500 tabular-nums">
                      {new Date(insp.created_at).toLocaleString([], {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => generateInspectionPdf(insp)}
                        title="Download PDF Quality Report"
                        className="px-2.5 py-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded text-xs font-medium inline-flex items-center gap-1 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>PDF</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedInspection && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedInspection.inspection_status} size="md" />
                <div>
                  <h3 className="text-sm font-bold font-mono text-white">
                    {selectedInspection.inspection_id}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Order: {selectedInspection.order_id} · {selectedInspection.product_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedInspection(null)}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {/* Image Preview & Annotations */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-1">
                    Annotated YOLO11 Detection
                  </div>
                  <div className="aspect-video bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center border border-slate-200">
                    <img
                      src={selectedInspection.annotated_image_path}
                      alt="Annotated detection"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-1">
                    Raw Packaging Tray Image
                  </div>
                  <div className="aspect-video bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center border border-slate-200">
                    <img
                      src={selectedInspection.original_image_path}
                      alt="Raw package"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
              </div>

              {/* Component Audit Table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Component Verification Audit
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase">
                      <tr>
                        <th className="py-2 px-3">Component</th>
                        <th className="py-2 px-3 text-right">Expected</th>
                        <th className="py-2 px-3 text-right">Detected</th>
                        <th className="py-2 px-3 text-right">Delta</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedInspection.verification_result?.component_results?.map((cr) => (
                        <tr key={cr.component_name}>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            {cr.component_name}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{cr.expected}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">
                            {cr.detected}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {cr.delta > 0 ? `+${cr.delta}` : cr.delta}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <StatusBadge status={cr.status} size="sm" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Corrective Guidance */}
              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5">
                <div className="font-bold text-slate-900">Corrective Guidance:</div>
                {selectedInspection.verification_result?.corrective_actions?.map((act, i) => (
                  <p key={i} className="text-slate-700">
                    • {act}
                  </p>
                ))}
              </div>

              {/* Digital Sign-off if approved */}
              {selectedInspection.digital_signoff && (
                <div className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-950 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Dispatch Sign-off Completed</span>
                  </div>
                  <p className="text-[11px]">
                    Authorized by: <strong>{selectedInspection.digital_signoff.approved_by}</strong> on{' '}
                    {new Date(selectedInspection.digital_signoff.approved_at).toLocaleString()}
                  </p>
                  <p className="font-mono text-[10px] text-emerald-700">
                    Authorization Code: {selectedInspection.digital_signoff.dispatch_authorization_code}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                onClick={() => generateInspectionPdf(selectedInspection)}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF Inspection Certificate</span>
              </button>

              <div className="flex items-center gap-2">
                {selectedInspection.inspection_status !== 'PASS' && (
                  <button
                    onClick={() => {
                      const target = selectedInspection;
                      setSelectedInspection(null);
                      onReinspect(target);
                    }}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Initiate Reinspection</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedInspection(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
