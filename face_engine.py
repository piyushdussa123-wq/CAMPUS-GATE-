"""
Face Recognition Engine for College Gate Attendance System.
Utilizes OpenCV YuNet for real-time face detection and SFace for 128-D facial feature embeddings.
Includes fallback mechanisms for maximum compatibility and robustness.
"""

import os
import io
import base64
import numpy as np
import cv2
from typing import List, Dict, Any, Optional, Tuple

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
YUNET_PATH = os.path.join(MODELS_DIR, "face_detection_yunet.onnx")
SFACE_PATH = os.path.join(MODELS_DIR, "face_recognition_sface.onnx")


def b64_to_image(b64_str: str) -> Optional[np.ndarray]:
    """Convert base64 encoded image string to OpenCV BGR image."""
    try:
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]
        img_bytes = base64.b64decode(b64_str)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"Error decoding base64 image: {e}")
        return None


def image_to_b64(image_bgr: np.ndarray, quality: int = 85) -> str:
    """Convert OpenCV BGR image to base64 JPEG string."""
    try:
        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
        _, buffer = cv2.imencode(".jpg", image_bgr, encode_params)
        b64_str = base64.b64encode(buffer).decode("utf-8")
        return f"data:image/jpeg;base64,{b64_str}"
    except Exception as e:
        print(f"Error encoding image to base64: {e}")
        return ""


class FaceEngine:
    def __init__(self, yunet_model: str = YUNET_PATH, sface_model: str = SFACE_PATH):
        self.yunet_path = yunet_model
        self.sface_path = sface_model
        self.detector = None
        self.recognizer = None
        self.has_dnn = False

        # Fallback Haar Cascade
        haar_file = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self.haar_cascade = cv2.CascadeClassifier(haar_file) if os.path.exists(haar_file) else None

        self._initialize_models()

    def _initialize_models(self):
        """Initialize YuNet and SFace models if present."""
        try:
            if os.path.exists(self.yunet_path) and os.path.exists(self.sface_path):
                self.detector = cv2.FaceDetectorYN.create(
                    self.yunet_path,
                    "",
                    (320, 320),
                    score_threshold=0.6,
                    nms_threshold=0.3,
                    top_k=5000
                )
                self.recognizer = cv2.FaceRecognizerSF.create(self.sface_path, "")
                self.has_dnn = True
                print("FaceEngine: YuNet and SFace loaded successfully.")
            else:
                print("FaceEngine: ONNX model files missing, using fallback detection.")
        except Exception as e:
            print(f"FaceEngine: Failed to load ONNX models: {e}. Using fallback.")
            self.has_dnn = False

    def detect_faces(self, image_bgr: np.ndarray, score_threshold: float = 0.55) -> List[Dict[str, Any]]:
        """
        Detect all faces in an image.
        Returns a list of dicts:
        {
            "box": [x, y, w, h],
            "confidence": float,
            "raw_face": face_row (if YuNet)
        }
        """
        if image_bgr is None or image_bgr.size == 0:
            return []

        h, w = image_bgr.shape[:2]
        detected = []

        if self.has_dnn and self.detector is not None:
            try:
                self.detector.setInputSize((w, h))
                self.detector.setScoreThreshold(score_threshold)
                _, faces = self.detector.detect(image_bgr)
                if faces is not None and len(faces) > 0:
                    for f in faces:
                        x, y, fw, fh = f[0:4].astype(int)
                        # Clamp coordinates within frame boundaries
                        x = max(0, x)
                        y = max(0, y)
                        fw = min(w - x, fw)
                        fh = min(h - y, fh)
                        conf = float(f[14])
                        if fw > 20 and fh > 20:
                            detected.append({
                                "box": [int(x), int(y), int(fw), int(fh)],
                                "confidence": round(conf, 3),
                                "raw_face": f
                            })
                    return detected
            except Exception as e:
                print(f"YuNet detection error: {e}")

        # Fallback to Haar Cascade
        if self.haar_cascade is not None:
            gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
            faces = self.haar_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
            )
            for (x, y, fw, fh) in faces:
                detected.append({
                    "box": [int(x), int(y), int(fw), int(fh)],
                    "confidence": 0.85,
                    "raw_face": None
                })

        return detected

    def extract_embedding(
        self, image_bgr: np.ndarray, raw_face: Optional[np.ndarray] = None
    ) -> Optional[List[float]]:
        """
        Extract 128-D facial feature embedding vector from an image or detected face.
        """
        if image_bgr is None or image_bgr.size == 0:
            return None

        if self.has_dnn and self.recognizer is not None:
            try:
                if raw_face is not None:
                    # Align and crop face using 5 facial landmarks from YuNet
                    aligned = self.recognizer.alignCrop(image_bgr, raw_face)
                    feature = self.recognizer.feature(aligned)
                    norm = np.linalg.norm(feature)
                    if norm > 0:
                        feature = feature / norm
                    return feature.flatten().tolist()
                else:
                    # Detect face first
                    faces = self.detect_faces(image_bgr, score_threshold=0.5)
                    if faces and faces[0]["raw_face"] is not None:
                        aligned = self.recognizer.alignCrop(image_bgr, faces[0]["raw_face"])
                        feature = self.recognizer.feature(aligned)
                        norm = np.linalg.norm(feature)
                        if norm > 0:
                            feature = feature / norm
                        return feature.flatten().tolist()
            except Exception as e:
                print(f"SFace feature extraction error: {e}")

        # Resilient fallback: compute normalized spatial frequency / color-texture descriptor
        try:
            gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
            # Find face crop or center
            faces = self.detect_faces(image_bgr)
            if faces:
                x, y, w, h = faces[0]["box"]
                face_crop = gray[y:y+h, x:x+w]
            else:
                face_crop = gray
            resized = cv2.resize(face_crop, (64, 64))
            # DCT frequency embedding
            float_img = np.float32(resized) / 255.0
            dct = cv2.dct(float_img)
            # Extract top 128 low-frequency components
            features = dct[:16, :8].flatten()
            norm = np.linalg.norm(features)
            if norm > 0:
                features = features / norm
            return features.tolist()
        except Exception as e:
            print(f"Fallback feature extraction error: {e}")
            return None

    @staticmethod
    def calculate_similarity(emb1: List[float], emb2: List[float]) -> float:
        """
        Compute Cosine Similarity between two 128-D embedding vectors.
        Returns a score from 0.0 to 1.0 (with 1.0 being exact match).
        """
        if not emb1 or not emb2:
            return 0.0
        v1 = np.array(emb1, dtype=np.float32)
        v2 = np.array(emb2, dtype=np.float32)

        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        if norm1 == 0 or norm2 == 0:
            return 0.0

        cosine_sim = float(np.dot(v1, v2) / (norm1 * norm2))
        return max(0.0, min(1.0, cosine_sim))

    def identify_face(
        self,
        query_embedding: List[float],
        enrolled_students: List[Dict[str, Any]],
        threshold: float = 0.38
    ) -> Tuple[Optional[Dict[str, Any]], float]:
        """
        Compare query face embedding against enrolled students.
        Returns (best_matching_student_dict or None, confidence_score).
        SFace official cosine threshold is ~0.363; 0.38 - 0.42 gives great gate accuracy.
        """
        if not query_embedding or not enrolled_students:
            return None, 0.0

        best_match = None
        best_score = 0.0

        for student in enrolled_students:
            std_emb = student.get("face_embedding")
            if not std_emb:
                continue

            sim = self.calculate_similarity(query_embedding, std_emb)
            if sim > best_score:
                best_score = sim
                best_match = student

        if best_score >= threshold:
            return best_match, round(best_score, 3)
        return None, round(best_score, 3)

    def scan_frame(
        self,
        image_bgr: np.ndarray,
        enrolled_students: List[Dict[str, Any]],
        threshold: float = 0.38
    ) -> List[Dict[str, Any]]:
        """
        Process a gate camera frame:
        1. Detects all faces.
        2. For each face, extracts embedding and identifies student.
        3. Returns detected bounding boxes, student information, and confidence.
        """
        results = []
        detected_faces = self.detect_faces(image_bgr)

        for df in detected_faces:
            bbox = df["box"]
            raw_face = df.get("raw_face")

            # Extract feature embedding
            embedding = self.extract_embedding(image_bgr, raw_face)

            if embedding:
                matched_student, score = self.identify_face(
                    embedding, enrolled_students, threshold=threshold
                )
                if matched_student:
                    results.append({
                        "box": bbox,
                        "is_known": True,
                        "confidence": score,
                        "student": {
                            "id": matched_student["id"],
                            "name": matched_student["name"],
                            "roll_number": matched_student["roll_number"],
                            "department": matched_student["department"],
                            "year": matched_student.get("year", ""),
                            "photo_path": matched_student.get("photo_path", "")
                        }
                    })
                else:
                    results.append({
                        "box": bbox,
                        "is_known": False,
                        "confidence": score,
                        "student": None
                    })
            else:
                results.append({
                    "box": bbox,
                    "is_known": False,
                    "confidence": 0.0,
                    "student": None
                })

        return results
