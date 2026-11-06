import { notFound } from "next/navigation";
import { pageActor } from "@/server/page-auth";
import { db } from "@/server/db";
import { getTicket } from "@/server/support";
import { Support } from "@/components/support";
import { jsonSafe } from "@/lib/api";
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const user = await pageActor(),
    path = (await params).path ?? [];
  if (
    path.length &&
    !(
      (path.length === 1 && path[0] === "new") ||
      (path.length === 2 && path[0] === "tickets")
    )
  )
    notFound();
  const mode =
    path[0] === "new" ? "new" : path[0] === "tickets" ? "ticket" : "list";
  const ticket = mode === "ticket" ? await getTicket(user, path[1]) : undefined;
  const tickets =
    mode === "list"
      ? await db.ticket.findMany({
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      : [];
  return (
    <Support
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roleNames,
        locale: user.locale,
        notificationsEnabled: user.notificationsEnabled,
      }}
      mode={mode}
      ticket={jsonSafe(ticket ?? null) ?? undefined}
      tickets={jsonSafe(tickets)}
    />
  );
}
