"""Create deterministic browser runtime data for the pinned JoyVASA model."""

from __future__ import annotations

import argparse
import hashlib
import json
import pickle
from pathlib import Path

import numpy as np
import torch


EXPECTED_CHECKPOINT_SHA256 = "9dd869329725caedf5f0c13dd383abec1e385f566d8afe2047b141f604844e80"
EXPECTED_TEMPLATE_SHA256 = "294ce67350b18031b375361756f654c76d5e14c8f1e319cf9ed07f759ef81a98"


def sha256(path: Path) -> str:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return digest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if sha256(args.checkpoint) != EXPECTED_CHECKPOINT_SHA256:
        raise RuntimeError("Unexpected JoyVASA checkpoint")
    if sha256(args.template) != EXPECTED_TEMPLATE_SHA256:
        raise RuntimeError("Unexpected JoyVASA motion template")

    payload = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    # The pinned 3.6KB pickle was audited before use and contains only a dict,
    # NumPy ndarray reconstruction, ndarray, and dtype globals.
    with args.template.open("rb") as handle:
        template = pickle.load(handle)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    conditioning_parts = [
        ("start_audio_feat", payload["model"]["start_audio_feat"].numpy()),
        ("start_motion_feat", payload["model"]["start_motion_feat"].numpy()),
        ("null_audio_feat", payload["model"]["null_audio_feat"].numpy()),
    ]
    conditioning = np.concatenate([value.reshape(-1) for _, value in conditioning_parts]).astype("<f4")
    conditioning_path = args.output_dir / "joyvasa-conditioning.bin"
    conditioning.tofile(conditioning_path)

    steps = 51
    x = torch.linspace(0, 50, steps)
    alpha_bars_raw = torch.cos(((x / 50) + 0.008) / 1.008 * torch.pi * 0.5) ** 2
    alpha_bars_raw = alpha_bars_raw / alpha_bars_raw[0]
    betas = 1 - alpha_bars_raw[1:] / alpha_bars_raw[:-1]
    betas = torch.clip(betas, 0.0001, 0.999)
    betas = torch.cat([torch.zeros(1), betas])
    alphas = 1 - betas
    alpha_bars = torch.cumprod(alphas, dim=0)
    schedule = torch.stack([alphas, alpha_bars], dim=1).numpy().astype("<f4")
    schedule_path = args.output_dir / "joyvasa-schedule.bin"
    schedule.tofile(schedule_path)

    template_json = {
        key: np.asarray(value, dtype=np.float32).reshape(-1).tolist()
        for key, value in template.items()
    }
    template_path = args.output_dir / "joyvasa-motion-template.json"
    template_path.write_text(json.dumps(template_json, separators=(",", ":")), encoding="utf-8")

    offset = 0
    layout = {}
    for name, value in conditioning_parts:
        layout[name] = {"offset": offset, "length": int(value.size), "shape": list(value.shape)}
        offset += value.size
    metadata = {
        "conditioning": {"bytes": conditioning_path.stat().st_size, "sha256": sha256(conditioning_path), "layout": layout},
        "schedule": {"bytes": schedule_path.stat().st_size, "sha256": sha256(schedule_path), "shape": [51, 2], "columns": ["alpha", "alpha_bar"]},
        "template": {"bytes": template_path.stat().st_size, "sha256": sha256(template_path), "keys": sorted(template_json)},
    }
    (args.output_dir / "joyvasa-runtime.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
