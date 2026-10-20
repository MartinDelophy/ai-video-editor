"""Synthetic schema oracle: uses upstream serializers, never ffprobe or real media.

The fixture supplies already-inspected metadata. __new__ bypasses media probing only;
segment, material, transition and ScriptFile serialization are upstream code.
This is not evidence of actual Jianying/media compatibility.
"""
import json
import os
from pathlib import Path
import sys
import uuid

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent / "vendor"))
import pyJianYingDraft as jy

fixture = json.load(sys.stdin)
p = fixture["payload"]
ratios = {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (1080, 1080), "4:5": (1080, 1350)}
script = jy.ScriptFile(*ratios[p["ratioId"]], 30, True)
transition_names = {"fade": "叠化", "zoom": "推近", "flash": "闪白", "wipe-left": "向左擦除",
                    "wipe-up": "向上擦除", "blur": "模糊", "split": "分割", "glitch": "故障"}


def micros(seconds):
    return round(seconds * 1_000_000)


def add_media(item, track, start, root_ref=None, clip_settings=None):
    binding = item.get("mediaRef") or item.get("mediaBindings", {}).get("blob") or item.get("mediaBindings", {}).get("src") or root_ref
    source = fixture["media"][binding["entityId"]]
    audio = source["kind"] == "audio"
    cls = jy.AudioMaterial if audio else jy.VideoMaterial
    material = cls.__new__(cls)
    material.material_id = uuid.uuid4().hex
    material.path = source["path"]
    material.material_name = item.get("name") or os.path.basename(material.path)
    material.local_material_id = Path(material.path).stem
    material.duration = 10_800_000_000 if source["kind"] == "image" else micros(source["durationSeconds"])
    if not audio:
        material.material_type = "photo" if source["kind"] == "image" else "video"
        material.width = item["width"]
        material.height = item["height"]
        material.crop_settings = jy.CropSettings()
    speed = 1 if source["kind"] == "image" else item.get("playbackRate", 1)
    segment_cls = jy.AudioSegment if audio else jy.VideoSegment
    target = jy.Timerange(micros(start), micros(item["duration"]))
    source_range = jy.Timerange(micros(item.get("sourceStart", 0)), micros(item["duration"] * speed))
    volume = 0 if source["kind"] == "image" and track == "image" else item.get("volume", 1)
    if not audio and item.get("baseTransform"):
        base = item["baseTransform"]
        clip_settings = jy.ClipSettings(
            alpha=base.get("opacity", 1), rotation=base.get("rotation", 0),
            scale_x=base.get("scale", 1), scale_y=base.get("scale", 1),
            transform_x=base.get("x", 0) / 50, transform_y=-base.get("y", 0) / 50)
    segment = (segment_cls(material, target, source_timerange=source_range, speed=speed, volume=volume)
               if audio else segment_cls(material, target, source_timerange=source_range, speed=speed,
                                          volume=volume, clip_settings=clip_settings))
    if not audio:
        properties = [
            ("x", jy.KeyframeProperty.position_x, lambda value: value / 50),
            ("y", jy.KeyframeProperty.position_y, lambda value: -value / 50),
            ("scale", jy.KeyframeProperty.uniform_scale, lambda value: value),
            ("rotation", jy.KeyframeProperty.rotation, lambda value: value),
            ("opacity", jy.KeyframeProperty.alpha, lambda value: value),
        ]
        for name, prop, convert in properties:
            for frame in item.get("keyframes", []):
                if name in frame:
                    local_time = round(round(frame["time"] * 30) * 1_000_000 / 30)
                    segment.add_keyframe(prop, source_range.start + round(local_time * speed),
                                         convert(frame[name]))
    if item.get("transition"):
        transition = item["transition"]
        segment.add_transition(getattr(jy.TransitionType, transition_names[transition["id"]]), duration=micros(transition["duration"]))
    script.add_segment(segment, track_name=track)


script.add_track(jy.TrackType.video, "image", relative_index=0)
cursor = 0
for item in p["visualSegments"]:
    add_media(item, "image", cursor)
    cursor += item["duration"]
script.add_track(jy.TrackType.video, "overlay-0", relative_index=1)
for item in p["visualOverlaySegments"]:
    add_media(item, "overlay-0", item["start"])
script.add_track(jy.TrackType.audio, "audio-0")
for item in p["audioSegments"]:
    add_media(item, "audio-0", item["start"])
script.add_track(jy.TrackType.audio, "music-0")
for item in p["musicSegments"]:
    add_media(item, "music-0", item["start"], p["musicRef"])
script.add_track(jy.TrackType.audio, "source-0")
add_media({"duration": p["sourceAudioDuration"], "volume": p["sourceAudioVolume"]}, "source-0", p["sourceAudioStart"], p["sourceAudioRef"])
script.add_track(jy.TrackType.text, "caption-0")
for item in p["captionSegments"]:
    placement = item.get("placement", p["captionPlacement"])
    segment = jy.TextSegment(item["text"], jy.Timerange(micros(item["start"]), micros(item["end"] - item["start"])),
                             clip_settings=jy.ClipSettings(transform_x=(placement["x"]-50)/50, transform_y=(50-placement["y"])/50))
    script.add_segment(segment, track_name="caption-0")
    # Upstream leaves TextSegment.speed referenced but unregistered. Deliberately
    # register it so the oracle and exporter require a complete material closure.
    script.materials.speeds.append(segment.speed)
script.add_track(jy.TrackType.video, "sticker-0", relative_index=10000)
for item in p["stickerSegments"]:
    source = fixture["media"]["sticker"]
    canvas_width, canvas_height = ratios[p["ratioId"]]
    source_ratio, canvas_ratio = source["width"] / source["height"], canvas_width / canvas_height
    fitted_width = canvas_width if source_ratio >= canvas_ratio else canvas_height * source_ratio
    requested_scale = max(0.2, min(3, item.get("scale", 1)))
    desired_width = min(canvas_width, canvas_height) * 0.22 * requested_scale * (1 if source_ratio >= 1 else source_ratio)
    image_scale = desired_width / fitted_width
    add_media({**item, "name": "热度火焰", "width": source["width"], "height": source["height"],
               "volume": 0}, "sticker-0", item["start"], {"entityId": "sticker"},
              jy.ClipSettings(alpha=max(0, min(1, item.get("opacity", 1))), rotation=item.get("rotation", 0),
                              scale_x=image_scale, scale_y=image_scale,
                              transform_x=(item.get("x", 50)-50)/50,
                              transform_y=(50-item.get("y", 50))/50))
print(script.dumps())
