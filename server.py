"""
FastAPI Server providing REST API endpoints for the Video Editing Pipeline.
Enables triggering auto-sort, watermark removal, and luxury color grading
directly from the frontend web UI or external API clients.
"""

import asyncio
import os
import sys
import shutil
import threading
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from video_pipeline.config import VideoPipelineConfig
from video_pipeline.pipeline import VideoEditorPipeline
from video_pipeline.scene_sorter import scan_and_sort_scenes

# Valid video file extensions for ingest
VALID_VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".ts", ".m4v", ".flv"}
ALLOWED_OPEN_FOLDERS = {"input_scenes", "output", "output/cleaned_scenes"}

app = FastAPI(
    title="Gemini Video Editor Pipeline API",
    description="Automated scene sorting, inpainting watermark removal, luxury color grading & master export",
    version="1.0.0"
)

# Enable CORS for Next.js frontend running on localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global cancellation event and job state
CANCEL_EVENT = threading.Event()
JOB_STATE = {
    "status": "idle",  # 'idle' | 'processing' | 'done' | 'failed'
    "progress": 0.0,
    "message": "",
    "output_file": None,
    "error": None,
}


class EditVideoRequest(BaseModel):
    input_dir: str = "input_scenes"
    output_filename: str = "MASTER_FINAL_1080p.mp4"
    resolution: str = "1080p"
    inpaint_method: str = "ns"
    enable_watermark_removal: bool = True
    enable_color_grade: bool = True
    crf: int = 16
    preset: str = "fast"
    fps: Optional[float] = None
    selected_scenes: Optional[List[str]] = None


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "video_editor_pipeline"}


@app.post("/api/scan-scenes")
def scan_scenes_endpoint(request: EditVideoRequest):
    """Scans and returns the strict chronological sequence of scenes without rendering."""
    try:
        input_path = Path(request.input_dir).resolve()
        if not input_path.exists():
            input_path.mkdir(parents=True, exist_ok=True)
            return {"success": True, "scene_count": 0, "scenes": []}
        try:
            probes = scan_and_sort_scenes(input_path)
        except (FileNotFoundError, ValueError) as fnf:
            if "No video files" in str(fnf):
                return {"success": True, "scene_count": 0, "scenes": []}
            raise
        return {
            "success": True,
            "scene_count": len(probes),
            "scenes": [
                {
                    "order": p["order_index"],
                    "tag": p["scene_tag"],
                    "filename": p["path"].name,
                    "resolution": f"{p['width']}x{p['height']}",
                    "fps": round(p["fps"], 2),
                    "duration": round(p["duration"], 2),
                    "has_audio": p["has_audio"]
                }
                for p in probes
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/upload-scenes")
async def upload_scenes_endpoint(files: List[UploadFile] = File(...)):
    """Uploads multiple scene video files into the input directory and auto-sorts them."""
    try:
        target_dir = Path("input_scenes").resolve()
        target_dir.mkdir(parents=True, exist_ok=True)
        saved_files = []

        for file in files:
            if not file.filename:
                continue
            clean_name = Path(file.filename).name
            ext = Path(clean_name).suffix.lower()
            if ext not in VALID_VIDEO_EXTS:
                continue
            dest = target_dir / clean_name
            with open(dest, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_files.append(clean_name)

        # Immediately scan and order all scenes
        try:
            probes = scan_and_sort_scenes(target_dir)
        except (FileNotFoundError, ValueError):
            probes = []

        return {
            "success": True,
            "uploaded_count": len(saved_files),
            "scene_count": len(probes),
            "scenes": [
                {
                    "order": p["order_index"],
                    "tag": p["scene_tag"],
                    "filename": p["path"].name,
                    "resolution": f"{p['width']}x{p['height']}",
                    "fps": round(p["fps"], 2),
                    "duration": round(p["duration"], 2),
                    "has_audio": p["has_audio"]
                }
                for p in probes
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/clear-scenes")
def clear_scenes_endpoint():
    """Deletes all uploaded video files from input_scenes and resets status."""
    global JOB_STATE
    try:
        target_dir = Path("input_scenes").resolve()
        if target_dir.exists():
            for f in target_dir.glob("*"):
                if f.is_file():
                    try:
                        f.unlink()
                    except Exception:
                        pass
        JOB_STATE = {
            "status": "idle",
            "progress": 0.0,
            "message": "",
            "output_file": None,
            "error": None,
        }
        return {"success": True, "scene_count": 0, "scenes": []}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/scene-video/{filename}")
def delete_scene_endpoint(filename: str):
    """Deletes a specific scene file from input_scenes safely and returns updated scene list."""
    try:
        clean_name = Path(filename).name
        target_file = Path("input_scenes").resolve() / clean_name
        if target_file.exists():
            import gc, time
            gc.collect()
            deleted = False
            for _ in range(4):
                try:
                    target_file.unlink()
                    deleted = True
                    break
                except PermissionError:
                    time.sleep(0.1)
                except Exception:
                    break
            if not deleted and target_file.exists():
                try:
                    temp_name = target_file.with_name(f".del_{int(time.time())}_{target_file.name}")
                    target_file.rename(temp_name)
                    temp_name.unlink(missing_ok=True)
                except Exception:
                    pass

        target_dir = Path("input_scenes").resolve()
        try:
            probes = scan_and_sort_scenes(target_dir)
        except (FileNotFoundError, ValueError):
            probes = []

        return {
            "success": True,
            "deleted": clean_name,
            "scene_count": len(probes),
            "scenes": [
                {
                    "order": p["order_index"],
                    "tag": p["scene_tag"],
                    "filename": p["path"].name,
                    "resolution": f"{p['width']}x{p['height']}",
                    "fps": round(p["fps"], 2),
                    "duration": round(p["duration"], 2),
                    "has_audio": p["has_audio"]
                }
                for p in probes
            ]
        }
    except Exception as e:
        return {"success": False, "deleted": filename, "error": str(e), "scenes": []}


class OpenFolderRequest(BaseModel):
    folder: str = "input_scenes"


@app.post("/api/open-folder")
def open_folder_endpoint(req: OpenFolderRequest):
    """Opens authorized directories in system File Explorer."""
    try:
        norm_folder = req.folder.replace("\\", "/").strip("/.")
        if norm_folder not in ALLOWED_OPEN_FOLDERS:
            raise HTTPException(status_code=403, detail="Access to specified folder is forbidden.")
        target_dir = Path(norm_folder).resolve()
        target_dir.mkdir(parents=True, exist_ok=True)
        if hasattr(os, "startfile"):
            os.startfile(str(target_dir))
        else:
            import subprocess
            subprocess.run(["open" if sys.platform == "darwin" else "xdg-open", str(target_dir)], check=False)
        return {"success": True, "path": str(target_dir)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def run_pipeline_worker(config: VideoPipelineConfig):
    global JOB_STATE, CANCEL_EVENT
    try:
        CANCEL_EVENT.clear()
        JOB_STATE["status"] = "processing"
        JOB_STATE["progress"] = 0.0
        JOB_STATE["message"] = "Initializing high-speed watermark removal..."
        JOB_STATE["error"] = None

        def progress_cb(pct: float, msg: str):
            JOB_STATE["progress"] = round(pct * 100, 1)
            JOB_STATE["message"] = msg

        pipeline = VideoEditorPipeline(config)
        output_path = pipeline.run(
            progress_callback=progress_cb,
            cancel_check=lambda: CANCEL_EVENT.is_set()
        )

        JOB_STATE["status"] = "done"
        JOB_STATE["progress"] = 100.0
        JOB_STATE["message"] = "Master export complete!"
        JOB_STATE["output_file"] = str(output_path.resolve())
    except Exception as e:
        if CANCEL_EVENT.is_set() or "cancelled" in str(e).lower():
            JOB_STATE["status"] = "idle"
            JOB_STATE["progress"] = 0.0
            JOB_STATE["message"] = "Processing cancelled."
        else:
            JOB_STATE["status"] = "failed"
            JOB_STATE["error"] = str(e)
            JOB_STATE["message"] = f"Pipeline failed: {e}"


@app.post("/api/edit-video/cancel")
def cancel_edit_video():
    """Cancels any running render job smoothly."""
    global JOB_STATE, CANCEL_EVENT
    CANCEL_EVENT.set()
    JOB_STATE["status"] = "idle"
    JOB_STATE["progress"] = 0.0
    JOB_STATE["message"] = "Processing cancelled by user"
    return {"success": True, "message": "Cancelled"}


def run_batch_scenes_worker(config: VideoPipelineConfig):
    global JOB_STATE
    try:
        JOB_STATE["status"] = "processing"
        JOB_STATE["progress"] = 0.0
        JOB_STATE["message"] = "Cleaning scenes..."
        JOB_STATE["error"] = None

        def progress_cb(pct: float, msg: str):
            JOB_STATE["progress"] = round(pct * 100, 1)
            JOB_STATE["message"] = msg

        pipeline = VideoEditorPipeline(config)
        clean_dir = Path("output/cleaned_scenes").resolve()
        cleaned = pipeline.clean_all_scenes(clean_dir, progress_callback=progress_cb)

        JOB_STATE["status"] = "done"
        JOB_STATE["progress"] = 100.0
        JOB_STATE["message"] = f"Cleaned {len(cleaned)} scenes successfully!"
        JOB_STATE["output_file"] = str(clean_dir)
    except Exception as e:
        JOB_STATE["status"] = "failed"
        JOB_STATE["error"] = str(e)
        JOB_STATE["message"] = f"Batch clean failed: {e}"


@app.post("/api/edit-video")
def trigger_edit_video(request: EditVideoRequest, background_tasks: BackgroundTasks):
    """Triggers the full automated video processing pipeline."""
    global JOB_STATE
    if JOB_STATE["status"] == "processing":
        return JSONResponse(
            status_code=409,
            content={"error": "Another video editing job is already in progress.", "job": JOB_STATE}
        )

    output_dir = Path("output").resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    out_file = output_dir / request.output_filename

    config = VideoPipelineConfig(
        input_dir=Path(request.input_dir).resolve(),
        output_file=out_file,
        resolution=request.resolution,
        enable_watermark_removal=request.enable_watermark_removal,
        inpaint_method=request.inpaint_method,
        enable_color_grade=request.enable_color_grade,
        crf=request.crf,
        preset=request.preset,
        target_fps=request.fps,
        selected_scenes=request.selected_scenes,
    )

    background_tasks.add_task(run_pipeline_worker, config)
    return {"success": True, "message": "Pipeline initiated", "config": request.dict()}


@app.post("/api/clean-scenes")
def trigger_clean_scenes(request: EditVideoRequest, background_tasks: BackgroundTasks):
    """Triggers batch cleaning for all individual scene files."""
    global JOB_STATE
    if JOB_STATE["status"] == "processing":
        return JSONResponse(
            status_code=409,
            content={"error": "Another video editing job is already in progress.", "job": JOB_STATE}
        )

    config = VideoPipelineConfig(
        input_dir=Path(request.input_dir).resolve(),
        enable_watermark_removal=request.enable_watermark_removal,
        inpaint_method=request.inpaint_method,
        enable_color_grade=request.enable_color_grade,
        crf=request.crf,
        preset=request.preset,
    )

    background_tasks.add_task(run_batch_scenes_worker, config)
    return {"success": True, "message": "Batch scene clean initiated"}


@app.get("/api/edit-video/status")
def get_status():
    """Polls progress of the active editing task."""
    global JOB_STATE
    out_master = Path("output/MASTER_FINAL_1080p.mp4").resolve()
    state = dict(JOB_STATE)
    state["has_master"] = out_master.exists()
    return state


CORS_STREAM_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
}


@app.api_route("/api/scene-video/{filename}", methods=["GET", "HEAD"])
def stream_scene_video(filename: str):
    """Streams a scene video for the web video preview player."""
    input_path = Path("input_scenes").resolve()
    clean_name = Path(filename).name
    target = (input_path / clean_name).resolve()
    # Security check: must be inside input_scenes
    if not str(target).startswith(str(input_path)) or not target.exists():
        raise HTTPException(status_code=404, detail="Scene file not found.")
    return FileResponse(target, media_type="video/mp4", headers=CORS_STREAM_HEADERS)


@app.api_route("/api/cleaned-scene-video/{filename}", methods=["GET", "HEAD"])
def stream_cleaned_scene_video(filename: str):
    """Streams a cleaned scene video from output/cleaned_scenes."""
    clean_path = Path("output/cleaned_scenes").resolve()
    clean_name = Path(filename).name
    target = (clean_path / clean_name).resolve()
    if not str(target).startswith(str(clean_path)) or not target.exists():
        raise HTTPException(status_code=404, detail="Cleaned scene file not found.")
    return FileResponse(target, media_type="video/mp4", headers=CORS_STREAM_HEADERS)


@app.api_route("/api/master-video", methods=["GET", "HEAD"])
def stream_master_video():
    """Streams the rendered master MP4 inline for the studio video monitor."""
    out_master = Path("output/MASTER_FINAL_1080p.mp4").resolve()
    file_path = Path(JOB_STATE["output_file"]) if (JOB_STATE.get("output_file") and Path(JOB_STATE["output_file"]).is_file()) else out_master
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="No completed video export available.")
    return FileResponse(file_path, media_type="video/mp4", headers=CORS_STREAM_HEADERS)


@app.get("/api/edit-video/download")
def download_master():
    """Downloads the rendered master MP4."""
    out_master = Path("output/MASTER_FINAL_1080p.mp4").resolve()
    file_path = Path(JOB_STATE["output_file"]) if (JOB_STATE.get("output_file") and Path(JOB_STATE["output_file"]).is_file()) else out_master
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="No completed video export available.")
    return FileResponse(file_path, media_type="video/mp4", filename=file_path.name)


@app.get("/api/clean-scenes/download-zip")
def download_clean_scenes_zip():
    """Zips and downloads all cleaned scene files."""
    import zipfile
    clean_dir = Path("output/cleaned_scenes").resolve()
    if not clean_dir.exists():
        raise HTTPException(status_code=404, detail="No cleaned scenes found.")
    files = list(clean_dir.glob("*.mp4"))
    if not files:
        raise HTTPException(status_code=404, detail="No cleaned scenes available.")

    zip_path = clean_dir.parent / "CLEAN_SCENES_ALL.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(f, arcname=f.name)

    return FileResponse(zip_path, media_type="application/zip", filename="CLEAN_SCENES_ALL.zip")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
