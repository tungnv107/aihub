import { docsPage } from "@/server/docs-page";
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  return docsPage("docs", (await params).slug);
}
