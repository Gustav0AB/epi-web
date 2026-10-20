import type { ComponentProps } from "react";
import { DatePicker as UiDatePicker } from "@epi/ui";
import { useI18n } from "../../lib/i18n";

export function DatePicker(props: Omit<ComponentProps<typeof UiDatePicker>, "locale" | "clearLabel">) {
  const { lang, t } = useI18n();
  return (
    <UiDatePicker
      {...props}
      locale={lang === "es" ? "es-MX" : "en-US"}
      clearLabel={t("datePicker.clear")}
      placeholder={props.placeholder ?? t("datePicker.placeholder")}
    />
  );
}
