import { getCaptionScript } from "./timeline.js";

export function setCaptionSegmentPlacement(segments, segmentId, placement) {
  return segments.map((segment) => (
    segment.id === segmentId ? { ...segment, placement: { ...placement } } : segment
  ));
}

export function snapCaptionPlacement(x, y, thresholdX, thresholdY) {
  const closest = (value, anchors, threshold) => {
    const anchor = anchors.reduce((best, item) => (
      Math.abs(item - value) < Math.abs(best - value) ? item : best
    ));
    return Math.abs(anchor - value) <= threshold ? anchor : null;
  };
  const guideX = closest(x, [50], thresholdX);
  const guideY = closest(y, [18, 50, 78], thresholdY);
  return {
    x: guideX ?? x,
    y: guideY ?? y,
    guideX,
    guideY,
  };
}

export function findCaptionAudioLinkTarget(caption, audioSegments) {
  if (!caption || !audioSegments?.length) return null;
  const remembered = audioSegments.find((segment) => segment.id === caption.detachedAudioSegmentId);
  if (remembered) return remembered;
  const captionStart = Number(caption.start) || 0;
  const captionEnd = Number(caption.end) || captionStart;
  const captionCenter = (captionStart + captionEnd) / 2;
  return [...audioSegments].sort((a, b) => {
    const overlap = (segment) => Math.max(0, Math.min(captionEnd, segment.start + segment.duration) - Math.max(captionStart, segment.start));
    const overlapDelta = overlap(b) - overlap(a);
    if (overlapDelta) return overlapDelta;
    const center = (segment) => segment.start + segment.duration / 2;
    return Math.abs(center(a) - captionCenter) - Math.abs(center(b) - captionCenter);
  })[0] ?? null;
}

export function createCaptionEditingActions(d) {
  const t = typeof d.t === "function" ? d.t : (key) => key;
  function updateScript(nextScript) {
    d.setScript(nextScript);
  }

  function updateCaptionSegmentText(segmentId, text) {
    if (d.trackLocks.caption) {
      d.notify("字幕轨已锁定，无法编辑");
      return;
    }
    d.setCaptionSegments((items) => {
      const nextSegments = items.map((segment) =>
        segment.id === segmentId ? { ...segment, text } : segment,
      );
      d.setScript(getCaptionScript(nextSegments));
      return nextSegments;
    });
  }

  function toggleCaptionSegmentHidden(segmentId) {
    if (d.trackLocks.caption) {
      d.notify("字幕轨已锁定，无法隐藏");
      return;
    }
    d.setCaptionSegments((items) =>
      items.map((segment) =>
        segment.id === segmentId ? { ...segment, hidden: !segment.hidden } : segment,
      ),
    );
    d.notify("字幕显示状态已更新");
  }

  function unlinkCaptionAudio(segmentId) {
    if (d.trackLocks.caption) return void d.notify(t("captionTrackLocked"));
    d.setCaptionSegments((items) => items.map((segment) => segment.id === segmentId && segment.audioSegmentId
      ? { ...segment, detachedAudioSegmentId: segment.audioSegmentId, audioSegmentId: "" }
      : segment));
    d.notify(t("captionAudioUnlinked"));
  }

  function linkCaptionAudio(segmentId) {
    if (d.trackLocks.caption) return void d.notify(t("captionTrackLocked"));
    let linked = false;
    d.setCaptionSegments((items) => {
      const caption = items.find((segment) => segment.id === segmentId);
      const target = findCaptionAudioLinkTarget(caption, d.audioSegments);
      if (!caption || !target) return items;
      linked = true;
      return items.map((segment) => segment.id === segmentId
        ? { ...segment, audioSegmentId: target.id, detachedAudioSegmentId: "" }
        : segment);
    });
    d.notify(t(linked ? "captionAudioLinked" : "captionAudioUnavailable"));
  }

  function alignCaptionToAudio(segmentId) {
    if (d.trackLocks.caption) return void d.notify(t("captionTrackLocked"));
    let aligned = false;
    d.setCaptionSegments((items) => items.map((segment) => {
      if (segment.id !== segmentId) return segment;
      const target = d.audioSegments.find((audio) => audio.id === segment.audioSegmentId);
      if (!target) return segment;
      aligned = true;
      return { ...segment, start: target.start, end: target.start + target.duration };
    }));
    d.notify(t(aligned ? "captionAlignedToAudio" : "captionAudioUnavailable"));
  }

  function linkAudioToCaption(audioId) {
    if (d.trackLocks.caption) return void d.notify(t("captionTrackLocked"));
    const audio = d.audioSegments.find((segment) => segment.id === audioId);
    if (!audio) return void d.notify(t("captionAudioUnavailable"));
    let linked = false;
    d.setCaptionSegments((items) => {
      const remembered = items.find((caption) => caption.detachedAudioSegmentId === audioId);
      const candidates = items.filter((caption) => !caption.audioSegmentId);
      const caption = remembered ?? findCaptionAudioLinkTarget(
        { start: audio.start, end: audio.start + audio.duration },
        candidates.map((item) => ({ id: item.id, start: item.start, duration: item.end - item.start })),
      );
      const targetId = remembered?.id ?? caption?.id;
      if (!targetId) return items;
      linked = true;
      return items.map((item) => item.id === targetId
        ? { ...item, audioSegmentId: audioId, detachedAudioSegmentId: "" }
        : item);
    });
    d.notify(t(linked ? "captionAudioLinked" : "captionAudioUnavailable"));
  }

  function unlinkAudioCaptions(audioId) {
    if (d.trackLocks.caption) return void d.notify(t("captionTrackLocked"));
    d.setCaptionSegments((items) => items.map((caption) => caption.audioSegmentId === audioId
      ? { ...caption, detachedAudioSegmentId: audioId, audioSegmentId: "" }
      : caption));
    d.notify(t("captionAudioUnlinked"));
  }

  function alignAudioCaptions(audioId) {
    if (d.trackLocks.caption) return void d.notify(t("captionTrackLocked"));
    const audio = d.audioSegments.find((segment) => segment.id === audioId);
    if (!audio) return void d.notify(t("captionAudioUnavailable"));
    d.setCaptionSegments((items) => items.map((caption) => caption.audioSegmentId === audioId
      ? { ...caption, start: audio.start, end: audio.start + audio.duration }
      : caption));
    d.notify(t("captionAlignedToAudio"));
  }

  function disableSmartCaptionAvoidance() {
    if (!d.previewVisionKey || !d.previewVisionRecord?.options?.avoidCaptions) return false;
    d.setVisionRecords((records) => {
      const record = records[d.previewVisionKey];
      return record
        ? {
            ...records,
            [d.previewVisionKey]: {
              ...record,
              options: { ...record.options, avoidCaptions: false },
            },
          }
        : records;
    });
    return true;
  }

  function handleCaptionPositionChange(position) {
    const placementMap = {
      top: { x: 50, y: 18 },
      middle: { x: 50, y: 50 },
      bottom: { x: 50, y: 78 },
    };
    d.setCaptionPosition(position);
    d.setCaptionPlacement(placementMap[position] ?? placementMap.bottom);
    if (disableSmartCaptionAvoidance()) {
      d.notify("已切回手动字幕位置，智能避让已关闭");
    }
  }

  function startCaptionDrag(event, segmentId = d.currentCaptionSegment?.id) {
    if (event.button !== 0) return;
    if (d.trackLocks.caption) {
      d.notify("字幕轨已锁定，无法拖动");
      return;
    }

    event.stopPropagation();
    const disabledSmartAvoidance = disableSmartCaptionAvoidance();
    d.setSelectedTrack("caption");
    if (segmentId) d.setSelectedSegmentId(segmentId);

    const applyPlacement = (clientX, clientY) => {
      const frame = d.previewCanvasRef.current;
      const rect = frame?.getBoundingClientRect();
      if (!rect) return;
      const rawX = Math.max(10, Math.min(90, ((clientX - rect.left) / rect.width) * 100));
      const rawY = Math.max(10, Math.min(90, ((clientY - rect.top) / rect.height) * 100));
      const { x, y, guideX, guideY } = snapCaptionPlacement(
        rawX,
        rawY,
        (9 / Math.max(1, rect.width)) * 100,
        (9 / Math.max(1, rect.height)) * 100,
      );
      frame.style.setProperty("--caption-guide-x", `${guideX ?? 50}%`);
      frame.style.setProperty("--caption-guide-y", `${guideY ?? 50}%`);
      frame.toggleAttribute("data-caption-guide-x", guideX !== null);
      frame.toggleAttribute("data-caption-guide-y", guideY !== null);
      if (segmentId) {
        d.setCaptionSegments((items) => setCaptionSegmentPlacement(items, segmentId, { x, y }));
      } else {
        d.setCaptionPlacement({ x, y });
      }
      d.setCaptionPosition("custom");
    };

    applyPlacement(event.clientX, event.clientY);
    const handlePointerMove = (moveEvent) => applyPlacement(moveEvent.clientX, moveEvent.clientY);
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      const frame = d.previewCanvasRef.current;
      frame?.removeAttribute("data-caption-guide-x");
      frame?.removeAttribute("data-caption-guide-y");
      d.notify(disabledSmartAvoidance
        ? "字幕位置已手动调整，智能避让已关闭"
        : "字幕位置已调整");
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function commitCaptionSegments(nextSegments, message, nextSelectedIndex = 0) {
    if (d.trackLocks.caption) {
      d.notify("字幕轨已锁定，无法修改片段");
      return;
    }
    d.setCaptionSegments(nextSegments);
    d.setScript(getCaptionScript(nextSegments));
    d.setSelectedTrack("caption");
    d.setSelectedSegmentId(
      nextSegments.length
        ? nextSegments[Math.min(nextSelectedIndex, nextSegments.length - 1)]?.id ?? ""
        : "",
    );
    d.notify(message);
  }

  function deleteCaptionSegment(segmentId = d.selectedSegmentId) {
    if (d.trackLocks.caption) {
      d.notify("字幕轨已锁定，无法删除");
      return;
    }
    if (!d.captionSegments.length) {
      d.notify("当前没有字幕片段可删除");
      return;
    }
    const fallbackIndex = d.focusedSegmentIndex >= 0 ? d.focusedSegmentIndex : 0;
    const segmentIndex = d.captionSegments.findIndex((segment) => segment.id === segmentId);
    const index = segmentIndex >= 0 ? segmentIndex : fallbackIndex;
    const nextSegments = d.captionSegments.filter((_, currentIndex) => currentIndex !== index);
    commitCaptionSegments(nextSegments, "已删除当前字幕片段", Math.max(0, index - 1));
  }

  return {
    commitCaptionSegments,
    alignCaptionToAudio,
    alignAudioCaptions,
    deleteCaptionSegment,
    handleCaptionPositionChange,
    linkCaptionAudio,
    linkAudioToCaption,
    startCaptionDrag,
    toggleCaptionSegmentHidden,
    unlinkCaptionAudio,
    unlinkAudioCaptions,
    updateCaptionSegmentText,
    updateScript,
  };
}
