import React from 'react';
import { InspectionStatus, ComponentStatus, OrderStatus } from '../types';
import { CheckCircle2, XCircle, AlertTriangle, Clock, ShieldCheck, RefreshCw } from 'lucide-react';

interface StatusBadgeProps {
  status: InspectionStatus | ComponentStatus | OrderStatus | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true
}) => {
  const norm = String(status).toUpperCase();

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold'
  }[size];

  if (norm === 'PASS' || norm === 'PASSED' || norm === 'MATCH') {
    return (
      <span className={`inline-flex items-center font-medium rounded border border-emerald-200 bg-emerald-50 text-emerald-800 ${sizeClasses}`}>
        {showIcon && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
        <span>{norm === 'MATCH' ? 'MATCH' : 'PASS'}</span>
      </span>
    );
  }

  if (norm === 'FAIL' || norm === 'FAILED' || norm === 'MISSING') {
    return (
      <span className={`inline-flex items-center font-medium rounded border border-rose-200 bg-rose-50 text-rose-800 ${sizeClasses}`}>
        {showIcon && <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
        <span>{norm}</span>
      </span>
    );
  }

  if (norm === 'EXTRA') {
    return (
      <span className={`inline-flex items-center font-medium rounded border border-amber-200 bg-amber-50 text-amber-800 ${sizeClasses}`}>
        {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
        <span>EXTRA</span>
      </span>
    );
  }

  if (norm === 'NEEDS_REVIEW' || norm === 'UNCERTAIN') {
    return (
      <span className={`inline-flex items-center font-medium rounded border border-amber-300 bg-amber-50 text-amber-900 ${sizeClasses}`}>
        {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
        <span>{norm === 'UNCERTAIN' ? 'UNCERTAIN' : 'NEEDS REVIEW'}</span>
      </span>
    );
  }

  if (norm === 'PENDING') {
    return (
      <span className={`inline-flex items-center font-medium rounded border border-slate-200 bg-slate-100 text-slate-700 ${sizeClasses}`}>
        {showIcon && <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
        <span>PENDING</span>
      </span>
    );
  }

  if (norm === 'IN_INSPECTION') {
    return (
      <span className={`inline-flex items-center font-medium rounded border border-blue-200 bg-blue-50 text-blue-700 ${sizeClasses}`}>
        {showIcon && <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />}
        <span>INSPECTING</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center font-medium rounded border border-slate-200 bg-slate-50 text-slate-700 ${sizeClasses}`}>
      <span>{status}</span>
    </span>
  );
};
