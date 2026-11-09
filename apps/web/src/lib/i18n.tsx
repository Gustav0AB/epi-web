import { UiProvider } from "@epi/ui";
import { createContext, useContext, useState } from "react";
import { errorMessage, setErrorLanguage } from "./error-messages";
import es from "./locales/es.json";
import en from "./locales/en.json";

// ponytail: i18n casero (contexto + diccionario plano, editable en
// lib/locales/*.json sin tocar código). Migrar a react-i18next solo si se
// necesitan plurales/interpolación compleja.

export type Lang = "es" | "en";

const DICT = { es, en } as const;

export type I18nKey = keyof (typeof DICT)["es"];

type I18nValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: I18nKey) => string;
  errorMessage: (code: string, fallback?: string) => string;
};

const I18nContext = createContext<I18nValue>({
  lang: "es",
  errorMessage,
  setLang: () => {},
  t: (k) => DICT.es[k],
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    () => { setErrorLanguage("es"); return "es"; }
  );
  const setLang = (l: Lang) => {
    if (l !== "es" && l !== "en") return;
    setErrorLanguage(l);
    localStorage.setItem("lang", l);
    setLangState(l);
  };
  const t = (key: I18nKey) => DICT[lang][key] ?? DICT.es[key];
  return (
    <I18nContext.Provider value={{ lang, setLang, t, errorMessage: (code, fallback) => errorMessage(code, fallback, lang) }}>
      <UiProvider lang={lang} t={t}>{children}</UiProvider>
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
