import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { translations, type Locale, localeLabels } from "@/i18n/translations";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem("app-locale");
    return (saved as Locale) || "pt-br";
  });

  // Load from profile on login
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("language")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.language && data.language in translations) {
          setLocaleState(data.language as Locale);
          localStorage.setItem("app-locale", data.language);
        }
      });
  }, [user?.id]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("app-locale", newLocale);
    // Persist to profile
    if (user) {
      supabase
        .from("profiles")
        .update({ language: newLocale })
        .eq("user_id", user.id)
        .then(() => {});
    }
  }, [user]);

  const t = useCallback((key: string): string => {
    return translations[locale]?.[key] ?? translations["pt-br"]?.[key] ?? key;
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}

export { localeLabels };
export type { Locale };
