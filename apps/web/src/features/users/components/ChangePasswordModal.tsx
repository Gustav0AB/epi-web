import { useState } from "react";
import { Button, Modal, TextField } from "@shared/components";
import { useAuthStore } from "../../../store/auth.store";
import { useI18n } from "../../../lib/i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  required?: boolean;
};

export function ChangePasswordModal({ open, onClose, required = false }: Props) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (required) return;
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { setError(t("common.passwordMismatch")); return; }
    setSaving(true);
    setError(null);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch("/api/users/me/change-password", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("common.changePasswordError"));
      useAuthStore.getState().logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.changePasswordError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("header.changePassword")}
      footer={
        <>
          {!required && <Button variant="ghost" onClick={handleClose} disabled={saving}>{t("common.cancel")}</Button>}
          <Button type="submit" form="change-password-form" loading={saving}>{t("common.save")}</Button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label={t("changePasswordModal.currentPassword")}
          type="password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder={t("changePasswordModal.currentPasswordPlaceholder")}
        />
        <TextField
          label={t("resetPasswordModal.newPassword")}
          type="password"
          required
          minLength={8}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder={t("common.minChars8")}
        />
        <TextField
          label={t("changePasswordModal.confirmNewPassword")}
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t("changePasswordModal.repeatNewPassword")}
        />
        {error && (
          <p className="rounded-md bg-danger-muted px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </form>
    </Modal>
  );
}
