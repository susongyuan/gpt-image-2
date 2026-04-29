import json
import os
import shutil
import tempfile
import time
from argparse import Namespace
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_from_directory
from werkzeug.utils import secure_filename

from generate_image import DEFAULT_BASE_URL, DEFAULT_MODEL, SCRIPT_DIR, run_generation


load_dotenv(SCRIPT_DIR / ".env")

OUTPUT_DIR = SCRIPT_DIR / "outputs"
SUPPORTED_DOCUMENT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".pdf", ".docx"}
MAX_DOCUMENT_CHARS = 12000
MAX_CONTEXT_CHARS = 6000
MAX_CONTEXT_IMAGES = 4
ALLOWED_QUALITIES = {"", "auto", "low", "medium", "high"}
ALLOWED_FORMATS = {"", "png", "jpeg", "webp"}
ALLOWED_BACKGROUNDS = {"", "auto", "opaque"}
ALLOWED_MODERATIONS = {"", "auto", "low"}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024 * 1024
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0


def asset_version() -> int:
    assets = [
        SCRIPT_DIR / "static" / "app.css",
        SCRIPT_DIR / "static" / "app.js",
        SCRIPT_DIR / "templates" / "index.html",
    ]
    existing = [path.stat().st_mtime for path in assets if path.exists()]
    return int(max(existing) if existing else time.time())


@app.after_request
def disable_cache(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def read_text_file(path: Path) -> str:
    for encoding in ("utf-8", "utf-8-sig", "gbk"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="ignore")


def read_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PDF support requires pypdf. Run: pip install -r requirements.txt") from exc

    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n\n".join(pages)


def read_docx(path: Path) -> str:
    try:
        from docx import Document
    except ImportError as exc:
        raise RuntimeError("DOCX support requires python-docx. Run: pip install -r requirements.txt") from exc

    document = Document(str(path))
    return "\n".join(paragraph.text for paragraph in document.paragraphs if paragraph.text.strip())


def extract_document_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_DOCUMENT_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_DOCUMENT_EXTENSIONS))
        raise RuntimeError(f"Unsupported document type: {path.name}. Supported types: {allowed}")
    if suffix == ".pdf":
        return read_pdf(path)
    if suffix == ".docx":
        return read_docx(path)
    return read_text_file(path)


def save_uploads(files, target_dir: Path) -> list[Path]:
    target_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for index, upload in enumerate(files, start=1):
        if not upload or not upload.filename:
            continue
        filename = secure_filename(upload.filename)
        if not filename:
            suffix = Path(upload.filename).suffix.lower()
            filename = f"upload-{index}{suffix}"
        path = target_dir / filename
        if path.exists():
            suffix = path.suffix
            stem = path.stem or "upload"
            path = target_dir / f"{stem}-{index}{suffix}"
        upload.save(path)
        saved.append(path)
    return saved


def clipped_context(value: Optional[str]) -> str:
    if not value:
        return ""
    cleaned = value.strip()
    if not cleaned:
        return ""
    return cleaned[:MAX_CONTEXT_CHARS]


def build_prompt(prompt: str, document_paths: list[Path], conversation_context: str = "") -> tuple[str, list[dict]]:
    prompt_parts = []
    context = clipped_context(conversation_context)
    if context:
        prompt_parts.append(
            "Conversation context from the current local chat. Use it only to understand references like "
            "'the previous image', 'same style', or 'change it'. The current request below has priority.\n"
            f"{context}"
        )
    if prompt.strip():
        prompt_parts.append(f"Current request:\n{prompt.strip()}")
    document_summaries = []
    remaining = MAX_DOCUMENT_CHARS

    for document_path in document_paths:
        text = extract_document_text(document_path).strip()
        if not text:
            document_summaries.append({"name": document_path.name, "chars": 0})
            continue
        clipped = text[:remaining]
        remaining -= len(clipped)
        document_summaries.append({"name": document_path.name, "chars": len(text)})
        prompt_parts.append(
            "\nDocument context. Use this as creative direction for the generated image; "
            "do not render long document text literally unless the user asks for text in the image.\n"
            f"[{document_path.name}]\n{clipped}"
        )
        if remaining <= 0:
            break

    combined = "\n\n".join(part for part in prompt_parts if part.strip()).strip()
    if not combined:
        raise RuntimeError("Enter a prompt or upload at least one readable document.")
    return combined, document_summaries


def output_path_from_url(value: str) -> Optional[Path]:
    if not value:
        return None
    prefix = "/outputs/"
    if value.startswith(prefix):
        filename = value[len(prefix) :].split("?", 1)[0]
    else:
        filename = value.split("?", 1)[0]
    if "/" in filename or "\\" in filename:
        return None
    candidate = (OUTPUT_DIR / filename).resolve()
    output_root = OUTPUT_DIR.resolve()
    try:
        if os.path.commonpath([str(output_root), str(candidate)]) != str(output_root):
            return None
    except ValueError:
        return None
    if candidate.is_file() and candidate.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
        return candidate
    return None


def save_previous_images(raw_value: Optional[str], target_dir: Path) -> list[Path]:
    if not raw_value:
        return []
    try:
        values = json.loads(raw_value)
    except json.JSONDecodeError:
        values = []
    if not isinstance(values, list):
        values = []

    target_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    seen = set()
    for index, value in enumerate(values, start=1):
        if len(saved) >= MAX_CONTEXT_IMAGES or not isinstance(value, str):
            continue
        source = output_path_from_url(value)
        if not source or source in seen:
            continue
        seen.add(source)
        target = target_dir / f"context-{index}{source.suffix.lower()}"
        while target.exists():
            target = target_dir / f"{target.stem}-{index}{target.suffix}"
        shutil.copy2(source, target)
        saved.append(target)
    return saved


def blank_to_none(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


def parse_count(value: Optional[str]) -> int:
    try:
        count = int(value or 1)
    except ValueError as exc:
        raise RuntimeError("Count must be a number from 1 to 10.") from exc
    if not 1 <= count <= 10:
        raise RuntimeError("Count must be from 1 to 10.")
    return count


def validated_choice(name: str, value: Optional[str], allowed: set[str]) -> Optional[str]:
    value = blank_to_none(value)
    normalized = value or ""
    if normalized not in allowed:
        allowed_text = ", ".join(item or "Default" for item in sorted(allowed))
        raise RuntimeError(f"{name} must be one of: {allowed_text}.")
    return value


def build_generation_args(
    prompt: str,
    image_dir: Optional[Path],
    *,
    output_dir: Optional[Path] = None,
) -> Namespace:
    form = request.form
    return Namespace(
        prompt=prompt,
        prompt_file=None,
        model=blank_to_none(form.get("model")) or os.getenv("GPT_IMAGE_MODEL", DEFAULT_MODEL),
        api_key=blank_to_none(form.get("api_key")),
        base_url=blank_to_none(form.get("base_url")) or os.getenv("OPENAI_BASE_URL", DEFAULT_BASE_URL),
        size=blank_to_none(form.get("size")) or "1024x1024",
        quality=validated_choice("Quality", form.get("quality"), ALLOWED_QUALITIES),
        format=validated_choice("Format", form.get("format"), ALLOWED_FORMATS),
        background=validated_choice("Background", form.get("background"), ALLOWED_BACKGROUNDS),
        moderation=validated_choice("Moderation", form.get("moderation"), ALLOWED_MODERATIONS),
        n=parse_count(form.get("n")),
        output_dir=str(output_dir or OUTPUT_DIR),
        image=str(image_dir) if image_dir else None,
        no_proxy=form.get("no_proxy") == "on",
        verbose=False,
    )


def copy_single_image_to_dir(source: Path, target_dir: Path) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / source.name
    if target.exists():
        target = target_dir / f"{source.stem}-1{source.suffix}"
    shutil.copy2(source, target)
    return target


def image_dimensions(path: Path) -> tuple[Optional[int], Optional[int]]:
    try:
        header = path.read_bytes()[:64]
    except Exception:
        header = b""

    if header.startswith(b"\x89PNG\r\n\x1a\n") and len(header) >= 24:
        return int.from_bytes(header[16:20], "big"), int.from_bytes(header[20:24], "big")

    try:
        from PIL import Image
    except Exception:
        return None, None

    try:
        with Image.open(path) as image:
            return image.width, image.height
    except Exception:
        return None, None


def image_response(path: Path) -> dict:
    width, height = image_dimensions(path)
    try:
        relative = path.resolve().relative_to(OUTPUT_DIR.resolve()).as_posix()
    except ValueError:
        relative = path.name
    return {
        "filename": path.name,
        "url": f"/outputs/{relative}",
        "download_url": f"/outputs/{relative}?download=1",
        "width": width,
        "height": height,
    }


@app.get("/")
def index():
    return render_template(
        "index.html",
        default_base_url=os.getenv("OPENAI_BASE_URL", DEFAULT_BASE_URL),
        default_model=os.getenv("GPT_IMAGE_MODEL", DEFAULT_MODEL),
        asset_version=asset_version(),
    )


@app.post("/api/generate")
def generate():
    try:
        with tempfile.TemporaryDirectory(prefix="gpt-image-2-") as temp_dir:
            temp_path = Path(temp_dir)
            image_dir = temp_path / "images"
            document_dir = temp_path / "documents"

            image_paths = save_uploads(request.files.getlist("images"), image_dir)
            batch_per_image = request.form.get("batch_per_image") == "on" and len(image_paths) > 1
            previous_image_paths = [] if batch_per_image else save_previous_images(request.form.get("previous_image_urls"), image_dir)
            document_paths = save_uploads(request.files.getlist("documents"), document_dir)
            combined_prompt, document_summaries = build_prompt(
                request.form.get("prompt", ""),
                document_paths,
                request.form.get("conversation_context", ""),
            )
            paths = []
            batch_items = []

            if batch_per_image:
                batch_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{temp_path.name.rsplit('-', 1)[-1]}"
                batch_output_dir = OUTPUT_DIR / f"batch-{batch_id}"
                for index, image_path in enumerate(image_paths, start=1):
                    item_dir = temp_path / "batch_images" / f"{index:03d}"
                    copy_single_image_to_dir(image_path, item_dir)
                    item_output_dir = batch_output_dir / f"{index:03d}-{image_path.stem[:40]}"
                    args = build_generation_args(combined_prompt, item_dir, output_dir=item_output_dir)
                    item_paths = run_generation(args)
                    paths.extend(item_paths)
                    batch_items.append({"source": image_path.name, "images": len(item_paths)})
            else:
                all_image_paths = image_paths + previous_image_paths
                args = build_generation_args(combined_prompt, image_dir if all_image_paths else None)
                paths = run_generation(args)

            images = [image_response(path) for path in paths]

        return jsonify(
            {
                "ok": True,
                "images": images,
                "batch": batch_per_image,
                "batch_items": batch_items,
                "documents": document_summaries,
                "context_images": len(previous_image_paths),
                "context_chars": len(clipped_context(request.form.get("conversation_context", ""))),
                "prompt_chars": len(combined_prompt),
            }
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


@app.get("/outputs/<path:filename>")
def output_file(filename: str):
    return send_from_directory(OUTPUT_DIR, filename, as_attachment=request.args.get("download") == "1")


@app.get("/favicon.ico")
def favicon():
    return "", 204


if __name__ == "__main__":
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    app.run(host="127.0.0.1", port=7860, debug=False)
