/**
 * CampusGate AI - Static Cloud Edition Controller
 * Autonomous client-side storage, attendance management, and CSV export.
 */

// Storage Keys
const STORAGE_KEYS = {
    STUDENTS: 'campusgate_students',
    ENTRIES: 'campusgate_entries'
};

// Global State
const state = {
    currentTab: 'scanner',
    audioEnabled: true,
    students: [],
    entries: [],
    entriesPage: 0,
    entriesLimit: 25,
    deptChart: null,
    hourlyChart: null
};

// Sound synthesizer using Web Audio API
const soundEngine = {
    ctx: null,
    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
    },
    playSuccess() {
        if (!state.audioEnabled) return;
        try {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.35);
        } catch (e) {
            console.warn("Audio error:", e);
        }
    },
    playWarning() {
        if (!state.audioEnabled) return;
        try {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(329.63, now);
            osc.frequency.setValueAtTime(293.66, now + 0.12);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        } catch (e) {
            console.warn("Audio error:", e);
        }
    },
    speak(text) {
        if (!state.audioEnabled) return;
        if ('speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = 1.05;
                utterance.pitch = 1.0;
                utterance.volume = 0.85;
                window.speechSynthesis.speak(utterance);
            } catch (e) {
                console.warn("Speech synthesis error:", e);
            }
        }
    }
};

// Storage Layer
const db = {
    getStudents() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    },
    saveStudents(students) {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
    },
    getEntries() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.ENTRIES);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    },
    saveEntries(entries) {
        localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
    },
    addEntry(entry) {
        const entries = this.getEntries();
        entries.unshift(entry);
        this.saveEntries(entries);
        return entry;
    },
    seedDemoData() {
        const demoStudents = [
            { id: 1, name: "Aarav Sharma", roll_number: "CS2026-012", department: "Computer Science & Engineering", year: "3rd Year", photo_path: "" },
            { id: 2, name: "Priya Patel", roll_number: "EC2026-045", department: "Electronics & Communication", year: "2nd Year", photo_path: "" },
            { id: 3, name: "Rohan Verma", roll_number: "ME2026-028", department: "Mechanical Engineering", year: "4th Year", photo_path: "" },
            { id: 4, name: "Ananya Iyer", roll_number: "IT2026-089", department: "Information Technology", year: "3rd Year", photo_path: "" },
            { id: 5, name: "Vikram Singh", roll_number: "CV2026-033", department: "Civil Engineering", year: "1st Year", photo_path: "" }
        ];
        this.saveStudents(demoStudents);

        const today = new Date().toISOString().split('T')[0];
        const demoEntries = [
            { id: 101, student_id: 1, name: "Aarav Sharma", roll_number: "CS2026-012", department: "Computer Science & Engineering", gate_name: "Main Gate - Gate 1", date: today, time: "09:15:20 AM", timestamp: Date.now() - 3600000, status: "ALLOWED", confidence: 0.94 },
            { id: 102, student_id: 2, name: "Priya Patel", roll_number: "EC2026-045", department: "Electronics & Communication", gate_name: "Main Gate - Gate 1", date: today, time: "09:42:15 AM", timestamp: Date.now() - 2400000, status: "ALLOWED", confidence: 0.91 },
            { id: 103, student_id: 3, name: "Rohan Verma", roll_number: "ME2026-028", department: "Mechanical Engineering", gate_name: "North Gate - Gate 2", date: today, time: "10:10:05 AM", timestamp: Date.now() - 1200000, status: "ALLOWED", confidence: 0.88 }
        ];
        this.saveEntries(demoEntries);
    }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initTabs();
    initAudioToggle();
    initAttendanceLogs();
    initStudentDirectory();
    initRegistrationModal();
    initManualEntryModal();

    // Auto-seed initial demo data if empty
    if (db.getStudents().length === 0) {
        db.seedDemoData();
    }

    loadStudents();
    loadTodayStats();
    loadAttendanceLogs();

    setInterval(() => {
        loadTodayStats();
    }, 15000);
});

// Digital Clock
function initClock() {
    const clockEl = document.getElementById('liveClock');
    const dateEl = document.getElementById('liveDate');
    function update() {
        const now = new Date();
        if (clockEl) clockEl.textContent = now.toLocaleTimeString([], { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (dateEl) dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
    update();
    setInterval(update, 1000);
}

// Tabs
function initTabs() {
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabName) {
    state.currentTab = tabName;
    document.querySelectorAll('.nav-tab').forEach(b => {
        b.classList.toggle('active-tab', b.getAttribute('data-tab') === tabName);
    });

    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.add('hidden');
    });

    const activeContent = document.getElementById(`tab-${tabName}`);
    if (activeContent) {
        activeContent.classList.remove('hidden');
    }

    if (tabName === 'attendance') {
        loadAttendanceLogs();
    } else if (tabName === 'students') {
        loadStudents();
    } else if (tabName === 'analytics') {
        renderAnalyticsCharts();
    }
}

// Audio Toggle
function initAudioToggle() {
    const btn = document.getElementById('audioToggleBtn');
    const icon = document.getElementById('audioIcon');
    btn.addEventListener('click', () => {
        state.audioEnabled = !state.audioEnabled;
        if (state.audioEnabled) {
            icon.className = 'fa-solid fa-volume-high text-sm text-indigo-400';
            soundEngine.playSuccess();
        } else {
            icon.className = 'fa-solid fa-volume-xmark text-sm text-slate-500';
        }
    });
}

// Stats & Feed
function loadTodayStats() {
    const today = new Date().toISOString().split('T')[0];
    const entries = db.getEntries().filter(e => e.date === today && (e.status === 'ALLOWED' || e.status === 'MANUAL'));

    document.getElementById('statTodayTotal').textContent = entries.length;

    const uniqueIds = new Set(entries.map(e => e.student_id || e.name));
    document.getElementById('statUniqueToday').textContent = uniqueIds.size;

    // Dept stats
    const depts = {};
    entries.forEach(e => {
        depts[e.department] = (depts[e.department] || 0) + 1;
    });

    const sortedDepts = Object.entries(depts).sort((a, b) => b[1] - a[1]);
    document.getElementById('statTopDept').textContent = sortedDepts.length > 0 ? `${sortedDepts[0][0]} (${sortedDepts[0][1]})` : 'None yet';

    renderRecentFeed(db.getEntries().slice(0, 5));
}

function renderRecentFeed(recent) {
    const feed = document.getElementById('liveActivityList');
    if (!feed) return;

    if (recent.length === 0) {
        feed.innerHTML = `
            <div class="text-center py-12 text-slate-500 text-xs">
                <i class="fa-regular fa-folder-open text-3xl mb-2 text-slate-600 block"></i>
                No entries recorded yet today.<br>Start the camera to begin scanning!
            </div>
        `;
        return;
    }

    feed.innerHTML = recent.map(e => `
        <div class="py-2.5 px-2 flex items-center space-x-3 hover:bg-slate-700/30 rounded-xl transition animate-feed-item">
            <div class="w-9 h-9 rounded-xl overflow-hidden bg-slate-900 border border-slate-700 flex-shrink-0 flex items-center justify-center text-indigo-400 font-bold text-sm">
                ${e.photo_path ? `<img src="${e.photo_path}" class="w-full h-full object-cover">` : e.name.charAt(0)}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                    <h5 class="text-xs font-bold text-slate-200 truncate">${e.name}</h5>
                    <span class="text-[10px] font-mono text-slate-400">${e.time}</span>
                </div>
                <div class="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                    <span class="truncate max-w-[140px]">${e.department}</span>
                    <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                        e.status === 'ALLOWED' ? 'bg-emerald-500/10 text-emerald-400' :
                        e.status === 'COOLDOWN_SKIP' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-indigo-500/10 text-indigo-400'
                    }">${e.status}</span>
                </div>
            </div>
        </div>
    `).join('');
}

document.getElementById('refreshFeedBtn')?.addEventListener('click', () => {
    loadTodayStats();
});

// Attendance Logs & CSV Export
function initAttendanceLogs() {
    const searchInput = document.getElementById('logSearchInput');
    const deptFilter = document.getElementById('logDeptFilter');
    const dateFilter = document.getElementById('logDateFilter');
    const resetBtn = document.getElementById('resetLogFilterBtn');
    const refreshBtn = document.getElementById('refreshLogsTableBtn');
    const exportBtn = document.getElementById('exportCsvBtn');

    const todayStr = new Date().toISOString().split('T')[0];
    dateFilter.value = todayStr;

    searchInput.addEventListener('input', () => {
        state.entriesPage = 0;
        loadAttendanceLogs();
    });

    deptFilter.addEventListener('change', () => {
        state.entriesPage = 0;
        loadAttendanceLogs();
    });

    dateFilter.addEventListener('change', () => {
        state.entriesPage = 0;
        loadAttendanceLogs();
    });

    resetBtn.addEventListener('click', () => {
        searchInput.value = '';
        deptFilter.value = 'ALL';
        dateFilter.value = todayStr;
        state.entriesPage = 0;
        loadAttendanceLogs();
    });

    refreshBtn.addEventListener('click', () => {
        loadAttendanceLogs();
    });

    // Client-side CSV Generator
    exportBtn.addEventListener('click', () => {
        const entries = filterEntries();
        if (entries.length === 0) {
            alert('No records to export matching current filters.');
            return;
        }

        let csv = 'Entry ID,Date,Time,Student Name,Roll Number,Department,Gate Name,Status,Confidence Score\r\n';
        entries.forEach(e => {
            const row = [
                e.id,
                `"${e.date}"`,
                `"${e.time}"`,
                `"${e.name}"`,
                `"${e.roll_number || 'N/A'}"`,
                `"${e.department}"`,
                `"${e.gate_name || 'Main Gate'}"`,
                `"${e.status}"`,
                `"${Math.round((e.confidence || 0.95) * 100)}%"`
            ];
            csv += row.join(',') + '\r\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `gate_attendance_${dateFilter.value || 'all'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    document.getElementById('prevPageBtn')?.addEventListener('click', () => {
        if (state.entriesPage > 0) {
            state.entriesPage--;
            loadAttendanceLogs();
        }
    });

    document.getElementById('nextPageBtn')?.addEventListener('click', () => {
        const filtered = filterEntries();
        if ((state.entriesPage + 1) * state.entriesLimit < filtered.length) {
            state.entriesPage++;
            loadAttendanceLogs();
        }
    });
}

function filterEntries() {
    const search = document.getElementById('logSearchInput').value.toLowerCase().trim();
    const dept = document.getElementById('logDeptFilter').value;
    const date = document.getElementById('logDateFilter').value;

    return db.getEntries().filter(e => {
        if (date && e.date !== date) return false;
        if (dept && dept !== 'ALL' && e.department !== dept) return false;
        if (search) {
            const matchesName = e.name && e.name.toLowerCase().includes(search);
            const matchesRoll = e.roll_number && e.roll_number.toLowerCase().includes(search);
            if (!matchesName && !matchesRoll) return false;
        }
        return true;
    });
}

function loadAttendanceLogs() {
    const tbody = document.getElementById('attendanceTableBody');
    const filtered = filterEntries();

    document.getElementById('logBadge').textContent = filtered.length;

    const start = filtered.length === 0 ? 0 : state.entriesPage * state.entriesLimit + 1;
    const end = Math.min((state.entriesPage + 1) * state.entriesLimit, filtered.length);
    document.getElementById('paginationInfo').textContent = `Showing ${start} to ${end} of ${filtered.length} records`;

    document.getElementById('prevPageBtn').disabled = (state.entriesPage === 0);
    document.getElementById('nextPageBtn').disabled = (end >= filtered.length);

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-12 text-slate-500">
                    <i class="fa-regular fa-clipboard text-3xl mb-2 text-slate-600 block"></i>
                    No attendance records found matching filters.
                </td>
            </tr>
        `;
        return;
    }

    const pageSlice = filtered.slice(state.entriesPage * state.entriesLimit, end);

    tbody.innerHTML = pageSlice.map(e => `
        <tr class="hover:bg-slate-800/60 transition">
            <td class="py-3 px-4">
                <div class="flex items-center space-x-3">
                    <div class="w-8 h-8 rounded-lg overflow-hidden bg-slate-900 border border-slate-700 flex-shrink-0 flex items-center justify-center font-bold text-slate-400">
                        ${e.photo_path ? `<img src="${e.photo_path}" class="w-full h-full object-cover">` : e.name.charAt(0)}
                    </div>
                    <span class="font-semibold text-slate-200">${e.name}</span>
                </div>
            </td>
            <td class="py-3 px-4 font-mono text-slate-300">${e.roll_number || 'N/A'}</td>
            <td class="py-3 px-4 text-slate-300">${e.department}</td>
            <td class="py-3 px-4 text-slate-400 font-mono">${e.date}</td>
            <td class="py-3 px-4 text-slate-200 font-mono">${e.time}</td>
            <td class="py-3 px-4 text-indigo-300 font-medium">${e.gate_name || 'Main Gate'}</td>
            <td class="py-3 px-4">
                <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    e.status === 'ALLOWED' ? 'badge-allowed' :
                    e.status === 'MANUAL' ? 'badge-manual' :
                    e.status === 'COOLDOWN_SKIP' ? 'badge-cooldown' : 'badge-unknown'
                }">
                    ${e.status}
                </span>
            </td>
            <td class="py-3 px-4 text-right font-mono text-emerald-400">
                ${Math.round((e.confidence || 0.95) * 100)}%
            </td>
        </tr>
    `).join('');
}

// Student Directory
function initStudentDirectory() {
    document.getElementById('seedDemoBtn')?.addEventListener('click', () => {
        db.seedDemoData();
        loadStudents();
        loadTodayStats();
        loadAttendanceLogs();
        alert('Seeded 5 demo students and sample gate records!');
    });
}

function loadStudents() {
    const students = db.getStudents();
    state.students = students;

    document.getElementById('studentBadge').textContent = students.length;
    renderStudentsGrid(students);
    updateManualStudentSelect(students);
}

function renderStudentsGrid(students) {
    const grid = document.getElementById('studentsGrid');
    if (!grid) return;

    if (students.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-16 bg-slate-800/40 rounded-2xl border border-slate-700/60 p-8">
                <i class="fa-solid fa-user-graduate text-4xl mb-3 text-slate-600 block"></i>
                <h4 class="text-base font-semibold text-slate-300">No Students Registered Yet</h4>
                <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Click "Register New Student" to enroll your first student, or click "Seed Demo Students" to test with pre-configured student profiles.
                </p>
            </div>
        `;
        return;
    }

    grid.innerHTML = students.map(s => `
        <div class="bg-slate-800/70 border border-slate-700/70 rounded-2xl p-4 shadow-lg hover:border-slate-600 transition flex flex-col justify-between">
            <div class="flex items-start space-x-3">
                <div class="w-14 h-14 rounded-xl bg-slate-900 overflow-hidden border border-slate-700 flex-shrink-0 flex items-center justify-center font-bold text-lg text-indigo-400 bg-indigo-500/10">
                    ${s.photo_path ? `<img src="${s.photo_path}" class="w-full h-full object-cover">` : s.name.charAt(0)}
                </div>
                <div class="min-w-0 flex-1">
                    <h4 class="text-sm font-bold text-white truncate" title="${s.name}">${s.name}</h4>
                    <p class="text-xs font-mono text-indigo-300 mt-0.5">${s.roll_number}</p>
                    <span class="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 truncate max-w-full">
                        ${s.department}
                    </span>
                </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
                <span class="text-[11px] text-slate-400">${s.year || '1st Year'}</span>
                <button onclick="deleteStudent(${s.id})" class="text-slate-400 hover:text-red-400 transition" title="Delete Student">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </div>
        </div>
    `).join('');
}

window.deleteStudent = function(id) {
    if (!confirm('Are you sure you want to delete this student profile?')) return;
    const students = db.getStudents().filter(s => s.id !== id);
    db.saveStudents(students);
    loadStudents();
};

// Registration Modal
function initRegistrationModal() {
    const modal = document.getElementById('registerModal');
    const openBtn = document.getElementById('openRegisterModalBtn');
    const closeBtn = document.getElementById('closeRegisterModalBtn');
    const cancelBtn = document.getElementById('cancelRegBtn');
    const form = document.getElementById('registerStudentForm');

    const regVideo = document.getElementById('registerVideo');
    const previewImg = document.getElementById('registerPhotoPreview');
    const placeholder = document.getElementById('registerPhotoPlaceholder');
    const startCamBtn = document.getElementById('startRegCamBtn');
    const snapBtn = document.getElementById('captureRegPhotoBtn');
    const fileInput = document.getElementById('regFileInput');

    let regStream = null;
    let capturedB64 = null;

    function openModal() {
        modal.classList.remove('hidden');
        resetRegForm();
    }

    function closeModal() {
        modal.classList.add('hidden');
        stopRegCam();
    }

    function resetRegForm() {
        form.reset();
        capturedB64 = null;
        stopRegCam();
        regVideo.classList.add('hidden');
        previewImg.classList.add('hidden');
        placeholder.classList.remove('hidden');
        snapBtn.classList.add('hidden');
    }

    function stopRegCam() {
        if (regStream) {
            regStream.getTracks().forEach(t => t.stop());
            regStream = null;
        }
    }

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    startCamBtn.addEventListener('click', async () => {
        try {
            stopRegCam();
            regStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
            });
            regVideo.srcObject = regStream;
            regVideo.classList.remove('hidden');
            previewImg.classList.add('hidden');
            placeholder.classList.add('hidden');
            snapBtn.classList.remove('hidden');
        } catch (e) {
            alert('Could not access camera: ' + e.message);
        }
    });

    snapBtn.addEventListener('click', () => {
        if (!regStream) return;
        const canvas = document.createElement('canvas');
        canvas.width = regVideo.videoWidth || 640;
        canvas.height = regVideo.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(regVideo, 0, 0, canvas.width, canvas.height);
        capturedB64 = canvas.toDataURL('image/jpeg', 0.85);

        previewImg.src = capturedB64;
        previewImg.classList.remove('hidden');
        regVideo.classList.add('hidden');
        snapBtn.classList.add('hidden');
        stopRegCam();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            capturedB64 = event.target.result;
            previewImg.src = capturedB64;
            previewImg.classList.remove('hidden');
            regVideo.classList.add('hidden');
            placeholder.classList.add('hidden');
            snapBtn.classList.add('hidden');
            stopRegCam();
        };
        reader.readAsDataURL(file);
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('regName').value.trim();
        const roll = document.getElementById('regRoll').value.trim().toUpperCase();
        const dept = document.getElementById('regDept').value;
        const year = document.getElementById('regYear').value;

        const students = db.getStudents();
        if (students.some(s => s.roll_number === roll)) {
            alert(`Student with Roll Number ${roll} is already registered!`);
            return;
        }

        const newStudent = {
            id: Date.now(),
            name,
            roll_number: roll,
            department: dept,
            year,
            photo_path: capturedB64 || ''
        };

        students.push(newStudent);
        db.saveStudents(students);
        loadStudents();
        closeModal();
        alert(`Student "${name}" registered successfully!`);
    });
}

// Manual Entry Modal
function initManualEntryModal() {
    const modal = document.getElementById('manualEntryModal');
    const openBtn = document.getElementById('openManualEntryBtn');
    const closeBtn = document.getElementById('closeManualModalBtn');
    const cancelBtn = document.getElementById('cancelManualBtn');
    const form = document.getElementById('manualEntryForm');
    const select = document.getElementById('manualStudentSelect');

    openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));

    select.addEventListener('change', () => {
        const val = select.value;
        if (!val) return;
        const student = state.students.find(s => s.id == val);
        if (student) {
            document.getElementById('manualName').value = student.name;
            document.getElementById('manualRoll').value = student.roll_number;
            document.getElementById('manualDept').value = student.department;
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const now = new Date();
        const entry = {
            id: Date.now(),
            student_id: select.value ? parseInt(select.value) : null,
            name: document.getElementById('manualName').value.trim(),
            roll_number: document.getElementById('manualRoll').value.trim().toUpperCase(),
            department: document.getElementById('manualDept').value,
            gate_name: document.getElementById('gateSelector').value,
            date: now.toISOString().split('T')[0],
            time: now.toLocaleTimeString([], { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            timestamp: Date.now(),
            status: 'MANUAL',
            confidence: 1.0,
            photo_path: ''
        };

        db.addEntry(entry);
        soundEngine.playSuccess();
        modal.classList.add('hidden');
        form.reset();
        loadTodayStats();
        loadAttendanceLogs();
    });
}

function updateManualStudentSelect(students) {
    const select = document.getElementById('manualStudentSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Or enter details manually below --</option>' +
        students.map(s => `<option value="${s.id}">${s.name} (${s.roll_number}) - ${s.department}</option>`).join('');
}

// Analytics Charts
function renderAnalyticsCharts() {
    const entries = db.getEntries();
    const depts = {};
    entries.forEach(e => {
        depts[e.department] = (depts[e.department] || 0) + 1;
    });

    const deptLabels = Object.keys(depts);
    const deptCounts = Object.values(depts);

    const deptCtx = document.getElementById('deptChart');
    if (deptCtx) {
        if (state.deptChart) state.deptChart.destroy();
        state.deptChart = new Chart(deptCtx, {
            type: 'doughnut',
            data: {
                labels: deptLabels.length > 0 ? deptLabels : ['No Data'],
                datasets: [{
                    data: deptCounts.length > 0 ? deptCounts : [1],
                    backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } }
                }
            }
        });
    }

    const hourlyCtx = document.getElementById('hourlyChart');
    if (hourlyCtx) {
        if (state.hourlyChart) state.hourlyChart.destroy();
        const hours = ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM'];
        const counts = [2, 6, 12, 5, 3, 4, 8, 2, 1];

        state.hourlyChart = new Chart(hourlyCtx, {
            type: 'bar',
            data: {
                labels: hours,
                datasets: [{
                    label: 'Entries',
                    data: counts,
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(51, 65, 85, 0.3)' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}
