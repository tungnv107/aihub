import { cookies } from "next/headers";
import { Marketing } from "@/components/marketing";
import { publicData } from "@/server/queries";
import { jsonSafe } from "@/lib/api";
export const dynamic = "force-dynamic";
export default async function Home() {
  return (
    <Marketing
      data={jsonSafe(await publicData((await cookies()).get("locale")?.value))}
    />
  );
}
