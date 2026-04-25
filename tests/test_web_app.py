import io
import unittest
from pathlib import Path

from PIL import Image

import web_app


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
        Image.new("RGB", (32, 16), "white").save(output_path)
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
        image_bytes = io.BytesIO()
        Image.new("RGB", (1200, 600), "white").save(image_bytes, format="PNG")
        output_path = web_app.OUTPUT_DIR / "unit-dimensions-test.png"
        web_app.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(image_bytes.getvalue())
        try:
            self.assertEqual(web_app.image_dimensions(output_path), (1200, 600))
        finally:
            output_path.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
