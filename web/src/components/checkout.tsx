"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ShieldCheck,
  ArrowRight,
  Check,
  Clock,
  RefreshCw,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { Header, Footer } from "./navigation";
import {
  Button,
  Field,
  PageHeading,
  Status,
  CodeBlock,
  Confirm,
  Empty,
} from "./ui";
import { useText } from "./providers";
import { api, money, date, errorMessage } from "@/lib/api";
import type { PublicData, Wire } from "@/lib/types";
import type { Order, OrderItem, Payment } from "@/generated/prisma/client";
import { bankQrUrl, type PaymentInstructions } from "@/lib/payment";
export type OrderView = Wire<
  Order & {
    items: OrderItem[];
    payments: Payment[];
    license: { id: string; status: string } | null;
  }
> & { payment: PaymentInstructions };
export function Checkout({
  data,
  user,
  planId,
  renewalId,
}: {
  data: PublicData;
  user: { name: string; email: string };
  planId?: string;
  renewalId?: string;
}) {
  const t = useText(),
    locale = useLocale(),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(planId ?? data.plans[0]?.id),
    [error, setError] = useState("");
  const plan = data.plans.find((p) => p.id === selected);
  const schema = z.object({ billingName: z.string().trim().min(2).max(120) }),
    {
      register,
      handleSubmit,
      formState: { errors },
    } = useForm<z.infer<typeof schema>>({
      resolver: zodResolver(schema),
      defaultValues: { billingName: user.name },
    });
  const submit = handleSubmit(async (values) => {
    setBusy(true);
    setError("");
    try {
      const order = await api<{ id: string }>("checkout", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          planId: selected,
          renewalLicenseId: renewalId,
        }),
      });
      router.push("/orders/" + order.id);
    } catch (err) {
      setError(errorMessage(err, locale));
    } finally {
      setBusy(false);
    }
  });
  return (
    <>
      <Header />
      <main
        id="main-content"
        className="container"
        style={{ paddingTop: 50, paddingBottom: 60 }}
      >
        <div style={{ maxWidth: 950, margin: "auto" }}>
          <PageHeading
            eyebrow="YOUR NEXT STEP"
            title={
              renewalId
                ? t("Gia hạn dịch vụ", "Renew your service")
                : t("Hoàn tất đăng ký dịch vụ", "Set up your service")
            }
            description={t(
              "Kiểm tra gói và thông tin trước khi tạo đơn hàng.",
              "Review your plan and details before creating an order.",
            )}
          />
          {!data.payment.available && (
            <div className="notice warning">
              <ShieldCheck size={18} />
              {t(
                "Thanh toán chưa được cấu hình. Vui lòng liên hệ hỗ trợ.",
                "Payments are not configured yet. Please contact support.",
              )}
            </div>
          )}
          {data.payment.sandbox && (
            <div className="notice warning">
              {t(
                "Môi trường thử nghiệm. Không chuyển tiền thật.",
                "Test environment. Do not transfer real money.",
              )}
            </div>
          )}
        </div>
        {plan ? (
          <div className="checkout-layout">
            <form className="panel stack" onSubmit={submit}>
              <h2 style={{ fontSize: 18 }}>
                {t("Thông tin đơn hàng", "Order details")}
              </h2>
              <Field label={t("Gói dịch vụ", "Plan")}>
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {data.plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {money(p.price, locale)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("Tên người mua", "Billing name")}
                error={errors.billingName?.message}
              >
                <input {...register("billingName")} autoComplete="name" />
              </Field>
              <Field label={t("Email nhận thông báo", "Notification email")}>
                <input value={user.email} disabled />
              </Field>
              <label className="checkbox-field">
                <input required type="checkbox" />
                {t(
                  "Tôi đã kiểm tra gói, thời hạn và điều khoản sử dụng.",
                  "I have reviewed the plan, validity and terms of service.",
                )}
              </label>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <Button
                busy={busy}
                disabled={!data.payment.available}
                type="submit"
              >
                {t("Tạo đơn & xem mã QR", "Create order & view QR")}
                <ArrowRight size={16} />
              </Button>
              <p className="tiny muted">
                {t(
                  "Key được cấp sau khi thanh toán xác thực. Thời hạn bắt đầu khi key được cấp.",
                  "A key is issued after payment verification. Validity begins when the key is issued.",
                )}
              </p>
            </form>
            <aside className="checkout-summary">
              <p className="eyebrow">ORDER SUMMARY</p>
              <h2>{plan.name}</h2>
              <p>{plan.description}</p>
              <dl className="detail-grid">
                <div>
                  <dt>{t("Thời hạn", "Validity")}</dt>
                  <dd>
                    {plan.durationDays} {t("ngày", "days")}
                  </dd>
                </div>
                <div>
                  <dt>{t("Thiết bị", "Devices")}</dt>
                  <dd>{plan.maxDevices}</dd>
                </div>
              </dl>
              <div className="stack" style={{ marginTop: 25, gap: 13 }}>
                {plan.features.map((f) => (
                  <span className="row tiny" key={f.id}>
                    <Check size={14} className="success-text" />
                    {f.label}
                  </span>
                ))}
              </div>
              <div className="total">
                <span>{t("Tổng cộng", "Total")}</span>
                <strong>{money(plan.price, locale)}</strong>
              </div>
            </aside>
          </div>
        ) : (
          <Empty
            title={t("Gói không còn được bán", "Plan unavailable")}
            description={t(
              "Vui lòng chọn một gói đang bán.",
              "Please select an available plan.",
            )}
            href="/pricing"
            label={t("Xem bảng giá", "View pricing")}
          />
        )}
      </main>
      <Footer />
    </>
  );
}
export function OrderDetail({
  initial,
  resultPage = false,
}: {
  initial: OrderView;
  resultPage?: boolean;
}) {
  const t = useText(),
    locale = useLocale(),
    [order, setOrder] = useState(initial),
    [error, setError] = useState(""),
    [reason, setReason] = useState("");
  const refresh = async () => {
    try {
      setOrder(await api<OrderView>("orders/" + order.id));
      setError("");
    } catch (err) {
      setError(errorMessage(err, locale));
    }
  };
  useEffect(() => {
    if (
      order.status !== "PENDING" &&
      !(order.status === "PAID" && !order.license && !order.renewalLicenseId)
    )
      return;
    const timer = setInterval(() => {
      api<OrderView>("orders/" + initial.id)
        .then(setOrder)
        .catch(() =>
          setError(
            t("Chưa thể cập nhật trạng thái.", "Unable to update status."),
          ),
        );
    }, 5000);
    return () => clearInterval(timer);
  }, [order.status, order.license, order.renewalLicenseId, initial.id, t]);
  const pending = order.status === "PENDING",
    paid = order.status === "PAID";
  const qr = bankQrUrl(order.payment, order.amount, order.code);
  const [qrFailed, setQrFailed] = useState(false);
  return (
    <>
      <Header />
      <main id="main-content" className="order-page">
        <PageHeading
          eyebrow={resultPage ? "PAYMENT STATUS" : "YOUR ORDER"}
          title={
            paid
              ? t("Thanh toán đã xác nhận", "Payment verified")
              : pending
                ? t("Đơn hàng đang chờ thanh toán", "Awaiting payment")
                : t("Trạng thái đơn hàng", "Order status")
          }
          description={order.code}
          action={<Status value={order.status} />}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="order-grid">
          <section className="panel">
            <h2 style={{ fontSize: 17 }}>
              {t("Thông tin dịch vụ", "Service details")}
            </h2>
            <h3>{order.items[0]?.name}</h3>
            <dl className="detail-grid">
              <div>
                <dt>{t("Số tiền", "Amount")}</dt>
                <dd>{money(order.amount, locale)}</dd>
              </div>
              <div>
                <dt>{t("Thời hạn", "Validity")}</dt>
                <dd>
                  {order.items[0]?.durationDays} {t("ngày", "days")}
                </dd>
              </div>
              <div className="full">
                <dt>Email</dt>
                <dd>{order.billingEmail}</dd>
              </div>
              <div className="full">
                <dt>{t("Ngày tạo", "Created")}</dt>
                <dd>{date(order.createdAt, locale)}</dd>
              </div>
            </dl>
            <div
              className="form-actions"
              style={{ justifyContent: "flex-start", flexWrap: "wrap" }}
            >
              <Button variant="secondary" onClick={refresh}>
                <RefreshCw size={14} />
                {t("Cập nhật", "Refresh")}
              </Button>
              {paid && (
                <a
                  className="button secondary"
                  href={"/api/v1/orders/" + order.id + "/receipt"}
                >
                  <Download size={14} />
                  {t("Chứng từ", "Receipt")}
                </a>
              )}
            </div>
            {pending && (
              <div style={{ marginTop: 15 }}>
                <Confirm
                  label={t("Hủy đơn hàng", "Cancel order")}
                  title={t("Hủy đơn này?", "Cancel this order?")}
                  description={t(
                    "Chỉ hủy nếu bạn chưa chuyển tiền.",
                    "Only cancel if you have not transferred payment.",
                  )}
                  onConfirm={async () => {
                    try {
                      await api("orders/" + order.id + "/cancel", {
                        method: "POST",
                        body: "{}",
                      });
                      await refresh();
                    } catch (err) {
                      toast.error(errorMessage(err, locale));
                    }
                  }}
                />
              </div>
            )}
          </section>
          <section className="panel">
            {pending ? (
              <>
                {order.payment.sandbox ? (
                  <div className="notice warning">
                    {t(
                      "Đơn thử nghiệm. Không chuyển tiền thật. Thanh toán chỉ được xác nhận qua webhook sandbox đã ký.",
                      "Test order. Do not send real money. Payment requires a signed sandbox webhook.",
                    )}
                  </div>
                ) : qr ? (
                  <>
                    <h2 style={{ fontSize: 17 }}>
                      {t(
                        "Quét mã để chuyển khoản",
                        "Scan to make a bank transfer",
                      )}
                    </h2>
                    <p className="tiny muted">
                      {t("Chờ đối soát", "Awaiting reconciliation")}
                    </p>
                    {qrFailed ? (
                      <div className="notice warning">
                        {t(
                          "Chưa tải được mã QR. Bạn có thể chuyển khoản bằng thông tin bên dưới.",
                          "QR could not load. You can transfer using the details below.",
                        )}
                      </div>
                    ) : (
                      <img
                        className="qr-code"
                        src={qr}
                        onError={() => setQrFailed(true)}
                        referrerPolicy="no-referrer"
                        alt={t(
                          "Mã QR thanh toán đơn hàng",
                          "Order payment QR code",
                        )}
                      />
                    )}
                    <p className="payment-amount">
                      {money(order.amount, locale)}
                    </p>
                    <dl className="detail-grid">
                      <div className="full">
                        <dt>{t("Ngân hàng thụ hưởng", "Receiving bank")}</dt>
                        <dd>{order.payment.bankName}</dd>
                      </div>
                      <div>
                        <dt>{t("Tài khoản", "Account")}</dt>
                        <dd>
                          <CodeBlock>{order.payment.bankAccount}</CodeBlock>
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Chủ tài khoản", "Account name")}</dt>
                        <dd>{order.payment.bankAccountName}</dd>
                      </div>
                    </dl>
                    <p className="tiny muted" style={{ marginTop: 20 }}>
                      {t(
                        "Nội dung chuyển khoản phải khớp chính xác:",
                        "Use this exact payment reference:",
                      )}
                    </p>
                    <CodeBlock>{order.code}</CodeBlock>
                    <div className="notice" style={{ marginTop: 20 }}>
                      <ShieldCheck size={18} />
                      {t(
                        "Hiển thị mã QR chưa phải thanh toán thành công. License chỉ được cấp sau khi đã nhận tiền và xác nhận đối soát.",
                        "Displaying a QR does not confirm payment. Your license is issued only after funds are received and reconciled.",
                      )}
                    </div>
                    {order.payment.provider === "manual" && (
                      <p className="tiny muted" style={{ marginTop: 12 }}>
                        {t(
                          "Quản trị viên sẽ kiểm tra giao dịch. Nếu cần hỗ trợ, gửi ticket kèm mã đơn và mã giao dịch ngân hàng.",
                          "An administrator will review your transfer. For help, open a ticket with the order and bank transaction reference.",
                        )}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="notice warning">
                    {t(
                      "Chưa có hướng dẫn chuyển khoản hợp lệ cho đơn này. Vui lòng liên hệ hỗ trợ.",
                      "Payment instructions are unavailable for this order. Please contact support.",
                    )}
                  </div>
                )}
                <div className="row tiny muted" style={{ marginTop: 20 }}>
                  <Clock size={15} />
                  {t("Hết thời gian thanh toán", "Payment deadline")}:{" "}
                  {date(order.expiresAt, locale)}
                </div>
              </>
            ) : paid ? (
              <>
                <div className="empty-icon">
                  <ShieldCheck size={27} />
                </div>
                <h3>
                  {order.license?.status === "ACTIVE" || order.renewalLicenseId
                    ? t("Dịch vụ đã được cấp quyền", "Your service is ready")
                    : t("Đang cấp license", "Issuing your license")}
                </h3>
                <p className="tiny">
                  {t(
                    "Quá trình cấp key được thực hiện tự động. Nếu chưa thấy key sau vài phút, hãy gửi ticket kèm mã đơn.",
                    "Key issuance is automatic. If it takes more than a few minutes, open a ticket with the order code.",
                  )}
                </p>
                <Link className="button primary" href="/dashboard/licenses">
                  {t("Mở license của tôi", "Open my licenses")}
                  <ArrowRight size={15} />
                </Link>
              </>
            ) : (
              <Empty
                title={t(
                  "Đơn không còn chờ thanh toán",
                  "Order is no longer pending",
                )}
                description={t(
                  "Nếu đã chuyển tiền, gửi mã giao dịch cho hỗ trợ để đối soát.",
                  "If you transferred funds, send the transaction reference to support for reconciliation.",
                )}
                href="/support/new"
                label={t("Mở ticket", "Open a ticket")}
              />
            )}
          </section>
        </div>
        {paid && (
          <section className="panel" style={{ marginTop: 24 }}>
            <h3>{t("Yêu cầu hỗ trợ thanh toán", "Billing assistance")}</h3>
            {order.refundRequestedAt ? (
              <p className="tiny muted">
                {t(
                  "Yêu cầu hoàn tiền đang được xem xét.",
                  "Your refund request is under review.",
                )}
              </p>
            ) : (
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api("orders/" + order.id + "/refund-request", {
                      method: "POST",
                      body: JSON.stringify({ reason }),
                    });
                    await refresh();
                  } catch (err) {
                    toast.error(errorMessage(err, locale));
                  }
                }}
              >
                <Field label={t("Lý do yêu cầu hoàn tiền", "Refund reason")}>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    minLength={10}
                    maxLength={2000}
                    required
                  />
                </Field>
                <Button variant="secondary" type="submit">
                  {t(
                    "Gửi yêu cầu xem xét hoàn tiền",
                    "Request a refund review",
                  )}
                </Button>
              </form>
            )}
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
