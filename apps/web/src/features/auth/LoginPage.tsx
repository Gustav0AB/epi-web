import { useState } from "react";
import { LoginForm } from "@epi/login";
import { Button } from "@epi/ui";
import { useAuthStore } from "../../store/auth.store";
import Logo from "../../assets/logo.svg";
import LogoText from "../../assets/logo-text.svg";
import { useI18n } from "../../lib/i18n";
import { LoginOcean } from "./LoginOcean";

export function LoginPage() {
  const { login, isAuthenticated, isLoading, error, errorCode, clearError } = useAuthStore();
  const { t, lang, setLang, errorMessage } = useI18n();
  const [animationEnabled, setAnimationEnabled] = useState(true);
  return <div className="login-page flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 pb-4 pt-16">
    {!isAuthenticated && animationEnabled && <LoginOcean />}
    <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center justify-end gap-2 sm:left-auto">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="border border-gray-200 bg-white"
        onClick={() => setAnimationEnabled(enabled => !enabled)}
      >
        {t(animationEnabled ? "login.disableAnimation" : "login.enableAnimation")}
      </Button>
      <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs">
        {t("login.language")}
        <select className="rounded border border-gray-200 bg-white px-1" value={lang} onChange={event => setLang(event.target.value === "en" ? "en" : "es")}>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </label>
    </div>
    <LoginForm locale={lang} loading={isLoading} error={errorCode ? errorMessage(errorCode) : error}
      brand={
        <div className="mb-6 flex flex-col items-center gap-3">
          <svg aria-hidden="true" viewBox="18 10 95 85" width="95" height="85" className="pointer-events-none h-20 w-auto overflow-visible">
            <use href={`${Logo}#logo-wave`} />
            <g className="login-brand__turtle">
              <use href={`${Logo}#logo-turtle-rear`} />
              <g className="login-brand__fin login-brand__fin--near">
                <use href={`${Logo}#logo-turtle-fin-near`} />
              </g>
              <use href={`${Logo}#logo-turtle-body`} />
              <g className="login-brand__fin login-brand__fin--far">
                <use href={`${Logo}#logo-turtle-fin-far`} />
              </g>
            </g>
          </svg>
          <h1 className="w-full max-w-60">
            <img src={LogoText} alt={t("app.name")} className="h-auto w-full" />
          </h1>
        </div>
      }
      onSubmit={async credentials => {
        clearError();
        try { await login(credentials); } catch { /* El store expone el error traducible. */ }
      }} />
  </div>;
}
