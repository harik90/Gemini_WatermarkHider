"""
Audio-Video synchronization and stream harmonization module.
Prevents frame drops, timestamp drift, and missing-audio concat failures.
"""

from typing import List, Dict, Any, Tuple


def build_video_concat_filtergraph(
    scene_probes: List[Dict[str, Any]],
    target_fps: float = 30.0,
    target_width: int = 1920,
    target_height: int = 1080
) -> str:
    """
    Builds video-only concat filtergraph:
    Conforms fps, resolution, padding, and resets PTS.
    """
    filter_chains = []
    v_outputs = []

    for i, _ in enumerate(scene_probes):
        v_in = f"[{i}:v]"
        v_out = f"[v{i}]"
        v_filter = (
            f"{v_in}"
            f"fps=fps={target_fps}:round=near,"
            f"scale={target_width}:{target_height}:flags=lanczos:force_original_aspect_ratio=decrease,"
            f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2,"
            f"setpts=PTS-STARTPTS"
            f"{v_out}"
        )
        filter_chains.append(v_filter)
        v_outputs.append(v_out)

    n = len(scene_probes)
    concat_inputs = "".join(v_outputs)
    concat_chain = f"{concat_inputs}concat=n={n}:v=1:a=0[v_concat]"
    filter_chains.append(concat_chain)

    return ";".join(filter_chains)


def build_audio_concat_filtergraph(
    scene_probes: List[Dict[str, Any]],
    sample_rate: int = 48000
) -> str:
    """
    Builds audio-only concat filtergraph:
    Pads silent audio for clips missing sound, harmonizes sample rate, resets PTS.
    """
    filter_chains = []
    a_outputs = []

    for i, probe in enumerate(scene_probes):
        a_out = f"[a{i}]"
        if probe["has_audio"]:
            a_filter = (
                f"[{i}:a]"
                f"aformat=sample_fmts=fltp:sample_rates={sample_rate}:channel_layouts=stereo,"
                f"asetpts=PTS-STARTPTS"
                f"{a_out}"
            )
            filter_chains.append(a_filter)
        else:
            duration = max(0.1, probe.get("duration", 1.0))
            a_filter = (
                f"anullsrc=channel_layout=stereo:sample_rate={sample_rate}:duration={duration},"
                f"asetpts=PTS-STARTPTS"
                f"{a_out}"
            )
            filter_chains.append(a_filter)

        a_outputs.append(a_out)

    n = len(scene_probes)
    concat_inputs = "".join(a_outputs)
    concat_chain = f"{concat_inputs}concat=n={n}:v=0:a=1[a_concat]"
    filter_chains.append(concat_chain)

    return ";".join(filter_chains)


def build_unified_av_concat_filtergraph(
    scene_probes: List[Dict[str, Any]],
    target_fps: float = 30.0,
    target_width: int = 1920,
    target_height: int = 1080,
    sample_rate: int = 48000
) -> str:
    """
    Builds combined A/V concat filtergraph for single-pass FFmpeg execution.
    """
    filter_chains = []
    v_outputs = []
    a_outputs = []

    for i, probe in enumerate(scene_probes):
        v_in = f"[{i}:v]"
        v_out = f"[v{i}]"
        v_filter = (
            f"{v_in}"
            f"fps=fps={target_fps}:round=near,"
            f"scale={target_width}:{target_height}:flags=lanczos:force_original_aspect_ratio=decrease,"
            f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2,"
            f"setpts=PTS-STARTPTS"
            f"{v_out}"
        )
        filter_chains.append(v_filter)
        v_outputs.append(v_out)

        a_out = f"[a{i}]"
        if probe["has_audio"]:
            a_filter = (
                f"[{i}:a]"
                f"aformat=sample_fmts=fltp:sample_rates={sample_rate}:channel_layouts=stereo,"
                f"asetpts=PTS-STARTPTS"
                f"{a_out}"
            )
            filter_chains.append(a_filter)
        else:
            duration = max(0.1, probe.get("duration", 1.0))
            a_filter = (
                f"anullsrc=channel_layout=stereo:sample_rate={sample_rate}:duration={duration},"
                f"asetpts=PTS-STARTPTS"
                f"{a_out}"
            )
            filter_chains.append(a_filter)
        a_outputs.append(a_out)

    n = len(scene_probes)
    concat_inputs = "".join(f"{v_outputs[i]}{a_outputs[i]}" for i in range(n))
    concat_chain = f"{concat_inputs}concat=n={n}:v=1:a=1[v_concat][a_concat]"
    filter_chains.append(concat_chain)

    return ";".join(filter_chains)
