import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp as initializeAdminApp, getApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth, DecodedIdToken } from 'firebase-admin/auth';
import { db } from './server/db.ts';
import { verifyPackingOrder } from './server/verificationEngine.ts';
import { modelService } from './server/modelService.ts';
import { DetectionItem } from './server/types.ts';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const MODEL_PATH = process.env.MODEL_PATH || 'models/best.onnx';

// Initialize Firebase Admin SDK for verifying Firebase Auth ID tokens
let firebaseProjectId = process.env.FIREBASE_PROJECT_ID || '';
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    firebaseProjectId = cfg.projectId || firebaseProjectId;
  }
} catch (err) {
  console.warn('[PackSure AI] Could not read firebase-applet-config.json:', err);
}

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeAdminApp(firebaseProjectId ? { projectId: firebaseProjectId } : undefined);
const adminAuth = getAdminAuth(adminApp);

interface AuthenticatedRequest extends Request {
  firebaseUser?: DecodedIdToken;
}

async function requireFirebaseAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Empty Bearer token.' });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email_verified) {
      return res.status(403).json({ error: 'Verified email required for station operations.' });
    }
    req.firebaseUser = decoded;
    return next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Invalid or expired Firebase authentication token.', details: err.message });
  }
}

// Increase limit for high-resolution industrial inspection images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure upload & model directories exist
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
const MODELS_DIR = path.resolve(process.cwd(), 'models');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

// Serve uploaded images statically
app.use('/uploads', express.static(UPLOAD_DIR));

// ==========================================
// API ROUTES
// ==========================================

// Health & System Status
app.get('/api/health', async (_req: Request, res: Response) => {
  const modelStatus = modelService.getStatus();

  res.json({
    status: 'ok',
    system: 'PackSure AI Verification System',
    timestamp: new Date().toISOString(),
    backend: {
      status: 'online',
      port: PORT,
      database: 'Firebase Firestore',
      auth: 'Firebase Authentication',
      engine: 'In-Process Node.js ONNX Runtime'
    },
    model_service: {
      online: true,
      model_loaded: modelStatus.loaded,
      configured_path: modelStatus.configured_path,
      resolved_onnx_path: modelStatus.resolved_onnx_path,
      file_exists: modelStatus.file_exists,
      file_readable: modelStatus.file_readable,
      file_size_bytes: modelStatus.file_size_bytes,
      load_time_ms: modelStatus.load_time_ms,
      classes: modelStatus.classes,
      framework: modelStatus.framework,
      error: modelStatus.error
    }
  });
});

// Legacy local auth routes disabled in favor of Firebase Authentication
app.post('/api/auth/login', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Use Firebase Google Sign-In on the client.' });
});

app.post('/api/auth/register', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Use Firebase Google Sign-In on the client.' });
});

app.get('/api/auth/users', requireFirebaseAuth, (_req: Request, res: Response) => {
  res.json([]);
});

// Orders Management Routes
app.get('/api/orders', (req: Request, res: Response) => {
  let orders = db.getOrders();
  const search = (req.query.search as string)?.toLowerCase();
  const status = req.query.status as string;

  if (search) {
    orders = orders.filter(
      o =>
        o.order_id.toLowerCase().includes(search) ||
        o.product_name.toLowerCase().includes(search) ||
        o.customer_reference.toLowerCase().includes(search)
    );
  }
  if (status && status !== 'all') {
    orders = orders.filter(o => o.status === status);
  }

  res.json(orders);
});

app.get('/api/orders/:id', (req: Request, res: Response) => {
  const order = db.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json(order);
});

app.post('/api/orders', (req: Request, res: Response) => {
  const { order_id, product_name, customer_reference, expected_components } = req.body;
  if (!order_id || !product_name || !expected_components) {
    return res.status(400).json({ error: 'Order ID, product name, and expected components are required' });
  }

  const existing = db.getOrderById(order_id);
  if (existing) {
    return res.status(409).json({ error: `Order with ID ${order_id} already exists` });
  }

  const newOrder = db.createOrder({
    order_id: order_id.toUpperCase().trim(),
    product_name,
    customer_reference: customer_reference || 'Standard Packaging',
    expected_components,
    status: 'pending'
  });

  res.status(201).json(newOrder);
});

app.put('/api/orders/:id', (req: Request, res: Response) => {
  const updated = db.updateOrder(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json(updated);
});

// Components Catalogue
app.get('/api/components', (_req: Request, res: Response) => {
  res.json(db.getComponents());
});

app.post('/api/components', (req: Request, res: Response) => {
  const { component_name, model_class_name, description, color } = req.body;
  if (!component_name || !model_class_name) {
    return res.status(400).json({ error: 'Component name and model class name are required' });
  }
  const newComp = db.addComponent({
    component_name,
    model_class_name,
    description: description || '',
    active: true,
    color: color || '#2563EB'
  });
  res.status(201).json(newComp);
});

// AI Inspection Execution Endpoint (Authenticated + Pure In-Process Node.js ONNX Runtime Execution)
app.post('/api/inspections/run', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      order_id,
      product_name,
      expected_components,
      image_base64,
      confidence_threshold,
      iou_threshold,
      parent_inspection_id,
      reinspection_notes,
      inspector_name
    } = req.body;

    if (!order_id || !image_base64) {
      return res.status(400).json({ error: 'order_id and image_base64 are required' });
    }

    const fallbackOrder = !expected_components ? db.getOrderById(order_id) : undefined;
    const resolvedExpected: Record<string, number> | undefined =
      expected_components || fallbackOrder?.expected_components;
    const resolvedProductName: string =
      product_name || fallbackOrder?.product_name || 'Mechanical Assembly';

    if (!resolvedExpected || Object.keys(resolvedExpected).length === 0) {
      return res.status(400).json({ error: `Expected components for order ${order_id} are required` });
    }

    const settings = db.getSettings();
    const confThreshold =
      typeof confidence_threshold === 'number'
        ? confidence_threshold
        : settings.confidence_threshold;
    const iouThreshold =
      typeof iou_threshold === 'number'
        ? iou_threshold
        : settings.iou_threshold;

    // Ensure ONNX model is initialized and readable before inference
    let modelStatus = modelService.getStatus();
    if (!modelStatus.loaded) {
      await modelService.initialize(MODEL_PATH);
      modelStatus = modelService.getStatus();
    }

    if (!modelStatus.loaded) {
      return res.status(503).json({
        error: 'MODEL_NOT_LOADED',
        message:
          modelStatus.error ||
          'Custom YOLO11 mechanical parts model is not loaded. Please ensure models/best.onnx or models/best.pt exists and is readable.',
        details: {
          configured_path: modelStatus.configured_path,
          expected_model_path: modelStatus.resolved_onnx_path,
          file_exists: modelStatus.file_exists,
          file_readable: modelStatus.file_readable,
          instructions: 'Upload your custom trained "best.pt" or "best.onnx" file via Settings -> Model Manager.'
        }
      });
    }

    // Convert base64 data to buffer
    const matches = image_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const base64Data = matches ? matches[2] : image_base64;
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Save original image to disk
    const timestamp = Date.now();
    const safeOrderCode = String(order_id).replace(/[^a-zA-Z0-9_\-]/g, '-');
    const filename = `orig_${safeOrderCode}_${timestamp}.jpg`;
    const imagePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(imagePath, imageBuffer);
    const originalImageUrl = `/uploads/${filename}`;

    const generatedInspId = `INSP-${new Date().getFullYear()}-${safeOrderCode.replace(/^ORD-/, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Execute real ONNX Runtime YOLO11 inference
    const inferenceResult = await modelService.detect(imageBuffer, confThreshold, iouThreshold);

    // Save annotated image
    let annotatedImageUrl = originalImageUrl;
    if (inferenceResult.annotated_image) {
      const annMatches = inferenceResult.annotated_image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (annMatches) {
        const annBuffer = Buffer.from(annMatches[2], 'base64');
        const annFilename = `ann_${safeOrderCode}_${timestamp}.jpg`;
        fs.writeFileSync(path.join(UPLOAD_DIR, annFilename), annBuffer);
        annotatedImageUrl = `/uploads/${annFilename}`;
      }
    }

    const detectedCounts: Record<string, number> = inferenceResult.object_counts || {};
    const detections: DetectionItem[] = inferenceResult.detections || [];

    // Run deterministic order verification engine
    const verification = verifyPackingOrder(
      resolvedExpected,
      detectedCounts,
      detections,
      confThreshold
    );

    const authUid = req.firebaseUser?.uid || 'unknown';
    const authName = inspector_name || req.firebaseUser?.name || req.firebaseUser?.email || 'Quality Inspector';

    const computedInspection = {
      id: `insp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      inspection_id: generatedInspId,
      order_id: safeOrderCode,
      product_name: resolvedProductName,
      original_image_path: originalImageUrl,
      annotated_image_path: annotatedImageUrl,
      expected_components: resolvedExpected,
      detected_components: detectedCounts,
      detections,
      verification_result: verification,
      inspection_status: verification.overall_status,
      inspected_by: authUid,
      inspected_by_name: authName,
      created_at: new Date().toISOString(),
      parent_inspection_id: parent_inspection_id || null,
      reinspection_notes: reinspection_notes || undefined,
      is_demo: false
    };

    res.status(201).json(computedInspection);
  } catch (err: any) {
    console.error('[Inspection Error]', err);
    res.status(500).json({ error: 'Inspection processing error', message: err.message });
  }
});

// Reinspection Comparison (placed before parameterized :id route)
app.get('/api/inspections/compare/:id1/:id2', (req: Request, res: Response) => {
  const insp1 = db.getInspectionById(req.params.id1);
  const insp2 = db.getInspectionById(req.params.id2);

  if (!insp1 || !insp2) {
    return res.status(404).json({ error: 'One or both inspections not found' });
  }

  const resolvedErrors: string[] = [];
  const remainingErrors: string[] = [];

  const exp = insp1.expected_components;
  for (const [comp, expectedQty] of Object.entries(exp)) {
    const det1 = insp1.detected_components[comp] || 0;
    const det2 = insp2.detected_components[comp] || 0;

    const err1 = det1 !== expectedQty;
    const err2 = det2 !== expectedQty;

    if (err1 && !err2) {
      resolvedErrors.push(
        `${comp}: Discrepancy resolved (from ${det1} detected to exact required count ${det2})`
      );
    } else if (err2) {
      remainingErrors.push(
        `${comp}: Discrepancy still present (${det2} detected vs ${expectedQty} required)`
      );
    }
  }

  res.json({
    original: insp1,
    reinspection: insp2,
    resolved_errors: resolvedErrors,
    remaining_errors: remainingErrors,
    status_transition: `${insp1.inspection_status} -> ${insp2.inspection_status}`,
    is_fully_resolved: insp2.inspection_status === 'PASS'
  });
});

// Inspections History & Retrieval
app.get('/api/inspections', (req: Request, res: Response) => {
  let list = db.getInspections();
  const orderId = req.query.order_id as string;
  const status = req.query.status as string;
  const search = (req.query.search as string)?.toLowerCase();

  if (orderId) {
    list = list.filter(i => i.order_id === orderId);
  }
  if (status && status !== 'all') {
    list = list.filter(i => i.inspection_status === status);
  }
  if (search) {
    list = list.filter(
      i =>
        i.inspection_id.toLowerCase().includes(search) ||
        i.order_id.toLowerCase().includes(search) ||
        i.product_name.toLowerCase().includes(search) ||
        i.inspected_by_name.toLowerCase().includes(search)
    );
  }

  res.json(list);
});

app.get('/api/inspections/:id', (req: Request, res: Response) => {
  const insp = db.getInspectionById(req.params.id);
  if (!insp) {
    return res.status(404).json({ error: 'Inspection not found' });
  }
  res.json(insp);
});

// Fail-safe Inspection Approval
app.post('/api/inspections/:id/approve', (req: Request, res: Response) => {
  const { approver_name } = req.body;
  try {
    const updated = db.approveInspection(req.params.id, approver_name || 'Authorized Lead Inspector');
    if (!updated) {
      return res.status(404).json({ error: 'Inspection not found' });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Quality Analytics
app.get('/api/analytics', (_req: Request, res: Response) => {
  const orders = db.getOrders();
  const inspections = db.getInspections();

  const totalInspections = inspections.length;
  const passCount = inspections.filter(i => i.inspection_status === 'PASS').length;
  const failCount = inspections.filter(i => i.inspection_status === 'FAIL').length;
  const reviewCount = inspections.filter(i => i.inspection_status === 'NEEDS_REVIEW').length;

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

  const reinspections = inspections.filter(i => !!i.parent_inspection_id);
  const recoveredPass = reinspections.filter(i => i.inspection_status === 'PASS').length;
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
    const dKey = insp.created_at.split('T')[0];
    if (dailyActivity[dKey]) {
      if (insp.inspection_status === 'PASS') dailyActivity[dKey].pass++;
      else if (insp.inspection_status === 'FAIL') dailyActivity[dKey].fail++;
      else dailyActivity[dKey].review++;
    }
  }

  res.json({
    total_orders: orders.length,
    total_inspections: totalInspections,
    pass_count: passCount,
    fail_count: failCount,
    review_count: reviewCount,
    packing_accuracy_percentage: packingAccuracy,
    failure_percentage: totalInspections > 0 ? Math.round((failCount / totalInspections) * 100) : 0,
    review_percentage: totalInspections > 0 ? Math.round((reviewCount / totalInspections) * 100) : 0,
    most_frequently_missing: sortedMissing[0] ? { component: sortedMissing[0][0], count: sortedMissing[0][1] } : null,
    most_frequently_extra: sortedExtra[0] ? { component: sortedExtra[0][0], count: sortedExtra[0][1] } : null,
    missing_components_distribution: Object.entries(missingFreq).map(([name, value]) => ({ name, value })),
    extra_components_distribution: Object.entries(extraFreq).map(([name, value]) => ({ name, value })),
    daily_trends: Object.values(dailyActivity),
    reinspections_count: reinspections.length,
    reinspection_success_rate: reinspectionSuccessRate
  });
});

// Model Info & Upload
app.get('/api/model/info', async (_req: Request, res: Response) => {
  const status = modelService.getStatus();

  res.json({
    model_loaded: status.loaded,
    model_path: status.resolved_onnx_path,
    configured_path: status.configured_path,
    model_classes: status.classes,
    framework: status.framework,
    model_name: path.basename(status.resolved_onnx_path),
    file_exists_on_disk: status.file_exists,
    file_readable: status.file_readable,
    file_size_bytes: status.file_size_bytes,
    load_time_seconds: status.load_time_ms !== null ? Number((status.load_time_ms / 1000).toFixed(3)) : null,
    full_disk_path: status.resolved_onnx_path,
    error: status.error,
    instructions: status.loaded
      ? 'Custom YOLO11 mechanical model (Bearing, Bolt, Gear, Nut) is loaded via ONNX Runtime and operational.'
      : status.error || 'Model file not loaded. Ensure a valid .onnx or .pt model is configured via MODEL_PATH.'
  });
});

app.post('/api/model/upload', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { file_base64, filename } = req.body;
    if (!file_base64) {
      return res.status(400).json({ error: 'file_base64 is required' });
    }

    const matches = file_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const rawBase64 = matches ? matches[2] : file_base64;
    const modelBuffer = Buffer.from(rawBase64, 'base64');

    const isOnnx = filename?.toLowerCase().endsWith('.onnx');
    const targetFile = path.join(MODELS_DIR, isOnnx ? 'best.onnx' : 'best.pt');
    fs.writeFileSync(targetFile, modelBuffer);

    const loaded = await modelService.reloadModel(targetFile);
    const info = modelService.getStatus();

    if (!loaded) {
      return res.status(422).json({
        error: 'MODEL_LOAD_FAILED',
        message: info.error || 'Model saved to disk but failed to initialize in ONNX Runtime.',
        model_info: info
      });
    }

    res.json({
      success: true,
      message: `Model weights successfully saved to ${targetFile} and initialized in ONNX Runtime.`,
      model_info: info
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to upload model', message: err.message });
  }
});

// Settings & Demo Reset
app.get('/api/settings', (_req: Request, res: Response) => {
  res.json(db.getSettings());
});

app.put('/api/settings', (req: Request, res: Response) => {
  const updated = db.updateSettings(req.body);
  res.json(updated);
});

app.post('/api/demo/reset', (_req: Request, res: Response) => {
  res.json(db.resetDemoData());
});

// ==========================================
// VITE SPA INTEGRATION & SERVER STARTUP
// ==========================================
async function startServer() {
  // Initialize ONNX Model Service on startup using process.env.MODEL_PATH (non-blocking if missing)
  try {
    const loaded = await modelService.initialize(MODEL_PATH);
    if (!loaded) {
      console.warn(
        `[PackSure AI] Startup notice: ONNX model not loaded (${modelService.getStatus().error}). Server will continue running; inspection endpoint will return 503 until a valid model is available.`
      );
    }
  } catch (err: any) {
    console.warn(`[PackSure AI] Model initialization warning on startup: ${err.message}`);
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(process.cwd(), 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PackSure AI] Application server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
