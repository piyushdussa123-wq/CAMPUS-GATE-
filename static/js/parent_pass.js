/**
 * CampusGate AI - Parent Visitor Gate Pass Controller
 * Handles student autocomplete, validations, pass generation, QR code rendering,
 * A5 printing, exit tracking, and staff login management.
 */

// Global State
const passState = {
    isAuthenticated: false,
    staffUser: null,
    selectedStudent: null,
    currentPass: null,
    webcamStream: null,
    capturedPhotoB64: null,
    activeTab: 'create' // 'create' or 'records'
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

// ============================================================================
// 1. CLOCK & INITIAL TIMESTAMPS
// ============================================================================
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

    // Set default in-time input if empty
    const inTimeInput = document.getElementById('inTime');
    if (inTimeInput && !inTimeInput.value) {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        inTimeInput.value = `${hours}:${minutes}`;
    }
}

// ============================================================================
// 2. AUTHENTICATION & LOGIN CHECKS
// ============================================================================
async function initAuth() {
    try {
        const res = await fetch('/api/parent-pass/auth/status');
        const data = await res.json();
        if (data.logged_in) {
            setLoggedIn(data.username || 'Staff');
        } else {
            setLoggedOut();
        }
    } catch (err) {
        console.error("Auth status error:", err);
    }

    const loginForm = document.getElementById('staffLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value.trim();
            const errBox = document.getElementById('loginErrorBox');
            errBox.classList.add('hidden');

            try {
                const res = await fetch('/api/parent-pass/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (data.success) {
                    setLoggedIn(data.username);
                    closeAuthModal();
                    loadRecords();
                } else {
                    errBox.textContent = data.error || 'Login failed';
                    errBox.classList.remove('hidden');
                }
            } catch (err) {
                errBox.textContent = 'Server error during authentication.';
                errBox.classList.remove('hidden');
            }
        });
    }

    const logoutBtn = document.getElementById('staffLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await fetch('/api/parent-pass/auth/logout', { method: 'POST' });
            setLoggedOut();
        });
    }
}

function setLoggedIn(username) {
    passState.isAuthenticated = true;
    passState.staffUser = username;

    const userBadge = document.getElementById('staffUserBadge');
    const authStatus = document.getElementById('authStatusContainer');
    const authModal = document.getElementById('authModal');

    if (userBadge) userBadge.textContent = username;
    if (authStatus) authStatus.classList.remove('hidden');
    if (authModal) authModal.classList.add('hidden');
}

function setLoggedOut() {
    passState.isAuthenticated = false;
    passState.staffUser = null;

    const authStatus = document.getElementById('authStatusContainer');
    const authModal = document.getElementById('authModal');

    if (authStatus) authStatus.classList.add('hidden');
    if (authModal) authModal.classList.remove('hidden');
}

function closeAuthModal() {
    const authModal = document.getElementById('authModal');
    if (authModal) authModal.classList.add('hidden');
}

// ============================================================================
// 3. STUDENT AUTOCOMPLETE / SEARCH (STRICTLY READ-ONLY)
// ============================================================================
function initStudentSearch() {
    const searchInput = document.getElementById('studentSearchInput');
    const dropdown = document.getElementById('studentSearchDropdown');
    const resultsContainer = document.getElementById('studentSearchResults');
    const selectedCard = document.getElementById('selectedStudentCard');
    const clearBtn = document.getElementById('clearSelectedStudentBtn');

    let debounceTimer = null;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = searchInput.value.trim();
        if (query.length < 1) {
            dropdown.classList.add('hidden');
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/parent-pass/students/search?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                renderStudentSearchResults(data.students || []);
            } catch (err) {
                console.error("Student search error:", err);
            }
        }, 200);
    });

    searchInput.addEventListener('focus', async () => {
        if (searchInput.value.trim().length > 0) {
            dropdown.classList.remove('hidden');
        } else {
            // Show prototype / default demo students on focus
            try {
                const res = await fetch('/api/parent-pass/students/search');
                const data = await res.json();
                renderStudentSearchResults(data.students || []);
            } catch (err) {
                console.warn(err);
            }
        }
    });

    // Close dropdown on outside click
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
        container.innerHTML = `
            <div class="p-3 text-xs text-slate-400 text-center">
                <i class="fa-solid fa-user-slash mr-1"></i> No matching students found
            </div>
        `;
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
                    <h4 class="text-xs font-bold text-white">${escapeHtml(s.name)}</h4>
                    <p class="text-[11px] text-slate-400">${escapeHtml(s.department)} • <span class="text-indigo-400 font-mono">${escapeHtml(s.roll_number)}</span></p>
                </div>
            </div>
            <span class="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-semibold">Select</span>
        `;

        item.addEventListener('click', () => {
            selectStudent(s);
        });

        container.appendChild(item);
    });

    dropdown.classList.remove('hidden');
}

function selectStudent(student) {
    passState.selectedStudent = student;
    document.getElementById('selectedStudentId').value = student.id;

    // Update read-only card
    document.getElementById('cardStudentName').textContent = student.name;
    document.getElementById('cardStudentRoll').textContent = student.roll_number;
    document.getElementById('cardStudentDept').textContent = `${student.department} (${student.year || '1st Year'})`;

    const avatar = document.getElementById('cardStudentAvatar');
    if (student.photo_path) {
        avatar.innerHTML = `<img src="${student.photo_path}" class="w-full h-full object-cover rounded-lg">`;
    } else {
        avatar.innerHTML = `<i class="fa-solid fa-user-graduate text-indigo-400 text-sm"></i>`;
    }

    document.getElementById('studentSearchDropdown').classList.add('hidden');
    document.getElementById('studentSearchInput').classList.add('hidden');
    document.getElementById('selectedStudentCard').classList.remove('hidden');

    // Hide any student error
    document.getElementById('studentSelectError').classList.add('hidden');
}

// ============================================================================
// 4. WEBCAM & PHOTO CAPTURE
// ============================================================================
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
                alert("Camera access denied or unavailable: " + err.message);
            }
        });
    }

    if (captureBtn) {
        captureBtn.addEventListener('click', () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 480;
            canvas.height = video.videoHeight || 360;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

            passState.capturedPhotoB64 = dataUrl;
            previewImg.src = dataUrl;
            previewContainer.classList.remove('hidden');
            stopWebcam();
            camContainer.classList.add('hidden');
        });
    }

    if (retakeBtn) {
        retakeBtn.addEventListener('click', () => {
            passState.capturedPhotoB64 = null;
            previewContainer.classList.add('hidden');
            startCamBtn.classList.remove('hidden');
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
                    stopWebcam();
                    camContainer.classList.add('hidden');
                    if (startCamBtn) startCamBtn.classList.add('hidden');
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

function stopWebcam() {
    if (passState.webcamStream) {
        passState.webcamStream.getTracks().forEach(t => t.stop());
        passState.webcamStream = null;
    }
}

// ============================================================================
// 5. FORM SUBMISSION & VALIDATION
// ============================================================================
function initForm() {
    const form = document.getElementById('parentPassForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Check authentication first
        if (!passState.isAuthenticated) {
            setLoggedOut();
            return;
        }

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

        // Field errors display
        let hasError = false;

        // Reset errors
        document.querySelectorAll('.form-error-msg').forEach(el => el.classList.add('hidden'));

        if (!parentName) {
            showError('parentNameError', 'Parent/Visitor name is required.');
            hasError = true;
        }

        // Validate 10-digit phone
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        if (cleanPhone.length !== 10) {
            showError('phoneError', 'Must be a valid 10-digit phone number (numbers only).');
            hasError = true;
        }

        if (!relation) {
            showError('relationError', 'Please select relation to student.');
            hasError = true;
        }

        if (!studentId) {
            showError('studentSelectError', 'Please search and select a registered student.');
            hasError = true;
        }

        if (!purpose) {
            showError('purposeError', 'Please select or specify purpose of visit.');
            hasError = true;
        }

        if (!idProofType) {
            showError('idTypeError', 'Please choose ID proof type.');
            hasError = true;
        }

        if (!idProofNumber) {
            showError('idNumberError', 'ID proof number is required.');
            hasError = true;
        }

        if (hasError) return;

        const payload = {
            parent_name: parentName,
            phone_number: cleanPhone,
            relation: relation,
            student_id: parseInt(studentId, 10),
            purpose: purpose,
            visit_date: visitDate,
            in_time: inTime,
            vehicle_number: vehicleNumber || null,
            id_proof_type: idProofType,
            id_proof_number: idProofNumber,
            photo_base64: passState.capturedPhotoB64 || null
        };

        const submitBtn = document.getElementById('submitPassBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i>Generating Pass...`;

        try {
            const res = await fetch('/api/parent-pass/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success && data.pass) {
                // Reset form
                form.reset();
                passState.selectedStudent = null;
                passState.capturedPhotoB64 = null;
                document.getElementById('selectedStudentId').value = '';
                document.getElementById('selectedStudentCard').classList.add('hidden');
                document.getElementById('studentSearchInput').classList.remove('hidden');
                document.getElementById('photoPreviewContainer').classList.add('hidden');
                const startCamBtn = document.getElementById('startCamBtn');
                if (startCamBtn) startCamBtn.classList.remove('hidden');

                // Render pass modal & show
                showGeneratedPassModal(data.pass);

                // Reload records list
                loadRecords();
            } else {
                alert("Error: " + (data.error || "Failed to create pass."));
            }
        } catch (err) {
            alert("Network error creating gate pass: " + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-ticket mr-2"></i>Generate Parent Gate Pass`;
        }
    });
}

function showError(elId, msg) {
    const el = document.getElementById(elId);
    if (el) {
        el.textContent = msg;
        el.classList.remove('hidden');
    }
}

// ============================================================================
// 6. GENERATED PASS MODAL, QR CODE & A5 PRINTING
// ============================================================================
function showGeneratedPassModal(pass) {
    passState.currentPass = pass;

    // Fill pass fields
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
    document.getElementById('passStudentDept').textContent = pass.student_dept || 'Engineering';
    document.getElementById('passPurpose').textContent = pass.purpose;
    document.getElementById('passVisitDate').textContent = pass.visit_date;
    document.getElementById('passInTime').textContent = pass.in_time;
    document.getElementById('passOutTime').textContent = pass.out_time || 'Pending Departure';
    document.getElementById('passVehicle').textContent = pass.vehicle_number || 'None (Pedestrian)';
    document.getElementById('passIdProof').textContent = `${pass.id_proof_type}: ${pass.id_proof_number}`;

    // Photo preview
    const photoContainer = document.getElementById('passVisitorPhotoBox');
    if (pass.photo_path) {
        photoContainer.innerHTML = `<img src="${pass.photo_path}" class="w-20 h-24 object-cover border border-black rounded">`;
        photoContainer.classList.remove('hidden');
    } else {
        photoContainer.innerHTML = '';
        photoContainer.classList.add('hidden');
    }

    // Generate QR Code
    const qrContainer = document.getElementById('passQrCode');
    qrContainer.innerHTML = '';
    const qrPayload = `CAMPUSGATE-PASS:${pass.pass_number}|PARENT:${pass.parent_name}|ROLL:${pass.student_roll}|DATE:${pass.visit_date}|IN:${pass.in_time}|STATUS:${pass.status}`;
    
    if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
            text: qrPayload,
            width: 86,
            height: 86,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    // Modal Exit Button
    const exitBtn = document.getElementById('modalMarkExitBtn');
    if (exitBtn) {
        if (pass.status === 'Active') {
            exitBtn.classList.remove('hidden');
            exitBtn.onclick = () => markPassExit(pass.id);
        } else {
            exitBtn.classList.add('hidden');
        }
    }

    const modal = document.getElementById('passModal');
    modal.classList.remove('hidden');
}

function initPrintButton() {
    const printBtn = document.getElementById('modalPrintBtn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }

    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('passModal').classList.add('hidden');
        });
    }
}

// Call print button setup
initPrintButton();

// ============================================================================
// 7. VISITOR PASS RECORDS LIST & FILTERING
// ============================================================================
function initRecordsList() {
    const searchInput = document.getElementById('recordsSearchInput');
    const dateInput = document.getElementById('recordsDateFilter');
    const statusSelect = document.getElementById('recordsStatusFilter');
    const resetBtn = document.getElementById('resetFiltersBtn');

    let debounceTimer = null;

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(loadRecords, 250);
        });
    }

    if (dateInput) {
        dateInput.addEventListener('change', loadRecords);
    }

    if (statusSelect) {
        statusSelect.addEventListener('change', loadRecords);
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            searchInput.value = '';
            dateInput.value = '';
            statusSelect.value = 'All';
            loadRecords();
        });
    }

    // Initial load
    loadRecords();
}

async function loadRecords() {
    const tableBody = document.getElementById('recordsTableBody');
    const mobileCards = document.getElementById('recordsMobileCards');
    const emptyState = document.getElementById('recordsEmptyState');
    const totalCountBadge = document.getElementById('totalRecordsBadge');

    if (!tableBody) return;

    const query = document.getElementById('recordsSearchInput')?.value.trim() || '';
    const date = document.getElementById('recordsDateFilter')?.value || '';
    const status = document.getElementById('recordsStatusFilter')?.value || 'All';

    try {
        const url = `/api/parent-pass/list?q=${encodeURIComponent(query)}&date=${encodeURIComponent(date)}&status=${encodeURIComponent(status)}`;
        const res = await fetch(url);
        const data = await res.json();

        const visits = data.visits || [];
        if (totalCountBadge) totalCountBadge.textContent = visits.length;

        tableBody.innerHTML = '';
        if (mobileCards) mobileCards.innerHTML = '';

        if (visits.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        visits.forEach(v => {
            // Desktop Table Row
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-700/30 border-b border-slate-700/50 transition';

            const isActive = v.status === 'Active';
            const statusHtml = isActive
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>Active</span>`
                : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/60 text-slate-400 border border-slate-600/50">Exited</span>`;

            tr.innerHTML = `
                <td class="px-4 py-3 whitespace-nowrap font-mono text-xs font-bold text-indigo-300">
                    ${escapeHtml(v.pass_number)}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-200">
                    <div class="font-bold text-white">${escapeHtml(v.parent_name)}</div>
                    <div class="text-[11px] text-slate-400">${escapeHtml(v.relation)} • ${escapeHtml(v.phone_number)}</div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-200">
                    <div class="font-semibold text-slate-100">${escapeHtml(v.student_name)}</div>
                    <div class="text-[11px] text-indigo-400 font-mono">${escapeHtml(v.student_roll)}</div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-300 max-w-[140px] truncate">
                    ${escapeHtml(v.purpose)}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-300">
                    <div>${escapeHtml(v.visit_date)}</div>
                    <div class="text-[11px] text-slate-400 font-mono">In: ${escapeHtml(v.in_time)}${v.out_time ? ` | Out: ${escapeHtml(v.out_time)}` : ''}</div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-xs">
                    ${statusHtml}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-right space-x-1.5">
                    <button class="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition" onclick="viewPassDetail(${v.id})" title="View / Print Pass">
                        <i class="fa-solid fa-print mr-1 text-indigo-400"></i>Pass
                    </button>
                    ${isActive ? `
                        <button class="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition" onclick="markPassExit(${v.id})" title="Mark Visitor Exited">
                            <i class="fa-solid fa-arrow-right-from-bracket mr-1"></i>Exit
                        </button>
                    ` : ''}
                </td>
            `;
            tableBody.appendChild(tr);

            // Mobile Card View
            if (mobileCards) {
                const card = document.createElement('div');
                card.className = 'bg-slate-800/80 border border-slate-700/70 rounded-xl p-4 space-y-3';
                card.innerHTML = `
                    <div class="flex items-center justify-between">
                        <span class="font-mono text-xs font-bold text-indigo-300">${escapeHtml(v.pass_number)}</span>
                        ${statusHtml}
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <span class="text-slate-400 block text-[10px] uppercase">Visitor</span>
                            <span class="font-semibold text-white">${escapeHtml(v.parent_name)}</span>
                            <span class="text-slate-400 block text-[11px]">(${escapeHtml(v.relation)})</span>
                        </div>
                        <div>
                            <span class="text-slate-400 block text-[10px] uppercase">Student</span>
                            <span class="font-semibold text-white">${escapeHtml(v.student_name)}</span>
                            <span class="text-indigo-400 font-mono block text-[11px]">${escapeHtml(v.student_roll)}</span>
                        </div>
                    </div>
                    <div class="text-xs text-slate-300">
                        <span class="text-slate-400 text-[10px] block uppercase">Timings</span>
                        <span>${escapeHtml(v.visit_date)} • In: ${escapeHtml(v.in_time)} ${v.out_time ? `• Out: ${escapeHtml(v.out_time)}` : ''}</span>
                    </div>
                    <div class="pt-2 border-t border-slate-700/50 flex space-x-2">
                        <button class="flex-1 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition" onclick="viewPassDetail(${v.id})">
                            <i class="fa-solid fa-print mr-1 text-indigo-400"></i>View / Print
                        </button>
                        ${isActive ? `
                            <button class="flex-1 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition" onclick="markPassExit(${v.id})">
                                <i class="fa-solid fa-arrow-right-from-bracket mr-1"></i>Mark Exit
                            </button>
                        ` : ''}
                    </div>
                `;
                mobileCards.appendChild(card);
            }
        });
    } catch (err) {
        console.error("Load records error:", err);
    }
}

async function viewPassDetail(id) {
    try {
        const res = await fetch(`/api/parent-pass/${id}`);
        const data = await res.json();
        if (data.success && data.pass) {
            showGeneratedPassModal(data.pass);
        } else {
            alert("Pass details not found.");
        }
    } catch (err) {
        alert("Error fetching pass: " + err.message);
    }
}

async function markPassExit(id) {
    if (!confirm("Are you sure you want to mark this visitor as EXITED?")) {
        return;
    }

    try {
        const res = await fetch(`/api/parent-pass/${id}/exit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
            alert(`Visitor marked Exited successfully at ${data.visit.out_time}.`);
            // Update modal if currently showing this pass
            if (passState.currentPass && passState.currentPass.id === id) {
                showGeneratedPassModal(data.visit);
            }
            loadRecords();
        } else {
            alert("Error: " + (data.error || "Failed to mark exit."));
        }
    } catch (err) {
        alert("Network error marking exit: " + err.message);
    }
}

// ============================================================================
// 8. TAB SWITCHING (CREATE PASS vs RECORDS LIST)
// ============================================================================
function initTabSwitching() {
    const btnCreate = document.getElementById('viewTabCreate');
    const btnRecords = document.getElementById('viewTabRecords');
    const containerCreate = document.getElementById('passFormContainer');
    const containerRecords = document.getElementById('recordsListContainer');

    if (btnCreate && btnRecords) {
        btnCreate.addEventListener('click', () => {
            btnCreate.className = 'nav-tab active-tab';
            btnRecords.className = 'nav-tab text-slate-300';
            containerCreate.classList.remove('hidden');
            containerRecords.classList.add('hidden');
            passState.activeTab = 'create';
        });

        btnRecords.addEventListener('click', () => {
            btnRecords.className = 'nav-tab active-tab';
            btnCreate.className = 'nav-tab text-slate-300';
            containerCreate.classList.add('hidden');
            containerRecords.classList.remove('hidden');
            passState.activeTab = 'records';
            loadRecords();
        });
    }
}

// Helper: Escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Prototype Showcase Quick-Fill & Demo Student Chips
function initPrototypeButtons() {
    // 1-Click Demo Pass
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
            selectStudent({
                id: 1,
                name: "Aarav Sharma",
                roll_number: "CS2026-012",
                department: "Computer Science & Engineering",
                year: "3rd Year",
                photo_path: "/data/student_photos/CS2026-012.jpg"
            });

            // Set current time and date
            const now = new Date();
            const dateInput = document.getElementById('visitDate');
            if (dateInput) dateInput.value = now.toISOString().split('T')[0];
            const inTimeInput = document.getElementById('inTime');
            if (inTimeInput) inTimeInput.value = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Clear errors
            document.querySelectorAll('.form-error-msg').forEach(el => el.classList.add('hidden'));

            // Smooth scroll to generate button and highlight
            const submitBtn = document.getElementById('submitPassBtn');
            if (submitBtn) {
                submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    // Demo Student Chips
    document.querySelectorAll('.demo-student-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            selectStudent({
                id: parseInt(chip.getAttribute('data-id'), 10),
                name: chip.getAttribute('data-name'),
                roll_number: chip.getAttribute('data-roll'),
                department: chip.getAttribute('data-dept'),
                year: chip.getAttribute('data-year') || '2nd Year',
                photo_path: chip.getAttribute('data-photo') || null
            });
        });
    });
}
