import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import { DetectionItem } from './types.ts';

const execAsync = promisify(exec);

export const MODEL_CLASSES = ['Bearing', 'Bolt', 'Gear', 'Nut'] as const;

const CLASS_COLORS: Record<string, string> = {
  Bearing: '#2563EB', // Blue
  Bolt: '#16A34A',    // Green
  Gear: '#D97706',    // Amber
  Nut: '#9333EA'      // Purple
};

export interface ModelFileCheck {
  path: string;
  exists: boolean;
  readable: boolean;
  isFile: boolean;
  sizeBytes: number;
  error?: string;
}

export interface ModelStatus {
  loaded: boolean;
  configured_path: string;
  resolved_onnx_path: string;
  file_exists: boolean;
  file_readable: boolean;
  file_size_bytes: number;
  framework: string;
  classes: string[];
  input_names: string[];
  output_names: string[];
  load_time_ms: number | null;
  error: string | null;
}

export interface YoloInferenceResult {
  success: boolean;
  model_status: {
    loaded: boolean;
    model_path: string;
    framework: string;
    inference_time_ms: number;
    classes: string[];
    confidence_threshold: number;
  };
  image_dimensions: {
    width: number;
    height: number;
  };
  total_detected_objects: number;
  detected_class_names: string[];
  object_counts: Record<string, number>;
  detections: DetectionItem[];
  annotated_image: string;
}

class ModelService {
  private session: ort.InferenceSession | null = null;
  private configuredPath: string = process.env.MODEL_PATH || 'models/best.onnx';
  private resolvedOnnxPath: string = path.resolve(process.cwd(), 'models/best.onnx');
  private isLoaded: boolean = false;
  private fileExists: boolean = false;
  private fileReadable: boolean = false;
  private fileSizeBytes: number = 0;
  private loadTimeMs: number | null = null;
  private loadError: string | null = null;

  /**
   * Verify if a model file exists on disk, is a regular file, and is readable.
   */
  public async verifyModelFile(targetPath: string): Promise<ModelFileCheck> {
    const absPath = path.isAbsolute(targetPath)
      ? targetPath
      : path.resolve(process.cwd(), targetPath);

    try {
      await fs.promises.access(absPath, fs.constants.F_OK);
    } catch {
      return {
        path: absPath,
        exists: false,
        readable: false,
        isFile: false,
        sizeBytes: 0,
        error: `Model file does not exist at ${absPath}`
      };
    }

    try {
      const stat = await fs.promises.stat(absPath);
      if (!stat.isFile()) {
        return {
          path: absPath,
          exists: true,
          readable: false,
          isFile: false,
          sizeBytes: 0,
          error: `Path exists at ${absPath} but is not a regular file`
        };
      }

      if (stat.size === 0) {
        return {
          path: absPath,
          exists: true,
          readable: false,
          isFile: true,
          sizeBytes: 0,
          error: `Model file at ${absPath} is empty (0 bytes)`
        };
      }

      await fs.promises.access(absPath, fs.constants.R_OK);

      return {
        path: absPath,
        exists: true,
        readable: true,
        isFile: true,
        sizeBytes: stat.size
      };
    } catch (err: any) {
      return {
        path: absPath,
        exists: true,
        readable: false,
        isFile: true,
        sizeBytes: 0,
        error: `Model file at ${absPath} is not readable: ${err.message}`
      };
    }
  }

  /**
   * Initialize the ONNX Runtime inference session using process.env.MODEL_PATH (or override).
   * If configured path points to a .pt file, locates or exports the corresponding .onnx file.
   */
  public async initialize(modelPathOverride?: string): Promise<boolean> {
    const startTime = Date.now();
    this.configuredPath = modelPathOverride || process.env.MODEL_PATH || 'models/best.onnx';
    const absConfigured = path.isAbsolute(this.configuredPath)
      ? this.configuredPath
      : path.resolve(process.cwd(), this.configuredPath);

    this.isLoaded = false;
    this.session = null;
    this.loadError = null;

    let onnxTargetPath = absConfigured;

    // If MODEL_PATH specifies a PyTorch .pt file (e.g. models/best.pt), check both .pt and sibling .onnx
    if (absConfigured.toLowerCase().endsWith('.pt')) {
      const ptCheck = await this.verifyModelFile(absConfigured);
      onnxTargetPath = absConfigured.replace(/\.pt$/i, '.onnx');
      const onnxCheck = await this.verifyModelFile(onnxTargetPath);

      if (!onnxCheck.exists && ptCheck.exists && ptCheck.readable) {
        try {
          console.log(`[ModelService] Converting ${absConfigured} to ONNX for Node.js ONNX Runtime...`);
          await execAsync(
            `python3 -c "from ultralytics import YOLO; model = YOLO('${absConfigured}'); model.export(format='onnx', opset=12, dynamic=False, imgsz=640)"`
          );
        } catch (convErr: any) {
          this.loadError = `Found .pt model at ${absConfigured} but failed to export to ONNX: ${convErr.message}`;
          console.error(`[ModelService] ${this.loadError}`);
          this.resolvedOnnxPath = onnxTargetPath;
          this.fileExists = false;
          this.fileReadable = false;
          this.fileSizeBytes = 0;
          return false;
        }
      } else if (!onnxCheck.exists && !ptCheck.exists) {
        this.resolvedOnnxPath = onnxTargetPath;
        this.fileExists = false;
        this.fileReadable = false;
        this.fileSizeBytes = 0;
        this.loadError = ptCheck.error || `Model file not found at ${absConfigured}`;
        console.warn(`[ModelService] ${this.loadError}`);
        return false;
      }
    }

    this.resolvedOnnxPath = onnxTargetPath;

    // Verify ONNX model file exists and is readable
    const check = await this.verifyModelFile(onnxTargetPath);
    this.fileExists = check.exists;
    this.fileReadable = check.readable;
    this.fileSizeBytes = check.sizeBytes;

    if (!check.exists || !check.readable) {
      this.loadError = check.error || `Cannot read ONNX model at ${onnxTargetPath}`;
      console.warn(`[ModelService] ${this.loadError}`);
      return false;
    }

    try {
      console.log(
        `[ModelService] Loading ONNX model from ${onnxTargetPath} (${(check.sizeBytes / (1024 * 1024)).toFixed(2)} MB)...`
      );
      this.session = await ort.InferenceSession.create(onnxTargetPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all'
      });
      this.isLoaded = true;
      this.loadTimeMs = Date.now() - startTime;
      this.loadError = null;
      console.log(
        `[ModelService] ONNX Runtime session initialized in ${this.loadTimeMs}ms. Inputs: [${this.session.inputNames.join(', ')}], Outputs: [${this.session.outputNames.join(', ')}]`
      );
      return true;
    } catch (err: any) {
      this.isLoaded = false;
      this.session = null;
      this.loadTimeMs = null;
      this.loadError = `Failed to load ONNX Runtime session from ${onnxTargetPath}: ${err.message}`;
      console.error(`[ModelService] ${this.loadError}`);
      return false;
    }
  }

  public async reloadModel(modelPathOverride?: string): Promise<boolean> {
    return this.initialize(modelPathOverride);
  }

  public getStatus(): ModelStatus {
    return {
      loaded: this.isLoaded,
      configured_path: this.configuredPath,
      resolved_onnx_path: this.resolvedOnnxPath,
      file_exists: this.fileExists,
      file_readable: this.fileReadable,
      file_size_bytes: this.fileSizeBytes,
      framework: 'ONNX Runtime (Node.js - Ultralytics YOLO11)',
      classes: [...MODEL_CLASSES],
      input_names: this.session ? [...this.session.inputNames] : [],
      output_names: this.session ? [...this.session.outputNames] : [],
      load_time_ms: this.loadTimeMs,
      error: this.loadError
    };
  }

  /**
   * Run YOLO11 object detection in-process via ONNX Runtime on an uploaded image buffer.
   */
  public async detect(
    imageBuffer: Buffer,
    confThreshold: number = parseFloat(process.env.CONF_THRESHOLD || '0.50'),
    iouThreshold: number = parseFloat(process.env.IOU_THRESHOLD || '0.45')
  ): Promise<YoloInferenceResult> {
    if (!this.isLoaded || !this.session) {
      const initialized = await this.initialize();
      if (!initialized || !this.session) {
        throw new Error(
          `YOLO ONNX model is not loaded. ${this.loadError || 'Ensure a valid .onnx or .pt model is configured via MODEL_PATH.'}`
        );
      }
    }

    const startTimer = Date.now();

    // 1. Inspect original image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const origWidth = metadata.width || 640;
    const origHeight = metadata.height || 640;

    // 2. Preprocess: Letterbox resize & pad to 640x640 RGB
    const targetSize = 640;
    const scale = Math.min(targetSize / origWidth, targetSize / origHeight);
    const scaledW = Math.round(origWidth * scale);
    const scaledH = Math.round(origHeight * scale);
    const padX = Math.floor((targetSize - scaledW) / 2);
    const padY = Math.floor((targetSize - scaledH) / 2);

    const resizedBuffer = await sharp(imageBuffer)
      .resize(scaledW, scaledH)
      .extend({
        top: padY,
        bottom: targetSize - scaledH - padY,
        left: padX,
        right: targetSize - scaledW - padX,
        background: { r: 114, g: 114, b: 114 }
      })
      .removeAlpha()
      .raw()
      .toBuffer();

    // 3. Build NCHW Float32 tensor [1, 3, 640, 640] normalized [0..1]
    const planeSize = targetSize * targetSize;
    const floatArr = new Float32Array(3 * planeSize);
    for (let i = 0; i < planeSize; i++) {
      floatArr[i] = resizedBuffer[i * 3] / 255.0;
      floatArr[planeSize + i] = resizedBuffer[i * 3 + 1] / 255.0;
      floatArr[2 * planeSize + i] = resizedBuffer[i * 3 + 2] / 255.0;
    }

    const inputName = this.session.inputNames[0] || 'images';
    const outputName = this.session.outputNames[0] || 'output0';
    const inputTensor = new ort.Tensor('float32', floatArr, [1, 3, targetSize, targetSize]);

    // 4. Execute ONNX inference
    const outputMap = await this.session.run({ [inputName]: inputTensor });
    const outputTensor = outputMap[outputName];
    const data = outputTensor.data as Float32Array;
    const dims = outputTensor.dims; // [1, 8, 8400]
    const numAnchors = dims.length === 3 ? dims[2] : 8400;

    // 5. Decode candidate detections
    interface BoxCandidate {
      classIndex: number;
      className: string;
      confidence: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x1Norm: number;
      y1Norm: number;
      x2Norm: number;
      y2Norm: number;
    }

    const candidates: BoxCandidate[] = [];

    for (let col = 0; col < numAnchors; col++) {
      let maxScore = -1;
      let maxClass = -1;

      for (let c = 0; c < MODEL_CLASSES.length; c++) {
        const score = data[(4 + c) * numAnchors + col];
        if (score > maxScore) {
          maxScore = score;
          maxClass = c;
        }
      }

      if (maxScore >= confThreshold && maxClass >= 0) {
        const cx = data[0 * numAnchors + col];
        const cy = data[1 * numAnchors + col];
        const w = data[2 * numAnchors + col];
        const h = data[3 * numAnchors + col];

        const x1Scaled = cx - w / 2 - padX;
        const y1Scaled = cy - h / 2 - padY;
        const x2Scaled = cx + w / 2 - padX;
        const y2Scaled = cy + h / 2 - padY;

        const x1 = Math.max(0, Math.min(origWidth, Math.round(x1Scaled / scale)));
        const y1 = Math.max(0, Math.min(origHeight, Math.round(y1Scaled / scale)));
        const x2 = Math.max(0, Math.min(origWidth, Math.round(x2Scaled / scale)));
        const y2 = Math.max(0, Math.min(origHeight, Math.round(y2Scaled / scale)));

        if (x2 > x1 && y2 > y1) {
          candidates.push({
            classIndex: maxClass,
            className: MODEL_CLASSES[maxClass],
            confidence: Number(maxScore.toFixed(4)),
            x1,
            y1,
            x2,
            y2,
            x1Norm: Number((x1 / origWidth).toFixed(4)),
            y1Norm: Number((y1 / origHeight).toFixed(4)),
            x2Norm: Number((x2 / origWidth).toFixed(4)),
            y2Norm: Number((y2 / origHeight).toFixed(4))
          });
        }
      }
    }

    // 6. Non-Maximum Suppression (NMS)
    candidates.sort((a, b) => b.confidence - a.confidence);
    const kept: BoxCandidate[] = [];
    const suppressed = new Uint8Array(candidates.length);

    for (let i = 0; i < candidates.length; i++) {
      if (suppressed[i]) continue;
      const a = candidates[i];
      kept.push(a);

      const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);

      for (let j = i + 1; j < candidates.length; j++) {
        if (suppressed[j]) continue;
        const b = candidates[j];

        const interX1 = Math.max(a.x1, b.x1);
        const interY1 = Math.max(a.y1, b.y1);
        const interX2 = Math.min(a.x2, b.x2);
        const interY2 = Math.min(a.y2, b.y2);

        const interW = Math.max(0, interX2 - interX1);
        const interH = Math.max(0, interY2 - interY1);
        const interArea = interW * interH;

        if (interArea > 0) {
          const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
          const unionArea = areaA + areaB - interArea;
          const iou = interArea / unionArea;

          if (iou >= iouThreshold) {
            suppressed[j] = 1;
          }
        }
      }
    }

    // 7. Count detected classes
    const objectCounts: Record<string, number> = {
      Bearing: 0,
      Bolt: 0,
      Gear: 0,
      Nut: 0
    };

    const finalDetections: DetectionItem[] = kept.map((box) => {
      objectCounts[box.className] = (objectCounts[box.className] || 0) + 1;
      return {
        class_name: box.className,
        confidence: box.confidence,
        bbox: [box.x1, box.y1, box.x2, box.y2],
        bbox_normalized: [box.x1Norm, box.y1Norm, box.x2Norm, box.y2Norm]
      };
    });

    // 8. Draw clean bounding boxes onto original image via SVG overlay
    let svgOverlay = `<svg width="${origWidth}" height="${origHeight}" xmlns="http://www.w3.org/2000/svg">`;
    const strokeWidth = Math.max(2, Math.round(Math.min(origWidth, origHeight) * 0.005));
    const fontSize = Math.max(12, Math.round(strokeWidth * 3.5));

    for (const d of finalDetections) {
      const [x1, y1, x2, y2] = d.bbox;
      const w = x2 - x1;
      const h = y2 - y1;
      const color = CLASS_COLORS[d.class_name] || '#EF4444';
      const label = `${d.class_name} ${Math.round(d.confidence * 100)}%`;
      const labelW = label.length * (fontSize * 0.6) + 10;
      const labelH = fontSize + 6;
      const tagY = Math.max(0, y1 - labelH);

      svgOverlay += `
        <rect x="${x1}" y="${y1}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" rx="2" />
        <rect x="${x1}" y="${tagY}" width="${labelW}" height="${labelH}" fill="${color}" rx="2" />
        <text x="${x1 + 5}" y="${tagY + fontSize}" fill="#FFFFFF" font-family="sans-serif" font-size="${fontSize}px" font-weight="bold">${label}</text>
      `;
    }
    svgOverlay += `</svg>`;

    const annotatedBuffer = await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    const annotatedBase64 = `data:image/jpeg;base64,${annotatedBuffer.toString('base64')}`;
    const inferenceTimeMs = Date.now() - startTimer;

    const detectedClassNames = Object.entries(objectCounts)
      .filter(([_, count]) => count > 0)
      .map(([cls]) => cls);

    return {
      success: true,
      model_status: {
        loaded: true,
        model_path: this.resolvedOnnxPath,
        framework: 'ONNX Runtime (Node.js - Ultralytics YOLO11)',
        inference_time_ms: inferenceTimeMs,
        classes: [...MODEL_CLASSES],
        confidence_threshold: confThreshold
      },
      image_dimensions: {
        width: origWidth,
        height: origHeight
      },
      total_detected_objects: finalDetections.length,
      detected_class_names: detectedClassNames,
      object_counts: objectCounts,
      detections: finalDetections,
      annotated_image: annotatedBase64
    };
  }
}

export const modelService = new ModelService();
