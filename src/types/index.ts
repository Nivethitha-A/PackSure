export type UserRole = 'admin' | 'inspector' | 'operator';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  createdAt: string;
  lastLogin?: string;
}

export interface ComponentDefinition {
  id: string;
  component_name: string;
  model_class_name: string;
  description: string;
  active: boolean;
  color: string;
}

export type OrderStatus = 'pending' | 'in_inspection' | 'passed' | 'failed' | 'needs_review';

export interface Order {
  id: string;
  order_id: string;
  product_name: string;
  customer_reference: string;
  expected_components: Record<string, number>;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  inspections_count: number;
  last_inspection_id?: string;
  createdBy?: string;
  is_demo?: boolean;
}

export interface BoundingBox {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  bbox_normalized: [number, number, number, number];
}

export interface DetectionItem extends BoundingBox {
  class_name: string;
  confidence: number;
}

export type ComponentStatus = 'MATCH' | 'MISSING' | 'EXTRA' | 'UNCERTAIN';

export interface ComponentVerificationItem {
  component_name: string;
  expected: number;
  detected: number;
  status: ComponentStatus;
  delta: number;
  min_confidence: number;
  avg_confidence: number;
  is_uncertain: boolean;
}

export type InspectionStatus = 'PASS' | 'FAIL' | 'NEEDS_REVIEW';

export interface VerificationResult {
  overall_status: InspectionStatus;
  component_results: ComponentVerificationItem[];
  missing_components: Record<string, number>;
  extra_components: Record<string, number>;
  uncertainty_flags: string[];
  corrective_actions: string[];
  can_approve: boolean;
  approval_block_reason?: string;
  confidence_threshold_applied: number;
}

export interface ImageQualityMetrics {
  width: number;
  height: number;
  aspect_ratio: number;
  estimated_blur_score?: number;
  brightness_score?: number;
  quality_passed: boolean;
  warnings: string[];
}

export interface Inspection {
  id: string;
  inspection_id: string;
  order_id: string;
  order_doc_id?: string;
  product_name: string;
  original_image_path: string;
  annotated_image_path: string;
  expected_components: Record<string, number>;
  detected_components: Record<string, number>;
  detections: DetectionItem[];
  verification_result: VerificationResult;
  inspection_status: InspectionStatus;
  inspected_by: string;
  inspected_by_name: string;
  created_at: string;
  updated_at?: string;
  parent_inspection_id?: string | null;
  reinspection_notes?: string;
  image_quality?: ImageQualityMetrics;
  digital_signoff?: {
    approved_by: string;
    approved_by_uid?: string;
    approved_at: string;
    dispatch_authorization_code: string;
  };
  is_demo?: boolean;
}

export interface SystemSettings {
  confidence_threshold: number;
  iou_threshold: number;
  strict_approval_only: boolean;
  model_path: string;
  min_image_resolution: number;
}

export interface ModelInfoResponse {
  model_loaded: boolean;
  model_path: string;
  configured_path?: string;
  model_classes: string[];
  framework: string;
  model_name: string;
  load_time_seconds?: number | null;
  error?: string | null;
  instructions: string;
  file_exists_on_disk?: boolean;
  file_readable?: boolean;
  file_size_bytes?: number;
  full_disk_path?: string;
}

export interface AnalyticsData {
  total_orders: number;
  total_inspections: number;
  pass_count: number;
  fail_count: number;
  review_count: number;
  packing_accuracy_percentage: number;
  failure_percentage: number;
  review_percentage: number;
  most_frequently_missing: { component: string; count: number } | null;
  most_frequently_extra: { component: string; count: number } | null;
  missing_components_distribution: { name: string; value: number }[];
  extra_components_distribution: { name: string; value: number }[];
  daily_trends: { date: string; pass: number; fail: number; review: number }[];
  reinspections_count: number;
  reinspection_success_rate: number;
}
