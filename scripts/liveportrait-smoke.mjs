import fs from "node:fs";
import path from "node:path";
import * as ort from "onnxruntime-web";

const modelDir = process.argv[2] ?? "/private/tmp";
const sourcePath = process.argv[3] ?? "/private/tmp/liveportrait-source-256.rgb";
const outputDir = process.argv[4] ?? "/private/tmp/liveportrait-smoke";
const renderSpecs = (process.argv[5] ?? "closed:0.05,open:0.35")
  .split(",")
  .map((entry) => {
    const [name, ratio] = entry.split(":");
    return [name, Number(ratio)];
  });

ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;

const modelPath = (name) => path.join(modelDir, `liveportrait-${name}.onnx`);
const tensor = (data, dims) => new ort.Tensor("float32", data, dims);

function log(stage, detail = "") {
  process.stdout.write(`[liveportrait] ${stage}${detail ? `: ${detail}` : ""}\n`);
}

function imageTensorFromRgb(bytes) {
  if (bytes.length !== 256 * 256 * 3) throw new Error(`Expected 256x256 RGB input, got ${bytes.length} bytes`);
  const data = new Float32Array(bytes.length);
  const plane = 256 * 256;
  for (let i = 0; i < plane; i += 1) {
    data[i] = bytes[i * 3] / 255;
    data[plane + i] = bytes[i * 3 + 1] / 255;
    data[plane * 2 + i] = bytes[i * 3 + 2] / 255;
  }
  return tensor(data, [1, 3, 256, 256]);
}

function headposeDegree(logits) {
  let max = -Infinity;
  for (const value of logits) max = Math.max(max, value);
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < logits.length; i += 1) {
    const value = Math.exp(logits[i] - max);
    sum += value;
    weighted += value * i;
  }
  return (weighted / sum) * 3 - 97.5;
}

function multiply3x3(a, b) {
  const out = new Float32Array(9);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] = a[row * 3] * b[col]
        + a[row * 3 + 1] * b[3 + col]
        + a[row * 3 + 2] * b[6 + col];
    }
  }
  return out;
}

function rotationMatrix(pitchDegree, yawDegree, rollDegree) {
  const pitch = pitchDegree * Math.PI / 180;
  const yaw = yawDegree * Math.PI / 180;
  const roll = rollDegree * Math.PI / 180;
  const rx = new Float32Array([1, 0, 0, 0, Math.cos(pitch), -Math.sin(pitch), 0, Math.sin(pitch), Math.cos(pitch)]);
  const ry = new Float32Array([Math.cos(yaw), 0, Math.sin(yaw), 0, 1, 0, -Math.sin(yaw), 0, Math.cos(yaw)]);
  const rz = new Float32Array([Math.cos(roll), -Math.sin(roll), 0, Math.sin(roll), Math.cos(roll), 0, 0, 0, 1]);
  const product = multiply3x3(rz, multiply3x3(ry, rx));
  return new Float32Array([product[0], product[3], product[6], product[1], product[4], product[7], product[2], product[5], product[8]]);
}

function transformKeypoints(motion) {
  const pitch = headposeDegree(motion.pitch.data);
  const yaw = headposeDegree(motion.yaw.data);
  const roll = headposeDegree(motion.roll.data);
  const rotation = rotationMatrix(pitch, yaw, roll);
  const kp = motion.kp.data;
  const exp = motion.exp.data;
  const translation = motion.t.data;
  const scale = motion.scale.data[0];
  const out = new Float32Array(63);
  for (let point = 0; point < 21; point += 1) {
    const offset = point * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      out[offset + axis] = scale * (
        kp[offset] * rotation[axis]
        + kp[offset + 1] * rotation[3 + axis]
        + kp[offset + 2] * rotation[6 + axis]
        + exp[offset + axis]
      );
    }
    out[offset] += translation[0];
    out[offset + 1] += translation[1];
  }
  return { data: out, pose: { pitch, yaw, roll, scale } };
}

async function createSession(name) {
  const started = Date.now();
  const session = await ort.InferenceSession.create(fs.readFileSync(modelPath(name)), {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  log(`loaded ${name}`, `${Date.now() - started} ms`);
  return session;
}

async function retargetLip(session, sourceKeypoints, targetRatio) {
  const input = new Float32Array(65);
  input.set(sourceKeypoints, 0);
  input[63] = 0.05;
  input[64] = targetRatio;
  const result = await session.run({ input: tensor(input, [1, 65]) });
  const keypoints = new Float32Array(63);
  for (let i = 0; i < 63; i += 1) keypoints[i] = sourceKeypoints[i] + result.output.data[i];
  return keypoints;
}

async function stitch(session, source, driving) {
  const input = new Float32Array(126);
  input.set(source, 0);
  input.set(driving, 63);
  const result = await session.run({ input: tensor(input, [1, 126]) });
  const output = new Float32Array(driving);
  for (let i = 0; i < 63; i += 1) output[i] += result.output.data[i];
  for (let point = 0; point < 21; point += 1) {
    output[point * 3] += result.output.data[63];
    output[point * 3 + 1] += result.output.data[64];
  }
  return output;
}

function writeRgbOutput(output, name) {
  const [batch, channels, height, width] = output.dims;
  if (batch !== 1 || channels !== 3) throw new Error(`Unexpected generator output ${output.dims.join("x")}`);
  const plane = height * width;
  const rgb = Buffer.alloc(plane * 3);
  for (let i = 0; i < plane; i += 1) {
    rgb[i * 3] = Math.round(Math.max(0, Math.min(1, output.data[i])) * 255);
    rgb[i * 3 + 1] = Math.round(Math.max(0, Math.min(1, output.data[plane + i])) * 255);
    rgb[i * 3 + 2] = Math.round(Math.max(0, Math.min(1, output.data[plane * 2 + i])) * 255);
  }
  fs.writeFileSync(path.join(outputDir, `${name}-${width}x${height}.rgb`), rgb);
  return { width, height };
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const image = imageTensorFromRgb(fs.readFileSync(sourcePath));

  const appearance = await createSession("appearance_feature_extractor");
  const appearanceOutput = await appearance.run({ img: image });
  const feature = appearanceOutput.output;
  log("appearance inference complete", feature.dims.join("x"));

  const motionExtractor = await createSession("motion_extractor");
  const motion = await motionExtractor.run({ img: image });
  const transformed = transformKeypoints(motion);
  const source = transformed.data;
  log("motion inference complete", JSON.stringify(transformed.pose));

  const lip = await createSession("stitching_lip");
  const stitching = await createSession("stitching");
  const drivingKeypoints = [];
  for (const [name, ratio] of renderSpecs) {
    if (!name || !Number.isFinite(ratio)) throw new Error(`Invalid render spec ${name}:${ratio}`);
    drivingKeypoints.push([name, await stitch(stitching, source, await retargetLip(lip, source, ratio))]);
  }

  const warping = await createSession("warping");
  const spade = await createSession("spade_generator");

  for (const [name, driving] of drivingKeypoints) {
    const started = Date.now();
    const warped = await warping.run({
      feature_3d: feature,
      kp_source: tensor(source, [1, 21, 3]),
      kp_driving: tensor(driving, [1, 21, 3]),
    });
    log(`${name} warping complete`, `${Date.now() - started} ms`);
    const generated = await spade.run({ input: warped["879"] });
    const dimensions = writeRgbOutput(generated.output, name);
    log(`${name} frame complete`, `${dimensions.width}x${dimensions.height}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
