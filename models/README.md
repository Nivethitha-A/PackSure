# PackSure AI – Custom YOLO11 Model Directory

Place your custom trained YOLO11 model weights file here:

**File Name:** `best.pt`  
**Full Expected Path:** `/app/applet/models/best.pt`

### Model Configuration Details:
- **Framework:** Ultralytics YOLO11 (`ultralytics`)
- **Dataset Domain:** Industrial Mechanical Packing Components
- **Trained Classes (4 classes):**
  1. `Bearing`
  2. `Bolt`
  3. `Gear`
  4. `Nut`

### How to Supply the Model:
1. **Via UI (Recommended):** Open PackSure AI -> Settings -> YOLO Model Manager -> Click "Upload Model Weights (best.pt)".
2. **Via File System:** Copy or move `best.pt` directly into `models/best.pt`.
3. **Via Environment Variable:** Point `MODEL_PATH` in `.env` to any custom path containing `best.pt`.

Once placed, PackSure AI automatically loads the weights into the Python FastAPI microservice (`inference_service/main.py`) and runs real-time computer vision inference.
