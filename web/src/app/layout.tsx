import type { Metadata } from "next";
import { cookies } from "next/headers";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-500.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-700.css";
import "@fontsource/jetbrains-mono/400.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { branding } from "@/server/branding";
export async function generateMetadata(): Promise<Metadata> {
  const brand = await branding();
  return {
    title: {
      default: brand.seoTitle || brand.name + " — Your AI coding workspace",
      template: "%s · " + brand.name,
    },
    description:
      brand.seoDescription ||
      "Quản lý license, thiết bị và dịch vụ AIHub trong một không gian thống nhất.",
    icons: { icon: brand.faviconUrl },
  };
}
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = (await cookies()).get("locale")?.value === "en" ? "en" : "vi";
  const brand = await branding();
  return (
    <html lang={locale} suppressHydrationWarning data-scroll-behavior="smooth">
      <body>
        <Providers locale={locale} branding={brand}>
          <a className="skip-link" href="#main-content">
            {locale === "vi" ? "Đến nội dung" : "Skip to content"}
          </a>
          {children}
        </Providers>
      </body>
    </html>
  );
}
