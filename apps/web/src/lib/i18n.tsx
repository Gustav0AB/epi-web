import { createContext, useContext, useState } from "react";
import es from "./locales/es.json";
import en from "./locales/en.json";

export type Lang = "es" | "en";
const DICT = { es, en } as const;
export type I18nKey = keyof (typeof DICT)["es"];
type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: I18nKey) => string;
};
const I18nContext = createContext<I18nValue>({
  lang: "es",
  setLang: () => {},
  t: (key) => DICT.es[key],
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem("lang") as Lang) ?? "es",
  );
  const setLang = (lang: Lang) => {
    localStorage.setItem("lang", lang);
    setLangState(lang);
  };
  const t = (key: I18nKey) => DICT[lang][key] ?? DICT.es[key];
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
