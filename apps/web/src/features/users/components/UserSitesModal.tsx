import { useEffect, useState } from "react";
import type { SiteDto, User } from "@epi/shared";
import { Button, CheckboxGroup, Modal } from "../../../shared/components";
import { apiClient } from "../../../lib/api-client";
import { useI18n } from "../../../lib/i18n";

type Props = { user: User; onClose: () => void; onSaved: () => Promise<void> };

export function UserSitesModal({ user, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [siteIds, setSiteIds] = useState(user.siteIds);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void apiClient.get<SiteDto[]>(`/api/sites?organizationId=${encodeURIComponent(user.organizationId ?? "")}`)
      .then((rows) => { if (!cancelled) setSites(rows); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : t("createUserModal.genericError")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user.organizationId]);

  async function save() {
    setError("");
    if (siteIds.length === 0) { setError(t("createUserModal.sitesRequired")); return; }
    setSaving(true);
    try {
      await apiClient.patch<User>(`/api/users/${user.id}`, { siteIds });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createUserModal.genericError"));
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={`${t("createUserModal.defaultSites")} — ${user.name}`}
      footer={<><Button variant="ghost" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
        <Button onClick={() => void save()} loading={saving} disabled={loading || sites.length === 0}>{t("common.save")}</Button></>}>
      {loading ? <p>{t("table.loading")}</p> : <CheckboxGroup label={t("createUserModal.defaultSitesHint")}
        options={sites.map((site) => ({ value: site.id, label: site.name }))}
        value={siteIds} onChange={setSiteIds} disabled={saving} />}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </Modal>
  );
}
