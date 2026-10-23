/**
 * CampusGate AI - Standalone Parent Visitor Gate Pass Controller
 * Supports both Live API mode and Client-Side Offline / Static Hosting (localStorage) Mode.
 */

// Default Demo Students for Static Mode
const STATIC_STUDENTS = [
    { id: 1, roll_number: "CS2026-012", name: "Aarav Sharma", department: "Computer Science & Engineering", year: "3rd Year" },
    { id: 2, roll_number: "EC2026-045", name: "Priya Patel", department: "Electronics & Communication", year: "2nd Year" },
    { id: 3, roll_number: "ME2026-028", name: "Rohan Verma", department: "Mechanical Engineering", year: "4th Year" },
    { id: 4, roll_number: "IT2026-089", name: "Ananya Iyer", department: "Information Technology", year: "1st Year" },
    { id: 5, roll_number: "CV2026-033", name: "Vikram Singh", department: "Civil Engineering", year: "2nd Year" }
];

const passState = {
    isAuthenticated: true,
    staffUser: "Gate Officer",
    selectedStudent: null,
    currentPass: null,
    webcamStream: null,
    capturedPhotoB64: null,
    activeTab: 'create'
};

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initClock();
    initStudentSearch();
    initWebcam();
    initForm();
    initRecordsList();
    initTabSwitching();
    initPrototypeButtons();
});

// Clock
function initClock() {
    function update() {
        const now = new Date();
        const timeEl = document.getElementById('headerClock');
        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    }
    update();
    setInterval(update, 1000);

    const inTimeInput = document.getElementById('inTime');
    if (inTimeInput && !inTimeInput.value) {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        inTimeInput.value = `${hours}:${minutes}`;
    }

    const dateInput = document.getElementById('visitDate');
    if (dateInput && !dateInput.value) {
        const now = new Date();
        dateInput.value = now.toISOString().split('T')[0];
    }
}

// Auth
function initAuth() {
    const userBadge = document.getElementById('staffUserBadge');
    if (userBadge) userBadge.textContent = "Security Officer";

    const logoutBtn = document.getElementById('staffLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            const authModal = document.getElementById('authModal');
            if (authModal) authModal.classList.remove('hidden');
        });
    }

    const form = document.getElementById('staffLoginForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const authModal = document.getElementById('authModal');
            if (authModal) authModal.classList.add('hidden');
        });
    }
}

// Student Search
function initStudentSearch() {
    const searchInput = document.getElementById('studentSearchInput');
    const dropdown = document.getElementById('studentSearchDropdown');
    const selectedCard = document.getElementById('selectedStudentCard');
    const clearBtn = document.getElementById('clearSelectedStudentBtn');

    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        if (q.length < 1) {
            dropdown.classList.add('hidden');
            return;
        }

        const matches = STATIC_STUDENTS.filter(s =>
            s.name.toLowerCase().includes(q) || s.roll_number.toLowerCase().includes(q)
        );
        renderStudentSearchResults(matches);
    });

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim().length > 0) dropdown.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            passState.selectedStudent = null;
            document.getElementById('selectedStudentId').value = '';
            selectedCard.classList.add('hidden');
            searchInput.classList.remove('hidden');
            searchInput.value = '';
            searchInput.focus();
        });
    }
}

function renderStudentSearchResults(students) {
    const dropdown = document.getElementById('studentSearchDropdown');
    const container = document.getElementById('studentSearchResults');
    container.innerHTML = '';

    if (students.length === 0) {
        container.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">No matching students found</div>`;
        dropdown.classList.remove('hidden');
        return;
    }

    students.forEach(s => {
        const item = document.createElement('div');
        item.className = 'p-2.5 hover:bg-slate-700/60 cursor-pointer flex items-center justify-between border-b border-slate-700/40 last:border-0 transition';
        item.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center font-bold text-xs">
                    ${s.roll_number.slice(0, 2)}
                </div>
                <div>
                    <h4 class="text-xs font-bold text-white">${s.name}</h4>
                    <p class="text-[11px] text-slate-400">${s.department} • <span class="text-indigo-400 font-mono">${s.roll_number}</span></p>
                </div>
            </div>
            <span class="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-semibold">Select</span>
        `;
        item.addEventListener('click', () => selectStudent(s));
        container.appendChild(item);
    });

    dropdown.classList.remove('hidden');
}

function selectStudent(student) {
    passState.selectedStudent = student;
    document.getElementById('selectedStudentId').value = student.id;

    document.getElementById('cardStudentName').textContent = student.name;
    document.getElementById('cardStudentRoll').textContent = student.roll_number;
    document.getElementById('cardStudentDept').textContent = `${student.department} (${student.year})`;

    document.getElementById('studentSearchDropdown').classList.add('hidden');
    document.getElementById('studentSearchInput').classList.add('hidden');
    document.getElementById('selectedStudentCard').classList.remove('hidden');
    document.getElementById('studentSelectError').classList.add('hidden');
}

// Webcam
function initWebcam() {
    const startCamBtn = document.getElementById('startCamBtn');
    const captureBtn = document.getElementById('capturePhotoBtn');
    const retakeBtn = document.getElementById('retakePhotoBtn');
    const fileInput = document.getElementById('photoFileInput');
    const video = document.getElementById('camVideo');
    const camContainer = document.getElementById('camContainer');
    const previewContainer = document.getElementById('photoPreviewContainer');
    const previewImg = document.getElementById('photoPreviewImg');

    if (startCamBtn) {
        startCamBtn.addEventListener('click', async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } });
                passState.webcamStream = stream;
                video.srcObject = stream;
                camContainer.classList.remove('hidden');
                startCamBtn.classList.add('hidden');
            } catch (err) {
                alert("Camera error: " + err.message);
            }
        });
    }

    if (captureBtn) {
        captureBtn.addEventListener('click', () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 480;
            canvas.height = video.videoHeight || 360;
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

            passState.capturedPhotoB64 = dataUrl;
            previewImg.src = dataUrl;
            previewContainer.classList.remove('hidden');
            if (passState.webcamStream) passState.webcamStream.getTracks().forEach(t => t.stop());
            camContainer.classList.add('hidden');
        });
    }

    if (retakeBtn) {
        retakeBtn.addEventListener('click', () => {
            passState.capturedPhotoB64 = null;
            previewContainer.classList.add('hidden');
            if (startCamBtn) startCamBtn.classList.remove('hidden');
            if (fileInput) fileInput.value = '';
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (re) => {
                    passState.capturedPhotoB64 = re.target.result;
                    previewImg.src = re.target.result;
                    previewContainer.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

// Form & Pass Generation
function initForm() {
    const form = document.getElementById('parentPassForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const parentName = document.getElementById('parentName').value.trim();
        const phoneNumber = document.getElementById('phoneNumber').value.trim();
        const relation = document.getElementById('relation').value;
        const studentId = document.getElementById('selectedStudentId').value;
        const purpose = document.getElementById('purpose').value.trim();
        const visitDate = document.getElementById('visitDate').value;
        const inTime = document.getElementById('inTime').value.trim();
        const vehicleNumber = document.getElementById('vehicleNumber').value.trim();
        const idProofType = document.getElementById('idProofType').value;
        const idProofNumber = document.getElementById('idProofNumber').value.trim();

        // 10-digit validation
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        if (cleanPhone.length !== 10) {
            alert("Phone number must be exactly 10 digits.");
            return;
        }

        if (!studentId || !passState.selectedStudent) {
            alert("Please search and select a student.");
            return;
        }

        const passNum = `PGP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

        const newPass = {
            id: Date.now(),
            pass_number: passNum,
            parent_name: parentName,
            phone_number: cleanPhone,
            relation: relation,
            student_id: passState.selectedStudent.id,
            student_name: passState.selectedStudent.name,
            student_roll: passState.selectedStudent.roll_number,
            student_dept: passState.selectedStudent.department,
            purpose: purpose,
            visit_date: visitDate,
            in_time: inTime,
            out_time: null,
            vehicle_number: vehicleNumber || 'None (Pedestrian)',
            id_proof_type: idProofType,
            id_proof_number: idProofNumber,
            photo_path: passState.capturedPhotoB64 || null,
            status: 'Active'
        };

        // Save to localStorage
        const stored = JSON.parse(localStorage.getItem('campusgate_parent_passes') || '[]');
        stored.unshift(newPass);
        localStorage.setItem('campusgate_parent_passes', JSON.stringify(stored));

        showGeneratedPassModal(newPass);
        form.reset();
        passState.selectedStudent = null;
        document.getElementById('selectedStudentId').value = '';
        document.getElementById('selectedStudentCard').classList.add('hidden');
        document.getElementById('studentSearchInput').classList.remove('hidden');
        document.getElementById('photoPreviewContainer').classList.add('hidden');
        loadRecords();
    });
}

// Modal & Print
function showGeneratedPassModal(pass) {
    passState.currentPass = pass;

    document.getElementById('passNumberText').textContent = pass.pass_number;
    document.getElementById('passStatusBadge').textContent = pass.status;
    document.getElementById('passStatusBadge').className = pass.status === 'Active'
        ? 'px-2 py-0.5 rounded text-xs font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300'
        : 'px-2 py-0.5 rounded text-xs font-bold uppercase bg-gray-100 text-gray-800 border border-gray-300';

    document.getElementById('passParentName').textContent = pass.parent_name;
    document.getElementById('passParentPhone').textContent = pass.phone_number;
    document.getElementById('passRelation').textContent = pass.relation;
    document.getElementById('passStudentName').textContent = pass.student_name;
    document.getElementById('passStudentRoll').textContent = pass.student_roll;
    document.getElementById('passStudentDept').textContent = pass.student_dept;
    document.getElementById('passPurpose').textContent = pass.purpose;
    document.getElementById('passVisitDate').textContent = pass.visit_date;
    document.getElementById('passInTime').textContent = pass.in_time;
    document.getElementById('passOutTime').textContent = pass.out_time || 'Pending Departure';
    document.getElementById('passVehicle').textContent = pass.vehicle_number;
    document.getElementById('passIdProof').textContent = `${pass.id_proof_type}: ${pass.id_proof_number}`;

    const qrContainer = document.getElementById('passQrCode');
    qrContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
            text: `CAMPUSGATE-PASS:${pass.pass_number}|PARENT:${pass.parent_name}|ROLL:${pass.student_roll}|STATUS:${pass.status}`,
            width: 86,
            height: 86
        });
    }

    const exitBtn = document.getElementById('modalMarkExitBtn');
    if (exitBtn) {
        if (pass.status === 'Active') {
            exitBtn.classList.remove('hidden');
            exitBtn.onclick = () => markPassExit(pass.id);
        } else {
            exitBtn.classList.add('hidden');
        }
    }

    document.getElementById('passModal').classList.remove('hidden');
}

// Print & Close
document.getElementById('modalPrintBtn')?.addEventListener('click', () => window.print());
document.getElementById('modalCloseBtn')?.addEventListener('click', () => {
    document.getElementById('passModal').classList.add('hidden');
});

// Records List
function initRecordsList() {
    loadRecords();
    document.getElementById('recordsSearchInput')?.addEventListener('input', loadRecords);
    document.getElementById('recordsDateFilter')?.addEventListener('change', loadRecords);
    document.getElementById('recordsStatusFilter')?.addEventListener('change', loadRecords);
    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
        document.getElementById('recordsSearchInput').value = '';
        document.getElementById('recordsDateFilter').value = '';
        document.getElementById('recordsStatusFilter').value = 'All';
        loadRecords();
    });
}

function loadRecords() {
    const tableBody = document.getElementById('recordsTableBody');
    const mobileCards = document.getElementById('recordsMobileCards');
    const emptyState = document.getElementById('recordsEmptyState');
    const totalBadge = document.getElementById('totalRecordsBadge');

    if (!tableBody) return;

    let passes = JSON.parse(localStorage.getItem('campusgate_parent_passes') || '[]');
    if (passes.length === 0) {
        // Seed initial sample
        passes = [
            {
                id: 101,
                pass_number: "PGP-20261023-8821",
                parent_name: "Rajesh Sharma",
                phone_number: "9876543210",
                relation: "Father",
                student_name: "Aarav Sharma",
                student_roll: "CS2026-012",
                student_dept: "Computer Science & Engineering",
                purpose: "Meeting Faculty / HOD",
                visit_date: "2026-10-23",
                in_time: "10:30 AM",
                out_time: "11:00 AM",
                vehicle_number: "KA-01-AB-1234",
                id_proof_type: "Aadhaar Card",
                id_proof_number: "XXXX-XXXX-1234",
                status: "Exited"
            }
        ];
        localStorage.setItem('campusgate_parent_passes', JSON.stringify(passes));
    }

    const q = document.getElementById('recordsSearchInput')?.value.trim().toLowerCase() || '';
    const date = document.getElementById('recordsDateFilter')?.value || '';
    const status = document.getElementById('recordsStatusFilter')?.value || 'All';

    const filtered = passes.filter(p => {
        const matchesQ = !q || p.parent_name.toLowerCase().includes(q) || p.student_roll.toLowerCase().includes(q) || p.pass_number.toLowerCase().includes(q);
        const matchesDate = !date || p.visit_date === date;
        const matchesStatus = status === 'All' || p.status === status;
        return matchesQ && matchesDate && matchesStatus;
    });

    if (totalBadge) totalBadge.textContent = filtered.length;
    tableBody.innerHTML = '';
    if (mobileCards) mobileCards.innerHTML = '';

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    filtered.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-700/30 border-b border-slate-700/50 transition';
        const isActive = p.status === 'Active';
        tr.innerHTML = `
            <td class="px-4 py-3 font-mono text-xs font-bold text-indigo-300">${p.pass_number}</td>
            <td class="px-4 py-3 text-xs text-slate-200">
                <div class="font-bold text-white">${p.parent_name}</div>
                <div class="text-[11px] text-slate-400">${p.relation} • ${p.phone_number}</div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-200">
                <div class="font-semibold text-slate-100">${p.student_name}</div>
                <div class="text-[11px] text-indigo-400 font-mono">${p.student_roll}</div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-300 max-w-[140px] truncate">${p.purpose}</td>
            <td class="px-4 py-3 text-xs text-slate-300">
                <div>${p.visit_date}</div>
                <div class="text-[11px] text-slate-400 font-mono">In: ${p.in_time}${p.out_time ? ` | Out: ${p.out_time}` : ''}</div>
            </td>
            <td class="px-4 py-3 text-xs">
                ${isActive ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>' : '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/60 text-slate-400">Exited</span>'}
            </td>
            <td class="px-4 py-3 text-xs text-right space-x-1.5">
                <button class="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200" onclick="viewPassDetail(${p.id})">Pass</button>
                ${isActive ? `<button class="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30" onclick="markPassExit(${p.id})">Exit</button>` : ''}
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function viewPassDetail(id) {
    const passes = JSON.parse(localStorage.getItem('campusgate_parent_passes') || '[]');
    const found = passes.find(p => p.id === id);
    if (found) showGeneratedPassModal(found);
}

function markPassExit(id) {
    const passes = JSON.parse(localStorage.getItem('campusgate_parent_passes') || '[]');
    const idx = passes.findIndex(p => p.id === id);
    if (idx !== -1) {
        const now = new Date();
        passes[idx].status = 'Exited';
        passes[idx].out_time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        localStorage.setItem('campusgate_parent_passes', JSON.stringify(passes));
        alert("Marked Exited at " + passes[idx].out_time);
        loadRecords();
        if (passState.currentPass && passState.currentPass.id === id) {
            showGeneratedPassModal(passes[idx]);
        }
    }
}

// Tab Switching
function initTabSwitching() {
    const btnCreate = document.getElementById('viewTabCreate');
    const btnRecords = document.getElementById('viewTabRecords');
    const cCreate = document.getElementById('passFormContainer');
    const cRecords = document.getElementById('recordsListContainer');

    btnCreate?.addEventListener('click', () => {
        btnCreate.className = 'nav-tab active-tab';
        btnRecords.className = 'nav-tab text-slate-300';
        cCreate.classList.remove('hidden');
        cRecords.classList.add('hidden');
    });

    btnRecords?.addEventListener('click', () => {
        btnRecords.className = 'nav-tab active-tab';
        btnCreate.className = 'nav-tab text-slate-300';
        cCreate.classList.add('hidden');
        cRecords.classList.remove('hidden');
        loadRecords();
    });
}

// Prototype Showcase Quick-Fill & Demo Student Chips
function initPrototypeButtons() {
    const autoFillBtn = document.getElementById('autoFillDemoPassBtn');
    if (autoFillBtn) {
        autoFillBtn.addEventListener('click', () => {
            document.getElementById('parentName').value = "Rajesh Sharma";
            document.getElementById('phoneNumber').value = "9876543210";
            document.getElementById('relation').value = "Father";
            document.getElementById('purpose').value = "Meeting Faculty / HOD";
            document.getElementById('idProofType').value = "Aadhaar Card";
            document.getElementById('idProofNumber').value = "9876-5432-1098";
            document.getElementById('vehicleNumber').value = "KA-01-AB-1234";

            // Select prototype student Aarav Sharma
            selectStudent(STATIC_STUDENTS[0]);

            const now = new Date();
            const dateInput = document.getElementById('visitDate');
            if (dateInput) dateInput.value = now.toISOString().split('T')[0];
            const inTimeInput = document.getElementById('inTime');
            if (inTimeInput) inTimeInput.value = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            document.querySelectorAll('.form-error-msg').forEach(el => el.classList.add('hidden'));

            const submitBtn = document.getElementById('submitPassBtn');
            if (submitBtn) {
                submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    document.querySelectorAll('.demo-student-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const id = parseInt(chip.getAttribute('data-id'), 10);
            const found = STATIC_STUDENTS.find(s => s.id === id) || {
                id: id,
                name: chip.getAttribute('data-name'),
                roll_number: chip.getAttribute('data-roll'),
                department: chip.getAttribute('data-dept'),
                year: '2nd Year'
            };
            selectStudent(found);
        });
    });
}
