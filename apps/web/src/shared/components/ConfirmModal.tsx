import { ConfirmModal as UiConfirmModal } from "@epi/ui";
import type { ComponentProps } from "react";
import { useI18n } from "../../lib/i18n";

type Props = Omit<ComponentProps<typeof UiConfirmModal>, "labels">;

export function ConfirmModal(props: Props) {
  const { t } = useI18n();
  return (
    <UiConfirmModal
      {...props}
      labels={{
        close: t("modal.close"),
        cancel: t("common.cancel"),
        confirm: t("common.delete"),
        genericError: t("common.genericError"),
      }}
    />
  );
}
