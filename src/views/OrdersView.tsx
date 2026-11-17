import React, { useState } from 'react';
import {
  Boxes,
  Plus,
  Search,
  Filter,
  CheckSquare,
  QrCode,
  ArrowRight,
  Edit2,
  Trash2,
  Eye,
  FileText,
  Printer,
  X
} from 'lucide-react';
import { Order, ComponentDefinition, OrderStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';

interface OrdersViewProps {
  orders: Order[];
  components: ComponentDefinition[];
  onCreateOrder: (order: Partial<Order>) => Promise<void>;
  onUpdateOrder: (id: string, updates: Partial<Order>) => Promise<void>;
  onInspectOrder: (order: Order) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  components,
  onCreateOrder,
  onUpdateOrder,
  onInspectOrder
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [qrModalOrder, setQrModalOrder] = useState<Order | null>(null);

  // Form State
  const [formOrderId, setFormOrderId] = useState('');
  const [formProductName, setFormProductName] = useState('');
  const [formCustomerRef, setFormCustomerRef] = useState('');
  const [formComponents, setFormComponents] = useState<Record<string, number>>({
    Bearing: 2,
    Bolt: 4,
    Gear: 2,
    Nut: 4
  });
  const [formError, setFormError] = useState('');

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.order_id.toLowerCase().includes(search.toLowerCase()) ||
      o.product_name.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_reference.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleComponentQtyChange = (compName: string, delta: number) => {
    setFormComponents((prev) => {
      const current = prev[compName] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [compName]: next };
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formOrderId.trim()) {
      setFormError('Order ID is required.');
      return;
    }
    if (!formProductName.trim()) {
      setFormError('Product Name is required.');
      return;
    }

    const totalParts = Object.values(formComponents).reduce((a, b) => a + b, 0);
    if (totalParts === 0) {
      setFormError('Please specify at least 1 expected component.');
      return;
    }

    // Filter out zero quantities
    const cleanComponents: Record<string, number> = {};
    for (const [k, v] of Object.entries(formComponents)) {
      if (v > 0) cleanComponents[k] = v;
    }

    try {
      await onCreateOrder({
        order_id: formOrderId.trim().toUpperCase(),
        product_name: formProductName.trim(),
        customer_reference: formCustomerRef.trim() || 'General Assembly Dispatch',
        expected_components: cleanComponents,
        status: 'pending'
      });
      setIsCreateOpen(false);
      // Reset form
      setFormOrderId('');
      setFormProductName('');
      setFormCustomerRef('');
      setFormComponents({ Bearing: 2, Bolt: 4, Gear: 2, Nut: 4 });
    } catch (err: any) {
      setFormError(err.message || 'Failed to create order');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Packing Order Management</h2>
          <p className="text-xs text-slate-500">
            Define bills of materials, manage shipment references, and generate QR verification tags
          </p>
        </div>

        <button
          onClick={() => {
            setFormOrderId(`ORD-${1000 + orders.length + 1}`);
            setIsCreateOpen(true);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 shadow-xs transition-colors shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Order</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Order ID, Product, or Customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
          {['all', 'pending', 'passed', 'failed', 'needs_review'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 capitalize ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'all' ? 'All Orders' : st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
              <tr>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Customer Ref</th>
                <th className="py-3 px-4">Bill of Materials</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">QR Tag</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No orders matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const totalComponents = Object.values(order.expected_components).reduce(
                    (a, b) => a + b,
                    0
                  );

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {order.order_id}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {order.product_name}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {order.customer_reference}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(order.expected_components).map(([c, qty]) => (
                            <span
                              key={c}
                              className="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              <span>{c}:</span>
                              <strong className="text-slate-900 font-bold">{qty}</strong>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={order.status} size="sm" />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setQrModalOrder(order)}
                          title="Generate & View QR Code"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors inline-flex items-center"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="px-2.5 py-1 text-slate-700 hover:bg-slate-100 rounded text-xs font-medium transition-colors"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => onInspectOrder(order)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <span>Inspect</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Order Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold">Create New Packing Order</h3>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Order ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={formOrderId}
                    onChange={(e) => setFormOrderId(e.target.value)}
                    placeholder="e.g. ORD-1006"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Product / Assembly *
                  </label>
                  <input
                    type="text"
                    required
                    value={formProductName}
                    onChange={(e) => setFormProductName(e.target.value)}
                    placeholder="e.g. Gearbox Kit Rev 3"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Customer / Shipment Reference
                </label>
                <input
                  type="text"
                  value={formCustomerRef}
                  onChange={(e) => setFormCustomerRef(e.target.value)}
                  placeholder="e.g. PO-99201 / European Dispatch"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Bill of Materials Builder */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Required Components & Expected Quantities (YOLO11 Classes)
                </label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {['Bearing', 'Bolt', 'Gear', 'Nut'].map((c) => {
                    const qty = formComponents[c] || 0;
                    return (
                      <div
                        key={c}
                        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between"
                      >
                        <span className="text-xs font-semibold text-slate-800">{c}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleComponentQtyChange(c, -1)}
                            className="w-6 h-6 rounded bg-white border border-slate-300 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-100 text-xs"
                          >
                            -
                          </button>
                          <span className="font-mono text-xs font-bold w-5 text-center">{qty}</span>
                          <button
                            type="button"
                            onClick={() => handleComponentQtyChange(c, 1)}
                            className="w-6 h-6 rounded bg-white border border-slate-300 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-100 text-xs"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded shadow-xs"
                >
                  Save Packing Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Details Drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="font-mono text-xs text-blue-400 font-bold">{selectedOrder.order_id}</span>
                <h3 className="text-sm font-bold text-white mt-0.5">{selectedOrder.product_name}</h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Customer / Destination
                </span>
                <p className="text-xs text-slate-800 font-medium">{selectedOrder.customer_reference}</p>
              </div>

              {/* Checklist */}
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Packing Checklist (Bill of Materials)
                </span>
                <div className="mt-2 space-y-1.5">
                  {Object.entries(selectedOrder.expected_components).map(([comp, qty]) => (
                    <div
                      key={comp}
                      className="p-2 rounded border border-slate-100 bg-slate-50 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-slate-800">{comp}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-900">
                        {qty} required
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <StatusBadge status={selectedOrder.status} />
                <button
                  onClick={() => {
                    const o = selectedOrder;
                    setSelectedOrder(null);
                    onInspectOrder(o);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold flex items-center gap-1.5"
                >
                  <span>Start Verification</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Inspection Tag Modal */}
      {qrModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 text-center p-6 space-y-4">
            <div className="flex justify-between items-center text-left">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  PackSure AI Order Tag
                </h4>
                <p className="font-mono font-bold text-sm text-slate-900">{qrModalOrder.order_id}</p>
              </div>
              <button
                onClick={() => setQrModalOrder(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Simulated Industrial QR Code Graphic */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-40 h-40">
                {/* QR Finder Corners */}
                <rect x="5" y="5" width="26" height="26" fill="#0F172A" rx="2" />
                <rect x="9" y="9" width="18" height="18" fill="#FFFFFF" />
                <rect x="13" y="13" width="10" height="10" fill="#0F172A" />

                <rect x="69" y="5" width="26" height="26" fill="#0F172A" rx="2" />
                <rect x="73" y="9" width="18" height="18" fill="#FFFFFF" />
                <rect x="77" y="13" width="10" height="10" fill="#0F172A" />

                <rect x="5" y="69" width="26" height="26" fill="#0F172A" rx="2" />
                <rect x="9" y="73" width="18" height="18" fill="#FFFFFF" />
                <rect x="13" y="77" width="10" height="10" fill="#0F172A" />

                {/* Data Matrix Dots */}
                <rect x="36" y="8" width="6" height="6" fill="#0F172A" />
                <rect x="48" y="12" width="6" height="6" fill="#0F172A" />
                <rect x="58" y="18" width="6" height="6" fill="#0F172A" />
                <rect x="38" y="24" width="6" height="6" fill="#0F172A" />
                <rect x="10" y="40" width="6" height="6" fill="#0F172A" />
                <rect x="22" y="44" width="6" height="6" fill="#0F172A" />
                <rect x="36" y="40" width="6" height="6" fill="#2563EB" />
                <rect x="48" y="40" width="6" height="6" fill="#2563EB" />
                <rect x="58" y="44" width="6" height="6" fill="#2563EB" />
                <rect x="70" y="40" width="6" height="6" fill="#0F172A" />
                <rect x="84" y="42" width="6" height="6" fill="#0F172A" />
                <rect x="40" y="60" width="6" height="6" fill="#0F172A" />
                <rect x="52" y="58" width="6" height="6" fill="#0F172A" />
                <rect x="62" y="64" width="6" height="6" fill="#0F172A" />
                <rect x="40" y="76" width="6" height="6" fill="#0F172A" />
                <rect x="52" y="80" width="6" height="6" fill="#0F172A" />
                <rect x="74" y="74" width="6" height="6" fill="#0F172A" />
                <rect x="86" y="84" width="6" height="6" fill="#0F172A" />
              </svg>
              <div className="text-[10px] text-slate-500 font-mono mt-2">
                Order Data Token: PACKSURE-{qrModalOrder.order_id}
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Attach this barcode to the packaging container for direct camera scanning.
            </p>

            <button
              onClick={() => window.print()}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Print Packing Slip Tag</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
