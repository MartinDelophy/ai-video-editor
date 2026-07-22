"""Export JoyVASA's pinned Chinese HuBERT audio path to ONNX.

The graph accepts one already padded four-second 16 kHz waveform (64,080
samples) and produces the 100 x 256 audio feature window consumed by the
diffusion denoiser. Padding is kept outside the graph so the browser can apply
JoyVASA's small reflect pad deterministically before inference.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path, PosixPath

import numpy as np
import onnx
import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import HubertConfig


EXPECTED_CHECKPOINT_SHA256 = "9dd869329725caedf5f0c13dd383abec1e385f566d8afe2047b141f604844e80"
EXPECTED_HUBERT_CONFIG_SHA256 = "f6bd1bdef239518d022edcef31243acf344a2afa33d5428e16f221cac09cbcd0"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class JoyVASAAudioFeatures(nn.Module):
    def __init__(self, encoder: nn.Module, projection: nn.Module):
        super().__init__()
        self.encoder = encoder
        self.projection = projection

    def forward(self, audio_padded: torch.Tensor) -> torch.Tensor:
        # JoyVASA first asks HuBERT for 200 frames, then back-resamples to the
        # 100 motion frames used for a four-second, 25 fps diffusion window.
        hidden = self.encoder(audio_padded, 25, frame_num=200).last_hidden_state
        hidden = F.interpolate(
            hidden.transpose(1, 2), size=100, align_corners=False, mode="linear"
        ).transpose(1, 2)
        return self.projection(hidden)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--hubert-config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    checkpoint_hash = sha256(args.checkpoint)
    config_hash = sha256(args.hubert_config)
    if checkpoint_hash != EXPECTED_CHECKPOINT_SHA256:
        raise RuntimeError(f"Unexpected checkpoint SHA-256: {checkpoint_hash}")
    if config_hash != EXPECTED_HUBERT_CONFIG_SHA256:
        raise RuntimeError(f"Unexpected HuBERT config SHA-256: {config_hash}")

    sys.path.insert(0, str(args.source))
    from src.modules.hubert import HubertModel

    torch.serialization.add_safe_globals([argparse.Namespace, PosixPath])
    payload = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    config = HubertConfig.from_json_file(str(args.hubert_config))
    encoder = HubertModel(config).eval()
    encoder_prefix = "audio_encoder."
    encoder_state = {
        key[len(encoder_prefix):]: value
        for key, value in payload["model"].items()
        if key.startswith(encoder_prefix)
    }
    missing, unexpected = encoder.load_state_dict(encoder_state, strict=True)
    if missing or unexpected:
        raise RuntimeError(f"Encoder state mismatch, missing={missing}, unexpected={unexpected}")

    projection = nn.Linear(768, 256).eval()
    projection.load_state_dict(
        {
            "weight": payload["model"]["audio_feature_map.weight"],
            "bias": payload["model"]["audio_feature_map.bias"],
        },
        strict=True,
    )
    model = JoyVASAAudioFeatures(encoder, projection).eval()

    torch.manual_seed(20260710)
    audio = torch.randn(1, 64_080)
    with torch.no_grad():
        reference = model(audio).cpu().numpy()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        (audio,),
        args.output,
        input_names=["audio_padded"],
        output_names=["audio_features"],
        opset_version=17,
        do_constant_folding=True,
        export_params=True,
    )
    graph = onnx.load(args.output, load_external_data=False)
    onnx.checker.check_model(graph)
    np.savez_compressed(
        args.output.with_suffix(".reference.npz"),
        audio_padded=audio.numpy(),
        audio_features=reference,
    )
    np.savez_compressed(
        args.output.with_suffix(".conditioning.npz"),
        start_audio_feat=payload["model"]["start_audio_feat"].numpy(),
        start_motion_feat=payload["model"]["start_motion_feat"].numpy(),
        null_audio_feat=payload["model"]["null_audio_feat"].numpy(),
    )
    metadata = {
        "checkpoint_sha256": checkpoint_hash,
        "hubert_config_sha256": config_hash,
        "onnx_sha256": sha256(args.output),
        "onnx_bytes": args.output.stat().st_size,
        "opset": 17,
        "sample_rate": 16_000,
        "unpadded_samples": 64_000,
        "padded_samples": 64_080,
        "motion_fps": 25,
        "motion_frames": 100,
        "nodes": len(graph.graph.node),
        "inputs": {item.name: [dim.dim_value for dim in item.type.tensor_type.shape.dim] for item in graph.graph.input},
        "outputs": {item.name: [dim.dim_value for dim in item.type.tensor_type.shape.dim] for item in graph.graph.output},
    }
    args.output.with_suffix(".json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
