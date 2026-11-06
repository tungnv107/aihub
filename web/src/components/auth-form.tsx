"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, ShieldCheck, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Header } from "./navigation";
import { ProductPreview } from "./marketing";
import { Button, Field } from "./ui";
import { useText } from "./providers";
type Mode =
  "login" | "register" | "forgot-password" | "reset-password" | "verify-email";
export function AuthForm({
  mode,
  googleEnabled = false,
}: {
  mode: Mode;
  googleEnabled?: boolean;
}) {
  const t = useText(),
    params = useSearchParams(),
    router = useRouter(),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  const schema = z.object({
    email:
      mode === "reset-password"
        ? z.string().optional()
        : z.email(t("Email không hợp lệ", "Invalid email")),
    password: ["login", "register", "reset-password"].includes(mode)
      ? z
          .string()
          .min(
            mode === "login" ? 1 : 12,
            t("Mật khẩu cần ít nhất 12 ký tự", "Use at least 12 characters"),
          )
      : z.string().optional(),
    name:
      mode === "register"
        ? z.string().trim().min(2, t("Nhập tên của bạn", "Enter your name"))
        : z.string().optional(),
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const title =
    mode === "login"
      ? t("Chào mừng trở lại.", "Welcome back.")
      : mode === "register"
        ? t("Bắt đầu không gian của bạn.", "Create your workspace.")
        : mode === "forgot-password"
          ? t("Quên mật khẩu?", "Forgot your password?")
          : mode === "reset-password"
            ? t("Tạo mật khẩu mới.", "Set a new password.")
            : t("Xác minh email.", "Verify your email.");
  const submit = handleSubmit(async (values) => {
    setBusy(true);
    setError("");
    try {
      let result;
      if (mode === "login")
        result = await authClient.signIn.email({
          email: values.email!,
          password: values.password!,
        });
      else if (mode === "register")
        result = await authClient.signUp.email({
          email: values.email!,
          password: values.password!,
          name: values.name!,
          callbackURL: "/dashboard",
        });
      else if (mode === "forgot-password")
        result = await authClient.requestPasswordReset({
          email: values.email!,
          redirectTo: "/reset-password",
        });
      else if (mode === "reset-password")
        result = await authClient.resetPassword({
          newPassword: values.password!,
          token: params.get("token") ?? "",
        });
      else
        result = await authClient.sendVerificationEmail({
          email: values.email!,
          callbackURL: "/dashboard",
        });
      if (result.error)
        throw Error(
          result.error.message ?? t("Không thể hoàn tất", "Unable to continue"),
        );
      if (mode === "login") {
        const next = params.get("next");
        router.push(
          next?.startsWith("/") &&
            !next.startsWith("//") &&
            !next.includes("\\")
            ? next
            : "/dashboard",
        );
        router.refresh();
      } else setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue");
    } finally {
      setBusy(false);
    }
  });
  return (
    <>
      <Header />
      <main id="main-content" className="auth-page">
        <section className="auth-story">
          <p className="eyebrow">YOUR NEXT CHAPTER</p>
          <h1>
            {t(
              "Mọi ý tưởng lớn đều cần một nơi bắt đầu.",
              "Every great idea needs a place to start.",
            )}
          </h1>
          <p>
            {t(
              "License, thiết bị và dịch vụ. Một workspace để bạn dành nhiều thời gian hơn cho những gì quan trọng.",
              "Licenses, devices and services. One workspace to give you more time for what matters.",
            )}
          </p>
          <ProductPreview />
        </section>
        <section className="auth-form-area">
          <div className="auth-form">
            <p className="eyebrow">AIHUB WORKSPACE</p>
            <h1>{title}</h1>
            <p>
              {t(
                "Kết nối với không gian phát triển của bạn.",
                "Connect to your development workspace.",
              )}
            </p>
            {done ? (
              <div className="panel">
                <Mail size={30} />
                <h3 style={{ marginTop: 20 }}>
                  {mode === "reset-password"
                    ? t("Mật khẩu đã cập nhật", "Password updated")
                    : t("Kiểm tra hộp thư của bạn", "Check your inbox")}
                </h3>
                <p>
                  {mode === "reset-password"
                    ? t(
                        "Bạn có thể đăng nhập bằng mật khẩu mới.",
                        "You can now sign in with your new password.",
                      )
                    : t(
                        "Nếu email hợp lệ, liên kết xác nhận sẽ được gửi đến bạn. Kiểm tra cả thư mục spam.",
                        "If the email is eligible, a confirmation link will be sent. Check your spam folder too.",
                      )}
                </p>
                <Link className="button secondary" href="/login">
                  {t("Đăng nhập", "Sign in")}
                </Link>
              </div>
            ) : (
              <>
                <form onSubmit={submit}>
                  {mode === "register" && (
                    <Field
                      label={t("Tên của bạn", "Your name")}
                      error={errors.name?.message}
                    >
                      <input
                        {...register("name")}
                        autoComplete="name"
                        placeholder="Nguyễn An"
                      />
                    </Field>
                  )}
                  {mode !== "reset-password" && (
                    <Field label="Email" error={errors.email?.message}>
                      <input
                        {...register("email")}
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                      />
                    </Field>
                  )}
                  {["login", "register", "reset-password"].includes(mode) && (
                    <Field
                      label={t("Mật khẩu", "Password")}
                      error={errors.password?.message}
                    >
                      <input
                        {...register("password")}
                        type="password"
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        placeholder={
                          mode === "login"
                            ? "••••••••••••"
                            : t("Ít nhất 12 ký tự", "At least 12 characters")
                        }
                      />
                    </Field>
                  )}
                  {mode === "register" && (
                    <label className="checkbox-field">
                      <input type="checkbox" required />
                      <span>
                        {t("Tôi đồng ý với", "I agree to the")}{" "}
                        <Link className="text-link" href="/legal/terms">
                          {t("điều khoản sử dụng", "terms of service")}
                        </Link>
                        .
                      </span>
                    </label>
                  )}
                  {error && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  <Button busy={busy} type="submit">
                    {mode === "login"
                      ? t("Đăng nhập", "Sign in")
                      : mode === "register"
                        ? t("Tạo tài khoản", "Create account")
                        : mode === "reset-password"
                          ? t("Lưu mật khẩu", "Save password")
                          : t("Gửi liên kết", "Send link")}
                    <ArrowRight size={16} />
                  </Button>
                </form>
                {googleEnabled && ["login", "register"].includes(mode) && (
                  <>
                    <div className="auth-divider">{t("hoặc", "or")}</div>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        authClient.signIn.social({
                          provider: "google",
                          callbackURL: "/dashboard",
                        })
                      }
                    >
                      {t("Tiếp tục với Google", "Continue with Google")}
                    </Button>
                  </>
                )}
                <div className="auth-links">
                  <Link href={mode === "login" ? "/register" : "/login"}>
                    {mode === "login"
                      ? t("Chưa có tài khoản? Đăng ký", "New here? Sign up")
                      : t(
                          "Đã có tài khoản? Đăng nhập",
                          "Already a member? Sign in",
                        )}
                  </Link>
                  {mode === "login" && (
                    <Link href="/forgot-password">
                      {t("Quên mật khẩu?", "Forgot password?")}
                    </Link>
                  )}
                </div>
                {mode === "login" && (
                  <p className="auth-footer">
                    <Link href="/verify-email">
                      {t("Gửi lại email xác minh", "Resend verification email")}
                    </Link>
                  </p>
                )}
              </>
            )}
            <p className="auth-footer">
              <ShieldCheck
                size={14}
                style={{
                  display: "inline",
                  verticalAlign: "middle",
                  marginRight: 5,
                }}
              />
              {t(
                "Tài khoản của bạn được bảo vệ bằng kết nối bảo mật.",
                "Your account is protected with a secure connection.",
              )}
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
