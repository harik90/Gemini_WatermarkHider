<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repo-specific agent notes

## Two runtimes, one repo
- `src/` is a **static-export Next.js 16 / React 19 app** (`output: 'export'`). The Images/Videos tabs run fully client-side via Canvas, MediaRecorder, a web worker (`public/workers/removal-worker.js`), and IndexedDB. There are no Next API routes and no SSR.
- `video_pipeline/` + `edit_video.py` + `server.py` are a **separate local Python/FFmpeg stack** for the Video Studio tab. It is not part of the Next build and requires FastAPI running locally.
- The README's "100% client-side" claim applies to the image/batch tabs; Video Studio calls a local server at `http://localhost:8000`.
- `next.config.mjs` applies `basePath` only when `GITHUB_ACTIONS=true`. `.github/workflows/deploy.yml` builds and publishes `out/` to Pages. Prefix public assets with `NEXT_PUBLIC_BASE_PATH` (see `Header.js`, `page.js`) or they 404 on Pages.

## Commands
- `npm run dev` — app at http://localhost:3000.
- `npm run lint` — ESLint 9 flat config. There is no test suite and no typecheck script; verify with `npm run build` plus manual browser checks.
- `npm run server` — FastAPI on `:8000` with reload; required for Video Studio.
- `npm run edit-video -- --dry-run` — validate scene discovery/order only. Remove `--dry-run` to render; see `edit_video.py` for flags.
- Python setup: `pip install -r requirements.txt`; **`ffmpeg` / `ffprobe` must be on PATH** (not pip packages). `video_pipeline/calibrated_{m,c}.npy` are loaded relative to `watermark_remover.py`; keep them together.
- `/api/open-folder` uses `os.startfile`, so the server is Windows-only.

## Video pipeline quirks
- Scene order comes from filenames matching `(SCENE|PART|CLIP)[_-\s]*(\d+)` case-insensitively; untagged clips sort last. Only top-level files in `input_scenes/` are scanned.
- `VideoPipelineConfig.selected_scenes` is already honored by `VideoEditorPipeline.run` (`pipeline.py:48`), but `server.py`'s `EditVideoRequest` and `EditVideoPanel` never send it. UI ordering currently does **not** affect rendering; wire it through both layers for sequence editing.
- Server defaults: `precision_unblend`, `preset=fast`, CRF 16, 1080p, source fps, AAC 320k. The CLI defaults to `preset=slow`. `delogo` uses a single-pass FFmpeg graph; the OpenCV methods pipe raw BGR frames and extract a temp audio master first.
- One render at a time: `JOB_STATE` is global and in-memory; overlapping requests get 409. `/api/edit-video/status` reports `done` whenever `output/MASTER_FINAL_1080p.mp4` exists (including after a restart), so a 4K render (`MASTER_FINAL_4k.mp4`) is not found by that fallback.
- Cleaned clips go to `output/cleaned_scenes/`; never put them in `input_scenes/` or they get re-ingested.
- Do not commit `input_scenes/`, `output/`, `scratch/`, `__pycache__/`, root `calibrated_*.npy`, or the debug `*.png` artifacts. `.gitignore` does not cover most of these.

## Studio UI (`src/components/EditVideoPanel.js`)
- Playback is per selected clip through `/api/scene-video/:filename`; `master` mode streams `/api/master-video`. There is no continuous sequence playback.
- There is no drag-to-reorder, and the media-bin dropzone only renders while the bin is empty. The Play/Pause tooltip mentions Space, but no keydown handler exists. These are the gaps to fill for clip sequencing.
- The live "cleaned" preview is a canvas overlay over the ROI using `createVideoWatermarkEngine`; it is independent of the Python renderer. Do not assume the JS and Python watermark math are interchangeable.
- API calls are hardcoded to `http://localhost:8000` throughout this component; update all call sites if the base changes.

## Conventions
- JavaScript only (no TypeScript), `@/*` -> `src/*`, vanilla CSS with design tokens in `src/app/globals.css`, `'use client'` on interactive screens.
- Keep the auto-generated Next.js block at the top of this file; `next dev` recreates it.
