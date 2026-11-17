# PackSure AI – Intelligent AI-Powered Packing Verification System
*Verify Every Part. Prevent Every Packing Error.*

PackSure AI is a commercial-grade industrial software product engineered for manufacturing companies, warehouses, assembly units, and fulfillment centers. It performs order-aware computer vision packing verification with fail-safe approval, corrective guidance, reinspection workflows, and digital traceability.

---

## 1. System Architecture

PackSure AI uses a microservice architecture separating web delivery, application state, and real-time computer vision inference:

1. **Frontend**: React 19, TypeScript, Tailwind CSS, Recharts, Lucide Icons, jsPDF. Desktop-first industrial SaaS dashboard.
2. **Application Backend**: Node.js Express server (`server.ts`) on port 3000 handling user sessions, order bills of materials, database persistence, audit history, and verification rules.
3. **Inference Microservice**: Dedicated Python FastAPI service (`inference_service/main.py`) on port 8001 loading the custom YOLO11 model weights (`models/best.pt`) once into memory for fast object detection.
4. **Database & Storage**: Structured database layer with atomic file writes (`data/packsure_db.json`), retaining complete audit trails, digital signatures, and inspection images in `uploads/`.

---

## 2. Mandatory Custom YOLO11 Model (`best.pt`)

The system is configured specifically for your custom-trained YOLO11 mechanical parts model (`best.pt`) with four trained classes:
1. **Bearing**
2. **Bolt**
3. **Gear**
4. **Nut**

### Where to Place `best.pt`:
- **File Name:** `best.pt`
- **Location:** `models/best.pt` (full path: `/app/applet/models/best.pt`)
- **Direct Upload via UI:** Navigate to **Settings & Model** in the PackSure AI navigation bar -> Drag and drop or browse to select `best.pt`. The Python inference microservice will immediately reload the weights into memory.

*Note: In compliance with industrial safety and anti-fabrication standards, PackSure AI never replaces your custom model with a generic pretrained COCO model or LLM vision approximation. If `best.pt` is not loaded, the system explicitly flags the missing model file and guides the operator to upload it.*

---

## 3. Quickstart & Execution Commands

### Prerequisites
- Node.js 18+ and npm
- Python 3.10+ with `fastapi`, `uvicorn`, `python-multipart`, `pillow`, `numpy`, and `ultralytics`

### Installation
```bash
# 1. Install Node.js frontend and backend dependencies
npm install

# 2. Install Python inference microservice dependencies
pip install fastapi uvicorn python-multipart pillow numpy requests ultralytics
```

### Starting the Full-Stack Application
```bash
# Starts both the Express server (port 3000) and spawns the Python YOLO microservice (port 8001)
npm run dev
```

Open your browser at `http://localhost:3000` (or your assigned AI Studio URL).

---

## 4. Built-in User Accounts & Roles

| Role | Email | Password | Permissions |
|---|---|---|---|
| **Administrator** | `admin@packsure.ai` | `admin123` | Full control, user management, system settings, model configuration, demo data resets. |
| **Quality Inspector** | `inspector@packsure.ai` | `inspect123` | Order inspection, digital dispatch approval, reinspection comparison, PDF reports. |
| **Packing Operator** | `operator@packsure.ai` | `pack123` | View assigned packing lists, perform packaging image capture, follow corrective guidance. |

*Quick-login buttons are provided on the login page to easily switch between roles during review.*

---

## 5. Verification Rules & Fail-Safe Approval

- **PASS**: All detected mechanical component quantities strictly match the selected order's Bill of Materials, and all individual detection confidence scores satisfy the threshold (default: 50%). **Only PASS inspections can be digitally approved for dispatch.**
- **FAIL**: A confirmed mismatch exists (missing parts, extra parts, or quantity mismatch). Dispatches are strictly locked. Actionable guidance is automatically generated (e.g., *"1 Bolt missing. Add 1 Bolt and perform reinspection"*).
- **NEEDS REVIEW**: Model output is ambiguous, confidence is low, or lighting/blur warnings are flagged during pre-flight checks. Approval is locked until manual review.

---

## 6. API Reference

### Inference Microservice (Port 8001)
- `GET /health` – Returns service status and `model_loaded` boolean.
- `GET /api/model-info` – Returns model classes, loaded status, and framework info.
- `POST /api/inspect` – Accepts `file: UploadFile`, `confidence_threshold`, `iou_threshold`. Returns bounding boxes, counts, and annotated image.
- `POST /api/upload-model` – Accepts `file: UploadFile` (.pt) and reloads model into memory.

### Application Backend (Port 3000)
- `GET /api/health` – Comprehensive full-stack system health status.
- `POST /api/auth/login` – Authenticates user credentials.
- `GET /api/orders` – Retrieves packing orders with status and search filters.
- `POST /api/orders` – Creates new order with expected component bill of materials.
- `POST /api/inspections/run` – Executes AI inspection workflow and verification engine.
- `POST /api/inspections/:id/approve` – Digitally signs off and authorizes package dispatch (PASS only).
- `GET /api/inspections/compare/:id1/:id2` – Computes delta between initial failure and subsequent reinspection.
- `GET /api/analytics` – Aggregates live quality assurance metrics and Pareto defect distributions.
- `POST /api/model/upload` – Receives `best.pt` file upload and notifies Python service.
