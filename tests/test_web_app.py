import io
import json
import struct
import unittest
import zlib
from pathlib import Path

import web_app


def png_bytes(width=1, height=1):
    def chunk(name, data):
        payload = name + data
        checksum = zlib.crc32(payload) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", checksum)

    rows = b"".join(b"\x00" + (b"\xff\xff\xff" * width) for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


class WebAppSmokeTests(unittest.TestCase):
    def setUp(self):
        self.client = web_app.app.test_client()

    def test_homepage_loads(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("gpt-image-2", response.get_data(as_text=True))

    def test_count_validation(self):
        response = self.client.post(
            "/api/generate",
            data={
                "prompt": "test",
                "n": "99",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Count must be from 1 to 10", response.get_json()["error"])

    def test_download_header(self):
        output_path = web_app.OUTPUT_DIR / "unit-download-test.png"
        web_app.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(png_bytes(32, 16))
        try:
            response = self.client.get(f"/outputs/{output_path.name}?download=1")
            self.assertEqual(response.status_code, 200)
            self.assertIn("attachment", response.headers.get("Content-Disposition", ""))
            response.close()
        finally:
            output_path.unlink(missing_ok=True)

    def test_upload_with_chinese_filename_is_saved(self):
        with web_app.app.test_request_context():
            storage = type(
                "Upload",
                (),
                {
                    "filename": "图片.png",
                    "save": lambda self, path: Path(path).write_bytes(b"test"),
                },
            )()
            with web_app.tempfile.TemporaryDirectory() as temp_dir:
                saved = web_app.save_uploads([storage], Path(temp_dir))
                self.assertEqual(len(saved), 1)
                self.assertTrue(saved[0].exists())

    def test_image_dimensions(self):
        output_path = web_app.OUTPUT_DIR / "unit-dimensions-test.png"
        web_app.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(png_bytes(1200, 600))
        try:
            self.assertEqual(web_app.image_dimensions(output_path), (1200, 600))
        finally:
            output_path.unlink(missing_ok=True)

    def test_build_prompt_includes_conversation_context(self):
        prompt, documents = web_app.build_prompt("make it blue", [], "User: make a red bottle")
        self.assertIn("Conversation context", prompt)
        self.assertIn("make a red bottle", prompt)
        self.assertIn("Current request", prompt)
        self.assertIn("make it blue", prompt)
        self.assertEqual(documents, [])

    def test_previous_images_are_copied_from_outputs_only(self):
        web_app.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        source = web_app.OUTPUT_DIR / "unit-context-image.png"
        source.write_bytes(png_bytes(24, 24))
        try:
            with web_app.tempfile.TemporaryDirectory() as temp_dir:
                copied = web_app.save_previous_images(
                    json.dumps(["/outputs/unit-context-image.png", "/outputs/../secret.png"]),
                    Path(temp_dir),
                )
                self.assertEqual(len(copied), 1)
                self.assertTrue(copied[0].exists())
                self.assertEqual(copied[0].name, "context-1.png")
        finally:
            source.unlink(missing_ok=True)

    def test_batch_per_image_runs_once_per_uploaded_image(self):
        def fake_run_generation(args):
            output_dir = Path(args.output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / "mock-result.png"
            output_path.write_bytes(png_bytes(20, 20))
            image_dir = Path(args.image)
            self.assertEqual(len(list(image_dir.glob("*"))), 1)
            return [output_path]

        first = io.BytesIO(png_bytes(20, 20))
        second = io.BytesIO(png_bytes(20, 20))

        original_run_generation = web_app.run_generation
        calls = []

        def recording_run_generation(args):
            calls.append(args)
            return fake_run_generation(args)

        web_app.run_generation = recording_run_generation
        try:
            response = self.client.post(
                "/api/generate",
                data={
                    "prompt": "Create a clean ecommerce main image for each product.",
                    "batch_per_image": "on",
                    "n": "1",
                    "images": [(first, "product-a.png"), (second, "product-b.png")],
                },
                content_type="multipart/form-data",
            )
        finally:
            web_app.run_generation = original_run_generation

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["batch"])
        self.assertEqual(len(payload["images"]), 2)
        self.assertEqual(len(payload["batch_items"]), 2)
        self.assertEqual(len(calls), 2)


if __name__ == "__main__":
    unittest.main()
