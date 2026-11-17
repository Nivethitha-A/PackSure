import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import {
  db,
  BOOTSTRAPPED_ADMIN_EMAIL,
  OperationType,
  handleFirestoreError
} from '../firebase';
import {
  User,
  UserRole,
  Order,
  OrderStatus,
  Inspection,
  ComponentDefinition,
  SystemSettings,
  AnalyticsData,
  VerificationResult,
  DetectionItem
} from '../types';

const ALLOWED_CLASSES = ['Bearing', 'Bolt', 'Gear', 'Nut'] as const;
const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  confidence_threshold: 0.5,
  iou_threshold: 0.45,
  strict_approval_only: true,
  model_path: 'models/best.onnx',
  min_image_resolution: 400
};

export const DEFAULT_COMPONENTS: ComponentDefinition[] = [
  {
    id: 'comp-bearing',
    component_name: 'Bearing',
    model_class_name: 'Bearing',
    description: 'Deep groove ball bearing for rotary mechanical assemblies.',
    active: true,
    color: '#2563EB'
  },
  {
    id: 'comp-bolt',
    component_name: 'Bolt',
    model_class_name: 'Bolt',
    description: 'High-tensile hexagonal head M8/M10 structural bolt.',
    active: true,
    color: '#16A34A'
  },
  {
    id: 'comp-gear',
    component_name: 'Gear',
    model_class_name: 'Gear',
    description: 'Precision spur gear with involute tooth profile.',
    active: true,
    color: '#D97706'
  },
  {
    id: 'comp-nut',
    component_name: 'Nut',
    model_class_name: 'Nut',
    description: 'Heavy hex locknut matching M8/M10 thread pitch.',
    active: true,
    color: '#9333EA'
  }
];

function toIsoString(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as any).toDate === 'function') {
    return (val as any).toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 128);
  return cleaned && ID_REGEX.test(cleaned) ? cleaned : `${fallbackPrefix}-${Date.now()}`;
}

function sanitizeText(raw: string | undefined | null, maxLen: number, fallback = ''): string {
  const val = (raw ?? fallback).trim();
  if (!val) return fallback.slice(0, maxLen);
  return val.slice(0, maxLen);
}

function sanitizeComponentMap(raw: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const cls of ALLOWED_CLASSES) {
    if (Object.prototype.hasOwnProperty.call(raw, cls)) {
      const n = Math.max(0, Math.min(10000, Math.round(Number(raw[cls]) || 0)));
      if (n > 0) out[cls] = n;
    }
  }
  return out;
}

function sanitizeVerificationResult(vr: VerificationResult): VerificationResult {
  const clean: VerificationResult = {
    overall_status: vr.overall_status,
    component_results: (vr.component_results || []).slice(0, 10).map((cr) => ({
      component_name: sanitizeText(cr.component_name, 64, 'Unknown'),
      expected: Math.max(0, Math.round(Number(cr.expected) || 0)),
      detected: Math.max(0, Math.round(Number(cr.detected) || 0)),
      status: cr.status,
      delta: Math.round(Number(cr.delta) || 0),
      min_confidence: Number(cr.min_confidence) || 0,
      avg_confidence: Number(cr.avg_confidence) || 0,
      is_uncertain: Boolean(cr.is_uncertain)
    })),
    missing_components: sanitizeComponentMap(vr.missing_components),
    extra_components: sanitizeComponentMap(vr.extra_components),
    uncertainty_flags: (vr.uncertainty_flags || []).slice(0, 20).map((f) => sanitizeText(f, 300)),
    corrective_actions: (vr.corrective_actions || []).slice(0, 20).map((a) => sanitizeText(a, 400)),
    can_approve: Boolean(vr.can_approve),
    confidence_threshold_applied: Math.min(1, Math.max(0, Number(vr.confidence_threshold_applied) || 0.5))
  };
  if (vr.approval_block_reason) {
    clean.approval_block_reason = sanitizeText(vr.approval_block_reason, 400);
  }
  return clean;
}

export function isBootstrappedAdminUser(user: Pick<User, 'email'> | FirebaseUser | null): boolean {
  return Boolean(user?.email && user.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase());
}

/**
 * Syncs authenticated Firebase Auth user with /users/{uid} in Firestore.
 * Enforces anti-privilege-escalation rules on first sign-in.
 */
export async function syncUserProfile(firebaseUser: FirebaseUser): Promise<User> {
  const uid = firebaseUser.uid;
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  const displayName = sanitizeText(
    firebaseUser.displayName || firebaseUser.email?.split('@')[0],
    120,
    'Station Operator'
  );
  const email = sanitizeText(firebaseUser.email, 254, 'operator@packsure.ai');
  const avatar = firebaseUser.photoURL ? firebaseUser.photoURL.slice(0, 512) : undefined;
  const bootstrappedAdmin =
    firebaseUser.emailVerified && isBootstrappedAdminUser(firebaseUser);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const initialRole: UserRole = bootstrappedAdmin ? 'admin' : 'operator';
      const payload: Record<string, unknown> = {
        uid,
        name: displayName,
        email,
        role: initialRole,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      };
      if (avatar) payload.avatar = avatar;

      await setDoc(userRef, payload);

      // Bootstrapped admin also ensures /admins/{uid} exists for relational lookups
      if (bootstrappedAdmin) {
        const adminRef = doc(db, 'admins', uid);
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          await setDoc(adminRef, {
            uid,
            email,
            grantedBy: uid,
            createdAt: serverTimestamp()
          });
        }
      }

      return {
        id: uid,
        name: displayName,
        email,
        role: initialRole,
        avatar,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
    } else {
      const updates: Record<string, unknown> = {
        name: displayName,
        lastLogin: serverTimestamp()
      };
      if (avatar) updates.avatar = avatar;
      await updateDoc(userRef, updates);

      const data = snap.data();
      let resolvedRole: UserRole = (data.role as UserRole) || 'operator';
      if (bootstrappedAdmin && resolvedRole !== 'admin') {
        resolvedRole = 'admin';
      }

      if (bootstrappedAdmin) {
        const adminRef = doc(db, 'admins', uid);
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          await setDoc(adminRef, {
            uid,
            email,
            grantedBy: uid,
            createdAt: serverTimestamp()
          });
        }
      }

      return {
        id: uid,
        name: data.name || displayName,
        email: data.email || email,
        role: resolvedRole,
        avatar: data.avatar || avatar,
        createdAt: toIsoString(data.createdAt),
        lastLogin: new Date().toISOString()
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export function subscribeOrders(user: User, onData: (orders: Order[]) => void): Unsubscribe {
  const path = 'orders';
  const q = isBootstrappedAdminUser(user)
    ? collection(db, path)
    : query(collection(db, path), where('createdBy', '==', user.id));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Order[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          order_id: data.order_id,
          product_name: data.product_name,
          customer_reference: data.customer_reference,
          expected_components: data.expected_components || {},
          status: (data.status as OrderStatus) || 'pending',
          created_at: toIsoString(data.created_at),
          updated_at: toIsoString(data.updated_at),
          inspections_count: Number(data.inspections_count) || 0,
          last_inspection_id: data.last_inspection_id,
          createdBy: data.createdBy,
          is_demo: Boolean(data.is_demo)
        };
      });
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeInspections(user: User, onData: (inspections: Inspection[]) => void): Unsubscribe {
  const path = 'inspections';
  const q = isBootstrappedAdminUser(user)
    ? collection(db, path)
    : query(collection(db, path), where('inspected_by', '==', user.id));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Inspection[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          inspection_id: data.inspection_id,
          order_id: data.order_id,
          order_doc_id: data.order_doc_id,
          product_name: data.product_name,
          original_image_path: data.original_image_path,
          annotated_image_path: data.annotated_image_path,
          expected_components: data.expected_components || {},
          detected_components: data.detected_components || {},
          detections: (data.detections as DetectionItem[]) || [],
          verification_result: data.verification_result,
          inspection_status: data.inspection_status,
          inspected_by: data.inspected_by,
          inspected_by_name: data.inspected_by_name,
          created_at: toIsoString(data.created_at),
          updated_at: toIsoString(data.updated_at),
          parent_inspection_id: data.parent_inspection_id ?? null,
          reinspection_notes: data.reinspection_notes,
          image_quality: data.image_quality,
          digital_signoff: data.digital_signoff
            ? {
                approved_by: data.digital_signoff.approved_by,
                approved_by_uid: data.digital_signoff.approved_by_uid,
                approved_at: toIsoString(data.digital_signoff.approved_at),
                dispatch_authorization_code: data.digital_signoff.dispatch_authorization_code
              }
            : undefined,
          is_demo: Boolean(data.is_demo)
        };
      });
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeUsers(user: User, onData: (users: User[]) => void): Unsubscribe {
  const path = 'users';
  const q = isBootstrappedAdminUser(user)
    ? collection(db, path)
    : query(collection(db, path), where('uid', '==', user.id));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: User[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          email: data.email,
          role: (data.role as UserRole) || 'operator',
          avatar: data.avatar,
          createdAt: toIsoString(data.createdAt),
          lastLogin: toIsoString(data.lastLogin)
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeSettings(onData: (settings: SystemSettings) => void): Unsubscribe {
  const path = 'settings/station';
  return onSnapshot(
    doc(db, 'settings', 'station'),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        onData({
          confidence_threshold: Number(data.confidence_threshold) || 0.5,
          iou_threshold: Number(data.iou_threshold) || 0.45,
          strict_approval_only: Boolean(data.strict_approval_only ?? true),
          model_path: data.model_path || 'models/best.onnx',
          min_image_resolution: Number(data.min_image_resolution) || 400
        });
      } else {
        onData(DEFAULT_SYSTEM_SETTINGS);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeComponents(onData: (components: ComponentDefinition[]) => void): Unsubscribe {
  const path = 'components';
  const q = query(collection(db, path), where('active', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onData(DEFAULT_COMPONENTS);
        return;
      }
      const list: ComponentDefinition[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          component_name: data.component_name,
          model_class_name: data.model_class_name,
          description: data.description,
          active: Boolean(data.active),
          color: data.color
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function ensureAdminConfigInitialized(user: User): Promise<void> {
  if (user.role !== 'admin') return;

  try {
    const settingsRef = doc(db, 'settings', 'station');
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        ...DEFAULT_SYSTEM_SETTINGS,
        updated_at: serverTimestamp(),
        updated_by: user.id
      });
    }

    const compSnap = await getDocs(query(collection(db, 'components'), where('active', '==', true)));
    if (compSnap.empty) {
      const batch = writeBatch(db);
      for (const comp of DEFAULT_COMPONENTS) {
        batch.set(doc(db, 'components', comp.id), comp);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/station');
  }
}

export async function createOrderInFirestore(
  orderData: Partial<Order>,
  user: User,
  existingOrders: Order[]
): Promise<Order> {
  const orderCode = sanitizeId((orderData.order_id || '').toUpperCase().trim(), 'ORD');
  if (existingOrders.some((o) => o.order_id.toLowerCase() === orderCode.toLowerCase())) {
    throw new Error(`Order with ID ${orderCode} already exists`);
  }

  const expected = sanitizeComponentMap(orderData.expected_components);
  if (Object.keys(expected).length === 0) {
    throw new Error('At least one valid mechanical component (Bearing, Bolt, Gear, Nut) is required.');
  }

  const docId = sanitizeId(`ord-${orderCode.toLowerCase()}-${Date.now().toString(36)}`, 'ord');
  const orderPath = `orders/${docId}`;
  const productName = sanitizeText(orderData.product_name, 200, 'Mechanical Assembly');
  const customerRef = sanitizeText(orderData.customer_reference, 200, 'Standard Packaging');

  try {
    await setDoc(doc(db, 'orders', docId), {
      id: docId,
      order_id: orderCode.slice(0, 64),
      product_name: productName,
      customer_reference: customerRef,
      expected_components: expected,
      status: 'pending',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      inspections_count: 0,
      createdBy: user.id,
      is_demo: Boolean(orderData.is_demo)
    });

    const nowIso = new Date().toISOString();
    return {
      id: docId,
      order_id: orderCode.slice(0, 64),
      product_name: productName,
      customer_reference: customerRef,
      expected_components: expected,
      status: 'pending',
      created_at: nowIso,
      updated_at: nowIso,
      inspections_count: 0,
      createdBy: user.id,
      is_demo: Boolean(orderData.is_demo)
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, orderPath);
  }
}

export async function updateOrderInFirestore(orderDocId: string, updates: Partial<Order>): Promise<void> {
  const path = `orders/${orderDocId}`;
  const payload: Record<string, unknown> = { updated_at: serverTimestamp() };
  if (updates.product_name !== undefined) payload.product_name = sanitizeText(updates.product_name, 200);
  if (updates.customer_reference !== undefined) {
    payload.customer_reference = sanitizeText(updates.customer_reference, 200);
  }
  if (updates.expected_components !== undefined) {
    payload.expected_components = sanitizeComponentMap(updates.expected_components);
  }
  if (updates.status !== undefined) payload.status = updates.status;

  try {
    await updateDoc(doc(db, 'orders', orderDocId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveInspectionAtomic(
  computedInspection: Inspection,
  order: Order,
  user: User
): Promise<Inspection> {
  const inspDocId = sanitizeId(
    computedInspection.id || `insp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    'insp'
  );
  const inspId = sanitizeId(computedInspection.inspection_id, 'INSP');
  const inspPath = `inspections/${inspDocId}`;

  const nextOrderStatus: OrderStatus =
    computedInspection.inspection_status === 'PASS'
      ? 'passed'
      : computedInspection.inspection_status === 'NEEDS_REVIEW'
      ? 'needs_review'
      : 'failed';

  const cleanVerification = sanitizeVerificationResult(computedInspection.verification_result);
  const cleanDetections = (computedInspection.detections || []).slice(0, 200).map((d) => ({
    class_name: d.class_name,
    confidence: Number(d.confidence) || 0,
    bbox: d.bbox,
    bbox_normalized: d.bbox_normalized
  }));

  const docPayload: Record<string, unknown> = {
    id: inspDocId,
    inspection_id: inspId,
    order_id: order.order_id,
    order_doc_id: order.id,
    product_name: sanitizeText(order.product_name, 200),
    original_image_path: sanitizeText(computedInspection.original_image_path, 512, '/uploads/raw.jpg'),
    annotated_image_path: sanitizeText(computedInspection.annotated_image_path, 512, '/uploads/ann.jpg'),
    expected_components: sanitizeComponentMap(order.expected_components),
    detected_components: sanitizeComponentMap(computedInspection.detected_components),
    detections: cleanDetections,
    verification_result: cleanVerification,
    inspection_status: computedInspection.inspection_status,
    inspected_by: user.id,
    inspected_by_name: sanitizeText(user.name, 120, 'Quality Inspector'),
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    parent_inspection_id: computedInspection.parent_inspection_id
      ? sanitizeText(computedInspection.parent_inspection_id, 128)
      : null,
    is_demo: Boolean(computedInspection.is_demo)
  };

  if (computedInspection.reinspection_notes) {
    docPayload.reinspection_notes = sanitizeText(computedInspection.reinspection_notes, 500);
  }
  if (computedInspection.image_quality) {
    docPayload.image_quality = computedInspection.image_quality;
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'inspections', inspDocId), docPayload);
    batch.update(doc(db, 'orders', order.id), {
      status: nextOrderStatus,
      inspections_count: (order.inspections_count || 0) + 1,
      last_inspection_id: inspId,
      updated_at: serverTimestamp()
    });
    await batch.commit();

    return {
      ...computedInspection,
      id: inspDocId,
      inspection_id: inspId,
      order_doc_id: order.id,
      inspected_by: user.id,
      inspected_by_name: sanitizeText(user.name, 120, 'Quality Inspector'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, inspPath);
  }
}

export async function approveInspectionInFirestore(
  inspection: Inspection,
  user: User
): Promise<Inspection> {
  if (inspection.inspection_status !== 'PASS') {
    throw new Error('Fail-safe rule violation: Only 100% verified PASS packages can be approved for dispatch.');
  }

  const path = `inspections/${inspection.id}`;
  const authCode = `AUTH-DISP-${Math.floor(1000 + Math.random() * 9000)}`;
  const approverLabel = sanitizeText(user.name, 120, 'Lead Quality Inspector');

  try {
    await updateDoc(doc(db, 'inspections', inspection.id), {
      digital_signoff: {
        approved_by: approverLabel,
        approved_by_uid: user.id,
        approved_at: serverTimestamp(),
        dispatch_authorization_code: authCode
      },
      updated_at: serverTimestamp()
    });

    return {
      ...inspection,
      digital_signoff: {
        approved_by: approverLabel,
        approved_by_uid: user.id,
        approved_at: new Date().toISOString(),
        dispatch_authorization_code: authCode
      },
      updated_at: new Date().toISOString()
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateSystemSettingsInFirestore(
  updates: Partial<SystemSettings>,
  current: SystemSettings,
  user: User
): Promise<void> {
  const path = 'settings/station';
  const merged = {
    confidence_threshold: Math.min(0.99, Math.max(0.1, Number(updates.confidence_threshold ?? current.confidence_threshold))),
    iou_threshold: Math.min(0.95, Math.max(0.1, Number(updates.iou_threshold ?? current.iou_threshold))),
    strict_approval_only: Boolean(updates.strict_approval_only ?? current.strict_approval_only),
    model_path: sanitizeText(updates.model_path ?? current.model_path, 256, 'models/best.onnx'),
    min_image_resolution: Math.min(4096, Math.max(100, Math.round(Number(updates.min_image_resolution ?? current.min_image_resolution)))),
    updated_at: serverTimestamp(),
    updated_by: user.id
  };

  try {
    await setDoc(doc(db, 'settings', 'station'), merged);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserRoleInFirestore(
  targetUser: User,
  newRole: UserRole,
  adminUser: User
): Promise<void> {
  const path = `users/${targetUser.id}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', targetUser.id), {
      role: newRole,
      lastLogin: serverTimestamp()
    });
    if (newRole === 'admin') {
      batch.set(doc(db, 'admins', targetUser.id), {
        uid: targetUser.id,
        email: targetUser.email,
        grantedBy: adminUser.id,
        createdAt: serverTimestamp()
      });
    } else if (targetUser.role === 'admin' && targetUser.id !== adminUser.id) {
      batch.delete(doc(db, 'admins', targetUser.id));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Seeds or resets industrial demonstration orders and inspections owned by the current user
 * in full compliance with Firestore security rules (atomic parent order sync).
 */
export async function seedDemoDataInFirestore(
  user: User,
  existingOrders: Order[],
  existingInspections: Inspection[]
): Promise<void> {
  const suffix = user.id.slice(0, 6);
  const demoOrdersSeed: Array<{
    id: string;
    order_id: string;
    product_name: string;
    customer_reference: string;
    expected_components: Record<string, number>;
  }> = [
    {
      id: sanitizeId(`demo-ord-1001-${suffix}`),
      order_id: 'ORD-1001',
      product_name: 'Mechanical Drive Assembly A',
      customer_reference: 'Apex Aerospace / PO-8842',
      expected_components: { Bearing: 2, Bolt: 4, Gear: 2, Nut: 4 }
    },
    {
      id: sanitizeId(`demo-ord-1002-${suffix}`),
      order_id: 'ORD-1002',
      product_name: 'Heavy Transmission Sub-Kit B',
      customer_reference: 'Nordic Turbines / NT-4011',
      expected_components: { Bearing: 4, Bolt: 8, Gear: 4, Nut: 8 }
    },
    {
      id: sanitizeId(`demo-ord-1003-${suffix}`),
      order_id: 'ORD-1003',
      product_name: 'Planetary Reducer Coupling 50mm',
      customer_reference: 'Siemens Robotics / SR-9921',
      expected_components: { Bearing: 3, Bolt: 6, Gear: 3, Nut: 6 }
    },
    {
      id: sanitizeId(`demo-ord-1004-${suffix}`),
      order_id: 'ORD-1004',
      product_name: 'High-Tensile Flange Fastener Pack',
      customer_reference: 'HydraTech Dynamics / HT-12',
      expected_components: { Bolt: 6, Nut: 6 }
    },
    {
      id: sanitizeId(`demo-ord-1005-${suffix}`),
      order_id: 'ORD-1005',
      product_name: 'Precision Spindle Shaft Kit S4',
      customer_reference: 'Kuka Automation / KA-773',
      expected_components: { Bearing: 2, Bolt: 4, Gear: 1, Nut: 4 }
    }
  ];

  try {
    // 1. Delete user's existing demo inspections & orders first
    const cleanupBatch = writeBatch(db);
    let hasCleanup = false;
    for (const insp of existingInspections) {
      if (insp.is_demo && insp.inspected_by === user.id) {
        cleanupBatch.delete(doc(db, 'inspections', insp.id));
        hasCleanup = true;
      }
    }
    for (const ord of existingOrders) {
      if (ord.is_demo && ord.createdBy === user.id) {
        cleanupBatch.delete(doc(db, 'orders', ord.id));
        hasCleanup = true;
      }
    }
    if (hasCleanup) {
      await cleanupBatch.commit();
    }

    // 2. Create the 5 demo orders in pending state (matches strict create rule)
    const ordersBatch = writeBatch(db);
    for (const ord of demoOrdersSeed) {
      ordersBatch.set(doc(db, 'orders', ord.id), {
        id: ord.id,
        order_id: ord.order_id,
        product_name: ord.product_name,
        customer_reference: ord.customer_reference,
        expected_components: ord.expected_components,
        status: 'pending',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        inspections_count: 0,
        createdBy: user.id,
        is_demo: true
      });
    }
    await ordersBatch.commit();

    // 3. Sequentially seed demo inspections with atomic order status updates
    const ord1001 = demoOrdersSeed[0];
    const ord1002 = demoOrdersSeed[1];
    const ord1003 = demoOrdersSeed[2];

    const inspSteps: Array<{
      insp: Inspection;
      order: typeof ord1001;
      prevCount: number;
      nextStatus: OrderStatus;
    }> = [
      {
        order: ord1001,
        prevCount: 0,
        nextStatus: 'failed',
        insp: {
          id: sanitizeId(`demo-insp-1001-a-${suffix}`),
          inspection_id: 'INSP-2026-1001-A',
          order_id: ord1001.order_id,
          order_doc_id: ord1001.id,
          product_name: ord1001.product_name,
          original_image_path: '/placeholder_tray_fail.jpg',
          annotated_image_path: '/placeholder_tray_fail_annotated.jpg',
          expected_components: ord1001.expected_components,
          detected_components: { Bearing: 2, Bolt: 3, Gear: 2, Nut: 4 },
          detections: [
            { class_name: 'Bearing', confidence: 0.94, bbox: [50, 60, 180, 190], bbox_normalized: [0.1, 0.12, 0.36, 0.38] },
            { class_name: 'Bolt', confidence: 0.93, bbox: [380, 60, 440, 140], bbox_normalized: [0.76, 0.12, 0.88, 0.28] }
          ],
          verification_result: {
            overall_status: 'FAIL',
            component_results: [
              { component_name: 'Bearing', expected: 2, detected: 2, status: 'MATCH', delta: 0, min_confidence: 0.92, avg_confidence: 0.93, is_uncertain: false },
              { component_name: 'Bolt', expected: 4, detected: 3, status: 'MISSING', delta: -1, min_confidence: 0.88, avg_confidence: 0.92, is_uncertain: false },
              { component_name: 'Gear', expected: 2, detected: 2, status: 'MATCH', delta: 0, min_confidence: 0.89, avg_confidence: 0.9, is_uncertain: false },
              { component_name: 'Nut', expected: 4, detected: 4, status: 'MATCH', delta: 0, min_confidence: 0.89, avg_confidence: 0.915, is_uncertain: false }
            ],
            missing_components: { Bolt: 1 },
            extra_components: {},
            uncertainty_flags: [],
            corrective_actions: ['1 Bolt is missing from the package. Add 1 Bolt to the package and run reinspection.'],
            can_approve: false,
            approval_block_reason: 'Approval blocked: Component count mismatch detected. Package cannot be dispatched until discrepancies are resolved.',
            confidence_threshold_applied: 0.5
          },
          inspection_status: 'FAIL',
          inspected_by: user.id,
          inspected_by_name: user.name,
          created_at: new Date().toISOString(),
          parent_inspection_id: null,
          is_demo: true
        }
      },
      {
        order: ord1001,
        prevCount: 1,
        nextStatus: 'passed',
        insp: {
          id: sanitizeId(`demo-insp-1001-b-${suffix}`),
          inspection_id: 'INSP-2026-1001-B',
          order_id: ord1001.order_id,
          order_doc_id: ord1001.id,
          product_name: ord1001.product_name,
          original_image_path: '/placeholder_tray_pass.jpg',
          annotated_image_path: '/placeholder_tray_pass_annotated.jpg',
          expected_components: ord1001.expected_components,
          detected_components: { Bearing: 2, Bolt: 4, Gear: 2, Nut: 4 },
          detections: [
            { class_name: 'Bearing', confidence: 0.96, bbox: [50, 60, 180, 190], bbox_normalized: [0.1, 0.12, 0.36, 0.38] },
            { class_name: 'Bolt', confidence: 0.95, bbox: [380, 330, 440, 410], bbox_normalized: [0.76, 0.66, 0.88, 0.82] }
          ],
          verification_result: {
            overall_status: 'PASS',
            component_results: [
              { component_name: 'Bearing', expected: 2, detected: 2, status: 'MATCH', delta: 0, min_confidence: 0.95, avg_confidence: 0.955, is_uncertain: false },
              { component_name: 'Bolt', expected: 4, detected: 4, status: 'MATCH', delta: 0, min_confidence: 0.92, avg_confidence: 0.942, is_uncertain: false },
              { component_name: 'Gear', expected: 2, detected: 2, status: 'MATCH', delta: 0, min_confidence: 0.91, avg_confidence: 0.92, is_uncertain: false },
              { component_name: 'Nut', expected: 4, detected: 4, status: 'MATCH', delta: 0, min_confidence: 0.9, avg_confidence: 0.925, is_uncertain: false }
            ],
            missing_components: {},
            extra_components: {},
            uncertainty_flags: [],
            corrective_actions: ['All components and quantities verified successfully. Package is cleared for dispatch sign-off.'],
            can_approve: true,
            confidence_threshold_applied: 0.5
          },
          inspection_status: 'PASS',
          inspected_by: user.id,
          inspected_by_name: user.name,
          created_at: new Date().toISOString(),
          parent_inspection_id: 'INSP-2026-1001-A',
          reinspection_notes: 'Added missing Bolt #4 from staging bin. Re-inspected and all counts match exact bill of materials.',
          is_demo: true
        }
      },
      {
        order: ord1002,
        prevCount: 0,
        nextStatus: 'failed',
        insp: {
          id: sanitizeId(`demo-insp-1002-a-${suffix}`),
          inspection_id: 'INSP-2026-1002-A',
          order_id: ord1002.order_id,
          order_doc_id: ord1002.id,
          product_name: ord1002.product_name,
          original_image_path: '/placeholder_tray_fail2.jpg',
          annotated_image_path: '/placeholder_tray_fail2_annotated.jpg',
          expected_components: ord1002.expected_components,
          detected_components: { Bearing: 4, Bolt: 7, Gear: 4, Nut: 9 },
          detections: [
            { class_name: 'Bearing', confidence: 0.92, bbox: [40, 50, 120, 130], bbox_normalized: [0.08, 0.1, 0.24, 0.26] },
            { class_name: 'Gear', confidence: 0.91, bbox: [240, 150, 320, 230], bbox_normalized: [0.48, 0.3, 0.64, 0.46] }
          ],
          verification_result: {
            overall_status: 'FAIL',
            component_results: [
              { component_name: 'Bearing', expected: 4, detected: 4, status: 'MATCH', delta: 0, min_confidence: 0.9, avg_confidence: 0.915, is_uncertain: false },
              { component_name: 'Bolt', expected: 8, detected: 7, status: 'MISSING', delta: -1, min_confidence: 0.88, avg_confidence: 0.88, is_uncertain: false },
              { component_name: 'Gear', expected: 4, detected: 4, status: 'MATCH', delta: 0, min_confidence: 0.89, avg_confidence: 0.915, is_uncertain: false },
              { component_name: 'Nut', expected: 8, detected: 9, status: 'EXTRA', delta: 1, min_confidence: 0.87, avg_confidence: 0.9, is_uncertain: false }
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
            confidence_threshold_applied: 0.5
          },
          inspection_status: 'FAIL',
          inspected_by: user.id,
          inspected_by_name: user.name,
          created_at: new Date().toISOString(),
          parent_inspection_id: null,
          is_demo: true
        }
      },
      {
        order: ord1003,
        prevCount: 0,
        nextStatus: 'needs_review',
        insp: {
          id: sanitizeId(`demo-insp-1003-a-${suffix}`),
          inspection_id: 'INSP-2026-1003-A',
          order_id: ord1003.order_id,
          order_doc_id: ord1003.id,
          product_name: ord1003.product_name,
          original_image_path: '/placeholder_tray_review.jpg',
          annotated_image_path: '/placeholder_tray_review_annotated.jpg',
          expected_components: ord1003.expected_components,
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
              { component_name: 'Nut', expected: 6, detected: 6, status: 'MATCH', delta: 0, min_confidence: 0.9, avg_confidence: 0.92, is_uncertain: false }
            ],
            missing_components: {},
            extra_components: {},
            uncertainty_flags: ['1 Gear detection(s) have confidence below required threshold (50%). Lowest confidence: 44.0%.'],
            corrective_actions: ['Low confidence for Gear: Re-orient component to avoid glare/shadows and re-inspect.'],
            can_approve: false,
            approval_block_reason: 'Approval blocked: AI model confidence or image quality is below industrial threshold. Manual review or re-capture required.',
            confidence_threshold_applied: 0.5
          },
          inspection_status: 'NEEDS_REVIEW',
          inspected_by: user.id,
          inspected_by_name: user.name,
          created_at: new Date().toISOString(),
          parent_inspection_id: null,
          is_demo: true
        }
      }
    ];

    for (const step of inspSteps) {
      const b = writeBatch(db);
      const payload: Record<string, unknown> = {
        id: step.insp.id,
        inspection_id: step.insp.inspection_id,
        order_id: step.insp.order_id,
        order_doc_id: step.order.id,
        product_name: step.insp.product_name,
        original_image_path: step.insp.original_image_path,
        annotated_image_path: step.insp.annotated_image_path,
        expected_components: step.insp.expected_components,
        detected_components: step.insp.detected_components,
        detections: step.insp.detections,
        verification_result: step.insp.verification_result,
        inspection_status: step.insp.inspection_status,
        inspected_by: user.id,
        inspected_by_name: sanitizeText(user.name, 120, 'Station Operator'),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        parent_inspection_id: step.insp.parent_inspection_id ?? null,
        is_demo: true
      };
      if (step.insp.reinspection_notes) {
        payload.reinspection_notes = step.insp.reinspection_notes;
      }

      b.set(doc(db, 'inspections', step.insp.id), payload);
      b.update(doc(db, 'orders', step.order.id), {
        status: step.nextStatus,
        inspections_count: step.prevCount + 1,
        last_inspection_id: step.insp.inspection_id,
        updated_at: serverTimestamp()
      });
      await b.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'orders');
  }
}

export function computeAnalytics(orders: Order[], inspections: Inspection[]): AnalyticsData {
  const totalInspections = inspections.length;
  const passCount = inspections.filter((i) => i.inspection_status === 'PASS').length;
  const failCount = inspections.filter((i) => i.inspection_status === 'FAIL').length;
  const reviewCount = inspections.filter((i) => i.inspection_status === 'NEEDS_REVIEW').length;

  const packingAccuracy = totalInspections > 0 ? Math.round((passCount / totalInspections) * 100) : 100;

  const missingFreq: Record<string, number> = {};
  const extraFreq: Record<string, number> = {};

  for (const insp of inspections) {
    for (const [comp, count] of Object.entries(insp.verification_result?.missing_components || {})) {
      missingFreq[comp] = (missingFreq[comp] || 0) + count;
    }
    for (const [comp, count] of Object.entries(insp.verification_result?.extra_components || {})) {
      extraFreq[comp] = (extraFreq[comp] || 0) + count;
    }
  }

  const sortedMissing = Object.entries(missingFreq).sort((a, b) => b[1] - a[1]);
  const sortedExtra = Object.entries(extraFreq).sort((a, b) => b[1] - a[1]);

  const reinspections = inspections.filter((i) => Boolean(i.parent_inspection_id));
  const recoveredPass = reinspections.filter((i) => i.inspection_status === 'PASS').length;
  const reinspectionSuccessRate =
    reinspections.length > 0 ? Math.round((recoveredPass / reinspections.length) * 100) : 100;

  const dailyActivity: Record<string, { date: string; pass: number; fail: number; review: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    dailyActivity[key] = { date: key.slice(5), pass: 0, fail: 0, review: 0 };
  }

  for (const insp of inspections) {
    const dKey = (insp.created_at || '').split('T')[0];
    if (dailyActivity[dKey]) {
      if (insp.inspection_status === 'PASS') dailyActivity[dKey].pass++;
      else if (insp.inspection_status === 'FAIL') dailyActivity[dKey].fail++;
      else dailyActivity[dKey].review++;
    }
  }

  return {
    total_orders: orders.length,
    total_inspections: totalInspections,
    pass_count: passCount,
    fail_count: failCount,
    review_count: reviewCount,
    packing_accuracy_percentage: packingAccuracy,
    failure_percentage: totalInspections > 0 ? Math.round((failCount / totalInspections) * 100) : 0,
    review_percentage: totalInspections > 0 ? Math.round((reviewCount / totalInspections) * 100) : 0,
    most_frequently_missing: sortedMissing[0]
      ? { component: sortedMissing[0][0], count: sortedMissing[0][1] }
      : null,
    most_frequently_extra: sortedExtra[0]
      ? { component: sortedExtra[0][0], count: sortedExtra[0][1] }
      : null,
    missing_components_distribution: Object.entries(missingFreq).map(([name, value]) => ({ name, value })),
    extra_components_distribution: Object.entries(extraFreq).map(([name, value]) => ({ name, value })),
    daily_trends: Object.values(dailyActivity),
    reinspections_count: reinspections.length,
    reinspection_success_rate: reinspectionSuccessRate
  };
}
