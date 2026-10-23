"""
Database layer for College Gate Face Scanning & Attendance System.
Handles student profiles, face embeddings, gate logs, and analytics.
"""

import sqlite3
import os
import json
import time
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "data", "college_gate.db")


def get_db_connection(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    """Create a database connection with dictionary-like row access."""
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str = DEFAULT_DB_PATH) -> None:
    """Initialize database tables and indexes."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roll_number TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        year TEXT DEFAULT '1st Year',
        photo_path TEXT,
        face_embedding TEXT,
        created_at TEXT NOT NULL
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS gate_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        name TEXT NOT NULL,
        roll_number TEXT,
        department TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        timestamp REAL NOT NULL,
        gate_name TEXT NOT NULL DEFAULT 'Main Gate',
        status TEXT NOT NULL DEFAULT 'ALLOWED',
        confidence REAL DEFAULT 1.0,
        snapshot_path TEXT,
        FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL
    );
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_entries_date ON gate_entries(date);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_entries_dept ON gate_entries(department);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_entries_student ON gate_entries(student_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON gate_entries(timestamp);")

    conn.commit()
    conn.close()


def register_student(
    name: str,
    roll_number: str,
    department: str,
    year: str = "1st Year",
    photo_path: Optional[str] = None,
    face_embedding: Optional[List[float]] = None,
    db_path: str = DEFAULT_DB_PATH,
) -> Dict[str, Any]:
    """Register a new student with face embedding."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    embedding_json = json.dumps(face_embedding) if face_embedding is not None else None

    try:
        cursor.execute(
            """
            INSERT INTO students (roll_number, name, department, year, photo_path, face_embedding, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (roll_number.strip().upper(), name.strip(), department.strip(), year.strip(), photo_path, embedding_json, now_str)
        )
        student_id = cursor.lastrowid
        conn.commit()
        return {
            "id": student_id,
            "roll_number": roll_number.strip().upper(),
            "name": name.strip(),
            "department": department.strip(),
            "year": year.strip(),
            "photo_path": photo_path,
            "created_at": now_str
        }
    except sqlite3.IntegrityError:
        raise ValueError(f"Student with Roll Number '{roll_number}' already exists.")
    finally:
        conn.close()


def update_student(
    student_id: int,
    name: str,
    roll_number: str,
    department: str,
    year: str = "1st Year",
    photo_path: Optional[str] = None,
    face_embedding: Optional[List[float]] = None,
    db_path: str = DEFAULT_DB_PATH,
) -> bool:
    """Update existing student info and optionally embedding."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    if face_embedding is not None and photo_path is not None:
        cursor.execute(
            """
            UPDATE students 
            SET name = ?, roll_number = ?, department = ?, year = ?, photo_path = ?, face_embedding = ?
            WHERE id = ?
            """,
            (name.strip(), roll_number.strip().upper(), department.strip(), year.strip(), photo_path, json.dumps(face_embedding), student_id)
        )
    else:
        cursor.execute(
            """
            UPDATE students 
            SET name = ?, roll_number = ?, department = ?, year = ?
            WHERE id = ?
            """,
            (name.strip(), roll_number.strip().upper(), department.strip(), year.strip(), student_id)
        )

    affected = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return affected


def delete_student(student_id: int, db_path: str = DEFAULT_DB_PATH) -> bool:
    """Delete a student by id."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM students WHERE id = ?", (student_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def get_all_students(db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    """Retrieve all enrolled students with parsed embeddings."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, roll_number, name, department, year, photo_path, face_embedding, created_at FROM students ORDER BY name ASC")
    rows = cursor.fetchall()
    students = []
    for r in rows:
        emb = None
        if r["face_embedding"]:
            try:
                emb = json.loads(r["face_embedding"])
            except Exception:
                emb = None
        students.append({
            "id": r["id"],
            "roll_number": r["roll_number"],
            "name": r["name"],
            "department": r["department"],
            "year": r["year"],
            "photo_path": r["photo_path"],
            "face_embedding": emb,
            "created_at": r["created_at"]
        })
    conn.close()
    return students


def get_student(student_id: int, db_path: str = DEFAULT_DB_PATH) -> Optional[Dict[str, Any]]:
    """Get single student by ID."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, roll_number, name, department, year, photo_path, face_embedding, created_at FROM students WHERE id = ?", (student_id,))
    r = cursor.fetchone()
    conn.close()
    if not r:
        return None
    emb = None
    if r["face_embedding"]:
        try:
            emb = json.loads(r["face_embedding"])
        except Exception:
            emb = None
    return {
        "id": r["id"],
        "roll_number": r["roll_number"],
        "name": r["name"],
        "department": r["department"],
        "year": r["year"],
        "photo_path": r["photo_path"],
        "face_embedding": emb,
        "created_at": r["created_at"]
    }


def get_last_entry_time(student_id: int, db_path: str = DEFAULT_DB_PATH) -> Optional[float]:
    """Get the unix timestamp of the student's most recent ALLOWED entry."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT timestamp FROM gate_entries WHERE student_id = ? AND status IN ('ALLOWED', 'MANUAL') ORDER BY timestamp DESC LIMIT 1",
        (student_id,)
    )
    row = cursor.fetchone()
    conn.close()
    return row["timestamp"] if row else None


def log_gate_entry(
    name: str,
    department: str,
    roll_number: Optional[str] = None,
    student_id: Optional[int] = None,
    gate_name: str = "Main Gate",
    status: str = "ALLOWED",
    confidence: float = 1.0,
    snapshot_path: Optional[str] = None,
    cooldown_seconds: int = 180,
    db_path: str = DEFAULT_DB_PATH
) -> Dict[str, Any]:
    """
    Log an entry at the college gate.
    If student_id is provided and was already logged within cooldown_seconds,
    returns COOLDOWN_SKIP response without double-logging.
    """
    now = datetime.now()
    now_ts = time.time()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%I:%M:%S %p")

    # Check cooldown if student_id is provided
    if student_id and status != "MANUAL":
        last_ts = get_last_entry_time(student_id, db_path)
        if last_ts is not None:
            elapsed = now_ts - last_ts
            if elapsed < cooldown_seconds:
                remaining = int(cooldown_seconds - elapsed)
                return {
                    "status": "COOLDOWN_SKIP",
                    "message": f"Already checked in! Cooldown active for {remaining}s.",
                    "entry": {
                        "student_id": student_id,
                        "name": name,
                        "roll_number": roll_number,
                        "department": department,
                        "gate_name": gate_name,
                        "date": date_str,
                        "time": time_str,
                        "confidence": confidence,
                        "cooldown_remaining": remaining
                    }
                }

    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO gate_entries (student_id, name, roll_number, department, date, time, timestamp, gate_name, status, confidence, snapshot_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (student_id, name, roll_number, department, date_str, time_str, now_ts, gate_name, status, confidence, snapshot_path)
    )
    entry_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "status": "ALLOWED" if status in ("ALLOWED", "MANUAL") else status,
        "message": f"Entry marked for {name} ({department})",
        "entry": {
            "id": entry_id,
            "student_id": student_id,
            "name": name,
            "roll_number": roll_number,
            "department": department,
            "gate_name": gate_name,
            "date": date_str,
            "time": time_str,
            "status": status,
            "confidence": confidence,
            "snapshot_path": snapshot_path
        }
    }


def get_entries(
    date_filter: Optional[str] = None,
    department_filter: Optional[str] = None,
    search_query: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db_path: str = DEFAULT_DB_PATH
) -> Tuple[List[Dict[str, Any]], int]:
    """Retrieve filtered gate entries and total count."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    conditions = []
    params: List[Any] = []

    if date_filter:
        conditions.append("e.date = ?")
        params.append(date_filter)

    if department_filter and department_filter != "ALL":
        conditions.append("e.department = ?")
        params.append(department_filter)

    if search_query:
        search_pattern = f"%{search_query.strip()}%"
        conditions.append("(e.name LIKE ? OR e.roll_number LIKE ?)")
        params.extend([search_pattern, search_pattern])

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    count_query = f"SELECT COUNT(*) as cnt FROM gate_entries e {where_clause}"
    cursor.execute(count_query, params)
    total_count = cursor.fetchone()["cnt"]

    select_query = f"""
        SELECT 
            e.id, e.student_id, e.name, e.roll_number, e.department, 
            e.date, e.time, e.timestamp, e.gate_name, e.status, e.confidence, e.snapshot_path,
            s.photo_path as student_photo
        FROM gate_entries e
        LEFT JOIN students s ON e.student_id = s.id
        {where_clause}
        ORDER BY e.timestamp DESC
        LIMIT ? OFFSET ?
    """
    cursor.execute(select_query, params + [limit, offset])
    rows = cursor.fetchall()

    entries = [dict(r) for r in rows]
    conn.close()
    return entries, total_count


def get_today_stats(date_str: Optional[str] = None, db_path: str = DEFAULT_DB_PATH) -> Dict[str, Any]:
    """Retrieve statistical summary for today's entries."""
    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")

    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    # Total entries today
    cursor.execute("SELECT COUNT(*) as total FROM gate_entries WHERE date = ? AND status IN ('ALLOWED', 'MANUAL')", (date_str,))
    total_entries = cursor.fetchone()["total"]

    # Unique students today
    cursor.execute("SELECT COUNT(DISTINCT student_id) as unique_students FROM gate_entries WHERE date = ? AND student_id IS NOT NULL AND status IN ('ALLOWED', 'MANUAL')", (date_str,))
    unique_students = cursor.fetchone()["unique_students"]

    # Department breakdown
    cursor.execute(
        """
        SELECT department, COUNT(*) as count 
        FROM gate_entries 
        WHERE date = ? AND status IN ('ALLOWED', 'MANUAL')
        GROUP BY department 
        ORDER BY count DESC
        """,
        (date_str,)
    )
    dept_stats = {r["department"]: r["count"] for r in cursor.fetchall()}

    # Recent entries
    cursor.execute(
        """
        SELECT e.id, e.name, e.roll_number, e.department, e.date, e.time, e.status, s.photo_path
        FROM gate_entries e
        LEFT JOIN students s ON e.student_id = s.id
        WHERE e.date = ?
        ORDER BY e.timestamp DESC
        LIMIT 5
        """,
        (date_str,)
    )
    recent_entries = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return {
        "date": date_str,
        "total_entries": total_entries,
        "unique_students": unique_students,
        "department_counts": dept_stats,
        "recent_entries": recent_entries
    }
