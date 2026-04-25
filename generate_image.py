import argparse
import base64
import mimetypes
import os
import re
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv


DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-image-2"
SCRIPT_DIR = Path(__file__).resolve().parent
SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def normalize_base_url(base_url: str) -> str:
    base_url = base_url.rstrip("/")
    if base_url.endswith("/v1"):
        return base_url
    return f"{base_url}/v1"


def read_prompt(args: argparse.Namespace) -> str:
    if args.prompt_file:
        return Path(args.prompt_file).read_text(encoding="utf-8").strip()
    return args.prompt.strip()


def slugify(text: str, max_length: int = 42) -> str:
    text = re.sub(r"\s+", "-", text.strip().lower())
    text = re.sub(r"[^a-z0-9._-]+", "", text)
    return text[:max_length].strip("-._") or "image"


def infer_extension(url: str, fallback: str) -> str:
    path = urlparse(url).path.lower()
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        if path.endswith(ext):
            return "jpg" if ext == ".jpeg" else ext.lstrip(".")
    return fallback


def save_base64_image(b64_json: str, output_path: Path) -> None:
    output_path.write_bytes(base64.b64decode(b64_json))


def save_url_image(url: str, output_path: Path) -> None:
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    output_path.write_bytes(response.content)


def make_session(args: argparse.Namespace) -> requests.Session:
    session = requests.Session()
    if args.no_proxy:
        session.trust_env = False
    return session


def collect_input_images(image_path: Optional[str]) -> list[Path]:
    if not image_path:
        return []

    path = Path(image_path)
    if path.is_file():
        if path.suffix.lower() not in SUPPORTED_IMAGE_EXTENSIONS:
            raise RuntimeError(f"Unsupported image file type: {path}")
        return [path]

    if path.is_dir():
        images = sorted(
            item
            for item in path.iterdir()
            if item.is_file() and item.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS
        )
        if not images:
            allowed = ", ".join(sorted(SUPPORTED_IMAGE_EXTENSIONS))
            raise RuntimeError(f"No supported images found in {path}. Supported types: {allowed}")
        return images

    raise RuntimeError(f"Input image path not found: {path}")


def build_payload(args: argparse.Namespace, model: str) -> dict:
    payload = {
        "model": model,
        "prompt": read_prompt(args),
        "size": args.size,
    }

    if args.n != 1:
        payload["n"] = args.n
    if args.quality:
        payload["quality"] = args.quality
    if args.format:
        payload["output_format"] = args.format
    if args.background:
        payload["background"] = args.background
    if args.moderation:
        payload["moderation"] = args.moderation

    return payload


def clone_args_with_n(args: argparse.Namespace, n: int) -> argparse.Namespace:
    copied = argparse.Namespace(**vars(args))
    copied.n = n
    return copied


def print_request_debug(endpoint: str, payload: dict, image_paths: list[Path]) -> None:
    visible_payload = dict(payload)
    if len(visible_payload["prompt"]) > 120:
        visible_payload["prompt"] = f"{visible_payload['prompt'][:120]}..."
    print(f"Endpoint: {endpoint}")
    print(f"Payload: {visible_payload}")
    if image_paths:
        print(f"Images: {len(image_paths)}")
        for image_path in image_paths:
            print(f"  - {image_path}")
    print("Request started...")


def post_image_generation(
    session: requests.Session,
    endpoint: str,
    api_key: str,
    payload: dict,
) -> requests.Response:
    return session.post(
        endpoint,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=300,
    )


def post_image_edit(
    session: requests.Session,
    endpoint: str,
    api_key: str,
    payload: dict,
    image_paths: list[Path],
) -> requests.Response:
    open_files = []
    try:
        files = []
        field_name = "image" if len(image_paths) == 1 else "image[]"
        for image_path in image_paths:
            mime_type = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
            image_file = image_path.open("rb")
            open_files.append(image_file)
            files.append((field_name, (image_path.name, image_file, mime_type)))

        return session.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {api_key}",
            },
            data=payload,
            files=files,
            timeout=300,
        )
    finally:
        for image_file in open_files:
            image_file.close()


def create_image(args: argparse.Namespace) -> dict:
    api_key = getattr(args, "api_key", None) or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is missing. Put it in .env or set it in the shell.")

    base_url = normalize_base_url(getattr(args, "base_url", None) or os.getenv("OPENAI_BASE_URL", DEFAULT_BASE_URL))
    model = args.model or os.getenv("GPT_IMAGE_MODEL", DEFAULT_MODEL)
    image_paths = collect_input_images(args.image)
    endpoint = f"{base_url}/images/edits" if image_paths else f"{base_url}/images/generations"
    payload = build_payload(args, model)
    session = make_session(args)

    if args.verbose:
        print_request_debug(endpoint, payload, image_paths)
        if args.no_proxy:
            print("Proxy: disabled")

    started_at = time.perf_counter()
    if image_paths:
        response = post_image_edit(session, endpoint, api_key, payload, image_paths)
    else:
        response = post_image_generation(session, endpoint, api_key, payload)
    elapsed = time.perf_counter() - started_at

    if args.verbose:
        print(f"Request finished in {elapsed:.1f}s")
        print(f"HTTP status: {response.status_code}")

    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        raise RuntimeError(f"Image request failed: {response.status_code} {response.text}") from exc

    result = response.json()
    if args.verbose:
        items = result.get("data", [])
        print(f"Response image items: {len(items)}")
        for index, item in enumerate(items, start=1):
            fields = []
            if item.get("b64_json"):
                fields.append(f"b64_json_len={len(item['b64_json'])}")
            if item.get("url"):
                fields.append("url=yes")
            if item.get("revised_prompt"):
                fields.append("revised_prompt=yes")
            print(f"Item {index}: {', '.join(fields) or 'no image fields'}")

    return result


def save_images(result: dict, args: argparse.Namespace, batch_index: int = 0) -> list[Path]:
    prompt = read_prompt(args)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    prefix = f"{timestamp}-{slugify(prompt)}"
    if batch_index:
        prefix = f"{prefix}-batch{batch_index:02d}"
    paths: list[Path] = []

    for index, item in enumerate(result.get("data", []), start=1):
        ext = args.format or "png"
        if item.get("url"):
            ext = infer_extension(item["url"], ext)

        output_path = output_dir / f"{prefix}-{index}.{ext}"
        if item.get("b64_json"):
            save_base64_image(item["b64_json"], output_path)
        elif item.get("url"):
            save_url_image(item["url"], output_path)
        else:
            raise RuntimeError(f"Image item {index} has neither b64_json nor url: {item}")

        paths.append(output_path)

    if not paths:
        raise RuntimeError(f"No image data returned: {result}")
    return paths


def run_generation(args: argparse.Namespace) -> list[Path]:
    image_paths = collect_input_images(args.image)
    if not image_paths:
        result = create_image(args)
        return save_images(result, args)

    all_paths: list[Path] = []
    total = args.n
    for batch_index in range(1, total + 1):
        request_args = clone_args_with_n(args, 1)
        if args.verbose and total > 1:
            print(f"Image request batch {batch_index}/{total}")
        result = create_image(request_args)
        all_paths.extend(save_images(result, args, batch_index if total > 1 else 0))
    return all_paths


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate images with a GPT Image-compatible API.")
    prompt_group = parser.add_mutually_exclusive_group(required=True)
    prompt_group.add_argument("--prompt", help="Text prompt for the image.")
    prompt_group.add_argument("--prompt-file", help="Read the text prompt from a UTF-8 file.")

    parser.add_argument("--model", help="Image model name. Defaults to GPT_IMAGE_MODEL or gpt-image-2.")
    parser.add_argument("--api-key", help="API key override. If omitted, OPENAI_API_KEY from .env is used.")
    parser.add_argument("--base-url", help="Base URL override. If omitted, OPENAI_BASE_URL from .env is used.")
    parser.add_argument("--size", default="1024x1024", help="Image size, such as 1024x1024 or 1536x1024.")
    parser.add_argument("--quality", choices=["auto", "low", "medium", "high"])
    parser.add_argument("--format", choices=["png", "jpeg", "webp"])
    parser.add_argument("--background", choices=["auto", "transparent", "opaque"])
    parser.add_argument("--moderation", choices=["auto", "low"])
    parser.add_argument("--n", default=1, type=int, help="Number of images to generate, 1 to 10.")
    parser.add_argument("--output-dir", default="outputs", help="Directory for generated images.")
    parser.add_argument(
        "--image",
        help="Optional input image file or folder. If a folder is passed, all png/jpg/jpeg/webp images are uploaded.",
    )
    parser.add_argument("--no-proxy", action="store_true", help="Do not use proxy settings from the environment.")
    parser.add_argument("--verbose", action="store_true", help="Print request timing and response summary.")
    return parser.parse_args()


def main() -> int:
    load_dotenv(SCRIPT_DIR / ".env")
    args = parse_args()

    if not 1 <= args.n <= 10:
        print("--n must be between 1 and 10.", file=sys.stderr)
        return 2
    model = args.model or os.getenv("GPT_IMAGE_MODEL", DEFAULT_MODEL)
    if model == "gpt-image-2" and args.background == "transparent":
        print('gpt-image-2 does not support --background transparent.', file=sys.stderr)
        return 2

    try:
        paths = run_generation(args)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    for path in paths:
        print(f"Saved: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
