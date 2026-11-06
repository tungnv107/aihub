"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Landmark, ShieldCheck, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Field, CodeBlock } from "./ui";
import { useText } from "./providers";
import { api, errorMessage } from "@/lib/api";
import {
  bankSettingsSchema,
  type AdminPaymentSettings,
  type BankSettings,
} from "@/lib/payment";

export function PaymentSettings({
  initial,
}: {
  initial: AdminPaymentSettings;
}) {
  const t = useText(),
    locale = useLocale(),
    router = useRouter();
  const [values, setValues] = useState({
    bankName: initial.bankName,
    bankBin: initial.bankBin,
    bankAccount: initial.bankAccount,
    bankAccountName: initial.bankAccountName,
    enabled: initial.enabled && initial.checkoutEnabled,
    sepayEnabled: initial.sepayEnabled,
    publicConsent: initial.publicConsent,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = (name: keyof BankSettings, value: string | boolean) =>
    setValues((previous) => ({ ...previous, [name]: value }));
  return (
    <section
      className="panel payment-settings"
      aria-labelledby="bank-settings-title"
    >
      <div className="panel-header">
        <div>
          <p className="eyebrow">BANK TRANSFER</p>
          <h2 id="bank-settings-title">
            <Landmark size={20} />{" "}
            {t("Tài khoản ngân hàng nhận tiền", "Receiving bank account")}
          </h2>
        </div>
        <Badge tone={initial.available ? "success" : "warning"}>
          {initial.available
            ? t("Đã cấu hình", "Configured")
            : t("Chưa cấu hình", "Not configured")}
        </Badge>
      </div>
      <p className="muted tiny payment-settings-intro">
        {t(
          "Khách hàng nhận mã QR với đúng số tiền của gói và mã đơn. Bạn đối soát giao dịch trước khi cấp license; không cần kích hoạt SePay ngay.",
          "Customers receive a QR with the plan price and order reference. Reconcile the transfer before issuing a license; SePay is optional.",
        )}
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const parsed = bankSettingsSchema.safeParse(values);
          if (!parsed.success) {
            setError(
              t(
                "Kiểm tra thông tin ngân hàng, mã BIN 6 chữ số, số tài khoản 6–19 chữ số và xác nhận quyền hiển thị.",
                "Check the bank details, 6-digit BIN, 6–19-digit account number and display consent.",
              ),
            );
            return;
          }
          setBusy(true);
          try {
            await api("admin/payment-settings", {
              method: "PATCH",
              body: JSON.stringify(parsed.data),
            });
            toast.success(
              t("Đã lưu thông tin thanh toán", "Payment settings saved"),
            );
            router.refresh();
          } catch (err) {
            setError(errorMessage(err, locale));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label={t("Tên ngân hàng", "Bank name")}>
            <input
              name="bankName"
              value={values.bankName}
              onChange={(e) => change("bankName", e.target.value)}
              required
              minLength={2}
              maxLength={80}
              placeholder="VD: VIETINBANK"
            />
          </Field>
          <Field label={t("Mã BIN ngân hàng", "Bank BIN")}>
            <input
              name="bankBin"
              value={values.bankBin}
              onChange={(e) => change("bankBin", e.target.value)}
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="VD: 970415"
            />
            <span className="tiny muted">
              {t(
                "Mã 6 chữ số của ngân hàng, dùng để tạo VietQR.",
                "The bank's 6-digit code used for VietQR.",
              )}
            </span>
          </Field>
          <Field label={t("Số tài khoản", "Account number")}>
            <input
              name="bankAccount"
              value={values.bankAccount}
              onChange={(e) => change("bankAccount", e.target.value)}
              required
              inputMode="numeric"
              pattern="[0-9]{6,19}"
              minLength={6}
              maxLength={19}
              autoComplete="off"
            />
          </Field>
          <Field label={t("Tên chủ tài khoản", "Account holder")}>
            <input
              name="bankAccountName"
              value={values.bankAccountName}
              onChange={(e) => change("bankAccountName", e.target.value)}
              required
              minLength={2}
              maxLength={80}
              autoComplete="off"
            />
          </Field>
        </div>
        <div className="stack payment-settings-options">
          <label className="checkbox-field">
            <input
              type="checkbox"
              name="publicConsent"
              checked={values.publicConsent}
              onChange={(e) => change("publicConsent", e.target.checked)}
              required
            />
            {t(
              "Tôi có quyền và đồng ý hiển thị thông tin nhận tiền này cho khách hàng.",
              "I am authorized and agree to display these receiving details to customers.",
            )}
          </label>
          <p className="tiny muted">
            {t(
              "Thông tin tài khoản, số tiền và mã đơn được gửi tới img.vietqr.io để tạo ảnh QR. Không nhập mật khẩu ngân hàng.",
              "Account details, amount and order reference are sent to img.vietqr.io to create the QR image. Do not enter a banking password.",
            )}
          </p>
          <label className="checkbox-field">
            <input
              type="checkbox"
              name="enabled"
              checked={values.enabled}
              onChange={(e) => change("enabled", e.target.checked)}
            />
            {t(
              "Mở mua gói bằng chuyển khoản ngân hàng",
              "Enable purchases by bank transfer",
            )}
          </label>
        </div>
        <details className="payment-sepay">
          <summary>
            {t(
              "SePay — tự động đối soát (tùy chọn)",
              "SePay — automatic reconciliation (optional)",
            )}
          </summary>
          <p className="tiny muted">
            {initial.sepayReady
              ? t(
                  "Kết nối SePay đã sẵn sàng. Bật để tự động đối soát webhook hợp lệ.",
                  "SePay is ready. Enable automatic reconciliation of authenticated webhooks.",
                )
              : t(
                  "SePay chưa được kết nối. Bạn vẫn nhận chuyển khoản và xác nhận giao dịch thủ công trong Đơn hàng & thanh toán. Có thể cấu hình kết nối SePay sau.",
                  "SePay is not connected. You can receive transfers and confirm them manually in Orders & payments, then connect SePay later.",
                )}
          </p>
          <label className="checkbox-field">
            <input
              type="checkbox"
              name="sepayEnabled"
              checked={values.sepayEnabled}
              disabled={!initial.sepayReady && !values.sepayEnabled}
              onChange={(e) => change("sepayEnabled", e.target.checked)}
            />
            {t(
              "Bật đối soát tự động qua SePay",
              "Enable automatic SePay reconciliation",
            )}
          </label>
          <p className="tiny muted">Webhook</p>
          <CodeBlock>{initial.webhookUrl}</CodeBlock>
        </details>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button busy={busy} type="submit">
            <Save size={16} />
            {t("Lưu thông tin thanh toán", "Save payment settings")}
          </Button>
        </div>
        <div className="notice">
          <ShieldCheck size={18} />
          {t(
            "QR chỉ hướng dẫn chuyển khoản. Không xác nhận thanh toán trước khi kiểm tra tiền đã vào tài khoản.",
            "The QR provides transfer instructions only. Confirm payment only after checking funds have reached your account.",
          )}
        </div>
      </form>
    </section>
  );
}
