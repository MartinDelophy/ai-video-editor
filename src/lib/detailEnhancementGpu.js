import { normalizeDetailSettings } from "./detailEnhancement.js";

const COMPUTE = `
struct Params { width: u32, height: u32, radius: u32, padding: u32, depth: f32, edges: f32, pad1: f32, pad2: f32 }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> luma: array<f32>;
@group(0) @binding(2) var<storage, read_write> horizontal: array<vec2<f32>>;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(4) var<uniform> params: Params;
fn index(x: i32, y: i32) -> u32 {
  return u32(clamp(y, 0, i32(params.height) - 1)) * params.width + u32(clamp(x, 0, i32(params.width) - 1));
}
@compute @workgroup_size(8, 8) fn luminance(@builtin(global_invocation_id) p: vec3<u32>) {
  if (p.x >= params.width || p.y >= params.height) { return; }
  let rgb = textureLoad(source, vec2<i32>(p.xy), 0).rgb * 255.0;
  luma[p.y * params.width + p.x] = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
}
@compute @workgroup_size(8, 8) fn blurHorizontal(@builtin(global_invocation_id) p: vec3<u32>) {
  if (p.x >= params.width || p.y >= params.height) { return; }
  let x = i32(p.x); let y = i32(p.y); let radius = i32(params.radius);
  var fine = 0.0; var broad = 0.0;
  if (params.edges > 0.0) {
    for (var offset = -1; offset <= 1; offset++) { fine += luma[index(x + offset, y)]; }
    fine /= 3.0;
  }
  if (params.depth > 0.0) {
    for (var offset = -radius; offset <= radius; offset++) { broad += luma[index(x + offset, y)]; }
    broad /= f32(radius * 2 + 1);
  }
  horizontal[index(x, y)] = vec2<f32>(fine, broad);
}
@compute @workgroup_size(8, 8) fn enhance(@builtin(global_invocation_id) p: vec3<u32>) {
  if (p.x >= params.width || p.y >= params.height) { return; }
  let x = i32(p.x); let y = i32(p.y); let radius = i32(params.radius);
  var fine = 0.0; var broad = 0.0;
  if (params.edges > 0.0) {
    for (var offset = -1; offset <= 1; offset++) { fine += horizontal[index(x, y + offset)].x; }
    fine /= 3.0;
  }
  if (params.depth > 0.0) {
    for (var offset = -radius; offset <= radius; offset++) { broad += horizontal[index(x, y + offset)].y; }
    broad /= f32(radius * 2 + 1);
  }
  let value = luma[index(x, y)];
  let high = value - fine;
  let edgeDetail = sign(high) * max(0.0, abs(high) - 1.5);
  let localContrast = select(0.0, 10.0 * tanh((value - broad) / 20.0) * params.depth, params.depth > 0.0);
  let sharpness = select(0.0, 12.0 * tanh(edgeDetail / 12.0) * params.edges, params.edges > 0.0);
  let correction = localContrast + sharpness;
  let original = textureLoad(source, vec2<i32>(p.xy), 0);
  let rgb = original.rgb * 255.0;
  let headroom = select(min(rgb.r, min(rgb.g, rgb.b)), 255.0 - max(rgb.r, max(rgb.g, rgb.b)), correction > 0.0);
  let delta = sign(correction) * min(abs(correction), headroom);
  textureStore(outputTexture, vec2<i32>(p.xy), vec4<f32>(clamp(round(rgb + vec3<f32>(delta)), vec3<f32>(0.0), vec3<f32>(255.0)) / 255.0, original.a));
}`;

const DISPLAY = `
@group(0) @binding(0) var image: texture_2d<f32>;
@vertex fn vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(positions[index], 0.0, 1.0);
}
@fragment fn fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let color = textureLoad(image, vec2<i32>(position.xy), 0);
  return vec4<f32>(color.rgb * color.a, color.a);
}`;

// All intermediate pixels remain on the GPU; only the completed bitmap is transferred.
export async function createDetailEnhancementGpu() {
  if (!navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance", forceFallbackAdapter: false });
  if (!adapter || adapter.isFallbackAdapter) return null;
  const device = await adapter.requestDevice();
  let lost = false;
  device.lost.then(() => { lost = true; });
  const format = navigator.gpu.getPreferredCanvasFormat();
  let canvas = null;
  let context = null;
  let resources = [];
  let source, outputTexture, uniform, bindGroup, displayGroup;
  try {
    const module = device.createShaderModule({ code: COMPUTE });
    const compilation = await module.getCompilationInfo();
    const errors = compilation.messages.filter((message) => message.type === "error");
    if (errors.length) throw new Error(errors.map((message) => `${message.lineNum}: ${message.message}`).join("; "));
    const layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: {} },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba8unorm" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
    ] });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const pipelines = await Promise.all(["luminance", "blurHorizontal", "enhance"].map((entryPoint) => device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module, entryPoint } })));
    const displayModule = device.createShaderModule({ code: DISPLAY });
    const displayPipeline = await device.createRenderPipelineAsync({ layout: "auto", vertex: { module: displayModule, entryPoint: "vertex" }, fragment: { module: displayModule, entryPoint: "fragment", targets: [{ format }] }, primitive: { topology: "triangle-list" } });
    return {
      dispose() { resources.forEach((resource) => resource.destroy()); context?.unconfigure(); device.destroy(); },
      async render(bitmap, settings) {
        if (lost) throw new Error("WebGPU device lost");
        const { width, height } = bitmap;
        if (Math.max(width, height) > device.limits.maxTextureDimension2D || width * height * 8 > device.limits.maxStorageBufferBindingSize) throw new Error("Frame exceeds WebGPU limits");
        device.pushErrorScope("validation");
        try {
          if (!canvas || canvas.width !== width || canvas.height !== height) {
            resources.forEach((resource) => resource.destroy());
            resources = [];
            context?.unconfigure();
            canvas = new OffscreenCanvas(width, height);
            context = canvas.getContext("webgpu");
            context.configure({ device, format, alphaMode: "premultiplied", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
            source = device.createTexture({ size: [width, height], format: "rgba8unorm", usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
            outputTexture = device.createTexture({ size: [width, height], format: "rgba8unorm", usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
            const luma = device.createBuffer({ size: width * height * 4, usage: GPUBufferUsage.STORAGE });
            const horizontal = device.createBuffer({ size: width * height * 8, usage: GPUBufferUsage.STORAGE });
            uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            resources.push(source, outputTexture, luma, horizontal, uniform);
            bindGroup = device.createBindGroup({ layout, entries: [
              { binding: 0, resource: source.createView() }, { binding: 1, resource: { buffer: luma } },
              { binding: 2, resource: { buffer: horizontal } }, { binding: 3, resource: outputTexture.createView() },
              { binding: 4, resource: { buffer: uniform } },
            ] });
            displayGroup = device.createBindGroup({ layout: displayPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: outputTexture.createView() }] });
          }
          const { depth, edges } = normalizeDetailSettings(settings);
          const params = new ArrayBuffer(32);
          new Uint32Array(params).set([width, height, Math.max(2, Math.round(Math.min(width, height) * 0.012)), 0]);
          new Float32Array(params).set([depth / 100, edges / 100], 4);
          device.queue.writeBuffer(uniform, 0, params);
          device.queue.copyExternalImageToTexture({ source: bitmap, flipY: false }, { texture: source, premultipliedAlpha: false }, [width, height]);
          const encoder = device.createCommandEncoder();
          for (const pipeline of pipelines) {
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8)); pass.end();
          }
          const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
          pass.setPipeline(displayPipeline); pass.setBindGroup(0, displayGroup); pass.draw(3); pass.end();
          device.queue.submit([encoder.finish()]);
        } catch (error) {
          await device.popErrorScope();
          throw error;
        }
        const error = await device.popErrorScope();
        if (error || lost) throw new Error(error?.message || "WebGPU device lost");
        return canvas;
      },
    };
  } catch (error) { device.destroy(); throw error; }
}
