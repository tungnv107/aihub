import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "./db";
import { publicData } from "./queries";
import { Documentation } from "@/components/documentation";
import { jsonSafe } from "@/lib/api";
export async function docsPage(
  kind: "docs" | "help" | "legal",
  slug?: string[],
) {
  if (slug && slug.length > 1) notFound();
  const locale = (await cookies()).get("locale")?.value === "en" ? "en" : "vi";
  let documents = await db.document.findMany({
    where: { kind, locale, published: true },
    orderBy: { sortOrder: "asc" },
    include: { category: { select: { id: true, name: true } } },
  });
  if (kind === "help" && !documents.length)
    documents = await db.document.findMany({
      where: { kind: "docs", locale, published: true },
      orderBy: { sortOrder: "asc" },
      include: { category: { select: { id: true, name: true } } },
    });
  const current = slug?.[0] ? documents.find((d) => d.slug === slug[0]) : null;
  if (slug?.[0] && !current) notFound();
  const info = await publicData(locale);
  return (
    <Documentation
      documents={jsonSafe(documents)}
      current={jsonSafe(current ?? null)}
      kind={kind}
      release={jsonSafe(info.release)}
      faqs={jsonSafe(info.faqs)}
    />
  );
}
