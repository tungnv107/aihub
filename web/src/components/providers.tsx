"use client";
import { ThemeProvider, useTheme } from "next-themes";
import { NextIntlClientProvider, useLocale } from "next-intl";
import { Toaster } from "sonner";
import { Moon, Sun, Languages } from "lucide-react";
import { messages } from "@/lib/messages";
import { createContext, useContext } from "react";
type Branding = {
  name: string;
  logoUrl: string | null;
  contactEmail?: string;
  supportHours?: string;
  maintenanceMode?: boolean;
};
const BrandingContext = createContext<Branding>({
  name: "AIHub",
  logoUrl: null,
});
export const useBranding = () => useContext(BrandingContext);
export function Providers({
  children,
  locale,
  branding,
}: {
  children: React.ReactNode;
  locale: "vi" | "en";
  branding?: Branding;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <NextIntlClientProvider
        locale={locale}
        messages={messages[locale]}
        timeZone="Asia/Ho_Chi_Minh"
      >
        <BrandingContext.Provider
          value={branding ?? { name: "AIHub", logoUrl: null }}
        >
          {children}
        </BrandingContext.Provider>
        <Toaster richColors position="bottom-right" />
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}
export function Preferences() {
  const { resolvedTheme, setTheme } = useTheme(),
    locale = useLocale();
  return (
    <div className="preferences">
      <button
        className="icon-button"
        aria-label={
          locale === "vi" ? "Đổi giao diện sáng/tối" : "Toggle color theme"
        }
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        <Sun className="dark-only" size={18} />
        <Moon className="light-only" size={18} />
      </button>
      <button
        className="locale-button"
        aria-label="Change language"
        onClick={() => {
          document.cookie = `locale=${locale === "vi" ? "en" : "vi"}; Path=/; SameSite=Lax; Max-Age=31536000`;
          window.location.reload();
        }}
      >
        <Languages size={16} />
        {locale.toUpperCase()}
      </button>
    </div>
  );
}
export function useText() {
  const locale = useLocale();
  return (vi: string, en: string) => (locale === "vi" ? vi : en);
}
