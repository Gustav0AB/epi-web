import { useId, useState } from "react";
import { Dropdown, TextField } from "@epi/ui";
import { useI18n } from "../../lib/i18n";

type Props = { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled?: boolean; error?: string | undefined };

export function CatalogNameField({ label, value, options, onChange, disabled, error }: Props) {
  const { t } = useI18n();
  const fieldId = useId();
  const [other, setOther] = useState(false);
  const custom = other || (!!value && !options.includes(value));
  return <div className="space-y-2">
    <Dropdown id={`${fieldId}-select`} label={label} disabled={disabled} error={!custom ? error : undefined} value={custom ? "other" : value ? `option:${value}` : ""}
      options={[{ value: "", label: t("surveySetup.select") }, ...options.map((name) => ({ value: `option:${name}`, label: name })), { value: "other", label: t("surveySetup.other") }]}
      onChange={(selection) => { setOther(selection === "other"); onChange(selection.startsWith("option:") ? selection.slice(7) : ""); }} />
    {custom && <TextField id={`${fieldId}-custom`} label={`${label} — ${t("surveySetup.other")}`} value={value} maxLength={100} disabled={disabled} error={error} onChange={(event) => onChange(event.target.value)} />}
  </div>;
}
