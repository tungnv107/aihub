import { db } from "./db";
export async function siteFlags() {
  const setting = await db.setting.findUnique({ where: { key: "site" } });
  const value = (setting?.value ?? {}) as Record<string, unknown>;
  return {
    maintenanceMode: value.maintenanceMode === true,
    registrationEnabled: value.registrationEnabled !== false,
    checkoutEnabled: value.checkoutEnabled !== false,
  };
}
