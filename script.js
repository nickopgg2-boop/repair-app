let jobs = getStoredJobs();
let ocrMetrics = getStoredOcrMetrics();

const jobListEl = document.getElementById('job-list');
const countTotalEl = document.getElementById('count-total');
const countPendingEl = document.getElementById('count-pending');
const countCompletedEl = document.getElementById('count-completed');
const countCameraEl = document.getElementById('count-camera');
const countOcrSuccessEl = document.getElementById('count-ocr-success');
const countOcrFailedEl = document.getElementById('count-ocr-failed');
const avgConfidenceEl = document.getElementById('avg-confidence');

const modal = document.getElementById('modal');
const btnOpenModal = document.getElementById('btn-open-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const btnSaveJob = document.getElementById('btn-save-job');
const jobTypeInput = document.getElementById('job-type');

const btnCreateFromPhoto = document.getElementById('btn-create-from-photo');
const cameraInput = document.getElementById('camera-input');
const galleryInput = document.getElementById('gallery-input');
let cameraFeaturePromise = null;
let awaitingCameraSelection = false;

function init() {
    migrateExistingJobs();
    saveData();
    renderDashboard();
    renderJobs();
    initManualJobModal();
    initCameraEntryPoints();
}

function getStoredJobs() {
    try {
        return JSON.parse(localStorage.getItem('maintenanceJobs')) || [];
    } catch (error) {
        console.warn('Cannot parse maintenanceJobs from localStorage', error);
        return [];
    }
}

function getStoredOcrMetrics() {
    try {
        const stored = JSON.parse(localStorage.getItem('maintenanceOcrMetrics')) || {};
        return {
            success: Number(stored.success || 0),
            failed: Number(stored.failed || 0)
        };
    } catch (error) {
        console.warn('Cannot parse maintenanceOcrMetrics from localStorage', error);
        return { success: 0, failed: 0 };
    }
}

function migrateExistingJobs() {
    jobs = jobs.map(job => ({
        createdFromCamera: false,
        imageBase64: null,
        processedImageBase64: null,
        ocrText: '',
        parsedData: {},
        confidence: {},
        scanTime: null,
        lastEdit: job.lastEdit || job.date || null,
        ...job
    }));
}

function renderDashboard() {
    const total = jobs.length;
    const completed = jobs.filter(job => job.status === 'เสร็จ').length;
    const pending = total - completed;
    const cameraJobs = jobs.filter(job => job.createdFromCamera);
    const confidenceValues = cameraJobs
        .map(job => Number(job.confidence?.overall || 0))
        .filter(value => Number.isFinite(value) && value > 0);
    const avgConfidence = confidenceValues.length
        ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
        : 0;

    countTotalEl.textContent = total;
    countPendingEl.textContent = pending;
    countCompletedEl.textContent = completed;

    if (countCameraEl) countCameraEl.textContent = cameraJobs.length;
    if (countOcrSuccessEl) countOcrSuccessEl.textContent = ocrMetrics.success;
    if (countOcrFailedEl) countOcrFailedEl.textContent = ocrMetrics.failed;
    if (avgConfidenceEl) avgConfidenceEl.textContent = `${avgConfidence}%`;
}

function renderJobs() {
    jobListEl.innerHTML = '';
    const sortedJobs = [...jobs].reverse();

    if (sortedJobs.length === 0) {
        jobListEl.innerHTML = `
            <div style="text-align:center; padding: 40px 20px; color: var(--text-gray);">
                <div style="font-size:3rem; margin-bottom:10px;">📭</div>
                <p>ยังไม่มีรายการแจ้งซ่อมในขณะนี้</p>
            </div>`;
        return;
    }

    sortedJobs.forEach(job => {
        const isPending = job.status === 'กำลังดำเนินการ';
        const card = document.createElement('div');
        card.className = 'job-card';
        const parsed = job.parsedData || {};
        const cameraMeta = job.createdFromCamera ? `
            <div class="camera-job-chip">📷 งานจากการถ่ายรูป · Confidence ${Math.round(Number(job.confidence?.overall || 0))}%</div>
            <div class="job-camera-detail">
                ${parsed.partNumber ? `<span>PART NO: <b>${escapeHtml(parsed.partNumber)}</b></span>` : ''}
                ${parsed.partName ? `<span>PART NAME: <b>${escapeHtml(parsed.partName)}</b></span>` : ''}
                ${parsed.model ? `<span>MODEL: <b>${escapeHtml(parsed.model)}</b></span>` : ''}
                ${parsed.problem ? `<span>ปัญหา: <b>${escapeHtml(truncateText(parsed.problem, 80))}</b></span>` : ''}
            </div>
        ` : '';

        card.innerHTML = `
            <div class="job-header-row">
                <span class="job-id">${escapeHtml(job.id)}</span>
                <span class="badge ${isPending ? 'badge-pending' : 'badge-completed'}">
                    ${isPending ? '⏳ รอดำเนินการ' : '✅ เสร็จสิ้น'}
                </span>
            </div>
            <div class="badge badge-type">ประเภท: ${escapeHtml(job.type)}</div>
            ${cameraMeta}
            <div class="job-date">📅 อัปเดตเมื่อ: ${escapeHtml(job.lastEdit || job.date)}</div>
            
            ${isPending ? `<button class="btn-finish" onclick="completeJob('${escapeAttribute(job.id)}')">ทำเครื่องหมายว่าเสร็จสิ้น</button>` : ''}
        `;
        jobListEl.appendChild(card);
    });
}

function initManualJobModal() {
    btnOpenModal.addEventListener('click', () => modal.classList.remove('hidden'));
    btnCloseModal.addEventListener('click', () => modal.classList.add('hidden'));
    modalBackdrop.addEventListener('click', () => modal.classList.add('hidden'));

    btnSaveJob.addEventListener('click', () => {
        createManualJob(jobTypeInput.value);
        modal.classList.add('hidden');
        jobTypeInput.value = 'S-D';
    });
}

function initCameraEntryPoints() {
    if (!btnCreateFromPhoto || !cameraInput || !galleryInput) return;

    btnCreateFromPhoto.addEventListener('click', () => {
        awaitingCameraSelection = true;
        const handleFocusBack = () => {
            window.setTimeout(async () => {
                if (!awaitingCameraSelection) return;
                awaitingCameraSelection = false;
                const feature = await ensureCameraFeature();
                feature.openImageSourceChoice();
            }, 500);
        };
        window.addEventListener('focus', handleFocusBack, { once: true });
        cameraInput.click();
    });

    cameraInput.addEventListener('change', async () => {
        awaitingCameraSelection = false;
        const file = cameraInput.files?.[0];
        cameraInput.value = '';
        if (!file) return;
        const feature = await ensureCameraFeature();
        feature.handleImageFile(file, 'camera');
    });

    galleryInput.addEventListener('change', async () => {
        const file = galleryInput.files?.[0];
        galleryInput.value = '';
        if (!file) return;
        const feature = await ensureCameraFeature();
        feature.handleImageFile(file, 'gallery');
    });
}

async function ensureCameraFeature() {
    if (!cameraFeaturePromise) {
        cameraFeaturePromise = import('./features/camera-ocr.js').then(module => {
            module.initCameraOcrFeature({
                app: window.maintenanceApp,
                openCamera: () => cameraInput.click(),
                openGallery: () => galleryInput.click(),
                elements: {
                    modal: document.getElementById('ocr-modal'),
                    backdrop: document.getElementById('ocr-modal-backdrop'),
                    closeButton: document.getElementById('btn-close-ocr-modal'),
                    galleryButton: document.getElementById('btn-gallery'),
                    retakeButton: document.getElementById('btn-retake'),
                    createButton: document.getElementById('btn-create-ocr-job'),
                    statusText: document.getElementById('ocr-status-text'),
                    progressFill: document.getElementById('ocr-progress-fill'),
                    progressText: document.getElementById('ocr-progress-text'),
                    progressBlock: document.getElementById('scan-progress-block'),
                    scanAnimation: document.getElementById('scan-animation'),
                    errorBox: document.getElementById('ocr-error'),
                    previewGrid: document.getElementById('ocr-preview-grid'),
                    originalPreview: document.getElementById('original-preview'),
                    processedPreview: document.getElementById('processed-preview'),
                    ocrTextSection: document.getElementById('ocr-text-section'),
                    ocrTextOutput: document.getElementById('ocr-text-output'),
                    parsedSection: document.getElementById('parsed-section'),
                    parsedForm: document.getElementById('parsed-form')
                }
            });
            return module;
        });
    }
    return cameraFeaturePromise;
}

function createManualJob(type) {
    const now = new Date();
    jobs.push({
        id: generateJobId(),
        type,
        date: formatThaiDate(now),
        status: 'กำลังดำเนินการ',
        createdFromCamera: false,
        imageBase64: null,
        processedImageBase64: null,
        ocrText: '',
        parsedData: {},
        confidence: {},
        scanTime: null,
        lastEdit: formatThaiDate(now)
    });

    saveData();
    renderDashboard();
    renderJobs();
}

function createCameraJob(scanPayload) {
    const now = new Date();
    const parsedData = scanPayload.parsedData || {};
    const priority = parsedData.priority || jobTypeInput.value || 'S-D';
    const confidence = scanPayload.confidence || {};

    jobs.push({
        id: generateJobId(),
        type: priority,
        date: formatThaiDate(now),
        status: 'กำลังดำเนินการ',
        createdFromCamera: true,
        imageBase64: scanPayload.imageBase64 || null,
        processedImageBase64: scanPayload.processedImageBase64 || null,
        ocrText: scanPayload.ocrText || '',
        parsedData,
        confidence,
        scanTime: scanPayload.scanTime || new Date().toISOString(),
        lastEdit: formatThaiDate(now)
    });

    ocrMetrics.success += 1;
    saveData();
    saveOcrMetrics();
    renderDashboard();
    renderJobs();
}

window.completeJob = function(jobId) {
    const jobIndex = jobs.findIndex(job => job.id === jobId);
    if (jobIndex > -1) {
        jobs[jobIndex].status = 'เสร็จ';
        jobs[jobIndex].lastEdit = formatThaiDate(new Date());
        saveData();
        renderDashboard();
        renderJobs();
    }
};

function registerOcrFailure() {
    ocrMetrics.failed += 1;
    saveOcrMetrics();
    renderDashboard();
}

function saveData() {
    localStorage.setItem('maintenanceJobs', JSON.stringify(jobs));
}

function saveOcrMetrics() {
    localStorage.setItem('maintenanceOcrMetrics', JSON.stringify(ocrMetrics));
}

function generateJobId() {
    let id;
    do {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        id = `JOB-${randomNum}`;
    } while (jobs.some(job => job.id === id));
    return id;
}

function formatThaiDate(date) {
    return date.toLocaleDateString('th-TH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function truncateText(text, maxLength) {
    const value = String(text || '');
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
}

window.maintenanceApp = {
    createCameraJob,
    registerOcrFailure,
    renderDashboard,
    renderJobs,
    getJobs: () => [...jobs]
};

init();
