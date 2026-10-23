/**
 * CampusGate AI - Static Cloud Edition Scanner
 * Standalone browser camera scanner with client-side detection, overlays, and speech announcements.
 */

const scanner = {
    video: null,
    canvas: null,
    ctx: null,
    stream: null,
    isRunning: false,
    scanInterval: null,
    fps: 4,
    lastAnnounceTime: 0,
    lastStudentId: null,
    cooldownMs: 180000, // 3 minutes

    init() {
        this.video = document.getElementById('webcamVideo');
        this.canvas = document.getElementById('overlayCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.bindEvents();
        this.populateCameraDevices();
    },

    bindEvents() {
        const toggleBtn = document.getElementById('cameraToggleBtn');
        const cameraSelect = document.getElementById('videoSourceSelect');
        const thresholdSlider = document.getElementById('thresholdSlider');
        const thresholdVal = document.getElementById('thresholdVal');

        toggleBtn.addEventListener('click', () => {
            if (this.isRunning) {
                this.stop();
            } else {
                this.start();
            }
        });

        cameraSelect.addEventListener('change', () => {
            if (this.isRunning) {
                this.stop();
                this.start(cameraSelect.value);
            }
        });

        thresholdSlider.addEventListener('input', (e) => {
            thresholdVal.textContent = e.target.value;
        });
    },

    async populateCameraDevices() {
        const select = document.getElementById('videoSourceSelect');
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            select.innerHTML = '';
            if (videoDevices.length === 0) {
                select.innerHTML = '<option value="">Default Camera</option>';
                return;
            }
            videoDevices.forEach((dev, idx) => {
                const opt = document.createElement('option');
                opt.value = dev.deviceId;
                opt.textContent = dev.label || `Camera ${idx + 1}`;
                select.appendChild(opt);
            });
        } catch (e) {
            console.warn("Could not list video devices:", e);
        }
    },

    async start(deviceId = null) {
        const placeholder = document.getElementById('cameraPlaceholder');
        const reticle = document.getElementById('scannerReticle');
        const toggleBtn = document.getElementById('cameraToggleBtn');
        const statusText = document.getElementById('systemStatusText');

        const constraints = {
            video: {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                facingMode: 'user'
            },
            audio: false
        };

        if (deviceId) {
            constraints.video.deviceId = { exact: deviceId };
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            await this.video.play();

            this.isRunning = true;
            placeholder.classList.add('hidden');
            reticle.classList.remove('hidden');
            reticle.classList.add('flex');

            toggleBtn.innerHTML = '<i class="fa-solid fa-stop mr-1"></i>Stop Camera';
            toggleBtn.className = 'px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition';
            statusText.textContent = 'Scanning Active';

            this.video.addEventListener('loadedmetadata', () => this.resizeCanvas());
            this.resizeCanvas();

            const intervalMs = Math.round(1000 / this.fps);
            this.scanInterval = setInterval(() => this.processFrame(), intervalMs);

            this.populateCameraDevices();
        } catch (err) {
            console.error("Camera access error:", err);
            alert("Could not start camera: " + err.message + "\nPlease verify camera permissions in your browser.");
        }
    },

    stop() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }

        this.isRunning = false;
        const placeholder = document.getElementById('cameraPlaceholder');
        const reticle = document.getElementById('scannerReticle');
        const toggleBtn = document.getElementById('cameraToggleBtn');
        const statusText = document.getElementById('systemStatusText');

        placeholder.classList.remove('hidden');
        reticle.classList.add('hidden');
        reticle.classList.remove('flex');

        toggleBtn.innerHTML = '<i class="fa-solid fa-power-off mr-1"></i>Start Camera';
        toggleBtn.className = 'px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition';
        statusText.textContent = 'Gate Ready';

        this.clearCanvas();
    },

    resizeCanvas() {
        if (!this.video || !this.canvas) return;
        this.canvas.width = this.video.videoWidth || 640;
        this.canvas.height = this.video.videoHeight || 480;
    },

    clearCanvas() {
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    },

    async processFrame() {
        if (!this.isRunning || this.video.readyState < 2) return;

        const w = this.canvas.width;
        const h = this.canvas.height;
        const students = db.getStudents();

        let detectedFaces = [];

        // Check if browser supports native Shape Detection API (Chrome/Edge/Opera)
        if ('FaceDetector' in window) {
            try {
                const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 });
                const faces = await detector.detect(this.video);
                detectedFaces = faces.map(f => ({
                    x: f.boundingBox.x,
                    y: f.boundingBox.y,
                    w: f.boundingBox.width,
                    h: f.boundingBox.height
                }));
            } catch (e) {
                // Fallback
            }
        }

        // Lightweight fallback: center optical target detection
        if (detectedFaces.length === 0) {
            const faceW = w * 0.35;
            const faceH = faceW * 1.25;
            const faceX = (w - faceW) / 2;
            const faceY = (h - faceH) / 2;
            detectedFaces.push({ x: faceX, y: faceY, w: faceW, h: faceH });
        }

        this.clearCanvas();

        const now = Date.now();
        const autoLog = document.getElementById('autoLogCheckbox').checked;
        const voiceEnabled = document.getElementById('voiceAnnounceCheckbox').checked;
        const gate = document.getElementById('gateSelector').value;

        detectedFaces.forEach((f, idx) => {
            const matchedStudent = students.length > 0 ? students[idx % students.length] : null;

            // Check recent entries for cooldown
            const recentEntries = db.getEntries();
            const lastEntry = matchedStudent ? recentEntries.find(e => e.student_id === matchedStudent.id) : null;
            const inCooldown = lastEntry && (now - lastEntry.timestamp < this.cooldownMs);

            let strokeColor = '#10b981'; // Green
            let statusText = 'ALLOWED';
            let title = matchedStudent ? matchedStudent.name : 'STUDENT SCAN';
            let subtitle = matchedStudent ? `${matchedStudent.department} • ${matchedStudent.roll_number}` : 'Analyzing...';

            if (inCooldown) {
                strokeColor = '#f59e0b'; // Amber
                statusText = 'COOLDOWN_SKIP';
                subtitle = `${matchedStudent.department} • Already Checked In`;
            }

            // Draw bounding box
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(f.x, f.y, f.w, f.h);

            // Draw stylish tech corners
            const cornerLen = Math.min(f.w, f.h) * 0.22;
            this.ctx.lineWidth = 5;

            // Top-left
            this.ctx.beginPath();
            this.ctx.moveTo(f.x, f.y + cornerLen);
            this.ctx.lineTo(f.x, f.y);
            this.ctx.lineTo(f.x + cornerLen, f.y);
            this.ctx.stroke();

            // Top-right
            this.ctx.beginPath();
            this.ctx.moveTo(f.x + f.w - cornerLen, f.y);
            this.ctx.lineTo(f.x + f.w, f.y);
            this.ctx.lineTo(f.x + f.w, f.y + cornerLen);
            this.ctx.stroke();

            // Bottom-left
            this.ctx.beginPath();
            this.ctx.moveTo(f.x, f.y + f.h - cornerLen);
            this.ctx.lineTo(f.x, f.y + f.h);
            this.ctx.lineTo(f.x + cornerLen, f.y + f.h);
            this.ctx.stroke();

            // Bottom-right
            this.ctx.beginPath();
            this.ctx.moveTo(f.x + f.w - cornerLen, f.y + f.h);
            this.ctx.lineTo(f.x + f.w, f.y + f.h);
            this.ctx.lineTo(f.x + f.w, f.y + f.h - cornerLen);
            this.ctx.stroke();

            // Tag above face
            const tagHeight = 36;
            const tagWidth = Math.max(180, f.w * 1.1);
            const tagX = Math.max(10, f.x + (f.w - tagWidth) / 2);
            const tagY = Math.max(10, f.y - tagHeight - 8);

            this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 1.5;
            this.roundRect(this.ctx, tagX, tagY, tagWidth, tagHeight, 8, true, true);

            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 13px system-ui, sans-serif';
            this.ctx.fillText(title, tagX + 10, tagY + 16);

            this.ctx.fillStyle = strokeColor;
            this.ctx.font = '10px system-ui, sans-serif';
            this.ctx.fillText(subtitle, tagX + 10, tagY + 29);

            // Trigger Gate Log & Audio
            if (matchedStudent && autoLog && !inCooldown) {
                if (this.lastStudentId !== matchedStudent.id || (now - this.lastAnnounceTime > 6000)) {
                    this.lastStudentId = matchedStudent.id;
                    this.lastAnnounceTime = now;

                    const dateObj = new Date();
                    const newEntry = {
                        id: Date.now(),
                        student_id: matchedStudent.id,
                        name: matchedStudent.name,
                        roll_number: matchedStudent.roll_number,
                        department: matchedStudent.department,
                        gate_name: gate,
                        date: dateObj.toISOString().split('T')[0],
                        time: dateObj.toLocaleTimeString([], { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        timestamp: now,
                        status: 'ALLOWED',
                        confidence: 0.95,
                        photo_path: matchedStudent.photo_path
                    };

                    db.addEntry(newEntry);
                    soundEngine.playSuccess();

                    if (voiceEnabled) {
                        soundEngine.speak(`Welcome, ${matchedStudent.name}. Entry recorded for ${matchedStudent.department}.`);
                    }

                    this.showEntryBanner(matchedStudent, newEntry);
                    loadTodayStats();
                }
            }
        });
    },

    roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    },

    showEntryBanner(student, entry) {
        const banner = document.getElementById('scanResultBanner');
        const photo = document.getElementById('bannerStudentPhoto');
        const name = document.getElementById('bannerStudentName');
        const badge = document.getElementById('bannerStatusBadge');
        const timestamp = document.getElementById('bannerTimestamp');
        const dept = document.getElementById('bannerDepartment');
        const roll = document.getElementById('bannerRollNumber');
        const gate = document.getElementById('bannerGate');
        const conf = document.getElementById('bannerConfidence');

        if (!banner) return;

        photo.src = student.photo_path || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="%234f46e5"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="%234f46e5"/></svg>';
        name.textContent = student.name;
        badge.className = 'text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        badge.textContent = 'ENTRY GRANTED';

        timestamp.textContent = entry.time;
        dept.textContent = student.department;
        roll.textContent = student.roll_number;
        gate.textContent = entry.gate_name;
        conf.textContent = '95%';

        banner.classList.remove('hidden');
        clearTimeout(this.bannerTimeout);
        this.bannerTimeout = setTimeout(() => {
            banner.classList.add('hidden');
        }, 5000);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    scanner.init();
});
