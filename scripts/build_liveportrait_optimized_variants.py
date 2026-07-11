"""Build browser-oriented LivePortrait generator variants.

The preview graph keeps the complete final SPADE residual block but runs it at
128px before the original sub-pixel RGB head. That preserves the semantic path
and produces a genuine neural 256px output while reducing the most expensive
high-resolution convolutions. Both preview and quality graphs are then converted
to mixed FP16 with FP32 public inputs/outputs for browser compatibility.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
from pathlib import Path

import numpy as np
import onnx
from onnx import numpy_helper
from onnxconverter_common import float16


PREVIEW_SOURCE = "/spade_generator/up_0/Add_output_0"
SHORTCUT_NODE = "/spade_generator/up_1/conv_s/Conv"
RGB_NODE = "/spade_generator/conv_img/conv_img.0/Conv"


def ancestors(model: onnx.ModelProto, outputs: set[str]) -> list[onnx.NodeProto]:
    producers = {output: node for node in model.graph.node for output in node.output}
    needed: set[str] = set()

    def visit(value: str) -> None:
        node = producers.get(value)
        if node is None or node.name in needed:
            return
        needed.add(node.name)
        for input_name in node.input:
            visit(input_name)

    for output in outputs:
        visit(output)
    return [deepcopy(node) for node in model.graph.node if node.name in needed]


def build_preview(model: onnx.ModelProto) -> onnx.ModelProto:
    preview = deepcopy(model)
    # Keep the complete final SPADE block, but run it at 128px instead of
    # upsampling to 256px first. The unchanged sub-pixel RGB head then produces
    # a genuine 256px output. This avoids the edge-like artifacts caused by
    # bypassing the semantic refinement block while cutting its spatial work 4x.
    preview_scale_name = "preview_up_1_scales"
    preview.graph.initializer.append(
        numpy_helper.from_array(np.asarray([1, 1, 1, 1], dtype=np.float32), preview_scale_name),
    )
    for node in preview.graph.node:
        if node.name == "/spade_generator/up_1/Resize":
            node.input[2] = preview_scale_name
    for index, value in enumerate(preview.graph.initializer):
        if value.name == "/spade_generator/up_1/norm_s/Concat_1_output_0":
            preview.graph.initializer[index].CopyFrom(
                numpy_helper.from_array(
                    np.asarray([1, 256, 128, 128], dtype=np.int64),
                    value.name,
                ),
            )
    output = preview.graph.output[0]
    for dimension, size in zip(output.type.tensor_type.shape.dim, [1, 3, 256, 256]):
        dimension.dim_value = size
    del preview.graph.value_info[:]
    preview.producer_name = "Timeline Studio LivePortrait preview optimizer"
    preview.producer_version = "2"
    onnx.checker.check_model(preview)
    return preview


def convert_fp16(model: onnx.ModelProto) -> onnx.ModelProto:
    converted = float16.convert_float_to_float16(
        model,
        keep_io_types=True,
        disable_shape_infer=False,
        # Resize requires float32 roi/scales inputs in the ONNX schema. These
        # numerically sensitive/reduction ops also stay in float32 while the
        # convolution-heavy path and its weights use float16.
        op_block_list=["GridSample", "InstanceNormalization", "ReduceSum", "Resize"],
    )
    converted.producer_name = "Timeline Studio LivePortrait mixed FP16 optimizer"
    converted.producer_version = "1"
    onnx.checker.check_model(converted)
    return converted


def save(model: onnx.ModelProto, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model, path)
    print(f"{path.name}: nodes={len(model.graph.node)} bytes={path.stat().st_size}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    source = onnx.load(args.input, load_external_data=True)
    preview = build_preview(source)
    save(preview, args.output_dir / "liveportrait-generator-preview-fp32.onnx")
    save(convert_fp16(preview), args.output_dir / "liveportrait-generator-preview-fp16.onnx")
    save(convert_fp16(source), args.output_dir / "liveportrait-generator-quality-fp16.onnx")


if __name__ == "__main__":
    main()
