import { LoginPage as ReusableLoginPage } from "@epi/auth";
import Logo from "../../assets/epi-logo.png";
import { useI18n } from "../../lib/i18n";
import { useAuthStore } from "../../store/auth.store";

export function LoginPage() {
  const { login, isLoading, error, clearError } = useAuthStore();
  const { t } = useI18n();

  return (
    <ReusableLoginPage
      title="EPI"
      logo={Logo}
      labels={{
        username: t("login.username"),
        password: t("login.password"),
        signIn: t("login.signIn"),
        logoAlt: t("login.logoAlt"),
      }}
      usernamePlaceholder="admin"
      passwordPlaceholder="••••••••"
      loading={isLoading}
      error={error}
      onClearError={clearError}
      onLogin={login}
      createCredentials={(username, password) => ({ username, password })}
    />
  );
}
