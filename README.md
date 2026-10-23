# CampusGate AI - College Gate Face Scanning & Attendance System

An intelligent, real-time facial recognition attendance system designed for college gate security, administrative tracking, and student entry logging.

![CampusGate AI](https://img.shields.io/badge/Python-3.11-blue.svg)
![OpenCV](https://img.shields.io/badge/OpenCV-5.0%20YuNet%20%2B%20SFace-green.svg)
![Status](https://img.shields.io/badge/Status-Live%20Ready-emerald.svg)

---

## 🌟 Key Features

1. **Real-time Face Scanning & Detection**:
   - Deep learning face detection using **OpenCV YuNet** and 128-D facial feature embeddings via **SFace**.
   - Sub-second recognition speed (< 150ms per frame) for high-traffic college gates.
   - Dynamic visual overlays: Green bounding boxes with Name, Department, and Roll Number for verified students; Red warning boxes for unknown persons.

2. **Automated Entry Logging**:
   - Automatically records entry info: **Student Name**, **Time**, **Department**, **Date**, **Roll Number**, **Gate Name**, and **Confidence Score**.
   - **Anti-Spam / Cooldown Debounce**: Configurable cooldown (default 3 minutes) prevents repetitive logging when students linger near the gate.
   - Saves cropped facial snapshots at each verified entry.

3. **Audio & Voice Announcements**:
   - Instant text-to-speech greeting: *"Welcome, Aarav Sharma. Entry recorded for Computer Science & Engineering."*
   - Synthesized chime feedback for security personnel.

4. **Attendance Management & CSV Export**:
   - Filter attendance by **Date**, **Department**, or **Student Name / Roll Number**.
   - One-click **Export to CSV** for college administration and reporting.
   - Manual entry override for visitors or students with card check-in.

5. **Student Directory & Enrollment**:
   - Enroll new students in seconds using live webcam snapshot or photo upload.
   - Pre-seeded demo student profiles across various engineering departments.

6. **Gate Analytics Dashboard**:
   - Real-time counters for Today's Total Entries and Unique Students.
   - Visual charts: Department distribution and Peak gate arrival hours.

---

## 🚀 Quick Start Guide

### Option 1: One-Click Launcher (Windows)
Double-click `run_gate_system.bat` in the project root. It will start the server and automatically launch your browser to:
```
http://127.0.0.1:5000
```

### Option 2: Command Line
Open a terminal in the project directory and run:
```bash
python app.py
```
Open your browser at `http://127.0.0.1:5000`.

---

## 📂 Project Structure

```
college_gate_attendance/
├── app.py                     # Flask web server & REST API
├── face_engine.py             # OpenCV YuNet + SFace recognition engine
├── database.py                # SQLite database management & attendance logging
├── test_system.py             # Automated unit & integration tests
├── run_gate_system.bat        # One-click Windows runner
├── README.md                  # System documentation
├── models/
│   ├── face_detection_yunet.onnx      # YuNet Face Detector
│   └── face_recognition_sface.onnx     # SFace Face Feature Extractor
├── templates/
│   └── index.html             # Gatekeeper & Scanner Dashboard UI
├── static/
│   ├── css/
│   │   └── style.css          # Custom styles and animations
│   └── js/
│       ├── app.js             # UI state, attendance tables, CSV export, charts
│       └── scanner.js         # WebRTC camera, canvas bounding boxes, audio
└── data/
    ├── college_gate.db        # SQLite database
    ├── student_photos/        # Registered student reference photos
    └── entry_snapshots/       # Captured snapshots at entry
```

---

## 🧪 Running Automated Tests

Run the test suite to verify face matching, database operations, and REST APIs:
```bash
python test_system.py
```

---

## 📋 REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/scan` | `POST` | Processes a camera frame, matches face, and marks entry |
| `/api/students` | `GET` | Lists all registered students |
| `/api/students` | `POST` | Enrolls a new student with photo and face embedding |
| `/api/students/<id>` | `DELETE` | Deletes a student profile |
| `/api/entries` | `GET` | Retrieves filtered gate attendance entries |
| `/api/entries/manual` | `POST` | Logs a manual gate entry override |
| `/api/entries/export` | `GET` | Downloads attendance logs as a `.csv` file |
| `/api/stats/today` | `GET` | Returns today's summary metrics and recent entries |
| `/api/seed-demo` | `POST` | Seeds demo students and sample gate records |
