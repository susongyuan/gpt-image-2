# gpt-image-2 Image Generation CLI

A small Python command-line tool for generating images with a GPT Image-compatible API.

It supports:

- A local web interface
- Text-to-image generation with `/v1/images/generations`
- Image-guided generation with `/v1/images/edits`
- Document-guided generation from `.txt`, `.md`, `.csv`, `.json`, `.pdf`, and `.docx`
- Single reference image input
- Folder-based reference image input
- Multiple output images with `--n`
- OpenAI-compatible custom API base URLs
- Verbose request logging without printing your API key

## Project Structure

```text
gpt-image-2/
├── generate_image.py
├── web_app.py
├── prompt.txt
├── templates/
│   └── index.html
├── static/
│   ├── app.css
│   └── app.js
├── reference_images/
│   └── README.md
├── outputs/
│   └── .gitkeep
├── .env.example
├── .gitignore
├── requirements.txt
├── LICENSE
└── README.md
```

Generated images are saved to `outputs/`. Input reference images can be placed in `reference_images/`.

## Installation

Python 3.9 or newer is recommended.

```powershell
cd gpt-image-2
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set your API key:

```env
OPENAI_API_KEY=sk-your-api-key
OPENAI_BASE_URL=https://your-provider.example.com/v1
GPT_IMAGE_MODEL=gpt-image-2
```

If you use the official OpenAI API, keep:

```env
OPENAI_BASE_URL=https://api.openai.com/v1
```

## Chat Web Interface

Start the local web app:

```powershell
python web_app.py
```

Open:

```text
http://127.0.0.1:7860
```

The page supports:

- Chat-style generation
- Local conversation history
- Enter-to-send and Shift+Enter for new lines
- Chinese and English interface language
- Selectable interface fonts
- Result previews preserve each generated image's aspect ratio
- Open and download controls for every generated image
- Prompt input
- Reference image uploads
- Document uploads
- Image + document uploads in the same request
- Custom Base URL
- Custom API Key
- Model, size, quality, format, count, background, moderation, and proxy settings

When documents are uploaded, the app extracts text from them and appends that text to the prompt as creative context for image generation.

Supported document formats:

- `.txt`
- `.md`
- `.csv`
- `.json`
- `.pdf`
- `.docx`

The browser sends the API key only to your local Flask server. The key is not written to the repository.

Conversation history is stored in your browser with `localStorage`. It stores prompts, attachment file names, generated image URLs, and response metadata. It does not store your API key.

Connection settings are preserved locally for convenience. The API key is kept in browser `sessionStorage`, so it remains available in the current browser tab after a request but is not saved into conversation history.

## Local Smoke Tests

Run the offline smoke tests before publishing or modifying the web app:

```powershell
python -m unittest discover -s tests
```

These tests do not call the image API. They check the homepage, parameter validation, image size detection, download headers, and upload filename handling.

## Text-to-Image

Generate an image directly from a prompt:

```powershell
python generate_image.py --prompt "A clean product advertisement image for a modern skincare bottle, studio lighting, premium commercial style"
```

Use `prompt.txt` as the prompt source:

```powershell
python generate_image.py --prompt-file prompt.txt --size 1024x1024 --quality high --format png --verbose
```

Generate multiple images in one text-to-image request:

```powershell
python generate_image.py --prompt-file prompt.txt --size 1024x1024 --quality high --format png --n 3 --verbose
```

## Image-Guided Generation

Put reference images in:

```text
reference_images/
```

Then run:

```powershell
python generate_image.py --prompt-file prompt.txt --image .\reference_images --size 1024x1024 --quality high --format png --n 3 --verbose
```

When `--image` points to a folder, the script uploads all supported images in that folder:

- `.png`
- `.jpg`
- `.jpeg`
- `.webp`

You can also upload a single reference image:

```powershell
python generate_image.py --prompt-file prompt.txt --image .\reference_images\reference.png --size 1024x1024 --verbose
```

Text-only generation uses:

```text
POST /v1/images/generations
```

Image-guided generation uses:

```text
POST /v1/images/edits
```

Both modes send the configured model name, usually:

```text
gpt-image-2
```

## Multiple Outputs With Reference Images

Some OpenAI-compatible providers ignore `n` on `/v1/images/edits` and return only one image.

To make `--n` reliable in image-guided mode, this script loops client-side:

```powershell
python generate_image.py --prompt-file prompt.txt --image .\reference_images --n 3 --verbose
```

That command sends 3 separate image-guided requests and saves 3 output files.

## Command Options

| Option | Description | Example |
| --- | --- | --- |
| `--prompt` | Prompt text written directly in the command line. Cannot be used with `--prompt-file`. | `--prompt "A product ad photo"` |
| `--prompt-file` | Read the prompt from a UTF-8 text file. Cannot be used with `--prompt`. | `--prompt-file prompt.txt` |
| `--image` | Optional reference image file or folder. If a folder is passed, all supported images are uploaded. | `--image .\reference_images` |
| `--model` | Image model name. Defaults to `GPT_IMAGE_MODEL` in `.env`, then `gpt-image-2`. | `--model gpt-image-2` |
| `--size` | Output image size. Provider support may vary. | `--size 1024x1024` |
| `--quality` | Optional quality value. | `--quality high` |
| `--format` | Optional output format. | `--format png` |
| `--background` | Optional background mode. `gpt-image-2` does not support `transparent`. | `--background opaque` |
| `--moderation` | Optional moderation setting if supported by your provider. | `--moderation low` |
| `--n` | Number of output images, from 1 to 10. In image-guided mode, the script loops requests. | `--n 3` |
| `--output-dir` | Directory for saved images. | `--output-dir outputs` |
| `--verbose` | Print endpoint, payload summary, timing, status code, and response summary. | `--verbose` |
| `--no-proxy` | Ignore proxy settings from the environment. Useful when `requests` reports `ProxyError`. | `--no-proxy` |

## Output Files

By default, generated images are saved to:

```text
outputs/
```

Example output:

```text
outputs/20260425-162835-image-1.png
```

When using `--image --n 3`, file names include batch markers such as:

```text
outputs/20260425-162835-image-batch01-1.png
outputs/20260425-162835-image-batch02-1.png
outputs/20260425-162835-image-batch03-1.png
```

## Troubleshooting

If you see:

```text
OPENAI_API_KEY is missing
```

Make sure `.env` exists in the project folder and contains `OPENAI_API_KEY`.

If you see:

```text
ProxyError
```

Try:

```powershell
python generate_image.py --prompt-file prompt.txt --image .\reference_images --no-proxy --verbose
```

If you see `502` or `503`, the provider's upstream image channel may be unavailable or interrupted.

If `--n 3` returns only one image in image-guided mode, use the latest script version. It loops requests automatically when `--image` is used.

## Security Notes

- Do not commit `.env`.
- Do not paste your real API key into issues, chats, screenshots, or README files.
- `.env`, generated outputs, and local reference images are ignored by Git by default.
