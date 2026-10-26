"""
Luxury & Professional 3D Animated Movie Color Grading Engine.
Provides both high-performance FFmpeg filtergraph generation and
OpenCV-based frame grading.
"""

from typing import Optional
from video_pipeline.config import VideoPipelineConfig


def get_color_grade_filtergraph(
    config: Optional[VideoPipelineConfig] = None,
    preset: str = "luxury_3d_animation"
) -> str:
    """
    Constructs an FFmpeg video filtergraph that implements the luxury 3D animated
    movie look (subtle unsharp micro-contrast, rich golden-hour warmth, deep
    cinematic shadows, and lush foliage saturation).
    """
    cfg = config or VideoPipelineConfig()

    filters = []

    # 1. Micro-contrast & texture enhancement (sharpens snake scales, foliage, bark without halos)
    if cfg.unsharp_filter:
        filters.append(cfg.unsharp_filter)

    # 2. Dynamic range, contrast, and saturation
    if cfg.eq_filter:
        filters.append(cfg.eq_filter)

    # 3. Cinematic 3-way color balance (teal shadow depth, lush green midtones, golden hour highlights)
    if cfg.colorbalance_filter:
        filters.append(cfg.colorbalance_filter)

    return ",".join(filters)


def get_upscale_filter(target_resolution: str = "1080p") -> str:
    """
    Generates high-fidelity Lanczos/Bicubic upscale or downscale filter
    ensuring 16:9 aspect ratio and even dimensions.
    """
    if target_resolution.lower() == "4k":
        # 3840x2160 with Lanczos 3-lobe filtering
        return "scale=3840:2160:flags=lanczos:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2"
    else:
        # 1920x1080 master
        return "scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
