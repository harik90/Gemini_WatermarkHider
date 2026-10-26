"""
Configuration settings for the automated video editing pipeline.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Tuple, Optional, List


@dataclass
class VideoPipelineConfig:
    # Directory scanning & scene ordering
    input_dir: Path = Path("input_scenes")
    output_file: Path = Path("output/MASTER_FINAL_1080p.mp4")
    scene_regex: str = r"(?i)(?:SCENE|PART|CLIP)[_\-\s]*(\d+)"
    allowed_extensions: Tuple[str, ...] = (".mp4", ".mov", ".mkv", ".webm")
    selected_scenes: Optional[List[str]] = None

    # Watermark Removal Settings
    # Covers both primary and secondary Gemini / Veo sparkle stars
    enable_watermark_removal: bool = True
    watermark_x_pct: Tuple[float, float] = (0.83, 0.95)
    watermark_y_pct: Tuple[float, float] = (0.72, 0.92)
    inpaint_method: str = "ns"  # 'ns' (Navier-Stokes PDE) | 'telea' | 'delogo'
    inpaint_radius: int = 2
    astroid_power: float = 0.67
    astroid_dilation: int = 3
    blend_texture: bool = True

    # Luxury 3D Animated Movie Color Grading Filtergraph
    enable_color_grade: bool = True
    unsharp_filter: str = "unsharp=5:5:0.8:3:3:0.4"
    eq_filter: str = "eq=contrast=1.08:brightness=0.01:saturation=1.18:gamma=0.96"
    colorbalance_filter: str = (
        "colorbalance="
        "rs=-0.02:gs=0.00:bs=0.02:"      # Rich cinematic shadow depth
        "rm=0.03:gm=0.05:bm=-0.02:"      # Lush jungle greens & warm midtones
        "rh=0.05:gh=0.02:bh=-0.05"       # Warm golden-hour highlight glow
    )

    # Master Export Settings
    resolution: str = "1080p"  # '1080p' (1920x1080) or '4k' (3840x2160)
    video_codec: str = "libx264"  # 'libx264' or 'libx265'
    crf: int = 16  # Master visually lossless quality
    preset: str = "fast"  # Fast high-throughput encoding (120+ FPS)
    pixel_format: str = "yuv420p"  # Universal player compatibility
    fps_mode: str = "cfr"
    target_fps: Optional[float] = None  # None = infer from clips, or set 24/30/60

    # Audio Mastering Settings
    audio_codec: str = "aac"
    audio_bitrate: str = "320k"
    audio_sample_rate: int = 48000
    audio_channels: int = 2

    # Processing Performance
    hwaccel: Optional[str] = None  # 'cuda' | 'qsv' | 'vaapi' | None
    threads: int = 0  # 0 = auto-detect all available CPU cores
