import { useState } from "react";
import { Button } from "./Button.js";
import { Modal } from "./Modal.js";

export type ConfirmModalLabels = {
  close: string;
  cancel: string;
  confirm: string;
  genericError: string;
};

type Props = {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  labels?: ConfirmModalLabels;
};

const defaultLabels: ConfirmModalLabels = {
  close: "Close",
  cancel: "Cancel",
  confirm: "Delete",
  genericError: "Something went wrong",
};

export function ConfirmModal({ open, title, message, onClose, onConfirm, labels = defaultLabels }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={labels.close}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button variant="danger" loading={loading} onClick={handleConfirm}>
            {labels.confirm}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600">{message}</p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Modal>
  );
}
