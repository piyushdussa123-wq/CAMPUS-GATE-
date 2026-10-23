/**
 * CampusGate AI - Scanner Engine & Real-time Video Processor
 * Manages WebRTC camera, canvas bounding boxes, API frame polling, and audio/voice announcements.
 */

const scanner = {
    video: null,
    canvas: null,
    ctx: null,
    stream: null,
    isRunning: false,
    isProcessing: false,
    scanInterval: null,
    fps: 4, // 4 frames per second scan rate (optimal balance of responsiveness and performance)
    lastAnnouncedStudent: null,
    lastAnnounceTime: 0,

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

        const simBtn = document.getElementById('simulateScanBtn');
        if (simBtn) {
            simBtn.addEventListener('click', () => {
                this.simulateDemoScan();
            });
        }
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

            // Resize canvas to match video actual resolution
            this.video.addEventListener('loadedmetadata', () => {
                this.resizeCanvas();
            });
            this.resizeCanvas();

            // Start frame processing loop
            const intervalMs = Math.round(1000 / this.fps);
            this.scanInterval = setInterval(() => this.processCurrentFrame(), intervalMs);

            // Re-check available devices once permission is granted
            this.populateCameraDevices();

        } catch (err) {
            console.error("Camera access error:", err);
            alert("Could not start camera: " + err.message + "\nPlease check browser camera permissions.");
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
        this.isProcessing = false;

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

    captureFrameB64() {
        if (!this.video || this.video.readyState < 2) return null;

        const offCanvas = document.createElement('canvas');
        offCanvas.width = 640;
        offCanvas.height = Math.round(640 * (this.video.videoHeight / (this.video.videoWidth || 1)));
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(this.video, 0, 0, offCanvas.width, offCanvas.height);
        return offCanvas.toDataURL('image/jpeg', 0.82);
    },

    async processCurrentFrame() {
        if (!this.isRunning || this.isProcessing) return;

        const imageB64 = this.captureFrameB64();
        if (!imageB64) return;

        this.isProcessing = true;

        const threshold = parseFloat(document.getElementById('thresholdSlider').value);
        const autoLog = document.getElementById('autoLogCheckbox').checked;
        const gate = document.getElementById('gateSelector').value;

        try {
            const res = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: imageB64,
                    threshold: threshold,
                    gate_name: gate,
                    auto_log: autoLog,
                    cooldown: 180 // 3 minutes cooldown
                })
            });

            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const data = await res.json();

            // Render overlays
            this.renderDetections(data.results || []);

            // Handle gate check-in events
            this.handleGateActions(data.results || []);

        } catch (err) {
            // Ignore brief frame drop errors
        } finally {
            this.isProcessing = false;
        }
    },

    renderDetections(results) {
        this.clearCanvas();
        if (!results || results.length === 0) return;

        // Scaling ratio between backend processed frame (640w) and displayed canvas
        const scaleX = this.canvas.width / 640;
        const scaleY = this.canvas.height / (640 * (this.video.videoHeight / (this.video.videoWidth || 1)));

        results.forEach(r => {
            const [rx, ry, rw, rh] = r.box;
            const x = rx * scaleX;
            const y = ry * scaleY;
            const w = rw * scaleX;
            const h = rh * scaleY;

            let strokeColor = '#ef4444'; // Red for unknown
            let title = 'UNKNOWN PERSON';
            let subtitle = 'Access Not Verified';

            if (r.is_known && r.student) {
                const action = r.gate_action;
                if (action && action.status === 'COOLDOWN_SKIP') {
                    strokeColor = '#f59e0b'; // Amber for cooldown
                    title = r.student.name;
                    subtitle = `${r.student.department} • Cooldown Active`;
                } else {
                    strokeColor = '#10b981'; // Green for granted
                    title = r.student.name;
                    subtitle = `${r.student.department} • ${r.student.roll_number}`;
                }
            }

            // Draw bounding box
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(x, y, w, h);

            // Draw stylish tech corners
            const cornerLen = Math.min(w, h) * 0.22;
            this.ctx.lineWidth = 5;

            // Top-left
            this.ctx.beginPath();
            this.ctx.moveTo(x, y + cornerLen);
            this.ctx.lineTo(x, y);
            this.ctx.lineTo(x + cornerLen, y);
            this.ctx.stroke();

            // Top-right
            this.ctx.beginPath();
            this.ctx.moveTo(x + w - cornerLen, y);
            this.ctx.lineTo(x + w, y);
            this.ctx.lineTo(x + w, y + cornerLen);
            this.ctx.stroke();

            // Bottom-left
            this.ctx.beginPath();
            this.ctx.moveTo(x, y + h - cornerLen);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x + cornerLen, y + h);
            this.ctx.stroke();

            // Bottom-right
            this.ctx.beginPath();
            this.ctx.moveTo(x + w - cornerLen, y + h);
            this.ctx.lineTo(x + w, y + h);
            this.ctx.lineTo(x + w, y + h - cornerLen);
            this.ctx.stroke();

            // Draw label pill above head
            const tagHeight = 36;
            const tagWidth = Math.max(180, w * 1.1);
            const tagX = Math.max(10, x + (w - tagWidth) / 2);
            const tagY = Math.max(10, y - tagHeight - 8);

            this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 1.5;

            this.roundRect(this.ctx, tagX, tagY, tagWidth, tagHeight, 8, true, true);

            // Text
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 13px system-ui, sans-serif';
            this.ctx.fillText(title, tagX + 10, tagY + 16);

            this.ctx.fillStyle = strokeColor;
            this.ctx.font = '10px system-ui, sans-serif';
            this.ctx.fillText(subtitle, tagX + 10, tagY + 29);
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

    handleGateActions(results) {
        const now = Date.now();
        const voiceEnabled = document.getElementById('voiceAnnounceCheckbox').checked;

        for (const r of results) {
            if (!r.is_known || !r.student || !r.gate_action) continue;

            const action = r.gate_action;
            const student = r.student;

            if (action.status === 'ALLOWED') {
                // Prevent duplicate voice triggers within 4 seconds
                if (this.lastAnnouncedStudent !== student.id || (now - this.lastAnnounceTime > 5000)) {
                    this.lastAnnouncedStudent = student.id;
                    this.lastAnnounceTime = now;

                    // Play chime & speak
                    soundEngine.playSuccess();
                    if (voiceEnabled) {
                        soundEngine.speak(`Welcome, ${student.name}. Entry recorded for ${student.department}.`);
                    }

                    // Update live banner
                    this.showEntryBanner(student, action, r.confidence);

                    // Update feed & counters
                    loadTodayStats();
                }
            } else if (action.status === 'COOLDOWN_SKIP') {
                if (this.lastAnnouncedStudent !== student.id || (now - this.lastAnnounceTime > 8000)) {
                    this.lastAnnouncedStudent = student.id;
                    this.lastAnnounceTime = now;

                    soundEngine.playWarning();
                    if (voiceEnabled) {
                        soundEngine.speak(`${student.name}, entry already marked.`);
                    }

                    this.showCooldownBanner(student, action);
                }
            }
        }
    },

    showEntryBanner(student, action, confidence) {
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

        photo.src = student.photo_path 
            ? `/data/student_photos/${student.photo_path}` 
            : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="%234f46e5"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="%234f46e5"/></svg>';

        name.textContent = student.name;
        badge.className = 'text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        badge.textContent = 'ENTRY GRANTED';

        timestamp.textContent = action.entry ? action.entry.time : new Date().toLocaleTimeString();
        dept.textContent = student.department;
        roll.textContent = student.roll_number;
        gate.textContent = document.getElementById('gateSelector').value;
        conf.textContent = `${Math.round((confidence || 0.95) * 100)}%`;

        banner.classList.remove('hidden');

        // Auto-fade banner after 6 seconds
        clearTimeout(this.bannerTimeout);
        this.bannerTimeout = setTimeout(() => {
            banner.classList.add('hidden');
        }, 6000);
    },

    showCooldownBanner(student, action) {
        const banner = document.getElementById('scanResultBanner');
        const photo = document.getElementById('bannerStudentPhoto');
        const name = document.getElementById('bannerStudentName');
        const badge = document.getElementById('bannerStatusBadge');
        const timestamp = document.getElementById('bannerTimestamp');
        const dept = document.getElementById('bannerDepartment');
        const roll = document.getElementById('bannerRollNumber');

        if (!banner) return;

        photo.src = student.photo_path 
            ? `/data/student_photos/${student.photo_path}` 
            : '';

        name.textContent = student.name;
        badge.className = 'text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
        badge.textContent = 'ALREADY CHECKED IN';

        timestamp.textContent = action.entry ? action.entry.time : new Date().toLocaleTimeString();
        dept.textContent = student.department;
        roll.textContent = student.roll_number;

        banner.classList.remove('hidden');

        clearTimeout(this.bannerTimeout);
        this.bannerTimeout = setTimeout(() => {
            banner.classList.add('hidden');
        }, 4000);
    },

    async simulateDemoScan() {
        const demoStudents = [
            { id: 1, name: "Aarav Sharma", roll_number: "CS2026-012", department: "Computer Science & Engineering", photo_path: "CS2026-012.jpg" },
            { id: 2, name: "Priya Patel", roll_number: "EC2026-045", department: "Electronics & Communication", photo_path: "EC2026-045.jpg" },
            { id: 3, name: "Rohan Verma", roll_number: "ME2026-028", department: "Mechanical Engineering", photo_path: "ME2026-028.jpg" }
        ];

        if (!this.demoIdx) this.demoIdx = 0;
        const student = demoStudents[this.demoIdx % demoStudents.length];
        this.demoIdx++;

        const placeholder = document.getElementById('cameraPlaceholder');
        if (placeholder) placeholder.classList.add('hidden');

        this.canvas.width = 640;
        this.canvas.height = 360;
        this.clearCanvas();

        const fakeBox = [220, 60, 200, 220];
        this.renderDetections([{
            box: fakeBox,
            is_known: true,
            student: student,
            confidence: 0.94,
            gate_action: { status: 'ALLOWED' }
        }]);

        soundEngine.playSuccess();
        const voiceEnabled = document.getElementById('voiceAnnounceCheckbox')?.checked ?? true;
        if (voiceEnabled) {
            soundEngine.speak(`Welcome, ${student.name}. Entry recorded for ${student.department}.`);
        }

        this.showEntryBanner(student, { gate_name: document.getElementById('gateSelector')?.value || 'Main Gate - Gate 1' }, 0.94);

        try {
            await fetch('/api/entries/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    student_id: student.id,
                    name: student.name,
                    roll_number: student.roll_number,
                    department: student.department,
                    gate_name: document.getElementById('gateSelector')?.value || 'Main Gate - Gate 1',
                    status: 'ALLOWED'
                })
            });
            if (typeof loadTodayStats === 'function') loadTodayStats();
            if (typeof loadAttendanceLogs === 'function') loadAttendanceLogs();
        } catch (e) {
            console.warn("Simulate log error:", e);
        }

        setTimeout(() => {
            if (!this.isRunning) {
                this.clearCanvas();
                if (placeholder) placeholder.classList.remove('hidden');
            }
        }, 4000);
    }
};

// Initialize scanner engine when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    scanner.init();
});
