"""
Module for scanning, regex parsing, strict chronological ordering,
and FFprobe stream harmonization of scene video clips.
"""

import json
import re
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple


def probe_video_stream(file_path: Path) -> Dict[str, Any]:
    """
    Extracts stream metadata (resolution, frame rate, duration, audio presence)
    using ffprobe JSON output.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(file_path.resolve())
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
    except Exception as e:
        raise RuntimeError(f"FFprobe failed to read {file_path}: {e}")

    streams = data.get("streams", [])
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

    if not video_stream:
        raise ValueError(f"No video stream found in {file_path}")

    # Calculate frame rate
    r_fps = video_stream.get("r_frame_rate", "30/1")
    try:
        num, den = map(float, r_fps.split("/"))
        fps = num / den if den != 0 else 30.0
    except Exception:
        fps = 30.0

    width = int(video_stream.get("width", 1920))
    height = int(video_stream.get("height", 1080))

    duration = float(
        video_stream.get("duration")
        or data.get("format", {}).get("duration")
        or 0.0
    )

    return {
        "path": file_path,
        "width": width,
        "height": height,
        "fps": fps,
        "duration": duration,
        "has_audio": audio_stream is not None,
        "audio_sample_rate": int(audio_stream.get("sample_rate", 48000)) if audio_stream else 48000,
        "audio_channels": int(audio_stream.get("channels", 2)) if audio_stream else 2,
    }


def natural_sort_key(filename: str):
    """Fallback natural sorting for alphanumeric strings."""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", filename)]


def scan_and_sort_scenes(
    input_dir: Path,
    regex_pattern: str = r"(?i)(?:SCENE|PART|CLIP)[_\-\s]*(\d+)",
    allowed_extensions: Tuple[str, ...] = (".mp4", ".mov", ".mkv", ".webm")
) -> List[Dict[str, Any]]:
    """
    Scans input directory for video files containing scene numbers,
    sorts them in strict ascending chronological order (SCENE_1 -> SCENE_6),
    and validates stream integrity with ffprobe.
    """
    input_path = Path(input_dir).resolve()
    if not input_path.exists() or not input_path.is_dir():
        raise FileNotFoundError(f"Input directory does not exist: {input_path}")

    files = [
        f for f in input_path.iterdir()
        if f.is_file() and f.suffix.lower() in allowed_extensions
    ]

    if not files:
        raise FileNotFoundError(
            f"No video files with extensions {allowed_extensions} found in {input_path}"
        )

    parsed_scenes = []
    pattern = re.compile(regex_pattern)

    for f in files:
        match = pattern.search(f.name)
        if match:
            scene_num = int(match.group(1))
            is_matched = True
        else:
            scene_num = float("inf")
            is_matched = False

        parsed_scenes.append({
            "file": f,
            "scene_num": scene_num,
            "is_matched": is_matched,
        })

    # Sort strictly by parsed scene number, falling back to natural sort key
    parsed_scenes.sort(
        key=lambda item: (item["scene_num"], natural_sort_key(item["file"].name))
    )

    # Probe each file and print the verified sequence
    ordered_probes = []
    print("\n" + "=" * 65)
    print("🎬 [STEP 1] AUTO-SORTED SCENE SEQUENCE (STRICT CHRONOLOGICAL):")
    print("=" * 65)

    for idx, item in enumerate(parsed_scenes, start=1):
        f = item["file"]
        scene_tag = f"SCENE {item['scene_num']}" if item["is_matched"] else "UNTAGGED"
        probe = probe_video_stream(f)
        probe["order_index"] = idx
        probe["scene_tag"] = scene_tag
        ordered_probes.append(probe)

        audio_status = "🔊 Audio OK" if probe["has_audio"] else "🔇 Silent (Needs Pad)"
        print(
            f"  {idx:02d}. [{scene_tag:^10}] -> {f.name:<32} "
            f"({probe['width']}x{probe['height']} @ {probe['fps']:.2f}fps, "
            f"{probe['duration']:.2f}s, {audio_status})"
        )
    print("=" * 65 + "\n")

    return ordered_probes
