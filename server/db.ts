import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  User,
  Order,
  Inspection,
  ComponentDefinition,
  SystemSettings
} from './types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'packsure_db.json');

interface DatabaseSchema {
  users: User[];
  orders: Order[];
  inspections: Inspection[];
  components: ComponentDefinition[];
  settings: SystemSettings;
}

// Simple deterministic hash for demo passwords
export function hashPassword(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

const DEFAULT_COMPONENTS: ComponentDefinition[] = [
  {
    id: 'comp-1',
    component_name: 'Bearing',
    model_class_name: 'Bearing',
    description: 'Deep groove ball bearing for rotary mechanical assemblies.',
    active: true,
    color: '#2563EB' // blue
  },
  {
    id: 'comp-2',
    component_name: 'Bolt',
    model_class_name: 'Bolt',
    description: 'High-tensile hexagonal head M8/M10 structural bolt.',
    active: true,
    color: '#16A34A' // green
  },
  {
    id: 'comp-3',
    component_name: 'Gear',
    model_class_name: 'Gear',
    description: 'Precision spur gear with involute tooth profile.',
    active: true,
    color: '#D97706' // amber
  },
  {
    id: 'comp-4',
    component_name: 'Nut',
    model_class_name: 'Nut',
    description: 'Heavy hex locknut matching M8/M10 thread pitch.',
    active: true,
    color: '#9333EA' // purple
  }
];

const DEFAULT_USERS: User[] = [
  {
    id: 'usr-admin-01',
    name: 'Marcus Vance',
    email: 'admin@packsure.ai',
    passwordHash: hashPassword('admin123'),
    role: 'admin',
    createdAt: '2026-01-10T08:00:00Z',
    lastLogin: '2026-11-12T06:15:00Z'
  },
  {
    id: 'usr-insp-01',
    name: 'Elena Rostova',
    email: 'inspector@packsure.ai',
    passwordHash: hashPassword('inspect123'),
    role: 'inspector',
    createdAt: '2026-02-01T08:00:00Z',
    lastLogin: '2026-11-12T05:30:00Z'
  },
  {
    id: 'usr-oper-01',
    name: 'Devon Miller',
    email: 'operator@packsure.ai',
    passwordHash: hashPassword('pack123'),
    role: 'operator',
    createdAt: '2026-03-15T08:00:00Z',
    lastLogin: '2026-11-12T06:00:00Z'
  }
];

const DEFAULT_SETTINGS: SystemSettings = {
  confidence_threshold: 0.50,
  iou_threshold: 0.45,
  strict_approval_only: true,
  model_path: 'models/best.pt',
  min_image_resolution: 400
};

// Seed realistic industrial demonstration orders
const DEFAULT_ORDERS: Order[] = [
  {
    id: 'ord-1001',
    order_id: 'ORD-1001',
    product_name: 'Mechanical Drive Assembly A',
    customer_reference: 'Apex Aerospace / PO-8842',
    expected_components: {
      Bearing: 2,
      Bolt: 4,
      Gear: 2,
      Nut: 4
    },
    status: 'passed',
    created_at: '2026-11-10T09:00:00Z',
    updated_at: '2026-11-11T14:20:00Z',
    inspections_count: 2,
    last_inspection_id: 'INSP-2026-1001-B',
    is_demo: true
  },
  {
    id: 'ord-1002',
    order_id: 'ORD-1002',
    product_name: 'Heavy Transmission Sub-Kit B',
    customer_reference: 'Nordic Turbines / NT-4011',
    expected_components: {
      Bearing: 4,
      Bolt: 8,
      Gear: 4,
      Nut: 8
    },
    status: 'failed',
    created_at: '2026-11-11T10:15:00Z',
    updated_at: '2026-11-12T05:40:00Z',
    inspections_count: 1,
    last_inspection_id: 'INSP-2026-1002-A',
    is_demo: true
  },
  {
    id: 'ord-1003',
    order_id: 'ORD-1003',
    product_name: 'Planetary Reducer Coupling 50mm',
    customer_reference: 'Siemens Robotics / SR-9921',
    expected_components: {
      Bearing: 3,
      Bolt: 6,
      Gear: 3,
      Nut: 6
    },
    status: 'needs_review',
    created_at: '2026-11-11T11:30:00Z',
    updated_at: '2026-11-12T04:22:00Z',
    inspections_count: 1,
    last_inspection_id: 'INSP-2026-1003-A',
    is_demo: true
  },
  {
    id: 'ord-1004',
    order_id: 'ORD-1004',
    product_name: 'High-Tensile Flange Fastener Pack',
    customer_reference: 'HydraTech Dynamics / HT-12',
    expected_components: {
      Bolt: 6,
      Nut: 6
    },
    status: 'pending',
    created_at: '2026-11-12T02:00:00Z',
    updated_at: '2026-11-12T02:00:00Z',
    inspections_count: 0,
    is_demo: true
  },
  {
    id: 'ord-1005',
    order_id: 'ORD-1005',
    product_name: 'Precision Spindle Shaft Kit S4',
    customer_reference: 'Kuka Automation / KA-773',
    expected_components: {
      Bearing: 2,
      Bolt: 4,
      Gear: 1,
      Nut: 4
    },
    status: 'pending',
    created_at: '2026-11-12T04:00:00Z',
    updated_at: '2026-11-12T04:00:00Z',
    inspections_count: 0,
    is_demo: true
  }
];

// Seed realistic inspection records (including a reinspection demonstration)
const DEFAULT_INSPECTIONS: Inspection[] = [
  {
    id: 'insp-1001-a',
    inspection_id: 'INSP-2026-1001-A',
    order_id: 'ORD-1001',
    product_name: 'Mechanical Drive Assembly A',
    original_image_path: '/placeholder_tray_fail.jpg',
    annotated_image_path: '/placeholder_tray_fail_annotated.jpg',
    expected_components: { Bearing: 2, Bolt: 4, Gear: 2, Nut: 4 },
    detected_components: { Bearing: 2, Bolt: 3, Gear: 2, Nut: 4 },
    detections: [
      { class_name: 'Bearing', confidence: 0.94, bbox: [50, 60, 180, 190], bbox_normalized: [0.1, 0.12, 0.36, 0.38] },
      { class_name: 'Bearing', confidence: 0.92, bbox: [220, 60, 350, 190], bbox_normalized: [0.44, 0.12, 0.7, 0.38] },
      { class_name: 'Gear', confidence: 0.91, bbox: [60, 240, 180, 360], bbox_normalized: [0.12, 0.48, 0.36, 0.72] },
      { class_name: 'Gear', confidence: 0.89, bbox: [220, 240, 340, 360], bbox_normalized: [0.44, 0.48, 0.68, 0.72] },
      { class_name: 'Bolt', confidence: 0.93, bbox: [380, 60, 440, 140], bbox_normalized: [0.76, 0.12, 0.88, 0.28] },
      { class_name: 'Bolt', confidence: 0.95, bbox: [380, 150, 440, 230], bbox_normalized: [0.76, 0.3, 0.88, 0.46] },
      { class_name: 'Bolt', confidence: 0.88, bbox: [380, 240, 440, 320], bbox_normalized: [0.76, 0.48, 0.88, 0.64] },
      { class_name: 'Nut', confidence: 0.92, bbox: [450, 60, 490, 100], bbox_normalized: [0.9, 0.12, 0.98, 0.2] },
      { class_name: 'Nut', confidence: 0.91, bbox: [450, 120, 490, 160], bbox_normalized: [0.9, 0.24, 0.98, 0.32] },
      { class_name: 'Nut', confidence: 0.89, bbox: [450, 180, 490, 220], bbox_normalized: [0.9, 0.36, 0.98, 0.44] },
      { class_name: 'Nut', confidence: 0.94, bbox: [450, 240, 490, 280], bbox_normalized: [0.9, 0.48, 0.98, 0.56] }
    ],
    verification_result: {
      overall_status: 'FAIL',
      component_results: [
        { component_name: 'Bearing', expected: 2, detected: 2, status: 'MATCH', delta: 0, min_confidence: 0.92, avg_confidence: 0.93, is_uncertain: false },
        { component_name: 'Bolt', expected: 4, detected: 3, status: 'MISSING', delta: -1, min_confidence: 0.88, avg_confidence: 0.92, is_uncertain: false },
        { component_name: 'Gear', expected: 2, detected: 2, status: 'MATCH', delta: 0, min_confidence: 0.89, avg_confidence: 0.90, is_uncertain: false },
        { component_name: 'Nut', expected: 4, detected: 4, status: 'MATCH', delta: 0, min_confidence: 0.89, avg_confidence: 0.915, is_uncertain: false }
      ],
      missing_components: { Bolt: 1 },
      extra_components: {},
      uncertainty_flags: [],
      corrective_actions: ['1 Bolt is missing from the package. Add 1 Bolt to the package and run reinspection.'],
      can_approve: false,
      approval_block_reason: 'Approval blocked: Component count mismatch detected. Package cannot be dispatched until discrepancies are resolved.',
      confidence_threshold_applied: 0.50
    },
    inspection_status: 'FAIL',
    inspected_by: 'usr-oper-01',
    inspected_by_name: 'Devon Miller',
    created_at: '2026-11-11T13:45:00Z',
    parent_inspection_id: null,
    is_demo: true
  },
  {
    id: 'insp-1001-b',
    inspection_id: 'INSP-2026-1001-B',
    order_id: 'ORD-1001',
    product_name: 'Mechanical Drive Assembly A',
    original_image_path: '/placeholder_tray_pass.jpg',
    annotated_image_path: '/placeholder_tray_pass_annotated.jpg',
    expected_components: { Bearing: 2, Bolt: 4, Gear: 2, Nut: 4 },
    detected_components: { Bearing: 2, Bolt: 4, Gear: 2, Nut: 4 },
    detections: [
      { class_name: 'Bearing', confidence: 0.96, bbox: [50, 60, 180, 190], bbox_normalized: [0.1, 0.12, 0.36, 0.38] },
      { class_name: 'Bearing', confidence: 0.95, bbox: [220, 60, 350, 190], bbox_normalized: [0.44, 0.12, 0.7, 0.38] },
      { class_name: 'Gear', confidence: 0.93, bbox: [60, 240, 180, 360], bbox_normalized: [0.12, 0.48, 0.36, 0.72] },
      { class_name: 'Gear', confidence: 0.91, bbox: [220, 240, 340, 360], bbox_normalized: [0.44, 0.48, 0.68, 0.72] },
      { class_name: 'Bolt', confidence: 0.94, bbox: [380, 60, 440, 140], bbox_normalized: [0.76, 0.12, 0.88, 0.28] },
      { class_name: 'Bolt', confidence: 0.96, bbox: [380, 150, 440, 230], bbox_normalized: [0.76, 0.3, 0.88, 0.46] },
      { class_name: 'Bolt', confidence: 0.92, bbox: [380, 240, 440, 320], bbox_normalized: [0.76, 0.48, 0.88, 0.64] },
      { class_name: 'Bolt', confidence: 0.95, bbox: [380, 330, 440, 410], bbox_normalized: [0.76, 0.66, 0.88, 0.82] },
      { class_name: 'Nut', confidence: 0.93, bbox: [450, 60, 490, 100], bbox_normalized: [0.9, 0.12, 0.98, 0.2] },
      { class_name: 'Nut', confidence: 0.92, bbox: [450, 120, 490, 160], bbox_normalized: [0.9, 0.24, 0.98, 0.32] },
      { class_name: 'Nut', confidence: 0.90, bbox: [450, 180, 490, 220], bbox_normalized: [0.9, 0.36, 0.98, 0.44] },
      { class_name: 'Nut', confidence: 0.95, bbox: [450, 240, 490, 280], bbox_normalized: [0.9, 0.48, 0.98, 0.56] }
    ],
    verification_result: {
      overall_status: 'PASS',
      component_results: [
        { component_name: 'Bearing', expected: 2, detected: 2, status: 'MATCH', delta: 0, min_confidence: 0.95, avg_confidence: 0.955, is_uncertain: false },
        { component_name: 'Bolt', expected: 4, detected: 4, status: 'MATCH', delta: 0, min_confidence: 0.92, avg_confidence: 0.942, is_uncertain: false },
        { component_name: 'Gear', expected: 2, detected: 2, status: 'MATCH', delta: 0, min_confidence: 0.91, avg_confidence: 0.92, is_uncertain: false },
        { component_name: 'Nut', expected: 4, detected: 4, status: 'MATCH', delta: 0, min_confidence: 0.90, avg_confidence: 0.925, is_uncertain: false }
      ],
      missing_components: {},
      extra_components: {},
      uncertainty_flags: [],
      corrective_actions: ['All components and quantities verified successfully. Package is cleared for dispatch sign-off.'],
      can_approve: true,
      confidence_threshold_applied: 0.50
    },
    inspection_status: 'PASS',
    inspected_by: 'usr-insp-01',
    inspected_by_name: 'Elena Rostova',
    created_at: '2026-11-11T14:20:00Z',
    parent_inspection_id: 'INSP-2026-1001-A',
    reinspection_notes: 'Added missing Bolt #4 from staging bin. Re-inspected and all counts match exact bill of materials.',
    digital_signoff: {
      approved_by: 'Elena Rostova (Lead QA)',
      approved_at: '2026-11-11T14:21:10Z',
      dispatch_authorization_code: 'AUTH-DISP-9981'
    },
    is_demo: true
  },
  {
    id: 'insp-1002-a',
    inspection_id: 'INSP-2026-1002-A',
    order_id: 'ORD-1002',
    product_name: 'Heavy Transmission Sub-Kit B',
    original_image_path: '/placeholder_tray_fail2.jpg',
    annotated_image_path: '/placeholder_tray_fail2_annotated.jpg',
    expected_components: { Bearing: 4, Bolt: 8, Gear: 4, Nut: 8 },
    detected_components: { Bearing: 4, Bolt: 7, Gear: 4, Nut: 9 },
    detections: [
      { class_name: 'Bearing', confidence: 0.92, bbox: [40, 50, 120, 130], bbox_normalized: [0.08, 0.1, 0.24, 0.26] },
      { class_name: 'Bearing', confidence: 0.90, bbox: [140, 50, 220, 130], bbox_normalized: [0.28, 0.1, 0.44, 0.26] },
      { class_name: 'Bearing', confidence: 0.93, bbox: [240, 50, 320, 130], bbox_normalized: [0.48, 0.1, 0.64, 0.26] },
      { class_name: 'Bearing', confidence: 0.91, bbox: [340, 50, 420, 130], bbox_normalized: [0.68, 0.1, 0.84, 0.26] },
      { class_name: 'Gear', confidence: 0.89, bbox: [40, 150, 120, 230], bbox_normalized: [0.08, 0.3, 0.24, 0.46] },
      { class_name: 'Gear', confidence: 0.94, bbox: [140, 150, 220, 230], bbox_normalized: [0.28, 0.3, 0.44, 0.46] },
      { class_name: 'Gear', confidence: 0.91, bbox: [240, 150, 320, 230], bbox_normalized: [0.48, 0.3, 0.64, 0.46] },
      { class_name: 'Gear', confidence: 0.92, bbox: [340, 150, 420, 230], bbox_normalized: [0.68, 0.3, 0.84, 0.46] },
      { class_name: 'Bolt', confidence: 0.88, bbox: [50, 250, 90, 330], bbox_normalized: [0.1, 0.5, 0.18, 0.66] }
    ],
    verification_result: {
      overall_status: 'FAIL',
      component_results: [
        { component_name: 'Bearing', expected: 4, detected: 4, status: 'MATCH', delta: 0, min_confidence: 0.90, avg_confidence: 0.915, is_uncertain: false },
        { component_name: 'Bolt', expected: 8, detected: 7, status: 'MISSING', delta: -1, min_confidence: 0.88, avg_confidence: 0.88, is_uncertain: false },
        { component_name: 'Gear', expected: 4, detected: 4, status: 'MATCH', delta: 0, min_confidence: 0.89, avg_confidence: 0.915, is_uncertain: false },
        { component_name: 'Nut', expected: 8, detected: 9, status: 'EXTRA', delta: 1, min_confidence: 0.87, avg_confidence: 0.90, is_uncertain: false }
      ],
      missing_components: { Bolt: 1 },
      extra_components: { Nut: 1 },
      uncertainty_flags: [],
      corrective_actions: [
        '1 Bolt is missing from the package. Add 1 Bolt to the package and run reinspection.',
        '1 extra Nut detected in the package. Remove 1 extra Nut and re-verify.'
      ],
      can_approve: false,
      approval_block_reason: 'Approval blocked: Component count mismatch detected. Package cannot be dispatched until discrepancies are resolved.',
      confidence_threshold_applied: 0.50
    },
    inspection_status: 'FAIL',
    inspected_by: 'usr-oper-01',
    inspected_by_name: 'Devon Miller',
    created_at: '2026-11-12T05:40:00Z',
    parent_inspection_id: null,
    is_demo: true
  },
  {
    id: 'insp-1003-a',
    inspection_id: 'INSP-2026-1003-A',
    order_id: 'ORD-1003',
    product_name: 'Planetary Reducer Coupling 50mm',
    original_image_path: '/placeholder_tray_review.jpg',
    annotated_image_path: '/placeholder_tray_review_annotated.jpg',
    expected_components: { Bearing: 3, Bolt: 6, Gear: 3, Nut: 6 },
    detected_components: { Bearing: 3, Bolt: 6, Gear: 3, Nut: 6 },
    detections: [
      { class_name: 'Bearing', confidence: 0.88, bbox: [50, 50, 130, 130], bbox_normalized: [0.1, 0.1, 0.26, 0.26] },
      { class_name: 'Gear', confidence: 0.44, bbox: [150, 50, 230, 130], bbox_normalized: [0.3, 0.1, 0.46, 0.26] }
    ],
    verification_result: {
      overall_status: 'NEEDS_REVIEW',
      component_results: [
        { component_name: 'Bearing', expected: 3, detected: 3, status: 'MATCH', delta: 0, min_confidence: 0.88, avg_confidence: 0.88, is_uncertain: false },
        { component_name: 'Gear', expected: 3, detected: 3, status: 'UNCERTAIN', delta: 0, min_confidence: 0.44, avg_confidence: 0.62, is_uncertain: true },
        { component_name: 'Bolt', expected: 6, detected: 6, status: 'MATCH', delta: 0, min_confidence: 0.91, avg_confidence: 0.93, is_uncertain: false },
        { component_name: 'Nut', expected: 6, detected: 6, status: 'MATCH', delta: 0, min_confidence: 0.90, avg_confidence: 0.92, is_uncertain: false }
      ],
      missing_components: {},
      extra_components: {},
      uncertainty_flags: [
        '1 Gear detection(s) have confidence below required threshold (50%). Lowest confidence: 44.0%.'
      ],
      corrective_actions: [
        'Low confidence for Gear: Re-orient component to avoid glare/shadows and re-inspect.'
      ],
      can_approve: false,
      approval_block_reason: 'Approval blocked: AI model confidence or image quality is below industrial threshold. Manual review or re-capture required.',
      confidence_threshold_applied: 0.50
    },
    inspection_status: 'NEEDS_REVIEW',
    inspected_by: 'usr-insp-01',
    inspected_by_name: 'Elena Rostova',
    created_at: '2026-11-12T04:22:00Z',
    parent_inspection_id: null,
    is_demo: true
  }
];

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[DB] Error reading database file:', err);
    }

    // Default seeded database
    const initial: DatabaseSchema = {
      users: DEFAULT_USERS,
      orders: DEFAULT_ORDERS,
      inspections: DEFAULT_INSPECTIONS,
      components: DEFAULT_COMPONENTS,
      settings: DEFAULT_SETTINGS
    };
    this.save(initial);
    return initial;
  }

  private save(data: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Error writing database file:', err);
    }
  }

  // Users
  getUsers(): User[] {
    return this.data.users;
  }

  getUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  }

  getUserByEmail(email: string): User | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  createUser(user: Omit<User, 'id' | 'createdAt'>): User {
    const newUser: User = {
      ...user,
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString()
    };
    this.data.users.push(newUser);
    this.save(this.data);
    return newUser;
  }

  updateUser(id: string, updates: Partial<User>): User | null {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    this.data.users[idx] = { ...this.data.users[idx], ...updates };
    this.save(this.data);
    return this.data.users[idx];
  }

  // Components
  getComponents(): ComponentDefinition[] {
    return this.data.components;
  }

  addComponent(comp: Omit<ComponentDefinition, 'id'>): ComponentDefinition {
    const newComp: ComponentDefinition = {
      ...comp,
      id: `comp-${Date.now()}`
    };
    this.data.components.push(newComp);
    this.save(this.data);
    return newComp;
  }

  // Orders
  getOrders(): Order[] {
    return [...this.data.orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  getOrderById(id: string): Order | undefined {
    return this.data.orders.find(o => o.id === id || o.order_id.toLowerCase() === id.toLowerCase());
  }

  createOrder(orderData: Omit<Order, 'id' | 'created_at' | 'updated_at' | 'inspections_count'>): Order {
    const now = new Date().toISOString();
    const newOrder: Order = {
      ...orderData,
      id: `ord-${Date.now()}`,
      created_at: now,
      updated_at: now,
      inspections_count: 0
    };
    this.data.orders.unshift(newOrder);
    this.save(this.data);
    return newOrder;
  }

  updateOrder(id: string, updates: Partial<Order>): Order | null {
    const idx = this.data.orders.findIndex(o => o.id === id || o.order_id === id);
    if (idx === -1) return null;
    this.data.orders[idx] = {
      ...this.data.orders[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.save(this.data);
    return this.data.orders[idx];
  }

  // Inspections
  getInspections(): Inspection[] {
    return [...this.data.inspections].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  getInspectionById(id: string): Inspection | undefined {
    return this.data.inspections.find(i => i.id === id || i.inspection_id === id);
  }

  getInspectionsByOrderId(orderId: string): Inspection[] {
    return this.data.inspections.filter(i => i.order_id === orderId);
  }

  createInspection(inspectionData: Omit<Inspection, 'id' | 'created_at'>): Inspection {
    const now = new Date().toISOString();
    const newInsp: Inspection = {
      ...inspectionData,
      id: `insp-${Date.now()}`,
      created_at: now
    };
    this.data.inspections.unshift(newInsp);

    // Update order status and inspection counter
    const order = this.data.orders.find(o => o.order_id === inspectionData.order_id);
    if (order) {
      order.inspections_count = (order.inspections_count || 0) + 1;
      order.last_inspection_id = newInsp.inspection_id;
      if (newInsp.inspection_status === 'PASS') {
        order.status = 'passed';
      } else if (newInsp.inspection_status === 'NEEDS_REVIEW') {
        order.status = 'needs_review';
      } else {
        order.status = 'failed';
      }
      order.updated_at = now;
    }

    this.save(this.data);
    return newInsp;
  }

  approveInspection(inspectionId: string, approverName: string): Inspection | null {
    const insp = this.getInspectionById(inspectionId);
    if (!insp) return null;
    if (insp.inspection_status !== 'PASS') {
      throw new Error('Only PASS inspections can be approved for dispatch.');
    }
    insp.digital_signoff = {
      approved_by: approverName,
      approved_at: new Date().toISOString(),
      dispatch_authorization_code: `AUTH-DISP-${Math.floor(1000 + Math.random() * 9000)}`
    };
    this.save(this.data);
    return insp;
  }

  // Settings
  getSettings(): SystemSettings {
    return this.data.settings;
  }

  updateSettings(updates: Partial<SystemSettings>): SystemSettings {
    this.data.settings = { ...this.data.settings, ...updates };
    this.save(this.data);
    return this.data.settings;
  }

  // Demo reset
  resetDemoData() {
    this.data.orders = DEFAULT_ORDERS;
    this.data.inspections = DEFAULT_INSPECTIONS;
    this.save(this.data);
    return { success: true, message: 'Demo records successfully reset.' };
  }
}

export const db = new Database();
