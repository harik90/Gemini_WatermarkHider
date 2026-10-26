#!/usr/bin/env python3
"""
Production CLI entrypoint for the Automated Video Editing Pipeline.

Features:
- Step 1: Auto-detects & sorts SCENE_1 ... SCENE_6 in chronological order.
- Step 2: Pixel-by-pixel 4-pointed astroid star watermark removal (OpenCV Telea/NS).
- Step 3: Luxury 3D Animated Movie color grading (micro-contrast, golden highlights, lush greens).
- Step 4: Broadcast-grade master export in 1080p/4K with H.264 CRF 16 and AAC 320k.
"""

import argparse
import sys
from pathlib import Path

from video_pipeline.config import VideoPipelineConfig
from video_pipeline.pipeline import VideoEditorPipeline
from video_pipeline.scene_sorter import scan_and_sort_scenes


def main():
    parser = argparse.ArgumentParser(
        description="Automated Video Editing Pipeline: Auto-Sort, Inpaint Watermark, Luxury Grade & Master Export"
    )
    parser.add_argument(
        "--input-dir", "-i",
        type=str,
        default="input_scenes",
        help="Path to folder containing scene files (e.g., SCENE_1_1080p_...mp4, SCENE_2_1080p_...mp4)"
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default="output/MASTER_FINAL_1080p.mp4",
        help="Path for final rendered master video file"
    )
    parser.add_argument(
        "--resolution", "-r",
        choices=["1080p", "4k"],
        default="1080p",
        help="Master export resolution (1080p = 1920x1080, 4k = 3840x2160)"
    )
    parser.add_argument(
        "--inpaint-method", "-m",
        choices=["ns", "telea", "precision_unblend", "delogo"],
        default="ns",
        help="Inpainting engine: 'ns' (Navier-Stokes PDE - recommended), 'telea' (OpenCV Fast Marching), 'precision_unblend', or 'delogo' (FFmpeg C filter)"
    )
    parser.add_argument(
        "--crf",
        type=int,
        default=16,
        help="H.264 Constant Rate Factor (16 = visually lossless master quality)"
    )
    parser.add_argument(
        "--preset",
        type=str,
        default="slow",
        choices=["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"],
        help="H.264 encoder preset"
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=None,
        help="Force constant frame rate (e.g. 24.0, 30.0, 60.0). Defaults to source fps."
    )
    parser.add_argument(
        "--no-color-grade",
        action="store_true",
        help="Disable the 3D Animated Movie luxury color grading pass"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scan and validate scene ordering without rendering output"
    )

    args = parser.parse_args()

    input_path = Path(args.input_dir)
    if not input_path.exists():
        print(f"\n❌ Error: Input directory '{input_path.resolve()}' does not exist.")
        print(f"👉 Please create the folder and place your SCENE_1, SCENE_2... files inside.\n")
        sys.exit(1)

    if args.dry_run:
        print("\n🔍 Running dry-run validation...")
        scan_and_sort_scenes(input_path)
        print("✅ Validation successful. All scenes are valid and ready to merge.")
        sys.exit(0)

    config = VideoPipelineConfig(
        input_dir=input_path,
        output_file=Path(args.output),
        resolution=args.resolution,
        inpaint_method=args.inpaint_method,
        crf=args.crf,
        preset=args.preset,
        target_fps=args.fps,
        enable_color_grade=not args.no_color_grade,
    )

    print("\n" + "=" * 65)
    print("🚀 STARTING AUTOMATED VIDEO PROCESSING PIPELINE")
    print("=" * 65)
    print(f"📁 Input Directory   : {config.input_dir.resolve()}")
    print(f"🎬 Output Master     : {config.output_file.resolve()}")
    print(f"📐 Target Resolution : {config.resolution.upper()}")
    print(f"🎨 Color Grade       : {'Luxury 3D Animation' if config.enable_color_grade else 'Disabled'}")
    print(f"🩹 Inpainting Engine : {config.inpaint_method.upper()}")
    print(f"🎛️ Quality (CRF/Enc) : CRF {config.crf} ({config.preset}) / AAC 320k")
    print("=" * 65 + "\n")

    pipeline = VideoEditorPipeline(config)
    try:
        final_master = pipeline.run()
        print("\n" + "=" * 65)
        print(f"🎉 MASTER VIDEO EXPORT COMPLETE!")
        print(f"📍 Location: {final_master.resolve()}")
        print("=" * 65 + "\n")
    except Exception as e:
        print(f"\n❌ Pipeline failed with error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
