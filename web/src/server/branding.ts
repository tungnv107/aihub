import { db } from "./db";
export async function branding() {
  const [site, logo, favicon] = await Promise.all([
    db.setting.findUnique({ where: { key: "site" } }),
    db.setting.findUnique({ where: { key: "branding:logo" } }),
    db.setting.findUnique({ where: { key: "branding:favicon" } }),
  ]);
  const value = site?.value as
    (Record<string, string> & { maintenanceMode?: boolean }) | null;
  return {
    name: value?.name ?? "AIHub",
    headline: value?.headline,
    description: value?.description,
    contactEmail: value?.contactEmail,
    supportHours: value?.supportHours,
    maintenanceMode: value?.maintenanceMode === true,
    seoTitle: value?.seoTitle,
    seoDescription: value?.seoDescription,
    logoUrl: logo
      ? "/api/branding?asset=logo&v=" + logo.updatedAt.getTime()
      : null,
    faviconUrl: favicon
      ? "/api/branding?asset=favicon&v=" + favicon.updatedAt.getTime()
      : "/icon.svg",
  };
}
