import http from 'http';
import https from 'https';
import { ModelInfoResponse, DetectionItem } from './types.ts';

const INFERENCE_URL = process.env.INFERENCE_SERVICE_URL || 'http://127.0.0.1:8001';

export interface InferenceInspectResult {
  success: boolean;
  inspection_id?: string;
  model_status?: any;
  image_dimensions?: { width: number; height: number };
  total_detected_objects?: number;
  detected_class_names?: string[];
  object_counts?: Record<string, number>;
  detections?: DetectionItem[];
  annotated_image?: string;
  error?: string;
  message?: string;
}

export async function checkInferenceHealth(): Promise<{ online: boolean; model_loaded: boolean; details?: any }> {
  try {
    const res = await fetch(`${INFERENCE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      return { online: false, model_loaded: false };
    }
    const data = await res.json();
    return {
      online: true,
      model_loaded: !!data.model_loaded,
      details: data
    };
  } catch (err: any) {
    return {
      online: false,
      model_loaded: false,
      details: { error: err.message }
    };
  }
}

export async function getModelInfo(): Promise<ModelInfoResponse> {
  try {
    const res = await fetch(`${INFERENCE_URL}/api/model-info`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      return await res.json();
    }
    return {
      model_loaded: false,
      model_path: 'models/best.pt',
      model_classes: ['Bearing', 'Bolt', 'Gear', 'Nut'],
      framework: 'Ultralytics YOLO11',
      model_name: 'best.pt',
      error: `Inference service responded with status ${res.status}`,
      instructions: 'Please check that the Python FastAPI inference microservice is running on port 8001.'
    };
  } catch (err: any) {
    return {
      model_loaded: false,
      model_path: 'models/best.pt',
      model_classes: ['Bearing', 'Bolt', 'Gear', 'Nut'],
      framework: 'Ultralytics YOLO11',
      model_name: 'best.pt',
      error: `Inference microservice unreachable: ${err.message}`,
      instructions: "Place your trained 'best.pt' in the 'models/' directory and start the inference microservice."
    };
  }
}

export async function runInference(
  imageBuffer: Buffer,
  filename: string,
  mimetype: string,
  confidenceThreshold: number = 0.50,
  iouThreshold: number = 0.45,
  inspectionId?: string
): Promise<InferenceInspectResult> {
  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimetype || 'image/jpeg' });
    formData.append('file', blob, filename || 'inspection.jpg');
    formData.append('confidence_threshold', String(confidenceThreshold));
    formData.append('iou_threshold', String(iouThreshold));
    if (inspectionId) {
      formData.append('inspection_id', inspectionId);
    }

    const res = await fetch(`${INFERENCE_URL}/api/inspect`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(60000) // 60s timeout for model inference
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 503) {
        return {
          success: false,
          error: 'MODEL_NOT_LOADED',
          message: data.detail?.message || 'Model best.pt is not loaded. Please upload or place best.pt in the models directory.'
        };
      }
      return {
        success: false,
        error: 'INFERENCE_FAILED',
        message: data.detail?.message || data.detail || 'YOLO inference failed'
      };
    }

    return {
      success: true,
      ...data
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'INFERENCE_SERVICE_UNAVAILABLE',
      message: `Failed to connect to Python YOLO11 inference microservice at ${INFERENCE_URL}: ${err.message}`
    };
  }
}

export async function uploadModelWeights(modelBuffer: Buffer, filename: string): Promise<any> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(modelBuffer)], { type: 'application/octet-stream' });
  formData.append('file', blob, filename);

  const res = await fetch(`${INFERENCE_URL}/api/upload-model`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(30000)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Failed to upload model weights');
  }
  return data;
}
