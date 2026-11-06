import { notFound, redirect } from "next/navigation";
import { pageActor } from "@/server/page-auth";
import { adminList, adminOverview } from "@/server/queries";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { adminPaymentConfiguration } from "@/server/payments";
import { Admin } from "@/components/admin";
import { jsonSafe } from "@/lib/api";
import { telegramConfigured } from "@/server/telegram";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    type?: string;
    filter?: string;
  }>;
}) {
  const user = await pageActor(),
    segments = (await params).section ?? [],
    section = segments[0] ?? "overview",
    query = await searchParams;
  if (
    segments.length > 1 ||
    ![
      "overview",
      "users",
      "plans",
      "orders",
      "licenses",
      "support",
      "content",
      "settings",
      "audit",
      "jobs",
    ].includes(section)
  )
    notFound();
  if (
    !user.roleNames.includes("ADMIN") &&
    !(section === "support" && user.roleNames.includes("SUPPORT"))
  )
    redirect("/dashboard");
  const resource =
    section === "content"
      ? [
          "documents",
          "faqs",
          "announcements",
          "testimonials",
          "categories",
        ].includes(query.type ?? "")
        ? query.type!
        : "documents"
      : section;
  const list =
    section === "overview" || section === "settings"
      ? { rows: [], total: 0 }
      : await adminList(
          resource,
          query.q?.slice(0, 100) ?? "",
          Math.max(1, Math.min(100000, Number(query.page) || 1)),
          query.filter,
        );
  const configuration =
    section === "settings"
      ? {
          site:
            (await db.setting.findUnique({ where: { key: "site" } }))?.value ??
            null,
          payment: await adminPaymentConfiguration(),
          emailConfigured: !!env.SMTP_HOST,
          telegramConfigured: telegramConfigured(),
          sub2apiConfigured:
            !!env.SUB2API_ADMIN_API_KEY || !!env.SUB2API_ADMIN_TOKEN,
          releaseVerified: env.AIHUB_NPM_RELEASE_VERIFIED === "true",
        }
      : undefined;
  return (
    <Admin
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roleNames,
        locale: user.locale,
        notificationsEnabled: user.notificationsEnabled,
      }}
      section={section}
      resource={resource}
      list={jsonSafe(list)}
      overview={
        section === "overview" ? jsonSafe(await adminOverview()) : undefined
      }
      configuration={jsonSafe(configuration ?? null) ?? undefined}
    />
  );
}
