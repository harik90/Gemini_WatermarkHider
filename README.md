# gemini-cleaner

a quiet, private utility to remove google gemini and veo watermarks from images and video sequences.

## what it is
a lightweight, zero-upload tool for cleaning watermark overlays and sparkles from ai-generated media. it performs mathematical inverse alpha blending purely in your browser memory for images, and drives a high-speed calibrated ffmpeg unblend pipeline for video sequences.

## why
ai tools like gemini and veo stamp translucent star watermarks across outputs. classic inpainting blurs grass, foliage, and character details into smudges. this tool solves the inverse blend equation b = (f - c)/m to restore original textures without ghosting or quality loss.

Live - https://harik90.github.io/Gemini_WatermarkHider/

## run
```bash
# install dependencies
npm install
pip install -r requirements.txt

# start frontend & backend
npm run dev
python -m uvicorn server:app --reload --port 8000
```

open `http://localhost:3000` in your browser.
