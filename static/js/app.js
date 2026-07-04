"use strict";

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

const topbar = $(".topbar");
const menuButton = $("#menuButton");
const mobileMenu = $("#mobileMenu");

const analyticsTabs = $$(".analytics-tab");
const analyticsPanels = $$(".analytics-panel");

const modelStatus = $("#modelStatus");
const footerModelStatus = $("#footerModelStatus");

const dropZone = $("#dropZone");
const imageInput = $("#imageInput");
const chooseButton = $("#chooseButton");
const cameraButton = $("#cameraButton");
const removeButton = $("#removeButton");
const predictButton = $("#predictButton");
const predictText = $("#predictText");
const predictSpinner = $("#predictSpinner");
const dropEmpty = $("#dropEmpty");
const previewState = $("#previewState");
const previewImage = $("#previewImage");
const previewName = $("#previewName");
const previewSize = $("#previewSize");
const uploadError = $("#uploadError");

const resultEmpty = $("#resultEmpty");
const resultContent = $("#resultContent");
const resultIcon = $("#resultIcon");
const resultTitle = $("#resultTitle");
const resultDescription = $("#resultDescription");
const resultConfidence = $("#resultConfidence");
const inferenceTime = $("#inferenceTime");
const inputSize = $("#inputSize");
const predictionList = $("#predictionList");
const resultSuggestion = $("#resultSuggestion");
const tryAgainButton = $("#tryAgainButton");

const imageModal = $("#imageModal");
const imageModalClose = $("#imageModalClose");
const modalImage = $("#modalImage");
const modalImageTitle = $("#modalImageTitle");

const cameraModal = $("#cameraModal");
const cameraClose = $("#cameraClose");
const cameraVideo = $("#cameraVideo");
const cameraCanvas = $("#cameraCanvas");
const captureButton = $("#captureButton");
const cameraError = $("#cameraError");

const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/bmp"
];

const MAX_FILE_SIZE = 8 * 1024 * 1024;

let selectedFile = null;
let previewUrl = null;
let cameraStream = null;


/* Navigation */

window.addEventListener("scroll", () => {
    topbar.classList.toggle("scrolled", window.scrollY > 30);
});

menuButton.addEventListener("click", () => {
    mobileMenu.classList.toggle("open");
});

$$(".mobile-menu a").forEach((link) => {
    link.addEventListener("click", () => {
        mobileMenu.classList.remove("open");
    });
});

document.addEventListener("click", (event) => {
    if (
        mobileMenu.classList.contains("open")
        && !mobileMenu.contains(event.target)
        && !menuButton.contains(event.target)
    ) {
        mobileMenu.classList.remove("open");
    }
});

const observedSections = $$("main section[id]");

const sectionObserver = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            $$(".desktop-nav a").forEach((link) => {
                link.classList.toggle(
                    "active",
                    link.getAttribute("href")
                    === `#${entry.target.id}`
                );
            });
        });
    },
    {
        rootMargin: "-30% 0px -60% 0px",
        threshold: 0
    }
);

observedSections.forEach((section) => {
    sectionObserver.observe(section);
});


/* Reveal and counters */

const revealObserver = new IntersectionObserver(
    (entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
        });
    },
    {
        threshold: 0.12
    }
);

$$(".reveal").forEach((element) => {
    revealObserver.observe(element);
});

function formatCounter(value, decimals) {
    if (decimals === 0) {
        return Math.round(value).toLocaleString("id-ID");
    }

    return value.toLocaleString("id-ID", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function animateCounter(element) {
    const target = Number(element.dataset.counter || 0);
    const decimals = Number(element.dataset.decimals || 0);
    const duration = 1100;
    const start = performance.now();

    function update(currentTime) {
        const progress = Math.min(
            (currentTime - start) / duration,
            1
        );

        const eased = 1 - Math.pow(1 - progress, 3);
        const value = target * eased;

        element.textContent = formatCounter(
            value,
            decimals
        );

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

const counterObserver = new IntersectionObserver(
    (entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            animateCounter(entry.target);
            observer.unobserve(entry.target);
        });
    },
    {
        threshold: 0.5
    }
);

$$("[data-counter]").forEach((counter) => {
    counterObserver.observe(counter);
});


/* Analytics tabs */

analyticsTabs.forEach((button) => {
    button.addEventListener("click", () => {
        const panelId = button.dataset.tab;

        analyticsTabs.forEach((item) => {
            item.classList.remove("active");
        });

        analyticsPanels.forEach((panel) => {
            panel.classList.remove("active");
        });

        button.classList.add("active");
        $(`#${panelId}`).classList.add("active");
    });
});


/* Image modal */

$$(".zoom-button").forEach((button) => {
    button.addEventListener("click", () => {
        modalImage.src = button.dataset.image;
        modalImageTitle.textContent =
            button.dataset.title || "Visual";
        imageModal.classList.add("open");
        document.body.style.overflow = "hidden";
    });
});

function closeImageModal() {
    imageModal.classList.remove("open");
    document.body.style.overflow = "";
}

imageModalClose.addEventListener("click", closeImageModal);

imageModal.addEventListener("click", (event) => {
    if (event.target === imageModal) {
        closeImageModal();
    }
});


/* Health status */

async function checkHealth() {
    try {
        const response = await fetch("/health");
        const data = await response.json();

        if (data.status === "ready") {
            modelStatus.className = "model-pill ready";
            $("span", modelStatus).textContent = "Model Online";
            footerModelStatus.textContent = "Ready";
        } else {
            modelStatus.className = "model-pill error";
            $("span", modelStatus).textContent = "Model Belum Ada";
            footerModelStatus.textContent = "Model missing";
        }

    } catch {
        modelStatus.className = "model-pill error";
        $("span", modelStatus).textContent = "Server Offline";
        footerModelStatus.textContent = "Offline";
    }
}


/* Upload helpers */

function formatFileSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function showUploadError(message) {
    uploadError.textContent = message;
    uploadError.classList.remove("hidden");
}

function hideUploadError() {
    uploadError.textContent = "";
    uploadError.classList.add("hidden");
}

function validateFile(file) {
    if (!file) {
        return "File gambar tidak ditemukan.";
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
        return "Format gambar harus JPG, JPEG, PNG, WEBP, atau BMP.";
    }

    if (file.size > MAX_FILE_SIZE) {
        return "Ukuran gambar maksimal adalah 8 MB.";
    }

    return null;
}

function releasePreviewUrl() {
    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
    }
}

function selectFile(file) {
    const validationError = validateFile(file);

    if (validationError) {
        showUploadError(validationError);
        return;
    }

    hideUploadError();
    releasePreviewUrl();

    selectedFile = file;
    previewUrl = URL.createObjectURL(file);

    previewImage.src = previewUrl;
    previewName.textContent = file.name;
    previewSize.textContent = formatFileSize(file.size);

    dropEmpty.classList.add("hidden");
    previewState.classList.remove("hidden");

    removeButton.disabled = false;
    predictButton.disabled = false;

    resetResult();
}

function resetUpload() {
    selectedFile = null;
    imageInput.value = "";
    releasePreviewUrl();

    previewImage.src = "";
    dropEmpty.classList.remove("hidden");
    previewState.classList.add("hidden");

    removeButton.disabled = true;
    predictButton.disabled = true;

    hideUploadError();
}

function resetResult() {
    resultEmpty.classList.remove("hidden");
    resultContent.classList.add("hidden");

    resultTitle.textContent = "—";
    resultConfidence.textContent = "0%";
    resultDescription.textContent = "";
    resultSuggestion.textContent = "";
    predictionList.innerHTML = "";
}

function setPredictLoading(isLoading) {
    predictButton.disabled =
        isLoading || selectedFile === null;

    predictText.textContent = isLoading
        ? "Menganalisis..."
        : "Analisis Gambar";

    predictSpinner.classList.toggle(
        "hidden",
        !isLoading
    );
}

chooseButton.addEventListener("click", () => {
    imageInput.click();
});

dropZone.addEventListener("click", (event) => {
    if (!event.target.closest("button")) {
        imageInput.click();
    }
});

dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        imageInput.click();
    }
});

imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];

    if (file) {
        selectFile(file);
    }
});

removeButton.addEventListener("click", () => {
    resetUpload();
    resetResult();
});

["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.add("drag-active");
    });
});

["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove("drag-active");
    });
});

dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];

    if (file) {
        selectFile(file);
    }
});


/* Prediction */

function createPredictionItem(item, index) {
    const wrapper = document.createElement("div");
    wrapper.className = "prediction-item";

    const rank = document.createElement("span");
    rank.className = "prediction-rank";
    rank.textContent = String(index + 1).padStart(2, "0");

    const name = document.createElement("span");
    name.className = "prediction-name";
    name.textContent = `${item.icon || ""} ${item.title}`.trim();

    const track = document.createElement("div");
    track.className = "progress-track";

    const fill = document.createElement("div");
    fill.className = "progress-fill";

    track.appendChild(fill);

    const value = document.createElement("span");
    value.className = "prediction-value";
    value.textContent =
        `${Number(item.confidence).toFixed(2)}%`;

    wrapper.append(rank, name, track, value);

    requestAnimationFrame(() => {
        fill.style.width =
            `${Math.min(100, Math.max(0, item.confidence))}%`;
    });

    return wrapper;
}

function renderPrediction(data) {
    const result = data.result;

    resultEmpty.classList.add("hidden");
    resultContent.classList.remove("hidden");

    resultIcon.textContent = result.icon || "🖼️";
    resultTitle.textContent = result.title;
    resultDescription.textContent = result.description;
    resultConfidence.textContent =
        `${Number(result.confidence).toFixed(2)}%`;
    resultSuggestion.textContent = result.suggestion;

    inferenceTime.textContent =
        `${Number(data.inference_ms).toFixed(1)} ms`;

    inputSize.textContent = Array.isArray(data.input_size)
        ? `${data.input_size[0]} × ${data.input_size[1]}`
        : "—";

    predictionList.innerHTML = "";

    (data.top_predictions || []).forEach(
        (item, index) => {
            predictionList.appendChild(
                createPredictionItem(item, index)
            );
        }
    );
}

async function predictImage() {
    if (!selectedFile) {
        showUploadError(
            "Silakan pilih gambar terlebih dahulu."
        );
        return;
    }

    hideUploadError();
    setPredictLoading(true);

    const formData = new FormData();
    formData.append("image", selectedFile);

    try {
        const response = await fetch("/predict", {
            method: "POST",
            body: formData
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                "Server tidak mengembalikan JSON yang valid."
            );
        }

        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                "Prediksi gagal dilakukan."
            );
        }

        renderPrediction(data);

        resultContent.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

    } catch (error) {
        showUploadError(
            error.message ||
            "Tidak dapat terhubung ke server Flask."
        );

    } finally {
        setPredictLoading(false);
    }
}

predictButton.addEventListener("click", predictImage);

tryAgainButton.addEventListener("click", () => {
    resetUpload();
    resetResult();

    dropZone.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
});


/* Camera */

async function openCamera() {
    cameraError.textContent = "";
    cameraModal.classList.add("open");
    document.body.style.overflow = "hidden";

    if (
        !navigator.mediaDevices
        || !navigator.mediaDevices.getUserMedia
    ) {
        cameraError.textContent =
            "Browser tidak mendukung akses kamera.";
        return;
    }

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment"
            },
            audio: false
        });

        cameraVideo.srcObject = cameraStream;

    } catch (error) {
        cameraError.textContent =
            "Kamera tidak dapat dibuka. Periksa izin browser.";
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach((track) => {
            track.stop();
        });

        cameraStream = null;
    }

    cameraVideo.srcObject = null;
}

function closeCamera() {
    stopCamera();
    cameraModal.classList.remove("open");
    document.body.style.overflow = "";
}

cameraButton.addEventListener("click", openCamera);
cameraClose.addEventListener("click", closeCamera);

cameraModal.addEventListener("click", (event) => {
    if (event.target === cameraModal) {
        closeCamera();
    }
});

captureButton.addEventListener("click", () => {
    if (!cameraVideo.videoWidth) {
        cameraError.textContent =
            "Kamera belum siap mengambil gambar.";
        return;
    }

    cameraCanvas.width = cameraVideo.videoWidth;
    cameraCanvas.height = cameraVideo.videoHeight;

    const context = cameraCanvas.getContext("2d");
    context.drawImage(
        cameraVideo,
        0,
        0,
        cameraCanvas.width,
        cameraCanvas.height
    );

    cameraCanvas.toBlob(
        (blob) => {
            if (!blob) {
                cameraError.textContent =
                    "Foto gagal diambil.";
                return;
            }

            const file = new File(
                [blob],
                `camera-${Date.now()}.jpg`,
                {
                    type: "image/jpeg"
                }
            );

            selectFile(file);
            closeCamera();
        },
        "image/jpeg",
        0.92
    );
});


/* Global escape key */

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
        return;
    }

    if (imageModal.classList.contains("open")) {
        closeImageModal();
    }

    if (cameraModal.classList.contains("open")) {
        closeCamera();
    }
});


/* Initialize */

resetUpload();
resetResult();
checkHealth();
