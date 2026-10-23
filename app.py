"""
Flask Application for College Gate Face Scanning & Attendance System.
Provides REST API endpoints for real-time face scanning, student enrollment,
attendance logging, CSV export, and administrative analytics.
"""

import os
import csv
import io
import time
from datetime import datetime
from flask import Flask, request, jsonify, render_template, send_file, send_from_directory
from flask_cors import CORS
import cv2
import numpy as np

from database import (
    init_db,
    register_student,
    update_student,
    delete_student,
    get_all_students,
    get_student,
    log_gate_entry,
    get_entries,
    get_today_stats,
    DEFAULT_DB_PATH
)
from face_engine import FaceEngine, b64_to_image, image_to_b64

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
PHOTOS_DIR = os.path.join(DATA_DIR, "student_photos")
SNAPSHOTS_DIR = os.path.join(DATA_DIR, "entry_snapshots")

os.makedirs(PHOTOS_DIR, exist_ok=True)
os.makedirs(SNAPSHOTS_DIR, exist_ok=True)

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static")
)
app.secret_key = os.environ.get("SECRET_KEY", "campusgate_security_secret_key_2026")
CORS(app)

# Register Parent Visitor Gate Pass feature
from parent_pass import parent_pass_bp
app.register_blueprint(parent_pass_bp)

# Initialize database and face recognition engine
init_db(DEFAULT_DB_PATH)
face_engine = FaceEngine()


@app.route("/")
def index():
    """Render the Gatekeeper & Scanner Dashboard."""
    return render_template("index.html")


@app.route("/data/student_photos/<path:filename>")
def serve_student_photo(filename):
    """Serve student profile photos."""
    return send_from_directory(PHOTOS_DIR, filename)


@app.route("/data/entry_snapshots/<path:filename>")
def serve_entry_snapshot(filename):
    """Serve gate entry snapshots."""
    return send_from_directory(SNAPSHOTS_DIR, filename)


@app.route("/api/scan", methods=["POST"])
def scan_frame():
    """
    Process incoming camera frame for face detection and gate attendance.
    Expects JSON: {
        "image": "data:image/jpeg;base64,...",
        "threshold": 0.38,
        "cooldown": 180,
        "gate_name": "Main Gate",
        "auto_log": true
    }
    """
    data = request.get_json()
    if not data or "image" not in data:
        return jsonify({"error": "Missing image data"}), 400

    image_bgr = b64_to_image(data["image"])
    if image_bgr is None:
        return jsonify({"error": "Failed to decode frame"}), 400

    threshold = float(data.get("threshold", 0.38))
    cooldown = int(data.get("cooldown", 180))
    gate_name = data.get("gate_name", "Main Gate")
    auto_log = bool(data.get("auto_log", True))

    # Fetch all students for matching
    students = get_all_students(DEFAULT_DB_PATH)

    # Perform face detection and recognition
    scan_results = face_engine.scan_frame(image_bgr, students, threshold=threshold)

    output = []
    for item in scan_results:
        result_item = {
            "box": item["box"],
            "is_known": item["is_known"],
            "confidence": item["confidence"],
            "student": item["student"],
            "gate_action": None
        }

        if item["is_known"] and item["student"] and auto_log:
            std = item["student"]
            # Save snapshot if entry is recorded
            snapshot_filename = f"snap_{std['roll_number']}_{int(time.time())}.jpg"
            snapshot_path = os.path.join(SNAPSHOTS_DIR, snapshot_filename)

            # Crop face for snapshot
            x, y, w, h = item["box"]
            pad = 20
            h_img, w_img = image_bgr.shape[:2]
            x1 = max(0, x - pad)
            y1 = max(0, y - pad)
            x2 = min(w_img, x + w + pad)
            y2 = min(h_img, y + h + pad)
            face_crop = image_bgr[y1:y2, x1:x2]

            log_res = log_gate_entry(
                name=std["name"],
                department=std["department"],
                roll_number=std["roll_number"],
                student_id=std["id"],
                gate_name=gate_name,
                confidence=item["confidence"],
                snapshot_path=snapshot_filename,
                cooldown_seconds=cooldown,
                db_path=DEFAULT_DB_PATH
            )

            # Only save disk snapshot on fresh ALLOWED entry
            if log_res["status"] == "ALLOWED":
                try:
                    cv2.imwrite(snapshot_path, face_crop)
                except Exception as e:
                    print(f"Error saving snapshot: {e}")

            result_item["gate_action"] = log_res

        output.append(result_item)

    return jsonify({
        "faces_detected": len(output),
        "results": output,
        "timestamp": time.time()
    })


@app.route("/api/students", methods=["GET"])
def list_students():
    """List all registered students (without full embeddings to minimize payload)."""
    students = get_all_students(DEFAULT_DB_PATH)
    lightweight = []
    for s in students:
        lightweight.append({
            "id": s["id"],
            "roll_number": s["roll_number"],
            "name": s["name"],
            "department": s["department"],
            "year": s["year"],
            "photo_path": s["photo_path"],
            "has_embedding": bool(s["face_embedding"]),
            "created_at": s["created_at"]
        })
    return jsonify(lightweight)


@app.route("/api/students", methods=["POST"])
def add_student():
    """
    Register a new student with face photo.
    Expects JSON: {
        "name": "Aarav Sharma",
        "roll_number": "CS2026-001",
        "department": "Computer Science",
        "year": "3rd Year",
        "image": "data:image/jpeg;base64,..."
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data received"}), 400

    name = data.get("name", "").strip()
    roll_number = data.get("roll_number", "").strip().upper()
    department = data.get("department", "").strip()
    year = data.get("year", "1st Year").strip()
    image_b64 = data.get("image", "")

    if not name or not roll_number or not department:
        return jsonify({"error": "Name, Roll Number, and Department are required."}), 400

    if not image_b64:
        return jsonify({"error": "A clear face photo is required for gate recognition."}), 400

    image_bgr = b64_to_image(image_b64)
    if image_bgr is None:
        return jsonify({"error": "Invalid photo format. Could not decode."}), 400

    # Detect face and extract embedding
    faces = face_engine.detect_faces(image_bgr)
    if not faces:
        return jsonify({
            "error": "No face detected in the photo. Please ensure good lighting and face the camera directly."
        }), 400

    raw_face = faces[0].get("raw_face")
    embedding = face_engine.extract_embedding(image_bgr, raw_face)

    if not embedding:
        return jsonify({
            "error": "Could not extract facial features. Please try another photo."
        }), 400

    # Save photo to student_photos/
    safe_roll = "".join(c for c in roll_number if c.isalnum() or c in ("-", "_"))
    photo_filename = f"{safe_roll}.jpg"
    photo_path = os.path.join(PHOTOS_DIR, photo_filename)

    try:
        # Crop to face with padding
        x, y, w, h = faces[0]["box"]
        pad = 30
        h_img, w_img = image_bgr.shape[:2]
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(w_img, x + w + pad)
        y2 = min(h_img, y + h + pad)
        face_crop = image_bgr[y1:y2, x1:x2]
        cv2.imwrite(photo_path, face_crop)
    except Exception as e:
        print(f"Error saving student photo: {e}")
        cv2.imwrite(photo_path, image_bgr)

    try:
        student = register_student(
            name=name,
            roll_number=roll_number,
            department=department,
            year=year,
            photo_path=photo_filename,
            face_embedding=embedding,
            db_path=DEFAULT_DB_PATH
        )
        return jsonify({
            "success": True,
            "message": f"Student {name} registered successfully!",
            "student": student
        }), 201
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": f"Database error: {str(e)}"}), 500


@app.route("/api/students/<int:student_id>", methods=["DELETE"])
def remove_student(student_id):
    """Delete student and their photo."""
    std = get_student(student_id, DEFAULT_DB_PATH)
    if not std:
        return jsonify({"error": "Student not found"}), 404

    if std.get("photo_path"):
        photo_file = os.path.join(PHOTOS_DIR, std["photo_path"])
        if os.path.exists(photo_file):
            try:
                os.remove(photo_file)
            except Exception:
                pass

    delete_student(student_id, DEFAULT_DB_PATH)
    return jsonify({"success": True, "message": "Student deleted successfully"})


@app.route("/api/entries", methods=["GET"])
def list_entries():
    """
    Get paginated gate attendance entries.
    Query params: date, department, search, limit, offset
    """
    date_filter = request.args.get("date")
    dept_filter = request.args.get("department")
    search = request.args.get("search")
    limit = int(request.args.get("limit", 100))
    offset = int(request.args.get("offset", 0))

    entries, total = get_entries(
        date_filter=date_filter,
        department_filter=dept_filter,
        search_query=search,
        limit=limit,
        offset=offset,
        db_path=DEFAULT_DB_PATH
    )

    return jsonify({
        "total": total,
        "limit": limit,
        "offset": offset,
        "entries": entries
    })


@app.route("/api/entries/manual", methods=["POST"])
def manual_entry():
    """Manually log a student entry (e.g. for ID card or camera override)."""
    data = request.get_json() or {}
    student_id = data.get("student_id")
    name = data.get("name", "").strip()
    roll_number = data.get("roll_number", "").strip().upper()
    department = data.get("department", "").strip()
    gate_name = data.get("gate_name", "Main Gate")

    if student_id:
        std = get_student(student_id, DEFAULT_DB_PATH)
        if std:
            name = std["name"]
            roll_number = std["roll_number"]
            department = std["department"]

    if not name or not department:
        return jsonify({"error": "Name and Department are required for entry."}), 400

    result = log_gate_entry(
        name=name,
        department=department,
        roll_number=roll_number,
        student_id=student_id,
        gate_name=gate_name,
        status="MANUAL",
        confidence=1.0,
        db_path=DEFAULT_DB_PATH
    )
    return jsonify(result)


@app.route("/api/entries/export", methods=["GET"])
def export_entries_csv():
    """Export attendance logs as a downloadable CSV file."""
    date_filter = request.args.get("date")
    dept_filter = request.args.get("department")
    search = request.args.get("search")

    entries, _ = get_entries(
        date_filter=date_filter,
        department_filter=dept_filter,
        search_query=search,
        limit=10000,
        offset=0,
        db_path=DEFAULT_DB_PATH
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Entry ID",
        "Date",
        "Time",
        "Student Name",
        "Roll Number",
        "Department",
        "Gate Name",
        "Status",
        "Confidence Score"
    ])

    for e in entries:
        writer.writerow([
            e["id"],
            e["date"],
            e["time"],
            e["name"],
            e["roll_number"] or "N/A",
            e["department"],
            e["gate_name"],
            e["status"],
            f"{e['confidence']:.2f}" if e["confidence"] is not None else "1.00"
        ])

    output.seek(0)
    filename = f"gate_attendance_{date_filter or datetime.now().strftime('%Y%m%d')}.csv"
    return send_file(
        io.BytesIO(output.getvalue().encode("utf-8")),
        mimetype="text/csv",
        as_attachment=True,
        download_name=filename
    )


@app.route("/api/stats/today", methods=["GET"])
def stats_today():
    """Retrieve today's entry statistics."""
    date_param = request.args.get("date")
    stats = get_today_stats(date_str=date_param, db_path=DEFAULT_DB_PATH)
    return jsonify(stats)


@app.route("/api/seed-demo", methods=["POST"])
def seed_demo_data():
    """Seed sample students and test entries for quick evaluation."""
    demo_students = [
        {"name": "Aarav Sharma", "roll": "CS2026-012", "dept": "Computer Science & Engineering", "year": "3rd Year", "color": (80, 150, 240)},
        {"name": "Priya Patel", "roll": "EC2026-045", "dept": "Electronics & Communication", "year": "2nd Year", "color": (240, 100, 160)},
        {"name": "Rohan Verma", "roll": "ME2026-028", "dept": "Mechanical Engineering", "year": "4th Year", "color": (100, 200, 100)},
        {"name": "Ananya Iyer", "roll": "IT2026-089", "dept": "Information Technology", "year": "3rd Year", "color": (240, 180, 60)},
        {"name": "Vikram Singh", "roll": "CV2026-033", "dept": "Civil Engineering", "year": "1st Year", "color": (160, 110, 230)},
    ]

    seeded_count = 0
    for s in demo_students:
        # Check if already exists
        existing = [st for st in get_all_students(DEFAULT_DB_PATH) if st["roll_number"] == s["roll"]]
        if existing:
            continue

        # Generate a distinct sample portrait with face features so detector/embedding works
        img = np.full((320, 320, 3), (245, 245, 245), dtype=np.uint8)
        # Background gradient circle
        cv2.circle(img, (160, 160), 140, s["color"], -1)
        # Face skin tone oval
        cv2.circle(img, (160, 150), 75, (190, 210, 240), -1)
        # Eyes
        cv2.circle(img, (135, 135), 10, (40, 40, 40), -1)
        cv2.circle(img, (185, 135), 10, (40, 40, 40), -1)
        # Smile
        cv2.ellipse(img, (160, 175), (28, 14), 0, 0, 180, (50, 50, 180), 3)

        # Photo save
        photo_name = f"{s['roll']}.jpg"
        photo_path = os.path.join(PHOTOS_DIR, photo_name)
        cv2.imwrite(photo_path, img)

        # Feature embedding
        emb = face_engine.extract_embedding(img)

        student = register_student(
            name=s["name"],
            roll_number=s["roll"],
            department=s["dept"],
            year=s["year"],
            photo_path=photo_name,
            face_embedding=emb,
            db_path=DEFAULT_DB_PATH
        )
        # Seed a sample entry
        log_gate_entry(
            name=s["name"],
            department=s["dept"],
            roll_number=s["roll"],
            student_id=student["id"],
            gate_name="Main Gate",
            status="ALLOWED",
            confidence=0.88,
            cooldown_seconds=0,
            db_path=DEFAULT_DB_PATH
        )
        seeded_count += 1

    return jsonify({
        "success": True,
        "message": f"Seeded {seeded_count} demo students and sample gate entries."
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting College Gate Attendance System on http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
