import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { headers } from "next/headers";
import { db } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import { fail } from "./security";
import { siteFlags } from "./site";
export const auth = betterAuth({
  appName: "AIHub",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path === "/sign-up/email") {
        const flags = await siteFlags();
        if (flags.maintenanceMode || !flags.registrationEnabled)
          throw new APIError("FORBIDDEN", {
            message: "Registration temporarily unavailable",
          });
      }
    }),
  },
  database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      sendMail(
        user.email,
        "AIHub · Đặt lại mật khẩu",
        `Mở liên kết để đặt lại mật khẩu: ${url}\nNếu không yêu cầu, hãy bỏ qua email này.`,
      ),
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) =>
      sendMail(
        user.email,
        "AIHub · Xác minh email",
        `Xác minh địa chỉ email của bạn: ${url}`,
      ),
  },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 12,
    cookieCache: { enabled: false },
  },
  advanced: {
    // Only the address overwritten by our trusted reverse proxy is authoritative.
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    useSecureCookies: new URL(env.BETTER_AUTH_URL).protocol === "https:",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },
  rateLimit: { enabled: true, window: 60, max: 60, storage: "database" },
  user: {
    additionalFields: {
      disabled: { type: "boolean", defaultValue: false, input: false },
      locale: { type: "string", defaultValue: "vi", input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const flags = await siteFlags();
          if (flags.maintenanceMode || !flags.registrationEnabled)
            throw new APIError("FORBIDDEN", {
              message: "Registration temporarily unavailable",
            });
          return { data: user };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
          });
          if (!user || user.disabled)
            throw new APIError("FORBIDDEN", { message: "Account disabled" });
          return { data: session };
        },
      },
    },
  },
});
export async function actor(requestHeaders?: Headers) {
  const session = await auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });
  if (!session) fail(401, "authentication_required");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.disabled || !user.emailVerified)
    fail(403, "account_unavailable");
  return {
    ...user,
    roleNames: user.roles.map((r) => r.role.name),
    sessionId: session.session.id,
  };
}
export type Actor = Awaited<ReturnType<typeof actor>>;
export function requireRole(user: Actor, ...roles: string[]) {
  if (!user.roleNames.some((r) => roles.includes(r)))
    fail(403, "insufficient_permissions");
}
export function isStaff(user: Actor) {
  return user.roleNames.some((r) => ["ADMIN", "SUPPORT"].includes(r));
}
