import { useState, useEffect } from "react";
import { useI18n } from "../../lib/i18n";

export function OfflineBanner() {
  const { t } = useI18n();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg sm:w-auto">
      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
      {t("offline.banner")}
    </div>
  );
}
