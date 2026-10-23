"""
Automated Test Suite for College Gate Face Scanning & Attendance System.
Validates database schema, face recognition matching, REST API endpoints,
cooldown logic, and CSV attendance export.
"""

import unittest
import os
import json
import base64
import numpy as np
import cv2

# Import app modules
from app import app
from database import init_db, get_all_students, log_gate_entry, get_entries, get_today_stats
from face_engine import FaceEngine, image_to_b64


class TestCollegeGateAttendance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_dir = os.path.dirname(os.path.abspath(__file__))
        cls.test_db = os.path.join(cls.test_dir, "data", "test_automated.db")
        if os.path.exists(cls.test_db):
            try:
                os.remove(cls.test_db)
            except Exception:
                pass

        init_db(cls.test_db)
        cls.engine = FaceEngine()
        cls.client = app.test_client()

        # Create a test face image
        img = np.full((320, 320, 3), (230, 230, 230), dtype=np.uint8)
        cv2.circle(img, (160, 160), 90, (180, 200, 230), -1)
        cv2.circle(img, (130, 135), 12, (30, 30, 30), -1)
        cv2.circle(img, (190, 135), 12, (30, 30, 30), -1)
        cv2.ellipse(img, (160, 190), (30, 15), 0, 0, 180, (40, 40, 180), 3)
        cls.test_image_bgr = img
        cls.test_image_b64 = image_to_b64(img)

    def test_01_database_tables(self):
        """Test database table creation and query."""
        students = get_all_students(self.test_db)
        self.assertIsInstance(students, list)

    def test_02_face_engine_models(self):
        """Test YuNet and SFace or fallback face embedding extraction."""
        emb = self.engine.extract_embedding(self.test_image_bgr)
        self.assertIsNotNone(emb, "Face embedding should not be None")
        self.assertEqual(len(emb), 128, "Embedding vector length should be 128")

    def test_03_cosine_similarity(self):
        """Test similarity score between identical and different embeddings."""
        emb1 = self.engine.extract_embedding(self.test_image_bgr)
        score_identical = self.engine.calculate_similarity(emb1, emb1)
        self.assertAlmostEqual(score_identical, 1.0, places=2)

    def test_04_gate_entry_logging_and_cooldown(self):
        """Test entry logging with Name, Time, Department, Date, and cooldown debounce."""
        # 1. First entry
        res1 = log_gate_entry(
            name="Rahul Sharma",
            department="Computer Science & Engineering",
            roll_number="CS2026-100",
            student_id=999,
            gate_name="Main Gate",
            db_path=self.test_db
        )
        self.assertEqual(res1["status"], "ALLOWED")
        entry = res1["entry"]
        self.assertEqual(entry["name"], "Rahul Sharma")
        self.assertEqual(entry["department"], "Computer Science & Engineering")
        self.assertTrue("date" in entry)
        self.assertTrue("time" in entry)

        # 2. Immediate second entry (within cooldown)
        res2 = log_gate_entry(
            name="Rahul Sharma",
            department="Computer Science & Engineering",
            roll_number="CS2026-100",
            student_id=999,
            gate_name="Main Gate",
            cooldown_seconds=120,
            db_path=self.test_db
        )
        self.assertEqual(res2["status"], "COOLDOWN_SKIP")
        self.assertIn("Already checked in", res2["message"])

    def test_05_api_seed_demo_and_list(self):
        """Test seeding demo students and listing them via REST API."""
        seed_res = self.client.post("/api/seed-demo")
        self.assertEqual(seed_res.status_code, 200)
        seed_data = json.loads(seed_res.data)
        self.assertTrue(seed_data["success"])

        list_res = self.client.get("/api/students")
        self.assertEqual(list_res.status_code, 200)
        students = json.loads(list_res.data)
        self.assertGreater(len(students), 0)

        # Verify attributes
        first = students[0]
        self.assertIn("name", first)
        self.assertIn("department", first)
        self.assertIn("roll_number", first)

    def test_06_api_scan_endpoint(self):
        """Test POST /api/scan endpoint with a frame."""
        payload = {
            "image": self.test_image_b64,
            "threshold": 0.35,
            "gate_name": "Main Gate",
            "auto_log": True,
            "cooldown": 60
        }
        res = self.client.post(
            "/api/scan",
            data=json.dumps(payload),
            content_type="application/json"
        )
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("faces_detected", data)
        self.assertIn("results", data)

    def test_07_api_manual_entry(self):
        """Test POST /api/entries/manual endpoint."""
        payload = {
            "name": "Kavita Nair",
            "roll_number": "ME2026-777",
            "department": "Mechanical Engineering",
            "gate_name": "Gate 2"
        }
        res = self.client.post(
            "/api/entries/manual",
            data=json.dumps(payload),
            content_type="application/json"
        )
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data["status"], "ALLOWED")
        self.assertEqual(data["entry"]["name"], "Kavita Nair")
        self.assertEqual(data["entry"]["department"], "Mechanical Engineering")

    def test_08_api_csv_export(self):
        """Test GET /api/entries/export to ensure CSV contains Name, Time, Department, Date."""
        res = self.client.get("/api/entries/export")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, "text/csv")
        csv_content = res.data.decode("utf-8")

        # Verify header columns
        self.assertIn("Student Name", csv_content)
        self.assertIn("Date", csv_content)
        self.assertIn("Time", csv_content)
        self.assertIn("Department", csv_content)
        self.assertIn("Roll Number", csv_content)

    def test_09_api_today_stats(self):
        """Test GET /api/stats/today endpoint."""
        res = self.client.get("/api/stats/today")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("total_entries", data)
        self.assertIn("unique_students", data)
        self.assertIn("department_counts", data)
        self.assertGreaterEqual(data["total_entries"], 1)


if __name__ == "__main__":
    unittest.main()
