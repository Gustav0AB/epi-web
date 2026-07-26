import { useState } from "react";
import { Button, Modal, TextField } from "@shared/components";
import { useI18n } from "../../../lib/i18n";

type Props = {
  open: boolean;
  userName: string;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
};

export function ResetPasswordModal({ open, userName, onClose, onSubmit }: Props) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setPassword("");
    setConfirm("");
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError(t("common.passwordMismatch")); return; }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(password);
      handleClose();
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
      title={`${t("resetPasswordModal.titlePrefix")} ${userName}`}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button type="submit" form="reset-password-form" loading={saving}>{t("resetPasswordModal.confirm")}</Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label={t("resetPasswordModal.newPassword")}
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("common.minChars8")}
        />
        <TextField
          label={t("resetPasswordModal.confirmPassword")}
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t("resetPasswordModal.repeatPassword")}
        />
        {error && (
          <p className="rounded-md bg-danger-muted px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </form>
    </Modal>
  );
}
