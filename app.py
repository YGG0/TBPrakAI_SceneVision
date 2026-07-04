from __future__ import annotations

import csv
import io
import json
import os
import pickle
import time
from datetime import datetime
from pathlib import Path
from typing import Any

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np
from flask import Flask, jsonify, render_template, request
from PIL import Image, UnidentifiedImageError

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = STATIC_DIR / "data"
ANALYTICS_PATH = DATA_DIR / "analytics.json"
MONITORING_PATH = DATA_DIR / "prediction_monitoring.csv"

DEFAULT_CLASS_INDICES = {
    "buildings": 0,
    "forest": 1,
    "glacier": 2,
    "mountain": 3,
    "sea": 4,
    "street": 5,
}

CLASS_INFO = {
    "buildings": {
        "display_name": "Bangunan",
        "description": "Gambar didominasi gedung, rumah, fasad, atau struktur buatan manusia.",
        "suggestion": "Gunakan gambar yang menampilkan bentuk geometris, jendela, dan fasad dengan jelas.",
        "icon": "🏙️",
    },
    "forest": {
        "display_name": "Hutan",
        "description": "Gambar menunjukkan area alami yang didominasi pepohonan dan vegetasi rapat.",
        "suggestion": "Pastikan dedaunan, batang pohon, dan area hijau tidak terlalu buram.",
        "icon": "🌲",
    },
    "glacier": {
        "display_name": "Gletser",
        "description": "Gambar menunjukkan bentang es, salju tebal, atau gletser.",
        "suggestion": "Gletser dapat mirip gunung bersalju; tampilkan area es secara dominan.",
        "icon": "🧊",
    },
    "mountain": {
        "display_name": "Gunung",
        "description": "Gambar menunjukkan puncak, lereng, atau rangkaian pegunungan.",
        "suggestion": "Gunakan gambar dengan kontur puncak dan lereng yang terlihat jelas.",
        "icon": "⛰️",
    },
    "sea": {
        "display_name": "Laut",
        "description": "Gambar menunjukkan perairan luas, pantai, ombak, atau horizon laut.",
        "suggestion": "Horizon dan area air yang luas membantu model mengenali kelas laut.",
        "icon": "🌊",
    },
    "street": {
        "display_name": "Jalan",
        "description": "Gambar menunjukkan jalan, trotoar, kendaraan, atau kawasan perkotaan.",
        "suggestion": "Marka jalan dan perspektif memanjang sebaiknya terlihat jelas.",
        "icon": "🛣️",
    },
}

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "bmp"}
MAX_FILE_SIZE = 8 * 1024 * 1024

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE

model: Any | None = None
model_error: str | None = None
class_indices: dict[str, int] = DEFAULT_CLASS_INDICES.copy()
model_metadata: dict[str, Any] = {}
model_input_size = (150, 150)


def read_json(path: Path, default: Any) -> Any:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        pass
    return default


def find_first_existing(paths: list[Path]) -> Path | None:
    return next((path for path in paths if path.exists()), None)


def load_analytics() -> dict[str, Any]:
    return read_json(ANALYTICS_PATH, {})


def load_metadata() -> dict[str, Any]:
    candidates = [
        MODEL_DIR / "model_metadata.json",
        BASE_DIR / "model_metadata.json",
    ]
    path = find_first_existing(candidates)
    return read_json(path, {}) if path else {}


def load_class_indices() -> dict[str, int]:
    candidates = [
        MODEL_DIR / "class_indices.json",
        BASE_DIR / "class_indices.json",
        MODEL_DIR / "class_indices.pkl",
        BASE_DIR / "class_indices.pkl",
    ]

    path = find_first_existing(candidates)
    if path is None:
        return DEFAULT_CLASS_INDICES.copy()

    if path.suffix.lower() == ".json":
        loaded: Any = json.loads(path.read_text(encoding="utf-8"))
    else:
        with path.open("rb") as file:
            loaded = pickle.load(file)

    normalized = {
        str(name): int(index)
        for name, index in loaded.items()
    }

    if sorted(normalized.values()) != list(range(len(normalized))):
        raise ValueError("Indeks kelas harus berurutan mulai dari 0.")

    return normalized


def resolve_input_size(loaded_model: Any) -> tuple[int, int]:
    shape = loaded_model.input_shape

    if isinstance(shape, list):
        shape = shape[0]

    try:
        height = int(shape[1])
        width = int(shape[2])
        if height > 0 and width > 0:
            return width, height
    except (TypeError, ValueError, IndexError):
        pass

    metadata_size = model_metadata.get("image_size", [150, 150])

    try:
        height = int(metadata_size[0])
        width = int(metadata_size[1])
        return width, height
    except (TypeError, ValueError, IndexError):
        return 150, 150


def get_model() -> Any | None:
    global model
    global model_error
    global class_indices
    global model_metadata
    global model_input_size

    if model is not None:
        return model

    candidates = [
        MODEL_DIR / "scene_classifier.keras",
        BASE_DIR / "scene_classifier.keras",
        MODEL_DIR / "scene_classifier.h5",
        BASE_DIR / "scene_classifier.h5",
    ]

    model_path = find_first_existing(candidates)

    if model_path is None:
        model_error = (
            "Model belum ditemukan. Salin scene_classifier.keras "
            "ke folder models."
        )
        return None

    try:
        import tensorflow as tf

        model_metadata = load_metadata()
        class_indices = load_class_indices()
        model = tf.keras.models.load_model(model_path, compile=False)

        output_size = int(model.output_shape[-1])

        if output_size != len(class_indices):
            raise ValueError(
                f"Output model {output_size} kelas, tetapi mapping "
                f"berisi {len(class_indices)} kelas."
            )

        model_input_size = resolve_input_size(model)
        model_error = None
        return model

    except Exception as error:
        model = None
        model_error = f"Model gagal dimuat: {error}"
        return None


def allowed_file(filename: str) -> bool:
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower()
        in ALLOWED_EXTENSIONS
    )


def preprocess_image(raw_bytes: bytes) -> np.ndarray:
    try:
        with Image.open(io.BytesIO(raw_bytes)) as verification_image:
            verification_image.verify()

        with Image.open(io.BytesIO(raw_bytes)) as image:
            image = image.convert("RGB")
            image = image.resize(
                model_input_size,
                Image.Resampling.LANCZOS,
            )
            array = np.asarray(image, dtype=np.float32) / 255.0

    except (UnidentifiedImageError, OSError) as error:
        raise ValueError(
            "File tidak dapat dibaca sebagai gambar yang valid."
        ) from error

    return np.expand_dims(array, axis=0)


def append_monitoring_log(
    filename: str,
    predicted_class: str,
    confidence: float,
    inference_ms: float,
) -> None:
    MONITORING_PATH.parent.mkdir(parents=True, exist_ok=True)
    file_exists = MONITORING_PATH.exists()

    try:
        with MONITORING_PATH.open(
            "a",
            newline="",
            encoding="utf-8",
        ) as file:
            writer = csv.writer(file)

            if not file_exists:
                writer.writerow([
                    "timestamp",
                    "filename",
                    "predicted_class",
                    "confidence",
                    "inference_time_ms",
                ])

            writer.writerow([
                datetime.now().isoformat(timespec="seconds"),
                filename,
                predicted_class,
                f"{confidence:.6f}",
                f"{inference_ms:.2f}",
            ])
    except OSError:
        # Logging tidak boleh menggagalkan prediksi.
        pass


@app.get("/")
def index():
    return render_template(
        "index.html",
        analytics=load_analytics(),
        metadata=load_metadata(),
    )


@app.get("/health")
def health():
    loaded_model = get_model()

    return jsonify({
        "status": (
            "ready"
            if loaded_model is not None
            else "model_missing"
        ),
        "message": model_error,
        "classes": [
            name
            for name, _ in sorted(
                class_indices.items(),
                key=lambda item: item[1],
            )
        ],
        "input_size": list(model_input_size),
        "metadata": model_metadata,
    })


@app.get("/api/analytics")
def analytics_api():
    return jsonify(load_analytics())


@app.post("/predict")
def predict():
    loaded_model = get_model()

    if loaded_model is None:
        return jsonify({
            "success": False,
            "message": model_error,
        }), 503

    uploaded = request.files.get("image")

    if uploaded is None or uploaded.filename == "":
        return jsonify({
            "success": False,
            "message": "Silakan pilih gambar terlebih dahulu.",
        }), 400

    if not allowed_file(uploaded.filename):
        return jsonify({
            "success": False,
            "message": (
                "Format gambar harus JPG, JPEG, PNG, WEBP, atau BMP."
            ),
        }), 400

    raw_bytes = uploaded.read()

    if not raw_bytes:
        return jsonify({
            "success": False,
            "message": "File gambar kosong.",
        }), 400

    try:
        input_tensor = preprocess_image(raw_bytes)

        start_time = time.perf_counter()
        raw_prediction = loaded_model.predict(
            input_tensor,
            verbose=0,
        )
        inference_ms = (
            time.perf_counter() - start_time
        ) * 1000

        probabilities = np.asarray(
            raw_prediction[0],
            dtype=np.float64,
        )

        if (
            probabilities.ndim != 1
            or len(probabilities) != len(class_indices)
        ):
            raise ValueError(
                "Bentuk output model tidak sesuai jumlah kelas."
            )

        probability_sum = probabilities.sum()

        if probability_sum <= 0:
            raise ValueError(
                "Model menghasilkan probabilitas tidak valid."
            )

        probabilities = probabilities / probability_sum

    except ValueError as error:
        return jsonify({
            "success": False,
            "message": str(error),
        }), 400

    except Exception as error:
        return jsonify({
            "success": False,
            "message": f"Prediksi gagal dijalankan: {error}",
        }), 500

    index_to_class = {
        index: name
        for name, index in class_indices.items()
    }

    ranked_indices = np.argsort(probabilities)[::-1]
    predicted_index = int(ranked_indices[0])
    predicted_class = index_to_class[predicted_index]
    confidence_ratio = float(
        probabilities[predicted_index]
    )

    predicted_info = CLASS_INFO.get(
        predicted_class,
        {
            "display_name": predicted_class.title(),
            "description": "Kelas pemandangan hasil prediksi.",
            "suggestion": (
                "Gunakan gambar terang dengan objek utama jelas."
            ),
            "icon": "🖼️",
        },
    )

    predictions = []

    for index in ranked_indices:
        class_name = index_to_class[int(index)]
        info = CLASS_INFO.get(
            class_name,
            {
                "display_name": class_name.title(),
                "icon": "🖼️",
            },
        )

        predictions.append({
            "class_name": class_name,
            "title": info["display_name"],
            "icon": info.get("icon", "🖼️"),
            "confidence": round(
                float(probabilities[int(index)]) * 100,
                2,
            ),
        })

    append_monitoring_log(
        uploaded.filename,
        predicted_class,
        confidence_ratio,
        inference_ms,
    )

    return jsonify({
        "success": True,
        "result": {
            "class_name": predicted_class,
            "title": predicted_info["display_name"],
            "icon": predicted_info.get("icon", "🖼️"),
            "confidence": round(
                confidence_ratio * 100,
                2,
            ),
            "description": predicted_info["description"],
            "suggestion": predicted_info["suggestion"],
        },
        "top_predictions": predictions[:3],
        "all_predictions": predictions,
        "inference_ms": round(inference_ms, 2),
        "input_size": list(model_input_size),
    })


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify({
        "success": False,
        "message": "Ukuran gambar terlalu besar. Maksimal 8 MB.",
    }), 413


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True,
        use_reloader=False,
    )
