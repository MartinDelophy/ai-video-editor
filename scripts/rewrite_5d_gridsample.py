"""Rewrite static 5D ONNX GridSample nodes into WebGPU-friendly 4D sampling.

For trilinear sampling, XY bilinear sampling is batched across every input depth
slice with one 4D GridSample. Linear Z weights are then applied and reduced.
This preserves align_corners=0 and zeros padding without native 5D GridSample.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper, shape_inference


def tensor_shapes(model: onnx.ModelProto) -> dict[str, list[int]]:
    inferred = shape_inference.infer_shapes(model)
    values = list(inferred.graph.input) + list(inferred.graph.value_info) + list(inferred.graph.output)
    return {
        value.name: [dimension.dim_value for dimension in value.type.tensor_type.shape.dim]
        for value in values
    }


def rewrite_node(node: onnx.NodeProto, input_shape: list[int], grid_shape: list[int], index: int):
    n, channels, depth, height, width = input_shape
    grid_n, out_depth, out_height, out_width, grid_coords = grid_shape
    if n != grid_n or grid_coords != 3 or not all(input_shape + grid_shape):
        raise RuntimeError(f"GridSample must have fully static 5D shapes: {input_shape}, {grid_shape}")
    attrs = {attribute.name: helper.get_attribute_value(attribute) for attribute in node.attribute}
    if attrs != {"align_corners": 0, "mode": b"linear", "padding_mode": b"zeros"}:
        raise RuntimeError(f"Unsupported GridSample attributes: {attrs}")

    prefix = f"webgpu_grid5d_{index}"
    initializers = []

    def const(name: str, values, dtype=np.int64):
        full_name = f"{prefix}_{name}"
        initializers.append(numpy_helper.from_array(np.asarray(values, dtype=dtype), full_name))
        return full_name

    shape_volume = const("shape_volume", [n * depth, channels, height, width])
    slice_starts = const("slice_starts", [0])
    slice_ends = const("slice_ends", [2])
    slice_axes = const("slice_axes", [4])
    slice_steps = const("slice_steps", [1])
    unsqueeze_depth_axis = const("unsqueeze_depth_axis", [1])
    tile_repeats = const("tile_repeats", [1, depth, 1, 1, 1, 1])
    shape_grid2d = const("shape_grid2d", [n * depth, out_depth * out_height, out_width, 2])
    shape_sampled = const("shape_sampled", [n, depth, channels, out_depth, out_height, out_width])
    z_starts = const("z_starts", [2])
    z_ends = const("z_ends", [3])
    depth_values = const("depth_values", np.arange(depth).reshape(1, 1, 1, 1, depth), np.float32)
    z_scale = const("z_scale", [depth / 2], np.float32)
    z_offset = const("z_offset", [(depth - 1) / 2], np.float32)
    one = const("one", [1], np.float32)
    zero = const("zero", [0], np.float32)
    channel_axis = const("channel_axis", [1])
    reduce_axis = const("reduce_axis", [5])

    names = {key: f"{prefix}_{key}" for key in [
        "volume_ndchw", "volume_4d", "grid_xy", "grid_xy_depth", "grid_xy_tiled", "grid_2d",
        "sampled_4d", "sampled_6d", "sampled_ordered", "grid_z", "z_scaled", "z_input",
        "z_delta", "z_distance", "z_weight_raw", "z_weights", "z_weights_channel", "weighted",
    ]}
    nodes = [
        helper.make_node("Transpose", [node.input[0]], [names["volume_ndchw"]], perm=[0, 2, 1, 3, 4], name=f"{prefix}/volume_to_ndchw"),
        helper.make_node("Reshape", [names["volume_ndchw"], shape_volume], [names["volume_4d"]], name=f"{prefix}/volume_to_4d"),
        helper.make_node("Slice", [node.input[1], slice_starts, slice_ends, slice_axes, slice_steps], [names["grid_xy"]], name=f"{prefix}/slice_xy"),
        helper.make_node("Unsqueeze", [names["grid_xy"], unsqueeze_depth_axis], [names["grid_xy_depth"]], name=f"{prefix}/add_input_depth"),
        helper.make_node("Tile", [names["grid_xy_depth"], tile_repeats], [names["grid_xy_tiled"]], name=f"{prefix}/tile_xy"),
        helper.make_node("Reshape", [names["grid_xy_tiled"], shape_grid2d], [names["grid_2d"]], name=f"{prefix}/grid_to_2d"),
        helper.make_node("GridSample", [names["volume_4d"], names["grid_2d"]], [names["sampled_4d"]], align_corners=0, mode="linear", padding_mode="zeros", name=f"{prefix}/grid_sample_2d"),
        helper.make_node("Reshape", [names["sampled_4d"], shape_sampled], [names["sampled_6d"]], name=f"{prefix}/sampled_to_6d"),
        helper.make_node("Transpose", [names["sampled_6d"]], [names["sampled_ordered"]], perm=[0, 2, 3, 4, 5, 1], name=f"{prefix}/depth_last"),
        helper.make_node("Slice", [node.input[1], z_starts, z_ends, slice_axes, slice_steps], [names["grid_z"]], name=f"{prefix}/slice_z"),
        helper.make_node("Mul", [names["grid_z"], z_scale], [names["z_scaled"]], name=f"{prefix}/scale_z"),
        helper.make_node("Add", [names["z_scaled"], z_offset], [names["z_input"]], name=f"{prefix}/offset_z"),
        helper.make_node("Sub", [names["z_input"], depth_values], [names["z_delta"]], name=f"{prefix}/z_delta"),
        helper.make_node("Abs", [names["z_delta"]], [names["z_distance"]], name=f"{prefix}/z_distance"),
        helper.make_node("Sub", [one, names["z_distance"]], [names["z_weight_raw"]], name=f"{prefix}/z_weight_raw"),
        helper.make_node("Clip", [names["z_weight_raw"], zero, one], [names["z_weights"]], name=f"{prefix}/z_weight_clip"),
        helper.make_node("Unsqueeze", [names["z_weights"], channel_axis], [names["z_weights_channel"]], name=f"{prefix}/z_weight_channel"),
        helper.make_node("Mul", [names["sampled_ordered"], names["z_weights_channel"]], [names["weighted"]], name=f"{prefix}/apply_z_weights"),
        helper.make_node("ReduceSum", [names["weighted"], reduce_axis], [node.output[0]], keepdims=0, name=f"{prefix}/sum_z"),
    ]
    return nodes, initializers


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    model = onnx.load(args.input, load_external_data=True)
    shapes = tensor_shapes(model)
    rewritten = []
    initializers = []
    count = 0
    for node in model.graph.node:
        if node.op_type == "GridSample" and len(shapes.get(node.input[0], [])) == 5:
            nodes, constants = rewrite_node(node, shapes[node.input[0]], shapes[node.input[1]], count)
            rewritten.extend(nodes)
            initializers.extend(constants)
            count += 1
        else:
            rewritten.append(node)
    if count == 0:
        raise RuntimeError("No static 5D GridSample nodes found")
    del model.graph.node[:]
    model.graph.node.extend(rewritten)
    model.graph.initializer.extend(initializers)
    model.producer_name = "Timeline Studio LivePortrait WebGPU rewrite"
    model.producer_version = "1"
    onnx.checker.check_model(model)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model, args.output)
    print(f"rewritten={count} nodes={len(model.graph.node)} bytes={args.output.stat().st_size}")


if __name__ == "__main__":
    main()
