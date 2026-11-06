import { env } from "./env";
import { ApiError } from "./security";
export async function upstream<T>(
  route: string,
  options: { method?: string; body?: unknown; key?: string } = {},
): Promise<T> {
  if (!options.key && !env.SUB2API_ADMIN_TOKEN && !env.SUB2API_ADMIN_API_KEY)
    throw new ApiError(503, "sub2api_not_configured");
  const authentication: Record<string, string> = options.key
    ? { authorization: "Bearer " + options.key }
    : env.SUB2API_ADMIN_API_KEY
      ? { "x-api-key": env.SUB2API_ADMIN_API_KEY }
      : { authorization: "Bearer " + env.SUB2API_ADMIN_TOKEN };
  const response = await fetch(env.SUB2API_URL + route, {
    method: options.method ?? "GET",
    headers: {
      ...authentication,
      "content-type": "application/json",
      "x-aihub-gateway": env.AIHUB_GATEWAY_SECRET,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok)
    throw new ApiError(
      response.status >= 500 ? 503 : 403,
      "sub2api_rejected_" + response.status,
    );
  const data = await response.json();
  return (data.data ?? data) as T;
}
export async function upstreamStatus(key: string) {
  return upstream<{
    schema: string;
    active: boolean;
    feature: string;
    key_id: number;
    server_time: string;
    expires_at: string;
  }>("/v1/ch-relay/license", { key });
}
