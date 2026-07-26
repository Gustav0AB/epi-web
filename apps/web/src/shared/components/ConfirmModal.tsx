import { useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { useI18n } from "../../lib/i18n";

type Props = {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function ConfirmModal({ open, title, message, onClose, onConfirm }: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" loading={loading} onClick={handleConfirm}>
            {t("common.delete")}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600">{message}</p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Modal>
  );
}
