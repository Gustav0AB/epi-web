import type { ComponentProps } from "react";
import { DatePicker as UiDatePicker } from "@epi/ui";
import { useI18n } from "../../lib/i18n";

type UiProps = ComponentProps<typeof UiDatePicker>;
type DatePickerProps = Omit<UiProps, "value" | "onChange" | "locale" | "clearLabel"> & {
  value: string;
  onChange: (value: string) => void;
};

function parseLocalDate(value: string): Date | null {
  if (!value) return null;
  const [date, time] = value.split(" ");
  const [year, month, day] = date!.slice(0, 10).split("-").map(Number);
  const [hours = 0, minutes = 0, seconds = 0] = (time ?? "").split(":").map(Number);
  return new Date(year!, month! - 1, day!, hours, minutes, seconds);
}

function toLocalValue(value: Date | null, mode: UiProps["mode"]): string {
  if (!value) return "";
  const date = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return mode === "datetime" ? `${date} ${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:${String(value.getSeconds()).padStart(2, "0")}` : date;
}

export function DatePicker({ value, onChange, ...props }: DatePickerProps) {
  const { lang, t } = useI18n();
  return (
    <UiDatePicker
      {...props}
      value={parseLocalDate(value)}
      onChange={(date) => onChange(toLocalValue(date, props.mode))}
      locale={lang === "es" ? "es-MX" : "en-US"}
      clearLabel={t("datePicker.clear")}
      placeholder={props.placeholder ?? t("datePicker.placeholder")}
    />
  );
}
