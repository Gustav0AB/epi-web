import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";
import { useI18n } from "../lib/i18n";
import LogoutIcon from "@mui/icons-material/Logout";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import Logo from "../assets/epi-logo.png";
import { ChangePasswordModal } from "../features/users/components/ChangePasswordModal";

const LAST_SEEN_KEY = "notifications-last-seen";

// Cuenta las respuestas de Jotform que llegaron desde la última vez que el
// admin abrió la campana. Sondeo simple cada 20s.
function useNewResponsesCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    async function poll() {
      const from =
        localStorage.getItem(LAST_SEEN_KEY) ?? new Date(0).toISOString();
      try {
        const res = await fetch(
          `/api/surveys/count?from=${encodeURIComponent(from)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const json = await res.json();
        if (!cancelled && json.success) setCount(json.data.count);
      } catch {
        /* sin red → se reintenta en el siguiente ciclo */
      }
    }
    void poll();
    const id = setInterval(poll, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, token]);

  const markSeen = () => {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    setCount(0);
  };
  return { count, markSeen };
}

// Cierra el menú al hacer click fuera.
function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onOutside]);
  return ref;
}

export function Header() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const mustChangePassword = useAuthStore((s) => s.mustChangePassword);
  const logout = useAuthStore((s) => s.logout);
  const { lang, setLang, t } = useI18n();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const menuRef = useClickOutside(() => setMenuOpen(false));

  const isSystemAdmin = currentUser?.role === "system_admin";
  const isAdminTier = isSystemAdmin || currentUser?.role === "org_admin";
  const canSeeSurveys =
    isAdminTier || (currentUser?.role === "functionality_user" && currentUser.featureKeys.includes("surveys"));
  const { count, markSeen } = useNewResponsesCount(canSeeSurveys);

  useEffect(() => {
    if (mustChangePassword) setChangePwOpen(true);
  }, [mustChangePassword]);

  const initials = currentUser?.name
    ? currentUser.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "?";

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <img src={Logo} alt={t("app.name")} className="h-8 w-auto sm:h-10" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Idioma ES ⇄ EN */}
          <button
            onClick={() => setLang(lang === "es" ? "en" : "es")}
            title={lang === "es" ? "Switch to English" : "Cambiar a español"}
            className="flex h-9 items-center rounded-md px-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            {lang === "es" ? "EN" : "ES"}
          </button>

          {/* Notificaciones: quien tenga acceso a encuestas — respuestas nuevas de Jotform */}
          {canSeeSurveys && (
            <button
              title={`${count} ${t("header.newResponses")}`}
              onClick={() => {
                markSeen();
                navigate("/surveys");
              }}
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <BellIcon />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          )}

          {/* Usuario → menú desplegable */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-gray-100"
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white"
                title={currentUser?.email}
              >
                {initials}
              </span>
              <span className="hidden text-sm font-medium text-gray-800 sm:inline">
                {currentUser?.name ?? "—"}
              </span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                {isSystemAdmin && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/settings");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <SettingsOutlinedIcon fontSize="small" />
                    {t("header.settings")}
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setChangePwOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <LockOutlinedIcon fontSize="small" />
                  {t("header.changePassword")}
                </button>
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <LogoutIcon fontSize="small" />
                  {t("header.logout")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <ChangePasswordModal
        open={changePwOpen || mustChangePassword}
        onClose={() => setChangePwOpen(false)}
        required={mustChangePassword}
      />
    </>
  );
}

function BellIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}
