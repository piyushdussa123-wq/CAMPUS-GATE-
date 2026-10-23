/**
 * CampusGate AI - Core Application Controller
 * Handles tabs, attendance logs, student directory, registration, manual entry, and analytics.
 */

// Global State
const state = {
    currentTab: 'scanner',
    audioEnabled: true,
    students: [],
    entriesPage: 0,
    entriesLimit: 25,
    totalEntries: 0,
    deptChart: null,
    hourlyChart: null
};

// Sound synthesizer using Web Audio API (zero external sound file dependency!)
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
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.35);
        } catch (e) {
            console.warn("Audio play error:", e);
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
            osc.frequency.setValueAtTime(329.63, now); // E4
            osc.frequency.setValueAtTime(293.66, now + 0.12); // D4
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        } catch (e) {
            console.warn("Audio play error:", e);
        }
    },
    speak(text) {
        if (!state.audioEnabled) return;
        if ('speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel(); // Cancel any ongoing speech
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = 1.05;
                utterance.pitch = 1.0;
                utterance.volume = 0.8;
                window.speechSynthesis.speak(utterance);
            } catch (e) {
                console.warn("Speech synthesis error:", e);
            }
        }
    }
};

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initTabs();
    initAudioToggle();
    initAttendanceLogs();
    initStudentDirectory();
    initRegistrationModal();
    initManualEntryModal();
    initAnalytics();

    // Initial data load
    loadTodayStats();
    loadStudents();
    loadAttendanceLogs();

    // Periodic stats refresh (every 20 seconds)
    setInterval(() => {
        loadTodayStats();
    }, 20000);
});

// Live Digital Clock
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

// Tab Switching
function initTabs() {
    const tabButtons = document.querySelectorAll('.nav-tab');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabName) {
    state.currentTab = tabName;
    document.querySelectorAll('.nav-tab').forEach(b => {
        if (b.getAttribute('data-tab') === tabName) {
            b.classList.add('active-tab');
        } else {
            b.classList.remove('active-tab');
        }
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

// Sound Feedback Toggle
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

// ================= STATS & FEED =================
async function loadTodayStats() {
    try {
        const res = await fetch('/api/stats/today');
        const data = await res.parseJsonSafely ? await res.parseJsonSafely() : await res.json();
        
        document.getElementById('statTodayTotal').textContent = data.total_entries || 0;
        document.getElementById('statUniqueToday').textContent = data.unique_students || 0;

        // Top department
        const depts = data.department_counts || {};
        const entries = Object.entries(depts);
        if (entries.length > 0) {
            entries.sort((a, b) => b[1] - a[1]);
            document.getElementById('statTopDept').textContent = `${entries[0][0]} (${entries[0][1]})`;
        } else {
            document.getElementById('statTopDept').textContent = 'None yet';
        }

        // Populate Recent Feed
        renderRecentFeed(data.recent_entries || []);
    } catch (e) {
        console.error("Failed to fetch today's stats:", e);
    }
}

function renderRecentFeed(entries) {
    const feed = document.getElementById('liveActivityList');
    if (!feed) return;

    if (entries.length === 0) {
        feed.innerHTML = `
            <div class="text-center py-12 text-slate-500 text-xs">
                <i class="fa-regular fa-folder-open text-3xl mb-2 text-slate-600 block"></i>
                No entries recorded yet today.<br>Start the camera to begin scanning!
            </div>
        `;
        return;
    }

    feed.innerHTML = entries.map(e => `
        <div class="py-2.5 px-2 flex items-center space-x-3 hover:bg-slate-700/30 rounded-xl transition animate-feed-item">
            <div class="w-9 h-9 rounded-xl overflow-hidden bg-slate-900 border border-slate-700 flex-shrink-0">
                ${e.photo_path 
                    ? `<img src="/data/student_photos/${e.photo_path}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full flex items-center justify-center text-slate-500 font-bold">${e.name.charAt(0)}</div>`}
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


// ================= TAB 2: ATTENDANCE LOGS =================
function initAttendanceLogs() {
    const searchInput = document.getElementById('logSearchInput');
    const deptFilter = document.getElementById('logDeptFilter');
    const dateFilter = document.getElementById('logDateFilter');
    const resetBtn = document.getElementById('resetLogFilterBtn');
    const refreshBtn = document.getElementById('refreshLogsTableBtn');
    const exportBtn = document.getElementById('exportCsvBtn');

    // Set today as default in date picker
    const todayStr = new Date().toISOString().split('T')[0];
    dateFilter.value = todayStr;

    searchInput.addEventListener('input', debounce(() => {
        state.entriesPage = 0;
        loadAttendanceLogs();
    }, 300));

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

    exportBtn.addEventListener('click', () => {
        const params = new URLSearchParams();
        if (dateFilter.value) params.append('date', dateFilter.value);
        if (deptFilter.value && deptFilter.value !== 'ALL') params.append('department', deptFilter.value);
        if (searchInput.value.trim()) params.append('search', searchInput.value.trim());

        window.location.href = `/api/entries/export?${params.toString()}`;
    });

    // Pagination
    document.getElementById('prevPageBtn')?.addEventListener('click', () => {
        if (state.entriesPage > 0) {
            state.entriesPage--;
            loadAttendanceLogs();
        }
    });

    document.getElementById('nextPageBtn')?.addEventListener('click', () => {
        if ((state.entriesPage + 1) * state.entriesLimit < state.totalEntries) {
            state.entriesPage++;
            loadAttendanceLogs();
        }
    });
}

async function loadAttendanceLogs() {
    const tbody = document.getElementById('attendanceTableBody');
    const search = document.getElementById('logSearchInput').value.trim();
    const dept = document.getElementById('logDeptFilter').value;
    const date = document.getElementById('logDateFilter').value;

    const params = new URLSearchParams({
        limit: state.entriesLimit,
        offset: state.entriesPage * state.entriesLimit
    });
    if (date) params.append('date', date);
    if (dept && dept !== 'ALL') params.append('department', dept);
    if (search) params.append('search', search);

    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center py-8 text-slate-400">
                <i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading gate logs...
            </td>
        </tr>
    `;

    try {
        const res = await fetch(`/api/entries?${params.toString()}`);
        const data = await res.json();

        state.totalEntries = data.total;
        document.getElementById('logBadge').textContent = data.total;

        // Update pagination controls
        const start = data.total === 0 ? 0 : state.entriesPage * state.entriesLimit + 1;
        const end = Math.min((state.entriesPage + 1) * state.entriesLimit, data.total);
        document.getElementById('paginationInfo').textContent = `Showing ${start} to ${end} of ${data.total} records`;

        document.getElementById('prevPageBtn').disabled = (state.entriesPage === 0);
        document.getElementById('nextPageBtn').disabled = (end >= data.total);

        if (!data.entries || data.entries.length === 0) {
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

        tbody.innerHTML = data.entries.map(e => `
            <tr class="hover:bg-slate-800/60 transition">
                <td class="py-3 px-4">
                    <div class="flex items-center space-x-3">
                        <div class="w-8 h-8 rounded-lg overflow-hidden bg-slate-900 border border-slate-700 flex-shrink-0">
                            ${e.student_photo 
                                ? `<img src="/data/student_photos/${e.student_photo}" class="w-full h-full object-cover">`
                                : `<div class="w-full h-full flex items-center justify-center font-bold text-slate-500">${e.name.charAt(0)}</div>`}
                        </div>
                        <span class="font-semibold text-slate-200">${e.name}</span>
                    </div>
                </td>
                <td class="py-3 px-4 font-mono text-slate-300">${e.roll_number || 'N/A'}</td>
                <td class="py-3 px-4 text-slate-300">${e.department}</td>
                <td class="py-3 px-4 text-slate-400 font-mono">${e.date}</td>
                <td class="py-3 px-4 text-slate-200 font-mono">${e.time}</td>
                <td class="py-3 px-4 text-indigo-300 font-medium">${e.gate_name}</td>
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
                    ${e.confidence ? `${Math.round(e.confidence * 100)}%` : '100%'}
                </td>
            </tr>
        `).join('');

    } catch (e) {
        console.error("Failed to load attendance logs:", e);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-red-400">
                    Error loading records from server.
                </td>
            </tr>
        `;
    }
}


// ================= TAB 3: STUDENT DIRECTORY =================
function initStudentDirectory() {
    document.getElementById('seedDemoBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('seedDemoBtn');
        const origText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Seeding...`;
        btn.disabled = true;

        try {
            const res = await fetch('/api/seed-demo', { method: 'POST' });
            const data = await res.json();
            alert(data.message || 'Demo students seeded successfully!');
            await loadStudents();
            await loadTodayStats();
            await loadAttendanceLogs();
        } catch (e) {
            alert('Failed to seed demo data.');
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    });
}

async function loadStudents() {
    try {
        const res = await fetch('/api/students');
        const students = await res.json();
        state.students = students;

        document.getElementById('studentBadge').textContent = students.length;
        renderStudentsGrid(students);
        updateManualStudentSelect(students);
    } catch (e) {
        console.error("Failed to load students:", e);
    }
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
                <div class="w-14 h-14 rounded-xl bg-slate-900 overflow-hidden border border-slate-700 flex-shrink-0">
                    ${s.photo_path 
                        ? `<img src="/data/student_photos/${s.photo_path}" class="w-full h-full object-cover">`
                        : `<div class="w-full h-full flex items-center justify-center font-bold text-lg text-indigo-400 bg-indigo-500/10">${s.name.charAt(0)}</div>`}
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
                <button onclick="deleteStudentById(${s.id}, '${s.name.replace(/'/g, "\\'")}')" class="text-slate-400 hover:text-red-400 transition" title="Delete Student">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function deleteStudentById(id, name) {
    if (!confirm(`Are you sure you want to delete student "${name}"?`)) return;
    try {
        const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            loadStudents();
        } else {
            alert(data.error || 'Failed to delete student');
        }
    } catch (e) {
        alert('Error communicating with server');
    }
}


// ================= STUDENT REGISTRATION MODAL =================
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
    const statusMsg = document.getElementById('regFaceStatus');

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
        statusMsg.classList.add('hidden');
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

    // Start webcam for enrollment
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

    // Snap photo from enrollment webcam
    snapBtn.addEventListener('click', () => {
        if (!regStream) return;
        const canvas = document.createElement('canvas');
        canvas.width = regVideo.videoWidth || 640;
        canvas.height = regVideo.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(regVideo, 0, 0, canvas.width, canvas.height);
        capturedB64 = canvas.toDataURL('image/jpeg', 0.9);

        // Show preview
        previewImg.src = capturedB64;
        previewImg.classList.remove('hidden');
        regVideo.classList.add('hidden');
        snapBtn.classList.add('hidden');
        stopRegCam();
    });

    // Upload file
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

    // Submit Registration
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!capturedB64) {
            alert('Please take or upload a photo of the student.');
            return;
        }

        const submitBtn = document.getElementById('saveStudentBtn');
        const origText = submitBtn.innerHTML;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Registering...`;
        submitBtn.disabled = true;

        const payload = {
            name: document.getElementById('regName').value.trim(),
            roll_number: document.getElementById('regRoll').value.trim().toUpperCase(),
            department: document.getElementById('regDept').value,
            year: document.getElementById('regYear').value,
            image: capturedB64
        };

        try {
            const res = await fetch('/api/students', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                alert(`Student "${payload.name}" enrolled successfully!`);
                closeModal();
                loadStudents();
            } else {
                alert(data.error || 'Failed to register student.');
            }
        } catch (err) {
            alert('Server communication error: ' + err.message);
        } finally {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
        }
    });
}


// ================= MANUAL ENTRY OVERRIDE MODAL =================
function initManualEntryModal() {
    const modal = document.getElementById('manualEntryModal');
    const openBtn = document.getElementById('openManualEntryBtn');
    const closeBtn = document.getElementById('closeManualModalBtn');
    const cancelBtn = document.getElementById('cancelManualBtn');
    const form = document.getElementById('manualEntryForm');
    const select = document.getElementById('manualStudentSelect');

    openBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

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

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const gate = document.getElementById('gateSelector').value;
        const payload = {
            student_id: select.value ? parseInt(select.value) : null,
            name: document.getElementById('manualName').value.trim(),
            roll_number: document.getElementById('manualRoll').value.trim().toUpperCase(),
            department: document.getElementById('manualDept').value,
            gate_name: gate
        };

        try {
            const res = await fetch('/api/entries/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok) {
                soundEngine.playSuccess();
                modal.classList.add('hidden');
                form.reset();
                loadTodayStats();
                loadAttendanceLogs();
            } else {
                alert(data.error || 'Failed to record manual entry');
            }
        } catch (err) {
            alert('Error logging manual entry: ' + err.message);
        }
    });
}

function updateManualStudentSelect(students) {
    const select = document.getElementById('manualStudentSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Or enter details manually below --</option>' +
        students.map(s => `<option value="${s.id}">${s.name} (${s.roll_number}) - ${s.department}</option>`).join('');
}


// ================= TAB 4: ANALYTICS =================
function initAnalytics() {
    // Initialized when tab is clicked
}

async function renderAnalyticsCharts() {
    try {
        const res = await fetch('/api/stats/today');
        const data = await res.json();
        const depts = data.department_counts || {};

        const deptLabels = Object.keys(depts);
        const deptCounts = Object.values(depts);

        // Department Donut Chart
        const deptCtx = document.getElementById('deptChart');
        if (deptCtx) {
            if (state.deptChart) state.deptChart.destroy();
            state.deptChart = new Chart(deptCtx, {
                type: 'doughnut',
                data: {
                    labels: deptLabels.length > 0 ? deptLabels : ['No Data'],
                    datasets: [{
                        data: deptCounts.length > 0 ? deptCounts : [1],
                        backgroundColor: [
                            '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#94a3b8', font: { size: 11 } }
                        }
                    }
                }
            });
        }

        // Hourly Bar Chart
        const hourlyCtx = document.getElementById('hourlyChart');
        if (hourlyCtx) {
            if (state.hourlyChart) state.hourlyChart.destroy();

            // Simulate or compute hourly breakdown from today's entries
            const hours = ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM'];
            const counts = [2, 8, 14, 5, 3, 4, 7, 2, 1]; // Sample spread

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
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }
    } catch (e) {
        console.error("Failed to render analytics:", e);
    }
}


// Utility: Debounce helper
function debounce(fn, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), wait);
    };
}
