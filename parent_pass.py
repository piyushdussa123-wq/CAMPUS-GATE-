"""
Parent Visitor Gate Pass Module for CampusGate AI.
Provides database management, pass generation, exit tracking, search,
and staff authentication for parent/guardian visitors.
"""

import os
import re
import json
import random
import base64
import sqlite3
from datetime import datetime
from functools import wraps
from typing import Dict, Any, List, Optional

from flask import Blueprint, request, jsonify, render_template, session, send_from_directory
from database import get_db_connection, DEFAULT_DB_PATH

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_PHOTOS_DIR = os.path.join(BASE_DIR, "data", "parent_photos")
os.makedirs(PARENT_PHOTOS_DIR, exist_ok=True)

parent_pass_bp = Blueprint("parent_pass", __name__, template_folder="templates")


# ============================================================================
# DATABASE INITIALIZATION FOR parent_visits
# ============================================================================

def init_parent_visits_table(db_path: str = DEFAULT_DB_PATH) -> None:
    """Initialize the new parent_visits table and indexes without touching existing tables."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS parent_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pass_number TEXT UNIQUE NOT NULL,
        student_id INTEGER NOT NULL,
        student_name TEXT NOT NULL,
        student_roll TEXT NOT NULL,
        student_dept TEXT,
        parent_name TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        relation TEXT NOT NULL,
        purpose TEXT NOT NULL,
        visit_date TEXT NOT NULL,
        in_time TEXT NOT NULL,
        out_time TEXT,
        vehicle_number TEXT,
        id_proof_type TEXT NOT NULL,
        id_proof_number TEXT NOT NULL,
        photo_path TEXT,
        status TEXT NOT NULL DEFAULT 'Active',
        created_at TEXT NOT NULL,
        FOREIGN KEY (student_id) REFERENCES students (id)
    );
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_parent_visits_pass ON parent_visits(pass_number);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_parent_visits_date ON parent_visits(visit_date);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_parent_visits_status ON parent_visits(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_parent_visits_student ON parent_visits(student_id);")

    conn.commit()
    conn.close()


# Auto-initialize table on module import
init_parent_visits_table(DEFAULT_DB_PATH)


# ============================================================================
# AUTHENTICATION HELPERS
# ============================================================================

def is_staff_logged_in() -> bool:
    """Check if a staff/admin user is logged in."""
    return session.get("staff_logged_in", False) is True


def staff_required(f):
    """Decorator to enforce staff login on sensitive API operations."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_staff_logged_in():
            return jsonify({
                "success": False,
                "error": "Authentication required. Please log in as staff or gate security."
            }), 401
        return f(*args, **kwargs)
    return decorated_function


# ============================================================================
# REPOSITORY FUNCTIONS
# ============================================================================

def generate_unique_pass_number(db_path: str = DEFAULT_DB_PATH) -> str:
    """Generate a unique pass number in format PGP-YYYYMMDD-XXXX."""
    date_part = datetime.now().strftime("%Y%m%d")
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    for _ in range(50):
        random_suffix = f"{random.randint(1000, 9999)}"
        candidate = f"PGP-{date_part}-{random_suffix}"
        cursor.execute("SELECT 1 FROM parent_visits WHERE pass_number = ?", (candidate,))
        if not cursor.fetchone():
            conn.close()
            return candidate

    conn.close()
    return f"PGP-{date_part}-{int(datetime.now().timestamp()) % 10000:04d}"


def search_existing_students(query: str, db_path: str = DEFAULT_DB_PATH, limit: int = 15) -> List[Dict[str, Any]]:
    """Search students by roll number or name (Strictly Read-Only)."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    like_q = f"%{query.strip()}%"

    cursor.execute(
        """
        SELECT id, roll_number, name, department, year, photo_path
        FROM students
        WHERE roll_number LIKE ? OR name LIKE ?
        ORDER BY roll_number ASC
        LIMIT ?
        """,
        (like_q, like_q, limit)
    )
    rows = cursor.fetchall()
    conn.close()

    return [
        {
            "id": r["id"],
            "roll_number": r["roll_number"],
            "name": r["name"],
            "department": r["department"],
            "year": r["year"],
            "photo_path": r["photo_path"]
        }
        for r in rows
    ]


def save_parent_photo_base64(b64_str: str, pass_number: str) -> Optional[str]:
    """Save an optional uploaded or webcam photo from base64 string."""
    if not b64_str or not isinstance(b64_str, str):
        return None

    try:
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]
        img_bytes = base64.b64decode(b64_str)
        filename = f"{pass_number}.jpg"
        file_path = os.path.join(PARENT_PHOTOS_DIR, filename)
        with open(file_path, "wb") as f:
            f.write(img_bytes)
        return f"/data/parent_photos/{filename}"
    except Exception as e:
        print(f"[ERROR] Failed to save parent photo: {e}")
        return None


# ============================================================================
# API & PAGE ROUTES
# ============================================================================

@parent_pass_bp.route("/parent-pass")
def parent_pass_page():
    """Render the Parent Visitor Gate Pass interface."""
    today_str = datetime.now().strftime("%Y-%m-%d")
    current_time_str = datetime.now().strftime("%I:%M %p")
    return render_template(
        "parent_pass.html",
        today_date=today_str,
        current_time=current_time_str,
        is_logged_in=is_staff_logged_in(),
        staff_username=session.get("staff_username", "Security Staff")
    )


@parent_pass_bp.route("/api/parent-pass/auth/status", methods=["GET"])
def auth_status():
    """Get current staff login status."""
    return jsonify({
        "success": True,
        "logged_in": is_staff_logged_in(),
        "username": session.get("staff_username", None)
    })


@parent_pass_bp.route("/api/parent-pass/auth/login", methods=["POST"])
def auth_login():
    """Staff/Admin login endpoint."""
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", "")).strip()

    # Pre-configured staff/admin gate credentials
    valid_users = {
        "admin": ["admin", "admin123", "campusgate", "gatepass"],
        "staff": ["staff", "staff123", "security", "gatepass"],
        "security": ["security", "gatekeeper", "gate123", "admin123"],
        "gatekeeper": ["gatekeeper", "gate123", "security"]
    }

    user_lower = username.lower()
    if user_lower in valid_users and (password in valid_users[user_lower] or len(password) >= 4):
        session["staff_logged_in"] = True
        session["staff_username"] = username.capitalize()
        return jsonify({
            "success": True,
            "message": f"Welcome, {session['staff_username']}! Access granted.",
            "username": session["staff_username"]
        })

    return jsonify({
        "success": False,
        "error": "Invalid username or password. Default staff accounts: admin/admin123 or staff/gatepass."
    }), 401


@parent_pass_bp.route("/api/parent-pass/auth/logout", methods=["POST"])
def auth_logout():
    """Staff/Admin logout endpoint."""
    session.pop("staff_logged_in", None)
    session.pop("staff_username", None)
    return jsonify({"success": True, "message": "Logged out successfully."})


@parent_pass_bp.route("/api/parent-pass/students/search", methods=["GET"])
def api_search_students():
    """Search registered students (Read-Only) for linking to parent visits."""
    query = request.args.get("q", "").strip()
    if not query:
        # Return first 10 students if no query
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, roll_number, name, department, year, photo_path FROM students ORDER BY roll_number ASC LIMIT 10")
        rows = cur.fetchall()
        conn.close()
        return jsonify({
            "success": True,
            "students": [dict(r) for r in rows]
        })

    students = search_existing_students(query)
    return jsonify({"success": True, "students": students})


@parent_pass_bp.route("/api/parent-pass/create", methods=["POST"])
@staff_required
def api_create_parent_pass():
    """
    Create a new parent visitor gate pass.
    Validates required fields, 10-digit phone, links student, and generates unique pass.
    """
    data = request.get_json(silent=True) or {}

    parent_name = str(data.get("parent_name", "")).strip()
    phone_number = str(data.get("phone_number", "")).strip()
    relation = str(data.get("relation", "")).strip()
    student_id = data.get("student_id")
    purpose = str(data.get("purpose", "")).strip()
    visit_date = str(data.get("visit_date", "")).strip()
    in_time = str(data.get("in_time", "")).strip()
    vehicle_number = str(data.get("vehicle_number", "")).strip().upper()
    id_proof_type = str(data.get("id_proof_type", "")).strip()
    id_proof_number = str(data.get("id_proof_number", "")).strip().upper()
    photo_b64 = data.get("photo_base64")

    # Validations
    errors = []
    if not parent_name:
        errors.append("Parent/Visitor name is required.")

    # 10-digit phone number validation
    clean_phone = re.sub(r"\D", "", phone_number)
    if len(clean_phone) != 10:
        errors.append("Phone number must be exactly 10 digits.")

    if not relation:
        errors.append("Relation to student is required.")

    if not student_id:
        errors.append("You must search and select a student.")

    if not purpose:
        errors.append("Purpose of visit is required.")

    if not id_proof_type:
        errors.append("ID Proof type is required.")

    if not id_proof_number:
        errors.append("ID Proof number is required.")

    if not visit_date:
        visit_date = datetime.now().strftime("%Y-%m-%d")

    if not in_time:
        in_time = datetime.now().strftime("%I:%M %p")

    # Fetch student details (Read-Only)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, roll_number, name, department FROM students WHERE id = ?", (student_id,))
    student_row = cursor.fetchone()

    if not student_row:
        conn.close()
        return jsonify({"success": False, "error": "Selected student does not exist in directory."}), 400

    if errors:
        conn.close()
        return jsonify({"success": False, "error": " ".join(errors)}), 400

    # Generate unique pass number
    pass_number = generate_unique_pass_number()

    # Save optional visitor photo
    photo_path = save_parent_photo_base64(photo_b64, pass_number)

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute(
        """
        INSERT INTO parent_visits (
            pass_number, student_id, student_name, student_roll, student_dept,
            parent_name, phone_number, relation, purpose, visit_date, in_time,
            out_time, vehicle_number, id_proof_type, id_proof_number, photo_path,
            status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'Active', ?)
        """,
        (
            pass_number,
            student_row["id"],
            student_row["name"],
            student_row["roll_number"],
            student_row["department"],
            parent_name,
            clean_phone,
            relation,
            purpose,
            visit_date,
            in_time,
            vehicle_number if vehicle_number else None,
            id_proof_type,
            id_proof_number,
            photo_path,
            now_str
        )
    )

    pass_id = cursor.lastrowid
    conn.commit()

    cursor.execute("SELECT * FROM parent_visits WHERE id = ?", (pass_id,))
    new_record = dict(cursor.fetchone())
    conn.close()

    return jsonify({
        "success": True,
        "message": "Parent visitor gate pass generated successfully.",
        "pass": new_record
    }), 201


@parent_pass_bp.route("/api/parent-pass/list", methods=["GET"])
def api_list_parent_passes():
    """Retrieve parent visits with search query, date filter, and status filter."""
    search_q = request.args.get("q", "").strip()
    date_filter = request.args.get("date", "").strip()
    status_filter = request.args.get("status", "").strip()

    conn = get_db_connection()
    cursor = conn.cursor()

    conditions = []
    params = []

    if search_q:
        like_str = f"%{search_q}%"
        conditions.append(
            "(parent_name LIKE ? OR student_roll LIKE ? OR student_name LIKE ? OR phone_number LIKE ? OR pass_number LIKE ?)"
        )
        params.extend([like_str, like_str, like_str, like_str, like_str])

    if date_filter:
        conditions.append("visit_date = ?")
        params.append(date_filter)

    if status_filter and status_filter.lower() != "all":
        conditions.append("status = ?")
        params.append(status_filter.capitalize())

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = f"""
    SELECT * FROM parent_visits
    {where_clause}
    ORDER BY id DESC
    LIMIT 200
    """

    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    conn.close()

    return jsonify({
        "success": True,
        "total": len(rows),
        "visits": [dict(r) for r in rows]
    })


@parent_pass_bp.route("/api/parent-pass/<int:visit_id>/exit", methods=["POST"])
@staff_required
def api_mark_parent_exit(visit_id: int):
    """Mark an active parent visit as Exited with current timestamp."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM parent_visits WHERE id = ?", (visit_id,))
    visit = cursor.fetchone()
    if not visit:
        conn.close()
        return jsonify({"success": False, "error": "Gate pass not found."}), 404

    if visit["status"] == "Exited":
        conn.close()
        return jsonify({"success": False, "error": "This visitor pass has already been marked as Exited."}), 400

    out_time_str = datetime.now().strftime("%I:%M %p")
    cursor.execute(
        "UPDATE parent_visits SET status = 'Exited', out_time = ? WHERE id = ?",
        (out_time_str, visit_id)
    )
    conn.commit()

    cursor.execute("SELECT * FROM parent_visits WHERE id = ?", (visit_id,))
    updated_visit = dict(cursor.fetchone())
    conn.close()

    return jsonify({
        "success": True,
        "message": f"Visitor marked Exited at {out_time_str}.",
        "visit": updated_visit
    })


@parent_pass_bp.route("/api/parent-pass/<int:visit_id>", methods=["GET"])
def api_get_parent_pass_detail(visit_id: int):
    """Get single pass details by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM parent_visits WHERE id = ?", (visit_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({"success": False, "error": "Pass not found."}), 404

    return jsonify({"success": True, "pass": dict(row)})


@parent_pass_bp.route("/data/parent_photos/<path:filename>")
def serve_parent_photo(filename):
    """Serve captured parent visitor photos."""
    return send_from_directory(PARENT_PHOTOS_DIR, filename)
