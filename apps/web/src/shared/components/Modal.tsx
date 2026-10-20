import { Modal as UiModal } from "@epi/ui";
import type { ComponentProps } from "react";
import { useI18n } from "../../lib/i18n";

type Props = Omit<ComponentProps<typeof UiModal>, "closeLabel">;

export function Modal(props: Props) {
  const { t } = useI18n();
  return <UiModal {...props} closeLabel={t("modal.close")} />;
}
