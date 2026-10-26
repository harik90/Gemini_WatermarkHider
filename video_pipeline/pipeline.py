"""
Production-grade Video Editor Pipeline orchestrating:
1. Scene Discovery & Strict Chronological Sorting
2. Audio/Video Stream Harmonization & Zero-Drop Concat
3. Pixel-by-Pixel Astroid Watermark Removal (OpenCV Inpaint / FFmpeg Delogo)
4. 3D Animated Movie Luxury Color Grading
5. High-Bitrate Master Export
"""

import os
import subprocess
import time
from pathlib import Path
from typing import Callable, Optional, Dict, Any, List

import numpy as np

from video_pipeline.config import VideoPipelineConfig
from video_pipeline.scene_sorter import scan_and_sort_scenes, probe_video_stream
from video_pipeline.watermark_remover import AstroidWatermarkRemover
from video_pipeline.color_grader import get_color_grade_filtergraph, get_upscale_filter
from video_pipeline.audio_sync import (
    build_video_concat_filtergraph,
    build_audio_concat_filtergraph,
    build_unified_av_concat_filtergraph,
)


class VideoEditorPipeline:
    def __init__(self, config: Optional[VideoPipelineConfig] = None):
        self.config = config or VideoPipelineConfig()

    def run(
        self,
        progress_callback: Optional[Callable[[float, str], None]] = None,
        cancel_check: Optional[Callable[[], bool]] = None,
    ) -> Path:
        start_time = time.time()
        output_path = Path(self.config.output_file).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        def emit_progress(pct: float, message: str):
            print(f"[{pct * 100:5.1f}%] {message}")
            if progress_callback:
                progress_callback(pct, message)

        if cancel_check and cancel_check():
            raise RuntimeError("Processing cancelled by user")

        emit_progress(0.02, "Scanning input directory and sorting scene files...")

        # -------------------------------------------------------------
        # STEP 1: AUTO-SORT OR USER-DEFINED SEQUENCE ORDER
        # -------------------------------------------------------------
        if self.config.selected_scenes and len(self.config.selected_scenes) > 0:
            available = scan_and_sort_scenes(
                self.config.input_dir,
                regex_pattern=self.config.scene_regex,
                allowed_extensions=self.config.allowed_extensions,
            )
            probe_map = {p["path"].name: p for p in available}
            scene_probes = []
            for idx, fname in enumerate(self.config.selected_scenes):
                if fname in probe_map:
                    p = dict(probe_map[fname])
                    p["order_index"] = idx + 1
                    scene_probes.append(p)
                else:
                    target_file = Path(self.config.input_dir) / fname
                    if target_file.exists():
                        p = probe_video_stream(target_file)
                        p["order_index"] = idx + 1
                        scene_probes.append(p)
            if not scene_probes:
                scene_probes = available
        else:
            scene_probes = scan_and_sort_scenes(
                self.config.input_dir,
                regex_pattern=self.config.scene_regex,
                allowed_extensions=self.config.allowed_extensions,
            )

        total_scenes = len(scene_probes)
        total_duration = sum(p["duration"] for p in scene_probes)
        target_fps = self.config.target_fps or scene_probes[0]["fps"]

        # Determine target resolution
        if self.config.resolution.lower() == "4k":
            target_w, target_h = 3840, 2160
        else:
            target_w, target_h = 1920, 1080

        emit_progress(
            0.10,
            f"Verified {total_scenes} scenes in strict sequence. Total duration: {total_duration:.2f}s "
            f"({target_w}x{target_h} @ {target_fps:.2f}fps)."
        )

        # -------------------------------------------------------------
        # STEP 2 & 3: CONCAT, WATERMARK REMOVAL, AND COLOR GRADING
        # -------------------------------------------------------------
        if self.config.inpaint_method in ("precision_unblend", "telea", "ns"):
            self._run_opencv_inpaint_pipeline(
                scene_probes=scene_probes,
                target_w=target_w,
                target_h=target_h,
                target_fps=target_fps,
                total_duration=total_duration,
                output_path=output_path,
                emit_progress=emit_progress,
                cancel_check=cancel_check,
            )
        else:
            self._run_ffmpeg_direct_pipeline(
                scene_probes=scene_probes,
                target_w=target_w,
                target_h=target_h,
                target_fps=target_fps,
                output_path=output_path,
                emit_progress=emit_progress,
            )

        elapsed = time.time() - start_time
        file_size_mb = output_path.stat().st_size / (1024 * 1024) if output_path.exists() else 0.0

        emit_progress(
            1.00,
            f"Export complete in {elapsed:.1f}s! Master file: {output_path.name} ({file_size_mb:.2f} MB)"
        )
        return output_path

    def _run_opencv_inpaint_pipeline(
        self,
        scene_probes: List[Dict[str, Any]],
        target_w: int,
        target_h: int,
        target_fps: float,
        total_duration: float,
        output_path: Path,
        emit_progress: Callable[[float, str], None],
        cancel_check: Optional[Callable[[], bool]] = None,
    ):
        """
        Piped architecture:
        FFmpeg Concat Stream -> Raw BGR frames -> OpenCV Astroid Inpainting ->
        FFmpeg Color Grading + H.264 CRF 16 Master Encoder + AAC 320k Audio.
        """
        emit_progress(0.15, "Initializing synchronized A/V concat filtergraphs...")

        if cancel_check and cancel_check():
            raise RuntimeError("Processing cancelled by user")

        # Build isolated audio concat filtergraph
        audio_concat_graph = build_audio_concat_filtergraph(
            scene_probes,
            sample_rate=self.config.audio_sample_rate
        )

        # Build isolated video concat filtergraph
        video_concat_graph = build_video_concat_filtergraph(
            scene_probes,
            target_fps=target_fps,
            target_width=target_w,
            target_height=target_h
        )

        # Build luxury color grade filtergraph
        color_filters = []
        if self.config.enable_color_grade:
            grade_str = get_color_grade_filtergraph(self.config)
            if grade_str:
                color_filters.append(grade_str)

        color_filter_arg = ",".join(color_filters) if color_filters else "null"

        # Temporary synchronized master audio
        temp_audio = output_path.parent / f"_temp_audio_{os.getpid()}.m4a"

        # 1. Extract synchronized audio master for the merged sequence
        emit_progress(0.20, "Extracting synchronized master audio track...")
        audio_cmd = ["ffmpeg", "-y", "-v", "error"]
        for p in scene_probes:
            audio_cmd.extend(["-i", str(p["path"])])

        audio_cmd.extend([
            "-filter_complex", audio_concat_graph,
            "-map", "[a_concat]",
            "-c:a", self.config.audio_codec,
            "-b:a", self.config.audio_bitrate,
            "-ar", str(self.config.audio_sample_rate),
            str(temp_audio)
        ])
        subprocess.run(audio_cmd, check=True)

        # 2. Setup OpenCV Astroid Inpainter
        inpainter = AstroidWatermarkRemover(
            x_pct=self.config.watermark_x_pct,
            y_pct=self.config.watermark_y_pct,
            method=self.config.inpaint_method,
            radius=self.config.inpaint_radius,
            astroid_power=self.config.astroid_power,
            dilation=self.config.astroid_dilation,
            blend_texture=self.config.blend_texture,
        )

        # 3. Setup Video Decoder Pipe (from video concat filtergraph to raw BGR frames)
        decoder_cmd = ["ffmpeg", "-v", "error", "-threads", "0"]
        for p in scene_probes:
            decoder_cmd.extend(["-i", str(p["path"])])

        decoder_cmd.extend([
            "-filter_complex", video_concat_graph,
            "-map", "[v_concat]",
            "-f", "rawvideo",
            "-pix_fmt", "bgr24",
            "-"
        ])

        # 4. Setup Video Encoder Pipe (from raw BGR frames -> Color Grade -> H.264 Master)
        encoder_cmd = [
            "ffmpeg", "-y", "-v", "error",
            "-threads", "0",
            "-f", "rawvideo",
            "-pix_fmt", "bgr24",
            "-s", f"{target_w}x{target_h}",
            "-r", str(target_fps),
            "-i", "-",
            "-i", str(temp_audio),
            "-vf", color_filter_arg,
            "-c:v", self.config.video_codec,
            "-crf", str(self.config.crf),
            "-preset", self.config.preset,
            "-pix_fmt", self.config.pixel_format,
            "-c:a", "copy",
            "-movflags", "+faststart",
            str(output_path)
        ]

        frame_bytes = target_w * target_h * 3
        estimated_frames = int(max(1, total_duration * target_fps))

        emit_progress(0.25, f"Starting frame-accurate inpainting & color grading ({estimated_frames} frames)...")

        proc_dec = subprocess.Popen(decoder_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        proc_enc = subprocess.Popen(encoder_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

        processed_frames = 0
        last_progress_time = time.time()

        try:
            while True:
                if cancel_check and cancel_check():
                    raise RuntimeError("Processing cancelled by user")

                raw_frame = proc_dec.stdout.read(frame_bytes)
                if not raw_frame or len(raw_frame) < frame_bytes:
                    break

                # Convert raw bytes to NumPy BGR frame (writable copy)
                frame = np.frombuffer(raw_frame, dtype=np.uint8).reshape((target_h, target_w, 3)).copy()

                # Inpaint watermark pixel-by-pixel with texture blending if enabled
                if self.config.enable_watermark_removal:
                    cleaned_frame = inpainter.inpaint_frame(frame)
                else:
                    cleaned_frame = frame

                # Write cleaned frame into encoder stdin
                proc_enc.stdin.write(cleaned_frame.tobytes())

                processed_frames += 1
                now = time.time()
                if now - last_progress_time > 1.2:
                    pct = 0.25 + 0.65 * min(1.0, processed_frames / estimated_frames)
                    emit_progress(
                        pct,
                        f"Inpainted frame {processed_frames}/{estimated_frames} "
                        f"({processed_frames / estimated_frames * 100:.1f}%)"
                    )
                    last_progress_time = now

        except Exception:
            if proc_dec.poll() is None:
                try: proc_dec.terminate()
                except Exception: pass
            if proc_enc.poll() is None:
                try: proc_enc.terminate()
                except Exception: pass
            raise
        else:
            # Normal completion: close decoder, close encoder stdin so FFmpeg flushes and writes moov atom
            if proc_dec.stdout:
                try: proc_dec.stdout.close()
                except Exception: pass
            proc_dec.wait()

            if proc_enc.stdin:
                try: proc_enc.stdin.close()
                except Exception: pass
            proc_enc.wait()
        finally:
            if proc_dec.poll() is None:
                try: proc_dec.kill()
                except Exception: pass
            if proc_enc.poll() is None:
                try: proc_enc.kill()
                except Exception: pass
            if temp_audio.exists():
                try: temp_audio.unlink()
                except Exception: pass

        emit_progress(0.95, "Finalizing master MP4 container & faststart moov atom...")

    def _run_ffmpeg_direct_pipeline(
        self,
        scene_probes: List[Dict[str, Any]],
        target_w: int,
        target_h: int,
        target_fps: float,
        output_path: Path,
        emit_progress: Callable[[float, str], None],
    ):
        """
        Ultra-fast single-pass pipeline combining Concat + Delogo + Color Grade + Encode
        directly inside FFmpeg's hardware-accelerated filtergraph.
        """
        emit_progress(0.20, "Building unified single-pass FFmpeg filtergraph...")

        concat_graph = build_unified_av_concat_filtergraph(
            scene_probes,
            target_fps=target_fps,
            target_width=target_w,
            target_height=target_h,
            sample_rate=self.config.audio_sample_rate
        )

        delogo_filter = AstroidWatermarkRemover.get_delogo_filter_string(
            width=target_w,
            height=target_h,
            x_pct=self.config.watermark_x_pct,
            y_pct=self.config.watermark_y_pct,
        )

        color_grade_filter = get_color_grade_filtergraph(self.config)

        # Chained processing
        final_video_chain = f"[v_concat]{delogo_filter}"
        if self.config.enable_color_grade and color_grade_filter:
            final_video_chain += f",{color_grade_filter}"
        final_video_chain += "[v_final]"

        full_filtergraph = f"{concat_graph};{final_video_chain}"

        cmd = ["ffmpeg", "-y", "-v", "info"]
        for p in scene_probes:
            cmd.extend(["-i", str(p["path"])])

        cmd.extend([
            "-filter_complex", full_filtergraph,
            "-map", "[v_final]",
            "-map", "[a_concat]",
            "-c:v", self.config.video_codec,
            "-crf", str(self.config.crf),
            "-preset", self.config.preset,
            "-pix_fmt", self.config.pixel_format,
            "-c:a", self.config.audio_codec,
            "-b:a", self.config.audio_bitrate,
            "-ar", str(self.config.audio_sample_rate),
            "-movflags", "+faststart",
            str(output_path)
        ])

        emit_progress(0.30, "Executing unified FFmpeg filtergraph rendering...")
        subprocess.run(cmd, check=True)
        emit_progress(0.95, "Master render finished successfully.")

    def clean_single_scene(
        self,
        input_scene_path: Path,
        output_path: Path,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> Path:
        """
        Cleans the watermark from a single scene clip with audio preservation
        and visually lossless fast encoding.
        """
        input_scene_path = Path(input_scene_path).resolve()
        output_path = Path(output_path).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        probe = probe_video_stream(input_scene_path)
        w, h = probe["width"], probe["height"]
        fps = probe["fps"]
        duration = probe["duration"]
        has_audio = probe["has_audio"]

        inpainter = AstroidWatermarkRemover(
            x_pct=self.config.watermark_x_pct,
            y_pct=self.config.watermark_y_pct,
            method=self.config.inpaint_method,
            radius=self.config.inpaint_radius,
            astroid_power=self.config.astroid_power,
            dilation=self.config.astroid_dilation,
            blend_texture=self.config.blend_texture,
        )

        decoder_cmd = [
            "ffmpeg", "-v", "error", "-threads", "0",
            "-i", str(input_scene_path),
            "-f", "rawvideo",
            "-pix_fmt", "bgr24",
            "-"
        ]

        color_filters = []
        if self.config.enable_color_grade:
            grade_str = get_color_grade_filtergraph(self.config)
            if grade_str:
                color_filters.append(grade_str)
        color_filter_arg = ",".join(color_filters) if color_filters else "null"

        encoder_cmd = [
            "ffmpeg", "-y", "-v", "error",
            "-threads", "0",
            "-f", "rawvideo",
            "-pix_fmt", "bgr24",
            "-s", f"{w}x{h}",
            "-r", str(fps),
            "-i", "-",
        ]

        if has_audio:
            encoder_cmd.extend(["-i", str(input_scene_path), "-map", "0:v", "-map", "1:a?", "-c:a", "copy"])

        encoder_cmd.extend([
            "-vf", color_filter_arg,
            "-c:v", self.config.video_codec,
            "-crf", str(self.config.crf),
            "-preset", self.config.preset,
            "-pix_fmt", self.config.pixel_format,
            "-movflags", "+faststart",
            str(output_path)
        ])

        frame_bytes = w * h * 3
        estimated_frames = int(max(1, duration * fps))
        proc_dec = subprocess.Popen(decoder_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        proc_enc = subprocess.Popen(encoder_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

        processed = 0
        try:
            while True:
                raw_frame = proc_dec.stdout.read(frame_bytes)
                if not raw_frame or len(raw_frame) < frame_bytes:
                    break
                frame = np.frombuffer(raw_frame, dtype=np.uint8).reshape((h, w, 3)).copy()
                if self.config.enable_watermark_removal:
                    cleaned_frame = inpainter.inpaint_frame(frame)
                else:
                    cleaned_frame = frame
                proc_enc.stdin.write(cleaned_frame.tobytes())
                processed += 1
                if progress_callback and processed % 30 == 0:
                    pct = min(1.0, processed / estimated_frames)
                    progress_callback(pct, f"Cleaned frame {processed}/{estimated_frames}")
        finally:
            if proc_dec.stdout:
                proc_dec.stdout.close()
            proc_dec.wait()
            if proc_enc.stdin:
                proc_enc.stdin.close()
            proc_enc.wait()

        return output_path

    def clean_all_scenes(
        self,
        output_dir: Path,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> List[Path]:
        """
        Cleans all scene clips in input_dir and saves each individually to output_dir.
        """
        output_dir = Path(output_dir).resolve()
        output_dir.mkdir(parents=True, exist_ok=True)

        scene_probes = scan_and_sort_scenes(
            self.config.input_dir,
            regex_pattern=self.config.scene_regex,
            allowed_extensions=self.config.allowed_extensions,
        )

        cleaned_files = []
        total = len(scene_probes)
        for idx, probe in enumerate(scene_probes):
            src_path = probe["path"]
            stem = src_path.stem
            dest = output_dir / f"{stem}_clean.mp4"
            if progress_callback:
                progress_callback(idx / total, f"Cleaning scene {idx + 1}/{total}: {src_path.name}")
            self.clean_single_scene(src_path, dest)
            cleaned_files.append(dest)

        if progress_callback:
            progress_callback(1.0, f"Successfully cleaned all {total} scenes!")
        return cleaned_files
