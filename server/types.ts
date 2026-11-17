export type UserRole = 'admin' | 'inspector' | 'operator';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
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
  order_id: string; // e.g. ORD-1001
  product_name: string;
  customer_reference: string;
  expected_components: Record<string, number>; // e.g. { Bearing: 2, Bolt: 4, Gear: 2, Nut: 4 }
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  inspections_count: number;
  last_inspection_id?: string;
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
  delta: number; // detected - expected
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
  inspection_id: string; // e.g. INSP-2026-001
  order_id: string;
  product_name: string;
  original_image_path: string;
  annotated_image_path: string;
  expected_components: Record<string, number>;
  detected_components: Record<string, number>;
  detections: DetectionItem[];
  verification_result: VerificationResult;
  inspection_status: InspectionStatus;
  inspected_by: string; // user id
  inspected_by_name: string;
  created_at: string;
  parent_inspection_id?: string | null; // For reinspection linkage
  reinspection_notes?: string;
  image_quality?: ImageQualityMetrics;
  digital_signoff?: {
    approved_by: string;
    approved_at: string;
    dispatch_authorization_code: string;
  };
  is_demo?: boolean;
}

export interface SystemSettings {
  confidence_threshold: number; // default 0.50
  iou_threshold: number; // default 0.45
  strict_approval_only: boolean; // default true
  model_path: string; // default "models/best.pt"
  min_image_resolution: number; // default 400
}

export interface ModelInfoResponse {
  model_loaded: boolean;
  model_path: string;
  model_classes: string[];
  framework: string;
  model_name: string;
  load_time_seconds?: number | null;
  error?: string | null;
  instructions: string;
}
