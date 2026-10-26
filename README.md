# gemini-cleaner

a quiet, private utility to remove google gemini and veo watermarks from images and video sequences.

## what it is
a zero-upload tool for cleaning watermark overlays and sparkles from ai-generated media. images run 100% client-side in your browser memory on static hosting. video studio drives a local calibrated ffmpeg unblend pipeline for high-fps multi-scene sequences.

live web app: https://harik90.github.io/Gemini_WatermarkHider/

## architecture
- **images (static hosting)**: runs entirely in your browser via html5 canvas and web workers. zero server, zero uploads, zero backend required.
- **video studio (local engine)**: multi-scene sorting and calibrated crf video export requires the local python daemon running on `http://localhost:8000`.

## run locally
```bash
# 1. install dependencies (ensure ffmpeg is on your system PATH)
npm install
pip install -r requirements.txt

# 2. start video studio backend daemon (FastAPI on :8000)
npm run server

# 3. start frontend (optional if using GitHub Pages)
npm run dev
```

open `http://localhost:3000` or use the live GitHub Pages site with your local backend.
