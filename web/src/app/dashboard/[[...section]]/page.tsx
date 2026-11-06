import { notFound } from "next/navigation";
import { pageActor } from "@/server/page-auth";
import { customerData } from "@/server/queries";
import { jsonSafe } from "@/lib/api";
import { Customer } from "@/components/customer";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const sections = (await params).section ?? [];
  const section = sections[0] ?? "overview";
  if (
    sections.length > 1 ||
    ![
      "overview",
      "licenses",
      "devices",
      "usage",
      "billing",
      "settings",
    ].includes(section)
  )
    notFound();
  const user = await pageActor();
  return (
    <Customer section={section} data={jsonSafe(await customerData(user))} />
  );
}
