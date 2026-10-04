import "./CaptionGroupingControl.css";
import { CaretDown } from "@phosphor-icons/react";

export function CaptionGroupingControl({ value, onChange, disabled, t }) {
  return (
    <label className="caption-grouping-control">
      <span>{t("captionGrouping")}</span>
      <span className="caption-grouping-select">
        <select aria-label={t("captionGrouping")} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          <option value="phrases">{t("captionGroupingPhrases")}</option>
          <option value="words">{t("captionGroupingWords")}</option>
        </select>
        <CaretDown size={14} weight="bold" aria-hidden="true" />
      </span>
    </label>
  );
}
