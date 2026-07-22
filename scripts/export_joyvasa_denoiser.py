"""Export the pinned JoyVASA diffusion denoiser to a browser-oriented ONNX graph.

The checkpoint contains argparse.Namespace, pathlib.PosixPath, collections.OrderedDict,
and PyTorch tensor rebuild/storage globals. The non-default classes are explicitly
allowlisted via add_safe_globals; all others are rejected by weights_only=True.
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


EXPECTED_CHECKPOINT_SHA256 = "9dd869329725caedf5f0c13dd383abec1e385f566d8afe2047b141f604844e80"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    checkpoint_hash = sha256(args.checkpoint)
    if checkpoint_hash != EXPECTED_CHECKPOINT_SHA256:
        raise RuntimeError(f"Unexpected checkpoint SHA-256: {checkpoint_hash}")

    sys.path.insert(0, str(args.source))
    import src.modules.dit_talking_head as dit_module

    # JoyVASA's helper defaults this mask to CUDA even when the network itself
    # is constructed on CPU. Keep the upstream source untouched and make the
    # export-only call follow the tensors' actual device.
    upstream_enc_dec_mask = dit_module.enc_dec_mask

    def cpu_enc_dec_mask(T, S, frame_width=2, expansion=0, device="cpu"):
        return upstream_enc_dec_mask(T, S, frame_width, expansion, device="cpu")

    dit_module.enc_dec_mask = cpu_enc_dec_mask
    DenoisingNetwork = dit_module.DenoisingNetwork

    torch.serialization.add_safe_globals([argparse.Namespace, PosixPath])
    payload = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    checkpoint_args = payload["args"]
    checkpoint_expected = {
        "n_diff_steps": 50,
        "feature_dim": 256,
        "n_heads": 8,
        "n_layers": 6,
        "n_motions": 100,
        "n_prev_motions": 10,
        "motion_feat_dim": 73,
        "use_indicator": True,
    }
    checkpoint_actual = {key: getattr(checkpoint_args, key) for key in checkpoint_expected}
    if checkpoint_actual != checkpoint_expected:
        raise RuntimeError(f"Unexpected JoyVASA checkpoint config: {checkpoint_actual}")

    # The pinned JoyVASA revision does not forward most training CLI fields into
    # DenoisingNetwork. Reproduce DitTalkingHead's real constructor call exactly:
    # checkpoint motion/feature dimensions plus DenoisingNetwork defaults. The
    # resulting state is 8 layers, a 501-step sinusoidal embedding, and no
    # indicator channel. Strict loading below is the final guard against drift.
    effective_architecture = {
        "motion_feat_dim": checkpoint_args.motion_feat_dim,
        "feature_dim": checkpoint_args.feature_dim,
        "n_heads": 8,
        "n_layers": 8,
        "n_motions": 100,
        "n_prev_motions": 10,
        "n_diff_steps_embedding": 500,
        "use_indicator": False,
        "learnable_pe": False,
    }

    model = DenoisingNetwork(
        device="cpu",
        motion_feat_dim=checkpoint_args.motion_feat_dim,
        feature_dim=checkpoint_args.feature_dim,
    ).eval()
    prefix = "denoising_net."
    state = {key[len(prefix):]: value for key, value in payload["model"].items() if key.startswith(prefix)}
    missing, unexpected = model.load_state_dict(state, strict=True)
    if missing or unexpected:
        raise RuntimeError(f"State mismatch, missing={missing}, unexpected={unexpected}")

    torch.manual_seed(20260710)
    inputs = (
        torch.randn(2, 100, 73),
        torch.randn(2, 100, 256),
        torch.randn(2, 10, 73),
        torch.randn(2, 10, 256),
        torch.tensor([50, 50], dtype=torch.int64),
    )
    with torch.no_grad():
        reference = model(*inputs).cpu().numpy()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        inputs,
        args.output,
        input_names=["motion", "audio", "previous_motion", "previous_audio", "step"],
        output_names=["motion_prediction"],
        opset_version=17,
        do_constant_folding=True,
        export_params=True,
    )
    graph = onnx.load(args.output, load_external_data=False)
    onnx.checker.check_model(graph)
    np.savez_compressed(
        args.output.with_suffix(".reference.npz"),
        motion=inputs[0].numpy(),
        audio=inputs[1].numpy(),
        previous_motion=inputs[2].numpy(),
        previous_audio=inputs[3].numpy(),
        step=inputs[4].numpy(),
        motion_prediction=reference,
    )
    metadata = {
        "checkpoint_sha256": checkpoint_hash,
        "onnx_sha256": sha256(args.output),
        "onnx_bytes": args.output.stat().st_size,
        "opset": 17,
        "checkpoint_config": checkpoint_actual,
        "effective_architecture": effective_architecture,
        "inputs": {item.name: [dim.dim_value for dim in item.type.tensor_type.shape.dim] for item in graph.graph.input},
        "outputs": {item.name: [dim.dim_value for dim in item.type.tensor_type.shape.dim] for item in graph.graph.output},
        "nodes": len(graph.graph.node),
    }
    args.output.with_suffix(".json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
