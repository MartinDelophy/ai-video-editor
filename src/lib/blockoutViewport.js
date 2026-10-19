import { getBlockoutActorPose, getBlockoutShot } from "./blockoutScene.js";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
export function createBlockoutViewport(host, { onSelect, onTransform, onTime, onError }) {
  const scene = new T.Scene();
  scene.background = new T.Color("#222d36");
  scene.fog = new T.Fog("#222d36", 18, 42);
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  host.append(renderer.domElement);
  const camera = new T.PerspectiveCamera(48, 1, 0.1, 100),
    director = new T.PerspectiveCamera(42, 1, 0.1, 100),
    top = new T.OrthographicCamera(-6, 6, 7, -7, 0.1, 50);
  top.position.set(0, 20, -1);
  top.up.set(0, 0, -1);
  top.lookAt(0, 0, -1);
  camera.position.set(5, 3.8, 7);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 1, -1);
  orbit.enableDamping = true;
  const transform = new TransformControls(camera, renderer.domElement);
  scene.add(transform.getHelper());
  let model = null,
    selected = "actor-a",
    playing = false,
    time = 0,
    preview = false,
    frame = 0,
    last = performance.now(),
    dragging = false,
    disposed = false;
  const objects = new Map(),
    mat = (color) => new T.MeshStandardMaterial({ color, roughness: 0.85 });
  const clay = mat("#c7c9c5"),
    blue = mat("#86a8ba");
  const box = (w, h, d, x, y, z, material = clay, parent = scene) => {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  scene.add(new T.HemisphereLight("#f5f4ea", "#667784", 2.1));
  const sun = new T.DirectionalLight("#fff5df", 3);
  sun.position.set(-4, 10, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  scene.add(sun);
  const grid = new T.GridHelper(12, 24, "#71858a", "#52646c");
  grid.position.y = 0.005;
  scene.add(grid);
  const actor = () => {
    const group = new T.Group();
    box(0.48, 0.58, 0.26, 0, 1.12, 0, blue, group);
    const head = new T.Mesh(new T.SphereGeometry(0.22, 12, 10), clay);
    head.position.y = 1.63;
    group.add(head);
    const limbs = [];
    for (let side of [-1, 1]) {
      let leg = new T.Group();
      leg.position.set(side * 0.13, 0.82, 0);
      box(0.16, 0.7, 0.17, 0, -0.35, 0, clay, leg);
      box(0.18, 0.1, 0.29, 0, -0.72, 0.05, clay, leg);
      group.add(leg);
      let arm = new T.Group();
      arm.position.set(side * 0.34, 1.37, 0);
      box(0.13, 0.58, 0.14, 0, -0.28, 0, blue, arm);
      group.add(arm);
      limbs.push(leg, arm);
    }
    group.userData.limbs = limbs;
    return group;
  };
  function rebuild(next) {
    model = next;
    for (const item of objects.values()) {
      scene.remove(item);
      item.traverse((n) => {
        if (n.geometry) n.geometry.dispose();
      });
    }
    objects.clear();
    for (const object of model.objects) {
      let group = object.kind === "actor" ? actor() : new T.Group();
      if (object.kind === "prop") box(0.2, 0.3, 0.2, 0, 0.15, 0, mat("#dddcd0"), group);
      if (object.kind === "camera") {
        box(0.35, 0.25, 0.4, 0, 0, 0, mat("#72bcb7"), group);
        const cone = new T.Mesh(new T.ConeGeometry(0.25, 0.4, 4), mat("#72bcb7"));
        cone.rotation.x = Math.PI / 2;
        cone.position.z = -0.35;
        group.add(cone);
      }
      group.userData.id = object.id;
      group.traverse((n) => (n.userData.objectId = object.id));
      scene.add(group);
      objects.set(object.id, group);
    }
    select(selected);
    updatePositions();
  }
  function select(id) {
    selected = id;
    const object = objects.get(id);
    transform.detach();
    if (object && !preview && !playing && time === 0 && object.userData.id !== "camera")
      transform.attach(object);
  }
  function updatePositions() {
    if (!model) return;
    for (const object of model.objects) {
      const group = objects.get(object.id);
      const pose = getBlockoutActorPose(model, object, time);
      group.position.fromArray(pose.position);
      group.rotation.set(...pose.rotation.map((n) => T.MathUtils.degToRad(n)));
      group.scale.fromArray(object.scale);
      const moving = pose.moving;
      group.userData.limbs?.forEach(
        (limb, i) =>
          (limb.rotation.x = moving
            ? Math.sin(time * 8 + (i < 2 ? 0 : Math.PI)) * 0.32 * (i % 2 ? -0.7 : 1)
            : 0),
      );
      // The camera is an editable logical rig; its solid body must never occlude either viewport.
      group.visible = object.kind !== "camera";
    }
    const shot = getBlockoutShot(model, time);
    director.position.fromArray(shot.position);
    director.lookAt(...shot.target);
    const cameraObject = objects.get("camera");
    if (cameraObject) {
      cameraObject.position.fromArray(shot.position);
      cameraObject.lookAt(...shot.target);
    }
  }
  transform.addEventListener("dragging-changed", (e) => {
    dragging = e.value;
    orbit.enabled = !e.value;
    if (!e.value) {
      const o = transform.object;
      if (o)
        onTransform(o.userData.id, {
          position: o.position.toArray(),
          rotation: [o.rotation.x, o.rotation.y, o.rotation.z].map(T.MathUtils.radToDeg),
          scale: o.scale.toArray(),
        });
    }
  });
  const ray = new T.Raycaster(),
    mouse = new T.Vector2();
  let down = null;
  const pointerDown = (e) => {
    down = [e.clientX, e.clientY];
  };
  const pointerUp = (e) => {
    if (
      dragging ||
      transform.axis ||
      !down ||
      Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 ||
      preview
    )
      return;
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, (-(e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects([...objects.values()], true)[0];
    if (hit) {
      select(hit.object.userData.objectId);
      onSelect(hit.object.userData.objectId);
    }
  };
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  let tick = 0;
  function render(now) {
    if (disposed) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing && model) {
      time += dt;
      if (time >= model.duration) {
        time = model.duration;
        playing = false;
        onTime(time, false);
        select(selected);
      }
      if (now - tick > 70) {
        onTime(time, playing);
        tick = now;
      }
    }
    if (!dragging) updatePositions();
    orbit.update();
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.render(scene, preview ? director : camera);
    if (!preview && model?.objects.length) {
      const iw = Math.max(60, Math.min(220, w * 0.26, (h - 95) / 1.62)),
        ih = iw * 0.62;
      renderer.setScissorTest(true);
      renderer.setScissor(w - iw - 16, h - ih - 60, iw, ih);
      renderer.setViewport(w - iw - 16, h - ih - 60, iw, ih);
      director.aspect = iw / ih;
      director.updateProjectionMatrix();
      const helperVisible = transform.getHelper().visible;
      transform.getHelper().visible = false;
      renderer.render(scene, director);
      renderer.setScissor(w - iw - 16, 16, iw, iw);
      renderer.setViewport(w - iw - 16, 16, iw, iw);
      renderer.render(scene, top);
      transform.getHelper().visible = helperVisible;
      renderer.setScissorTest(false);
    }
    frame = requestAnimationFrame(render);
  }
  frame = requestAnimationFrame(render);
  const contextLost = (e) => {
    e.preventDefault();
    playing = false;
    onError?.();
  };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  return {
    update: rebuild,
    select,
    setMode(mode) {
      transform.setMode(mode);
    },
    seek(t) {
      time = t;
      updatePositions();
      select(selected);
    },
    play(value) {
      if (time >= model.duration) time = 0;
      playing = value;
      transform.detach();
      if (!value) select(selected);
    },
    preview(value) {
      preview = value;
      orbit.enabled = !value;
      select(selected);
      resize();
      director.aspect = host.clientWidth / host.clientHeight;
      director.updateProjectionMatrix();
    },
    reset() {
      camera.position.set(5, 3.8, 7);
      orbit.target.set(0, 1, -1);
    },
    async exportVideo({ signal, onProgress = () => {} } = {}) {
      if (!model?.objects.length || typeof MediaRecorder === "undefined")
        throw Error("VIDEO_UNAVAILABLE");
      const output = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      output.setSize(1280, 720, false);
      output.shadowMap.enabled = true;
      const exportCamera = director.clone();
      exportCamera.aspect = 16 / 9;
      exportCamera.updateProjectionMatrix();
      let stream = output.domElement.captureStream(0);
      let track = stream.getVideoTracks()[0];
      if (!track.requestFrame) {
        track.stop();
        stream = output.domElement.captureStream(24);
        track = stream.getVideoTracks()[0];
      }
      const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      if (!mime) {
        stream.getTracks().forEach((t) => t.stop());
        output.dispose();
        throw Error("VIDEO_UNAVAILABLE");
      }
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 }),
        chunks = [];
      const originalTime = time,
        originalPlaying = playing,
        originalGrid = grid.visible;
      playing = false;
      transform.getHelper().visible = false;
      grid.visible = false;
      let complete = false;
      const stopped = new Promise((resolve, reject) => {
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.onstop = () =>
          complete
            ? resolve(new Blob(chunks, { type: "video/webm" }))
            : reject(new DOMException("Aborted", "AbortError"));
        recorder.onerror = () => reject(Error("VIDEO_EXPORT_FAILED"));
      });
      // Attach rejection handling immediately; abort may happen between frames.
      stopped.catch(() => {});
      const cancel = () => {
        if (recorder.state !== "inactive") recorder.stop();
      };
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        signal?.throwIfAborted();
        recorder.start();
        const frames = Math.ceil(model.duration * 24);
        for (let i = 0; i < frames; i++) {
          signal?.throwIfAborted();
          time = i / 24;
          updatePositions();
          exportCamera.position.copy(director.position);
          exportCamera.quaternion.copy(director.quaternion);
          transform.getHelper().visible = false;
          output.render(scene, exportCamera);
          track.requestFrame?.();
          onProgress(i / frames);
          await new Promise((resolve) => setTimeout(resolve, 1000 / 24));
        }
        signal?.throwIfAborted();
        complete = true;
        recorder.stop();
        const blob = await stopped;
        onProgress(1);
        return blob;
      } finally {
        signal?.removeEventListener("abort", cancel);
        cancel();
        stream.getTracks().forEach((t) => t.stop());
        output.dispose();
        time = originalTime;
        playing = originalPlaying;
        grid.visible = originalGrid;
        transform.getHelper().visible = true;
        updatePositions();
        select(selected);
      }
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      orbit.dispose();
      transform.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      scene.traverse((n) => {
        n.geometry?.dispose();
        if (n.material) {
          for (const m of Array.isArray(n.material) ? n.material : [n.material]) m.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
