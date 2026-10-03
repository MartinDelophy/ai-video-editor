import { useEffect, useState } from "react";
import { FileVideo } from "@phosphor-icons/react";
import { readAnnaFile } from "../lib/annaRuntime.js";

/** Covers are optional, independently loaded, and never gate project actions. */
export function AnnaProjectCover({ preview, className = "anna-project-cover" }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    setUrl("");
    if (preview) (preview instanceof Blob ? Promise.resolve(preview) : readAnnaFile({ path: preview.path, expectedFile: preview, signal: controller.signal })).then(blob => {
      if (controller.signal.aborted || blob.size > 131072) return;
      objectUrl = URL.createObjectURL(new Blob([blob], { type: "image/jpeg" }));
      setUrl(objectUrl);
    }).catch(() => {});
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [preview]);
  return <span className={className}>{url ? <img src={url} alt="" onError={() => setUrl("")} /> : <FileVideo size={48} weight="light" aria-hidden="true" />}</span>;
}
