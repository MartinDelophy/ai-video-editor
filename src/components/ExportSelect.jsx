import { useId } from "react";
import { CaretDown } from "@phosphor-icons/react";

export function ExportSelect({ label, children, ...props }) {
  const labelId = useId();
  return <div className="export-setting-field">
    <span id={labelId}>{label}</span>
    <span className="export-select-control">
      <select aria-labelledby={labelId} {...props}>{children}</select>
      <CaretDown size={14} weight="bold" aria-hidden="true" />
    </span>
  </div>;
}
