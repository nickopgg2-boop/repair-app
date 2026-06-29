const OPENCV_URLS = [
    './vendor/opencv.js',
    'https://docs.opencv.org/4.x/opencv.js',
    'https://cdn.jsdelivr.net/npm/opencv.js@1.2.1/opencv.min.js'
];

const TESSERACT_URLS = [
    './vendor/tesseract.min.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js'
];

const TESSERACT_OPTIONS = {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd.wasm.js',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0'
};

const FIELD_ORDER = [
    'partName', 'partNumber', 'model', 'problem', 'stock', 'priority',
    'prd', 'qa', 'pcc', 'coverD', 'fg'
];

const SUMMIT_TEMPLATE_LAYOUT = {
    partName: { yMin: 0.08, yMax: 0.28 },
    partNumber: { yMin: 0.08, yMax: 0.30 },
    model: { yMin: 0.10, yMax: 0.34 },
    problem: { yMin: 0.30, yMax: 0.62 },
    stock: { yMin: 0.55, yMax: 0.75 },
    priority: { yMin: 0.58, yMax: 0.82 },
    prd: { yMin: 0.68, yMax: 0.94 },
    qa: { yMin: 0.68, yMax: 0.94 },
    pcc: { yMin: 0.68, yMax: 0.94 },
    coverD: { yMin: 0.68, yMax: 0.94 },
    fg: { yMin: 0.68, yMax: 0.94 }
};

let config = null;
let initialized = false;
let cvLoadingPromise = null;
let tessLoadingPromise = null;
let currentScan = null;

function initCameraOcrFeature(options) {
    config = options;
    if (initialized) return;
    initialized = true;

    const { elements, openCamera, openGallery } = config;
    elements.backdrop?.addEventListener('click', hideModal);
    elements.closeButton?.addEventListener('click', hideModal);
    elements.galleryButton?.addEventListener('click', openGallery);
    elements.retakeButton?.addEventListener('click', openCamera);
    elements.createButton?.addEventListener('click', createJobFromCurrentScan);

    elements.parsedForm?.addEventListener('input', () => {
        if (!currentScan) return;
        currentScan.parsedData = collectParsedFormData();
    });
}


function openImageSourceChoice() {
    if (!config) return;
    resetScannerUi();
    showModal();
    config.elements.progressBlock.classList.add('hidden');
    config.elements.statusText.textContent = 'เลือกแหล่งรูปภาพ';
    config.elements.errorBox.textContent = 'ยังไม่ได้เลือกรูปภาพ สามารถถ่ายใหม่หรือเลือกภาพจาก Gallery ได้';
    config.elements.errorBox.classList.remove('hidden');
    config.elements.retakeButton.classList.remove('hidden');
    config.elements.createButton.classList.add('hidden');
}

async function handleImageFile(file, source = 'camera') {
    if (!config) throw new Error('Camera OCR feature has not been initialized.');

    resetScannerUi();
    showModal();
    setStage('Scanning...', 6, source === 'camera' ? 'กำลังอ่านภาพจากกล้อง' : 'กำลังอ่านภาพจาก Gallery');

    try {
        if (!file || !file.type.startsWith('image/')) {
            throw new Error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
        }

        const imageBase64 = await fileToDataUrl(file);
        config.elements.originalPreview.src = imageBase64;
        config.elements.previewGrid.classList.remove('hidden');

        setStage('Scanning...', 14, 'กำลังโหลด OpenCV.js เพื่อปรับภาพก่อน OCR');
        await loadOpenCv();

        setStage('Scanning...', 24, 'AI กำลังตรวจจับกระดาษและขอบเอกสาร');
        const processed = await preprocessImageWithOpenCV(imageBase64);
        if (processed.blurScore < 22) {
            throw new Error('รูปไม่ชัด กรุณาถ่ายใหม่');
        }

        config.elements.processedPreview.src = processed.dataUrl;
        config.elements.previewGrid.classList.remove('hidden');

        setStage('Reading Text...', 52, 'กำลังโหลด Tesseract.js และ Web Worker');
        await loadTesseract();

        setStage('Reading Text...', 60, 'OCR กำลังอ่านข้อความภาษาไทย อังกฤษ ตัวเลข และสัญลักษณ์');
        const ocrResult = await recognizeDocument(processed.canvas || processed.dataUrl);
        const cleanOcrText = normalizeOcrText(ocrResult.text);
        if (!cleanOcrText || cleanOcrText.replace(/\s/g, '').length < 4) {
            throw new Error('OCR ไม่พบข้อความในภาพ กรุณาถ่ายใหม่ให้เห็นใบแจ้งซ่อมชัดเจน');
        }

        setStage('Analyzing...', 84, 'AI Parser กำลังแยกช่องข้อมูลและแก้คำ OCR ที่อ่านผิด');
        const parsed = parseSummitTemporaryDieMaintenanceForm(cleanOcrText, ocrResult.words);

        currentScan = {
            imageBase64,
            processedImageBase64: processed.dataUrl,
            ocrText: cleanOcrText,
            parsedData: parsed.data,
            confidence: {
                ...parsed.confidence,
                overall: parsed.overallConfidence
            },
            scanTime: new Date().toISOString()
        };

        renderScanResult(currentScan);
        setStage('Success', 100, 'อ่านข้อมูลสำเร็จ กรุณาตรวจสอบก่อนสร้างใบงาน');
        config.elements.createButton.classList.remove('hidden');
        config.elements.retakeButton.classList.remove('hidden');
    } catch (error) {
        showError(error.message || 'ไม่สามารถประมวลผลภาพได้');
        config.app?.registerOcrFailure?.();
    }
}

async function createJobFromCurrentScan() {
    if (!currentScan) return;
    setStage('Creating Job...', 96, 'กำลังสร้างใบงานและบันทึกลง Dashboard');
    currentScan.parsedData = collectParsedFormData();
    currentScan.confidence = recalculateConfidenceAfterEdit(currentScan.confidence, currentScan.parsedData);
    config.app?.createCameraJob?.(currentScan);
    setStage('Success', 100, 'สร้างใบงานสำเร็จ');
    window.setTimeout(hideModal, 650);
}

function resetScannerUi() {
    const { elements } = config;
    currentScan = null;
    elements.errorBox.classList.add('hidden');
    elements.errorBox.textContent = '';
    elements.previewGrid.classList.add('hidden');
    elements.ocrTextSection.classList.add('hidden');
    elements.parsedSection.classList.add('hidden');
    elements.createButton.classList.add('hidden');
    elements.retakeButton.classList.add('hidden');
    elements.progressBlock.classList.remove('hidden');
    elements.scanAnimation.classList.remove('success');
    elements.originalPreview.removeAttribute('src');
    elements.processedPreview.removeAttribute('src');
    elements.ocrTextOutput.value = '';
    FIELD_ORDER.forEach(field => {
        const input = document.getElementById(`parsed-${field}`);
        const chip = document.getElementById(`confidence-${field}`);
        if (input) input.value = '';
        if (input) input.classList.remove('low-confidence');
        if (chip) {
            chip.textContent = '';
            chip.className = 'confidence-chip';
        }
    });
}

function showModal() {
    config.elements.modal.classList.remove('hidden');
}

function hideModal() {
    config.elements.modal.classList.add('hidden');
}

function setStage(stage, progress, detail) {
    const { elements } = config;
    elements.statusText.textContent = detail || stage;
    elements.progressText.textContent = `${stage} ${Math.round(progress)}%`;
    elements.progressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    const animationLabel = elements.scanAnimation.querySelector('span');
    if (animationLabel) animationLabel.textContent = stage;
    elements.scanAnimation.classList.toggle('success', stage === 'Success');
}

function showError(message) {
    const { elements } = config;
    elements.progressBlock.classList.add('hidden');
    elements.errorBox.textContent = message;
    elements.errorBox.classList.remove('hidden');
    elements.retakeButton.classList.remove('hidden');
    elements.createButton.classList.add('hidden');
    elements.statusText.textContent = 'ตรวจสอบรูปภาพอีกครั้ง';
}

function renderScanResult(scan) {
    const { elements } = config;
    elements.ocrTextOutput.value = scan.ocrText;
    elements.ocrTextSection.classList.remove('hidden');
    elements.parsedSection.classList.remove('hidden');

    FIELD_ORDER.forEach(field => {
        const input = document.getElementById(`parsed-${field}`);
        const chip = document.getElementById(`confidence-${field}`);
        if (!input || !chip) return;
        input.value = scan.parsedData[field] || '';
        const score = Math.round(Number(scan.confidence[field] || 0));
        chip.textContent = `${score}%`;
        chip.className = `confidence-chip ${score < 70 ? 'confidence-low' : 'confidence-ok'}`;
        input.classList.toggle('low-confidence', score < 70);
    });
}

function collectParsedFormData() {
    return FIELD_ORDER.reduce((data, field) => {
        const input = document.getElementById(`parsed-${field}`);
        data[field] = input ? input.value.trim() : '';
        return data;
    }, {});
}

function recalculateConfidenceAfterEdit(confidence, parsedData) {
    const next = { ...confidence };
    FIELD_ORDER.forEach(field => {
        const value = parsedData[field];
        if (value && Number(next[field] || 0) < 70) next[field] = 70;
    });
    const coreFields = ['partName', 'partNumber', 'model', 'problem', 'stock', 'priority'];
    next.overall = Math.round(coreFields.reduce((sum, field) => sum + Number(next[field] || 0), 0) / coreFields.length);
    return next;
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
        reader.readAsDataURL(file);
    });
}

function loadScriptWithFallback(urls, globalCheck, existingPromise) {
    if (globalCheck()) return Promise.resolve();
    if (existingPromise) return existingPromise;

    return urls.reduce((chain, url) => {
        return chain.catch(() => loadScript(url).then(() => waitForGlobal(globalCheck, 15000)));
    }, Promise.reject()).catch(() => {
        throw new Error('ไม่สามารถโหลด Library OCR ได้ กรุณาเชื่อมต่ออินเทอร์เน็ตครั้งแรกเพื่อ Cache ระบบ');
    });
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = [...document.scripts].find(script => script.src && script.src.includes(src.replace('./', '')));
        if (existing) {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', reject, { once: true });
            if (existing.dataset.loaded === 'true') resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
        };
        script.onerror = () => reject(new Error(`Cannot load ${src}`));
        document.head.appendChild(script);
    });
}

function waitForGlobal(check, timeoutMs) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = window.setInterval(() => {
            if (check()) {
                window.clearInterval(interval);
                resolve();
            } else if (Date.now() - start > timeoutMs) {
                window.clearInterval(interval);
                reject(new Error('Library load timeout'));
            }
        }, 80);
    });
}

async function loadOpenCv() {
    if (window.cv?.Mat) return;
    if (!cvLoadingPromise) {
        cvLoadingPromise = loadScriptWithFallback(
            OPENCV_URLS,
            () => Boolean(window.cv?.Mat),
            cvLoadingPromise
        ).then(() => {
            if (window.cv?.onRuntimeInitialized && !window.cv.Mat) {
                return new Promise(resolve => {
                    window.cv.onRuntimeInitialized = resolve;
                });
            }
        });
    }
    return cvLoadingPromise;
}

async function loadTesseract() {
    if (window.Tesseract?.recognize) return;
    if (!tessLoadingPromise) {
        tessLoadingPromise = loadScriptWithFallback(
            TESSERACT_URLS,
            () => Boolean(window.Tesseract?.recognize),
            tessLoadingPromise
        );
    }
    return tessLoadingPromise;
}

async function preprocessImageWithOpenCV(imageDataUrl) {
    const sourceCanvas = await imageDataUrlToCanvas(imageDataUrl, 1800);
    const cv = window.cv;
    const src = cv.imread(sourceCanvas);
    let rgb = new cv.Mat();
    let balanced = new cv.Mat();
    let gray = new cv.Mat();
    let shadowRemoved = new cv.Mat();
    let contrast = new cv.Mat();
    let denoised = new cv.Mat();
    let edges = new cv.Mat();
    let documentMat = null;
    let deskewed = null;
    let threshold = null;
    let sharpened = null;
    let outputCanvas = document.createElement('canvas');

    try {
        cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
        balanced = applyWhiteBalance(rgb);
        cv.cvtColor(balanced, gray, cv.COLOR_RGB2GRAY);

        const blurScore = calculateBlurScore(gray);

        shadowRemoved = removeShadow(gray);
        contrast = correctBrightnessAndContrast(shadowRemoved);
        denoised = reduceNoise(contrast);

        cv.Canny(denoised, edges, 40, 130, 3, false);
        const detectedContour = findDocumentContour(edges);
        documentMat = detectedContour ? perspectiveCorrect(balanced, detectedContour) : balanced.clone();

        const docGray = new cv.Mat();
        cv.cvtColor(documentMat, docGray, cv.COLOR_RGB2GRAY);
        deskewed = deskew(docGray);
        docGray.delete();

        const deskewedContrast = correctBrightnessAndContrast(deskewed);
        const finalNoise = reduceNoise(deskewedContrast);
        threshold = adaptiveThreshold(finalNoise);
        sharpened = sharpenImage(threshold);

        cv.imshow(outputCanvas, sharpened);
        deskewedContrast.delete();
        finalNoise.delete();

        return {
            canvas: outputCanvas,
            dataUrl: outputCanvas.toDataURL('image/png', 0.95),
            blurScore
        };
    } finally {
        src.delete();
        rgb.delete();
        balanced.delete();
        gray.delete();
        shadowRemoved.delete();
        contrast.delete();
        denoised.delete();
        edges.delete();
        if (documentMat) documentMat.delete();
        if (deskewed) deskewed.delete();
        if (threshold) threshold.delete();
        if (sharpened) sharpened.delete();
    }
}

function imageDataUrlToCanvas(dataUrl, maxSide) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(autoRotateCanvas(canvas));
        };
        image.onerror = () => reject(new Error('ไม่สามารถโหลดรูปภาพได้'));
        image.src = dataUrl;
    });
}

function autoRotateCanvas(canvas) {
    if (canvas.width <= canvas.height) return canvas;
    const rotated = document.createElement('canvas');
    rotated.width = canvas.height;
    rotated.height = canvas.width;
    const context = rotated.getContext('2d');
    context.translate(rotated.width / 2, rotated.height / 2);
    context.rotate(Math.PI / 2);
    context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return rotated;
}

function applyWhiteBalance(rgb) {
    const cv = window.cv;
    const channels = new cv.MatVector();
    const adjustedChannels = new cv.MatVector();
    const output = new cv.Mat();
    const adjustedMats = [];
    cv.split(rgb, channels);
    try {
        const means = [0, 1, 2].map(index => {
            const channel = channels.get(index);
            const mean = cv.mean(channel)[0] || 1;
            channel.delete();
            return mean;
        });
        const target = means.reduce((sum, value) => sum + value, 0) / means.length;
        for (let index = 0; index < 3; index += 1) {
            const channel = channels.get(index);
            const adjusted = new cv.Mat();
            channel.convertTo(adjusted, -1, target / means[index], 0);
            adjustedChannels.push_back(adjusted);
            adjustedMats.push(adjusted);
            channel.delete();
        }
        cv.merge(adjustedChannels, output);
        return output;
    } finally {
        adjustedMats.forEach(mat => mat.delete());
        channels.delete();
        adjustedChannels.delete();
    }
}

function calculateBlurScore(gray) {
    const cv = window.cv;
    const laplacian = new cv.Mat();
    const mean = new cv.Mat();
    const stddev = new cv.Mat();
    try {
        cv.Laplacian(gray, laplacian, cv.CV_64F);
        cv.meanStdDev(laplacian, mean, stddev);
        return Number(stddev.doubleAt(0, 0) ** 2);
    } finally {
        laplacian.delete();
        mean.delete();
        stddev.delete();
    }
}

function removeShadow(gray) {
    const cv = window.cv;
    const kernel = cv.Mat.ones(7, 7, cv.CV_8U);
    const dilated = new cv.Mat();
    const background = new cv.Mat();
    const diff = new cv.Mat();
    const normalized = new cv.Mat();
    const inverted = new cv.Mat();
    try {
        cv.dilate(gray, dilated, kernel);
        cv.medianBlur(dilated, background, 31);
        cv.absdiff(gray, background, diff);
        cv.normalize(diff, normalized, 0, 255, cv.NORM_MINMAX);
        cv.bitwise_not(normalized, inverted);
        return inverted;
    } finally {
        kernel.delete();
        dilated.delete();
        background.delete();
        diff.delete();
        normalized.delete();
    }
}

function correctBrightnessAndContrast(gray) {
    const cv = window.cv;
    const normalized = new cv.Mat();
    const equalized = new cv.Mat();
    cv.normalize(gray, normalized, 0, 255, cv.NORM_MINMAX);
    cv.equalizeHist(normalized, equalized);
    normalized.delete();
    return equalized;
}

function reduceNoise(gray) {
    const cv = window.cv;
    const denoised = new cv.Mat();
    cv.bilateralFilter(gray, denoised, 5, 60, 60, cv.BORDER_DEFAULT);
    return denoised;
}

function adaptiveThreshold(gray) {
    const cv = window.cv;
    const threshold = new cv.Mat();
    cv.adaptiveThreshold(gray, threshold, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 12);
    return threshold;
}

function sharpenImage(gray) {
    const cv = window.cv;
    const kernel = cv.matFromArray(3, 3, cv.CV_32F, [0, -1, 0, -1, 5, -1, 0, -1, 0]);
    const sharpened = new cv.Mat();
    try {
        cv.filter2D(gray, sharpened, cv.CV_8U, kernel);
        return sharpened;
    } finally {
        kernel.delete();
    }
}

function findDocumentContour(edges) {
    const cv = window.cv;
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    let best = null;
    try {
        cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
        let bestArea = 0;
        const minArea = edges.rows * edges.cols * 0.12;

        for (let i = 0; i < contours.size(); i += 1) {
            const contour = contours.get(i);
            const perimeter = cv.arcLength(contour, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
            const area = Math.abs(cv.contourArea(contour));

            if (approx.rows === 4 && area > minArea && area > bestArea) {
                bestArea = area;
                best = pointsFromMat(approx);
            }

            contour.delete();
            approx.delete();
        }
        return best;
    } finally {
        contours.delete();
        hierarchy.delete();
    }
}

function pointsFromMat(mat) {
    const points = [];
    const data = mat.data32S;
    for (let i = 0; i < data.length; i += 2) {
        points.push({ x: data[i], y: data[i + 1] });
    }
    return points.slice(0, 4);
}

function perspectiveCorrect(src, points) {
    const cv = window.cv;
    const ordered = orderDocumentPoints(points);
    const widthA = distance(ordered.bottomRight, ordered.bottomLeft);
    const widthB = distance(ordered.topRight, ordered.topLeft);
    const heightA = distance(ordered.topRight, ordered.bottomRight);
    const heightB = distance(ordered.topLeft, ordered.bottomLeft);
    const maxWidth = Math.max(500, Math.round(Math.max(widthA, widthB)));
    const maxHeight = Math.max(500, Math.round(Math.max(heightA, heightB)));

    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        ordered.topLeft.x, ordered.topLeft.y,
        ordered.topRight.x, ordered.topRight.y,
        ordered.bottomRight.x, ordered.bottomRight.y,
        ordered.bottomLeft.x, ordered.bottomLeft.y
    ]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        maxWidth - 1, 0,
        maxWidth - 1, maxHeight - 1,
        0, maxHeight - 1
    ]);
    const transform = cv.getPerspectiveTransform(srcTri, dstTri);
    const warped = new cv.Mat();
    try {
        cv.warpPerspective(src, warped, transform, new cv.Size(maxWidth, maxHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
        return warped;
    } finally {
        srcTri.delete();
        dstTri.delete();
        transform.delete();
    }
}

function orderDocumentPoints(points) {
    const sortedBySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const sortedByDiff = [...points].sort((a, b) => (a.y - a.x) - (b.y - b.x));
    return {
        topLeft: sortedBySum[0],
        bottomRight: sortedBySum[3],
        topRight: sortedByDiff[0],
        bottomLeft: sortedByDiff[3]
    };
}

function distance(pointA, pointB) {
    return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function deskew(gray) {
    const cv = window.cv;
    const inverted = new cv.Mat();
    const nonZero = new cv.Mat();
    const output = new cv.Mat();
    try {
        cv.threshold(gray, inverted, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
        cv.findNonZero(inverted, nonZero);
        if (!nonZero.rows) return gray.clone();

        const rect = cv.minAreaRect(nonZero);
        let angle = rect.angle;
        if (angle < -45) angle += 90;
        if (Math.abs(angle) < 0.4 || Math.abs(angle) > 12) return gray.clone();

        const center = new cv.Point(gray.cols / 2, gray.rows / 2);
        const rotation = cv.getRotationMatrix2D(center, angle, 1.0);
        cv.warpAffine(gray, output, rotation, new cv.Size(gray.cols, gray.rows), cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar());
        rotation.delete();
        return output;
    } catch (error) {
        return gray.clone();
    } finally {
        inverted.delete();
        nonZero.delete();
    }
}

async function recognizeDocument(canvasOrDataUrl) {
    const result = await window.Tesseract.recognize(canvasOrDataUrl, 'tha+eng', {
        ...TESSERACT_OPTIONS,
        logger: message => {
            if (!message || typeof message.progress !== 'number') return;
            const progress = 60 + (message.progress * 22);
            setStage('Reading Text...', progress, `OCR: ${message.status || 'กำลังประมวลผล'} ${Math.round(message.progress * 100)}%`);
        }
    });
    return {
        text: result?.data?.text || '',
        words: Array.isArray(result?.data?.words) ? result.data.words : []
    };
}

function normalizeOcrText(text) {
    return String(text || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[:：]/g, ':')
        .replace(/[|]/g, 'I')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function parseSummitTemporaryDieMaintenanceForm(ocrText, ocrWords = []) {
    const layoutLines = buildLayoutLinesFromWords(ocrWords);
    const lines = layoutLines.length ? layoutLines.map(line => line.text) : ocrText.split('\n').map(line => line.trim()).filter(Boolean);
    const normalizedText = normalizeForSearch(ocrText);
    const data = {};
    const confidence = {};

    data.partNumber = detectPartNumber(ocrText, lines);
    confidence.partNumber = scorePartNumber(data.partNumber, ocrText);

    const fieldDefinitions = {
        partName: ['PART NAME', 'PARTNAME', 'PART NAM', 'ชื่อชิ้นงาน', 'ชื่อ PART', 'ชิ้นงาน'],
        model: ['MODEL', 'MODE L', 'รุ่น', 'โมเดล'],
        problem: ['ปัญหา', 'สาเหตุ', 'ปัญหา / สาเหตุ', 'PROBLEM', 'CAUSE', 'DETAIL', 'DETAILS', 'อาการ'],
        stock: ['STOCK', 'สต็อก', 'สต๊อก', 'จำนวน'],
        prd: ['PRD', 'P R D', 'PRODUCTION'],
        qa: ['QA', 'Q A', 'QUALITY'],
        pcc: ['PCC', 'P C C'],
        coverD: ['COVER D', 'COVER-D', 'COVERD', 'COVER'],
        fg: ['FG', 'F G', 'FINISHED GOODS']
    };

    Object.entries(fieldDefinitions).forEach(([field, aliases]) => {
        if (field === 'problem') {
            data[field] = extractProblemBlock(lines, aliases);
        } else {
            data[field] = extractValueByAliases(lines, aliases);
        }
        confidence[field] = scoreExtractedValue(field, data[field], lines, aliases, layoutLines);
    });

    const priorityRaw = extractValueByAliases(lines, ['PRIORITY', 'TYPE', 'ประเภท', 'ความเร่งด่วน', 'DIE TYPE']) || normalizedText;
    const priority = normalizePriority(priorityRaw, normalizedText);
    data.priority = priority.value;
    confidence.priority = priority.confidence;

    const coreFields = ['partName', 'partNumber', 'model', 'problem', 'stock', 'priority'];
    const overallConfidence = Math.round(coreFields.reduce((sum, field) => sum + Number(confidence[field] || 0), 0) / coreFields.length);

    return { data, confidence, overallConfidence };
}

function detectPartNumber(text, lines) {
    const combinedByLineBreak = text.match(/\b(\d{5,8})\s*\n\s*(\d{3,6}[-–—]?\d{0,3})\b/);
    if (combinedByLineBreak) return `${combinedByLineBreak[1]}${combinedByLineBreak[2].replace(/[–—]/g, '-')}`;

    const labeledValue = extractValueByAliases(lines, ['PART NO', 'PART NO.', 'PART NUMBER', 'PARTNO', 'PART #', 'P/NO']);
    if (labeledValue) {
        const cleaned = labeledValue.replace(/\s+/g, '').replace(/[–—]/g, '-');
        if (/[A-Z0-9]{4,}/i.test(cleaned)) return cleaned;
    }

    for (let index = 0; index < lines.length - 1; index += 1) {
        const current = lines[index].replace(/\s/g, '');
        const next = lines[index + 1].replace(/\s/g, '').replace(/[–—]/g, '-');
        if (/^\d{5,8}$/.test(current) && /^\d{3,6}-?\d{0,3}$/.test(next)) {
            return `${current}${next}`;
        }
    }

    const inline = text.replace(/\s+/g, ' ').match(/\b(?=[A-Z0-9–—-]*\d)([A-Z0-9]{4,}[-–—]?[A-Z0-9]{1,})\b/i);
    return inline ? inline[1].replace(/[–—]/g, '-') : '';
}

function scorePartNumber(value, text) {
    if (!value) return 0;
    if (/\d{5,8}\d{3,6}-?\d{0,3}/.test(value)) return 99;
    if (/PART\s*(NO|NUMBER|#)/i.test(text)) return 96;
    return 78;
}

function extractValueByAliases(lines, aliases) {
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const match = matchAlias(line, aliases);
        if (!match.hit) continue;

        const afterLabel = line.slice(match.endIndex).replace(/^[\s:：\-–—=]+/, '').trim();
        if (afterLabel && !isLikelyOnlyLabel(afterLabel)) return cleanupFieldValue(afterLabel);

        const nextLine = findNextUsefulLine(lines, index + 1);
        if (nextLine) return cleanupFieldValue(nextLine);
    }
    return '';
}

function extractProblemBlock(lines, aliases) {
    for (let index = 0; index < lines.length; index += 1) {
        const match = matchAlias(lines[index], aliases);
        if (!match.hit) continue;

        const first = lines[index].slice(match.endIndex).replace(/^[\s:：\-–—=]+/, '').trim();
        const buffer = first ? [first] : [];
        for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
            if (looksLikeAnyKnownLabel(lines[cursor])) break;
            buffer.push(lines[cursor]);
            if (buffer.join(' ').length > 160) break;
        }
        return cleanupFieldValue(buffer.join(' '));
    }
    return '';
}

function findNextUsefulLine(lines, startIndex) {
    for (let index = startIndex; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line || looksLikeAnyKnownLabel(line)) continue;
        return line;
    }
    return '';
}

function matchAlias(line, aliases) {
    const searchableLine = normalizeForSearch(line);
    const orderedAliases = [...aliases].sort((a, b) => b.length - a.length);
    for (const alias of orderedAliases) {
        const searchableAlias = normalizeForSearch(alias);
        const index = searchableLine.indexOf(searchableAlias);
        if (index >= 0) {
            const originalIndex = Math.max(0, line.toUpperCase().indexOf(alias.toUpperCase().replace(/\s+/g, ' ')));
            return { hit: true, endIndex: originalIndex + alias.length, score: 1 };
        }
    }

    const firstChunk = searchableLine.split(/[:\-–—=]/)[0] || searchableLine;
    const best = orderedAliases.reduce((candidate, alias) => {
        const score = similarity(firstChunk, normalizeForSearch(alias));
        return score > candidate.score ? { alias, score } : candidate;
    }, { alias: '', score: 0 });

    if (best.score >= 0.72) {
        return { hit: true, endIndex: best.alias.length, score: best.score };
    }

    return { hit: false, endIndex: 0, score: 0 };
}

function normalizePriority(rawValue, fullText) {
    const raw = `${rawValue || ''} ${fullText || ''}`;
    const canonical = normalizeForSearch(raw).replace(/[\s\-_.]/g, '');

    if (/PROGRESSIVE|\bPD\b|P\s*[-]?\s*D/.test(raw.toUpperCase()) || canonical.includes('PD')) {
        return { value: 'P-D', confidence: 100 };
    }
    if (/SMALL\s*STAMPING|\bSD\b|S\s*[-]?\s*D|STANDARD/.test(raw.toUpperCase()) || canonical.includes('SD')) {
        return { value: 'S-D', confidence: 96 };
    }
    if (/LARGE\s*STAMPING|\bLD\b|L\s*[-]?\s*D|LEVEL/.test(raw.toUpperCase()) || canonical.includes('LD')) {
        return { value: 'L-D', confidence: 96 };
    }

    const fuzzyCandidates = [
        { needle: 'PROGRESSIVE', value: 'P-D' },
        { needle: 'SMALLSTAMPING', value: 'S-D' },
        { needle: 'LARGESTAMPING', value: 'L-D' }
    ];
    const best = fuzzyCandidates.reduce((candidate, item) => {
        const score = similarity(canonical, item.needle);
        return score > candidate.score ? { ...item, score } : candidate;
    }, { value: '', score: 0 });

    return best.score > 0.6 ? { value: best.value, confidence: 82 } : { value: '', confidence: 0 };
}

function looksLikeAnyKnownLabel(line) {
    const labelAliases = [
        'PART NAME', 'PART NO', 'PART NUMBER', 'MODEL', 'PROBLEM', 'CAUSE', 'STOCK', 'PRIORITY',
        'PRD', 'QA', 'PCC', 'COVER D', 'FG', 'ปัญหา', 'สาเหตุ', 'รุ่น', 'จำนวน'
    ];
    return labelAliases.some(alias => matchAlias(line, [alias]).hit);
}

function cleanupFieldValue(value) {
    return String(value || '')
        .replace(/^[\s:：\-–—=]+/, '')
        .replace(/[☐□■▪]+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function isLikelyOnlyLabel(value) {
    return /^[\s:：\-–—=]*$/.test(value) || looksLikeAnyKnownLabel(value);
}

function scoreExtractedValue(field, value, lines, aliases, layoutLines = []) {
    if (!value) return 0;
    const labelFound = lines.some(line => matchAlias(line, aliases).hit);
    const layoutBoost = hasTemplateLayoutHit(field, layoutLines, aliases) ? 4 : 0;
    if (field === 'problem') return Math.min(99, (value.length > 8 ? 88 : 72) + layoutBoost);
    if (['prd', 'qa', 'pcc', 'coverD', 'fg'].includes(field)) return Math.min(99, (labelFound ? 86 : 65) + layoutBoost);
    if (field === 'stock' && /\d+/.test(value)) return Math.min(99, 96 + layoutBoost);
    if (labelFound) return Math.min(99, 92 + layoutBoost);
    return Math.min(99, 72 + layoutBoost);
}

function buildLayoutLinesFromWords(words) {
    const usableWords = words
        .map(word => ({
            text: String(word.text || '').trim(),
            confidence: Number(word.confidence || 0),
            bbox: word.bbox || word.boundingBox || null
        }))
        .filter(word => word.text && word.bbox && Number.isFinite(word.bbox.x0) && Number.isFinite(word.bbox.y0));

    if (!usableWords.length) return [];

    const maxY = Math.max(...usableWords.map(word => word.bbox.y1 || word.bbox.y0 || 0), 1);
    const sorted = usableWords.sort((a, b) => (a.bbox.y0 - b.bbox.y0) || (a.bbox.x0 - b.bbox.x0));
    const lines = [];

    sorted.forEach(word => {
        const centerY = ((word.bbox.y0 || 0) + (word.bbox.y1 || word.bbox.y0 || 0)) / 2;
        let line = lines.find(candidate => Math.abs(candidate.centerY - centerY) < 14);
        if (!line) {
            line = { words: [], centerY, yRatio: centerY / maxY };
            lines.push(line);
        }
        line.words.push(word);
        line.centerY = (line.centerY + centerY) / 2;
        line.yRatio = line.centerY / maxY;
    });

    return lines
        .map(line => {
            const sortedWords = line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
            return {
                ...line,
                words: sortedWords,
                text: sortedWords.map(word => word.text).join(' ')
            };
        })
        .filter(line => line.text.trim())
        .sort((a, b) => a.centerY - b.centerY);
}

function hasTemplateLayoutHit(field, layoutLines, aliases) {
    const hint = SUMMIT_TEMPLATE_LAYOUT[field];
    if (!hint || !layoutLines.length) return false;
    return layoutLines.some(line => {
        const yRatio = Number(line.yRatio || 0);
        const inExpectedZone = yRatio >= hint.yMin && yRatio <= hint.yMax;
        return inExpectedZone && aliases.some(alias => matchAlias(line.text, [alias]).hit);
    });
}

function normalizeForSearch(value) {
    return String(value || '')
        .toUpperCase()
        .replace(/[().,;_]/g, ' ')
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

function similarity(a, b) {
    if (!a || !b) return 0;
    if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
    const distanceValue = levenshteinDistance(a, b);
    return 1 - distanceValue / Math.max(a.length, b.length);
}

function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[a.length][b.length];
}


window.CameraOCRFeature = {
    initCameraOcrFeature,
    openImageSourceChoice,
    handleImageFile
};
