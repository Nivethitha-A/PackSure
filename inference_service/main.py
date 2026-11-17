"""
PackSure AI - YOLO11 Inference Microservice
Dedicated Python FastAPI service loading custom-trained mechanical components model (best.pt)
Classes: Bearing, Bolt, Gear, Nut
"""

import os
import io
import time
import uuid
import base64
import logging
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageDraw, ImageFont

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("packsure_yolo")

app = FastAPI(
    title="PackSure AI - YOLO11 Inference Service",
    description="Dedicated microservice for industrial packing verification using custom YOLO11 model (best.pt)",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
DEFAULT_MODEL_PATH = os.environ.get("MODEL_PATH", "models/best.pt")
CONFIDENCE_THRESHOLD = float(os.environ.get("CONF_THRESHOLD", "0.50"))
EXPECTED_CLASSES = ["Bearing", "Bolt", "Gear", "Nut"]

# Global model state
yolo_model = None
model_load_error = None
model_info = {
    "loaded": False,
    "path": DEFAULT_MODEL_PATH,
    "classes": EXPECTED_CLASSES,
    "framework": "Ultralytics YOLO11",
    "load_time": None
}

def load_yolo_model(model_path: str = DEFAULT_MODEL_PATH):
    global yolo_model, model_load_error, model_info
    logger.info(f"Attempting to load YOLO model from: {model_path}")
    
    if not os.path.exists(model_path):
        err = f"Model file not found at '{model_path}'. Expected custom YOLO11 model 'best.pt'."
        logger.warning(err)
        yolo_model = None
        model_load_error = err
        model_info["loaded"] = False
        model_info["path"] = model_path
        model_info["error"] = err
        return False
        
    try:
        from ultralytics import YOLO
        logger.info(f"Loading weights from {model_path} into memory...")
        start_t = time.time()
        model = YOLO(model_path)
        yolo_model = model
        model_load_error = None
        
        # Extract class names if defined in weights
        classes = EXPECTED_CLASSES
        if hasattr(model, "names") and model.names:
            if isinstance(model.names, dict):
                classes = [model.names[k] for k in sorted(model.names.keys())]
            elif isinstance(model.names, list):
                classes = model.names
                
        model_info["loaded"] = True
        model_info["path"] = model_path
        model_info["classes"] = classes
        model_info["load_time"] = round(time.time() - start_t, 3)
        model_info.pop("error", None)
        logger.info(f"Successfully loaded YOLO11 model in {model_info['load_time']}s. Classes: {classes}")
        return True
    except Exception as e:
        err = f"Failed to load YOLO model from '{model_path}': {str(e)}"
        logger.error(err)
        yolo_model = None
        model_load_error = err
        model_info["loaded"] = False
        model_info["error"] = err
        return False

# Attempt load on startup
@app.on_event("startup")
async def startup_event():
    os.makedirs(os.path.dirname(DEFAULT_MODEL_PATH) or "models", exist_ok=True)
    load_yolo_model(DEFAULT_MODEL_PATH)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "PackSure AI YOLO Inference Microservice",
        "model_loaded": model_info["loaded"],
        "model_path": model_info["path"],
        "expected_classes": EXPECTED_CLASSES
    }

@app.get("/api/model-info")
def get_model_info():
    return {
        "model_loaded": model_info["loaded"],
        "model_path": model_info["path"],
        "model_classes": model_info.get("classes", EXPECTED_CLASSES),
        "framework": model_info.get("framework", "Ultralytics YOLO11"),
        "model_name": os.path.basename(model_info["path"]),
        "load_time_seconds": model_info.get("load_time"),
        "error": model_load_error if not model_info["loaded"] else None,
        "instructions": (
            "Model is active and ready for inference."
            if model_info["loaded"]
            else f"Please place your trained 'best.pt' file at '{os.path.abspath(DEFAULT_MODEL_PATH)}' or upload it via POST /api/upload-model."
        )
    }

@app.post("/api/upload-model")
async def upload_model(file: UploadFile = File(...)):
    """Upload or replace the custom best.pt model file"""
    if not file.filename.endswith(".pt"):
        raise HTTPException(status_code=400, detail="Only .pt PyTorch YOLO model files are accepted.")
    
    os.makedirs(os.path.dirname(DEFAULT_MODEL_PATH) or "models", exist_ok=True)
    target_path = DEFAULT_MODEL_PATH
    
    logger.info(f"Saving uploaded model file: {file.filename} to {target_path}")
    content = await file.read()
    with open(target_path, "wb") as f:
        f.write(content)
        
    success = load_yolo_model(target_path)
    if not success:
        raise HTTPException(
            status_code=500,
            detail=f"Model saved to {target_path} but failed to load: {model_load_error}"
        )
        
    return {
        "message": f"Successfully uploaded and loaded custom YOLO11 model '{file.filename}'.",
        "model_info": model_info
    }

def annotate_image_fallback(image: Image.Image, detections: List[Dict[str, Any]]) -> str:
    """Draw clean bounding boxes and class labels onto the image and return base64 string"""
    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    
    # Class colors: Bearing (blue), Bolt (green), Gear (amber), Nut (purple)
    palette = {
        "Bearing": "#2563EB",
        "Bolt": "#16A34A",
        "Gear": "#D97706",
        "Nut": "#9333EA"
    }
    
    w, h = annotated.size
    line_w = max(2, int(min(w, h) * 0.004))
    
    for det in detections:
        box = det["bbox"] # [x1, y1, x2, y2]
        cls_name = det["class_name"]
        conf = det["confidence"]
        color = palette.get(cls_name, "#EF4444")
        
        # Draw box
        draw.rectangle(box, outline=color, width=line_w)
        
        # Label background
        label = f"{cls_name} {int(conf * 100)}%"
        # Draw small tag
        tag_x1, tag_y1 = box[0], max(0, box[1] - 18)
        tag_x2 = tag_x1 + (len(label) * 8) + 8
        tag_y2 = tag_y1 + 18
        draw.rectangle([tag_x1, tag_y1, tag_x2, tag_y2], fill=color)
        draw.text((tag_x1 + 4, tag_y1 + 2), label, fill="#FFFFFF")
        
    buf = io.BytesIO()
    annotated.save(buf, format="JPEG", quality=88)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

@app.post("/api/inspect")
async def inspect_image(
    file: UploadFile = File(...),
    confidence_threshold: float = Form(0.50),
    iou_threshold: float = Form(0.45),
    inspection_id: Optional[str] = Form(None)
):
    """
    Main YOLO11 inference endpoint.
    Performs true object detection using loaded custom weights (best.pt).
    """
    global yolo_model
    
    # Fail-safe check: Model must be loaded
    if not model_info["loaded"] or yolo_model is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "MODEL_NOT_LOADED",
                "message": (
                    f"Custom YOLO model 'best.pt' is not loaded. "
                    f"Expected model location: {os.path.abspath(DEFAULT_MODEL_PATH)}. "
                    "Please upload or place the trained 'best.pt' file before performing AI verification."
                ),
                "model_status": model_info
            }
        )

    # Read and validate image
    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Empty image file received.")

    try:
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")

    orig_w, orig_h = image.size
    
    # Generate unique inspection ID if not provided
    iid = inspection_id or f"INSP-{int(time.time())}-{uuid.uuid4().hex[:6].upper()}"

    # Execute actual Ultralytics YOLO inference
    start_t = time.time()
    try:
        results = yolo_model.predict(
            source=image,
            conf=confidence_threshold,
            iou=iou_threshold,
            verbose=False
        )
        inference_time_ms = round((time.time() - start_t) * 1000, 1)
    except Exception as e:
        logger.error(f"Inference failure: {str(e)}")
        raise HTTPException(status_code=500, detail=f"YOLO inference runtime error: {str(e)}")

    detections = []
    object_counts = {cls: 0 for cls in EXPECTED_CLASSES}
    
    # Parse Ultralytics result
    result = results[0]
    boxes = result.boxes
    
    annotated_base64 = None
    
    if boxes is not None and len(boxes) > 0:
        names = yolo_model.names
        for box in boxes:
            cls_id = int(box.cls[0].item())
            cls_name = names.get(cls_id, f"class_{cls_id}") if isinstance(names, dict) else names[cls_id]
            conf = float(box.conf[0].item())
            xyxy = box.xyxy[0].tolist() # [x1, y1, x2, y2]
            
            # Count detected class
            if cls_name not in object_counts:
                object_counts[cls_name] = 0
            object_counts[cls_name] += 1
            
            detections.append({
                "class_name": cls_name,
                "confidence": round(conf, 4),
                "bbox": [round(c, 1) for c in xyxy],
                "bbox_normalized": [
                    round(xyxy[0] / orig_w, 4),
                    round(xyxy[1] / orig_h, 4),
                    round(xyxy[2] / orig_w, 4),
                    round(xyxy[3] / orig_h, 4)
                ]
            })

    # Render annotated image
    try:
        # Use result.plot() if available
        plotted_bgr = result.plot() # numpy array
        plotted_rgb = Image.fromarray(plotted_bgr[..., ::-1]) # BGR to RGB
        buf = io.BytesIO()
        plotted_rgb.save(buf, format="JPEG", quality=88)
        annotated_base64 = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:
        logger.warning(f"Ultralytics plot failed, falling back to PIL drawer: {e}")
        annotated_base64 = annotate_image_fallback(image, detections)

    detected_classes = [c for c, count in object_counts.items() if count > 0]

    return {
        "inspection_id": iid,
        "model_status": {
            "loaded": True,
            "model_path": model_info["path"],
            "framework": "Ultralytics YOLO11",
            "inference_time_ms": inference_time_ms,
            "confidence_threshold": confidence_threshold
        },
        "image_dimensions": {
            "width": orig_w,
            "height": orig_h
        },
        "total_detected_objects": len(detections),
        "detected_class_names": detected_classes,
        "object_counts": object_counts,
        "detections": detections,
        "annotated_image": annotated_base64
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("INFERENCE_PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
