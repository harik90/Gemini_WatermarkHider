"""
Automated Video Editing Pipeline package.
"""

from video_pipeline.config import VideoPipelineConfig
from video_pipeline.pipeline import VideoEditorPipeline
from video_pipeline.scene_sorter import scan_and_sort_scenes, probe_video_stream
from video_pipeline.watermark_remover import AstroidWatermarkRemover
from video_pipeline.color_grader import get_color_grade_filtergraph

__all__ = [
    "VideoPipelineConfig",
    "VideoEditorPipeline",
    "scan_and_sort_scenes",
    "probe_video_stream",
    "AstroidWatermarkRemover",
    "get_color_grade_filtergraph",
]
