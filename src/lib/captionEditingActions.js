import { getCaptionScript } from "./timeline.js";

export function createCaptionEditingActions(d) {
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

  function startCaptionDrag(event) {
    if (event.button !== 0) return;
    if (d.trackLocks.caption) {
      d.notify("字幕轨已锁定，无法拖动");
      return;
    }

    event.stopPropagation();
    const disabledSmartAvoidance = disableSmartCaptionAvoidance();
    d.setSelectedTrack("caption");
    if (d.currentCaptionSegment) d.setSelectedSegmentId(d.currentCaptionSegment.id);

    const applyPlacement = (clientX, clientY) => {
      const rect = d.previewCanvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(10, Math.min(90, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.max(10, Math.min(90, ((clientY - rect.top) / rect.height) * 100));
      d.setCaptionPlacement({ x, y });
      d.setCaptionPosition("custom");
    };

    applyPlacement(event.clientX, event.clientY);
    const handlePointerMove = (moveEvent) => applyPlacement(moveEvent.clientX, moveEvent.clientY);
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
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
    deleteCaptionSegment,
    handleCaptionPositionChange,
    startCaptionDrag,
    toggleCaptionSegmentHidden,
    updateCaptionSegmentText,
    updateScript,
  };
}
