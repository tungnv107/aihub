"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  Plus,
  LifeBuoy,
  Paperclip,
  ArrowRight,
  BookOpen,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { WorkspaceShell } from "./navigation";
import { PageHeading, Button, Field, Status, Confirm } from "./ui";
import { DataTable } from "./data-table";
import { useText, useBranding } from "./providers";
import { api, date, errorMessage } from "@/lib/api";
import type { CustomerData, Wire } from "@/lib/types";
import type { getTicket } from "@/server/support";
type Ticket = Wire<Awaited<ReturnType<typeof getTicket>>>;
export function Support({
  user,
  tickets,
  mode,
  ticket,
}: {
  user: CustomerData["user"];
  tickets: CustomerData["tickets"];
  mode: "list" | "new" | "ticket";
  ticket?: Ticket;
}) {
  const t = useText(),
    brand = useBranding(),
    locale = useLocale(),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(""),
    staff = user.roles.some((r) => ["ADMIN", "SUPPORT"].includes(r));
  async function upload(
    file: File | null,
    ticketId: string,
    messageId: string,
  ) {
    if (!file || !file.size) return;
    const form = new FormData();
    form.set("file", file);
    form.set("ticketId", ticketId);
    form.set("messageId", messageId);
    const response = await fetch("/api/attachments", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const data = await response.json();
      throw Error(data.error?.code ?? "upload_failed");
    }
  }
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const element = e.currentTarget,
      form = new FormData(element);
    setBusy(true);
    setError("");
    try {
      if (mode === "new") {
        const created = await api<{ id: string }>("tickets", {
          method: "POST",
          body: JSON.stringify({
            subject: form.get("subject"),
            category: form.get("category"),
            body: form.get("body"),
          }),
        });
        const detail = await api<Ticket>("tickets/" + created.id);
        try {
          await upload(
            form.get("file") as File,
            created.id,
            detail.messages[0].id,
          );
        } catch (err) {
          toast.error(errorMessage(err, locale));
        }
        router.push("/support/tickets/" + created.id);
      } else if (ticket) {
        const message = await api<{ id: string }>(
          "tickets/" + ticket.id + "/messages",
          { method: "POST", body: JSON.stringify({ body: form.get("body") }) },
        );
        try {
          await upload(form.get("file") as File, ticket.id, message.id);
        } catch (err) {
          toast.error(errorMessage(err, locale));
        }
        element.reset();
        router.refresh();
      }
    } catch (err) {
      setError(errorMessage(err, locale));
    } finally {
      setBusy(false);
    }
  };
  async function change(data: unknown) {
    if (!ticket) return;
    try {
      await api("tickets/" + ticket.id, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      router.refresh();
      toast.success(t("Đã cập nhật", "Updated"));
    } catch (err) {
      toast.error(errorMessage(err, locale));
    }
  }
  return (
    <WorkspaceShell user={user}>
      {brand.contactTelegram && (
        <div className="notice" style={{ marginBottom: 20 }}>
          <Send size={18} />
          <a
            href={brand.contactTelegram}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Liên hệ hỗ trợ qua Telegram", "Contact support on Telegram")}: @
            {brand.contactTelegram.split("/").at(-1)}
          </a>
        </div>
      )}
      <PageHeading
        eyebrow="WE'RE HERE TO HELP"
        title={
          mode === "new"
            ? t("Tạo yêu cầu hỗ trợ", "New support request")
            : mode === "ticket"
              ? ticket!.subject
              : t("Trung tâm hỗ trợ", "Support center")
        }
        description={t(
          "Trao đổi với đội ngũ AIHub và theo dõi tiến trình xử lý.",
          "Talk to the AIHub team and follow your request.",
        )}
        action={
          mode === "list" ? (
            <Link className="button primary" href="/support/new">
              <Plus size={15} />
              {t("Tạo ticket", "New ticket")}
            </Link>
          ) : (
            <Link className="button secondary" href="/support">
              {t("Tất cả ticket", "All tickets")}
            </Link>
          )
        }
      />
      {mode === "list" && (
        <>
          <div className="dashboard-grid equal">
            <Link className="panel row" href="/docs">
              <BookOpen size={24} style={{ color: "var(--primary)" }} />
              <div>
                <strong>
                  {t("Tài liệu & cài đặt", "Documentation & setup")}
                </strong>
                <p className="tiny" style={{ margin: 0 }}>
                  {t(
                    "Từng bước để bắt đầu dễ dàng.",
                    "Step-by-step guides to get started.",
                  )}
                </p>
              </div>
              <ArrowRight size={16} style={{ marginLeft: "auto" }} />
            </Link>
            <Link className="panel row" href="/help">
              <LifeBuoy size={24} style={{ color: "var(--secondary)" }} />
              <div>
                <strong>
                  {t("Câu hỏi thường gặp", "Frequently asked questions")}
                </strong>
                <p className="tiny" style={{ margin: 0 }}>
                  {t(
                    "Câu trả lời cho những vấn đề phổ biến.",
                    "Answers to common questions.",
                  )}
                </p>
              </div>
              <ArrowRight size={16} style={{ marginLeft: "auto" }} />
            </Link>
          </div>
          <div className="table-toolbar">
            <div className="tab-list">
              {["", "OPEN", "WAITING_CUSTOMER", "CLOSED"].map((s) => (
                <button
                  key={s}
                  className={filter === s ? "selected" : ""}
                  onClick={() => setFilter(s)}
                >
                  {s ? s.replaceAll("_", " ") : t("Tất cả", "All")}
                </button>
              ))}
            </div>
          </div>
          <DataTable
            rows={tickets.filter((item) => !filter || item.status === filter)}
            columns={[
              {
                accessorKey: "subject",
                header: t("Yêu cầu", "Request"),
                cell: ({ row }) => (
                  <Link
                    className="text-link"
                    href={"/support/tickets/" + row.original.id}
                  >
                    {row.original.subject}
                    <ArrowRight size={13} />
                  </Link>
                ),
              },
              { accessorKey: "category", header: t("Danh mục", "Category") },
              {
                accessorKey: "status",
                header: t("Trạng thái", "Status"),
                cell: ({ getValue }) => <Status value={getValue<string>()} />,
              },
              {
                accessorKey: "updatedAt",
                header: t("Cập nhật", "Updated"),
                cell: ({ getValue }) => date(getValue<string>(), locale),
              },
            ]}
          />
        </>
      )}
      {mode === "new" && (
        <form
          className="panel stack"
          style={{ maxWidth: 800 }}
          onSubmit={submit}
        >
          <div className="form-grid">
            <Field label={t("Chủ đề", "Subject")}>
              <input
                name="subject"
                minLength={4}
                maxLength={160}
                required
                placeholder={t(
                  "Mô tả ngắn vấn đề của bạn",
                  "Briefly describe your issue",
                )}
              />
            </Field>
            <Field label={t("Danh mục", "Category")}>
              <select name="category">
                <option value="ACTIVATION">
                  {t("Kích hoạt", "Activation")}
                </option>
                <option value="BILLING">{t("Thanh toán", "Billing")}</option>
                <option value="TECHNICAL">{t("Kỹ thuật", "Technical")}</option>
                <option value="OTHER">{t("Khác", "Other")}</option>
              </select>
            </Field>
          </div>
          <Field label={t("Nội dung", "Description")}>
            <textarea
              name="body"
              rows={8}
              required
              minLength={10}
              maxLength={10000}
              placeholder={t(
                "Các bước đã thực hiện, thông báo lỗi và mã đơn nếu có. Không gửi key hoặc mật khẩu.",
                "Steps taken, error messages and order code if applicable. Do not send keys or passwords.",
              )}
            />
          </Field>
          <Field
            label={t(
              "Đính kèm (PNG, JPEG, PDF · tối đa 5 MB)",
              "Attachment (PNG, JPEG, PDF · up to 5 MB)",
            )}
          >
            <input
              type="file"
              name="file"
              accept="image/png,image/jpeg,application/pdf"
            />
          </Field>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button busy={busy} type="submit">
              <Send size={15} />
              {t("Gửi yêu cầu", "Send request")}
            </Button>
          </div>
        </form>
      )}
      {mode === "ticket" && ticket && (
        <div className="ticket-layout">
          <div>
            {ticket.messages.map((message) => (
              <article
                key={message.id}
                className={
                  "message " + (message.authorId === user.id ? "own" : "")
                }
              >
                <div className="message-header">
                  <span className="avatar small">
                    {message.author.name.slice(0, 1)}
                  </span>
                  <strong>{message.author.name}</strong>
                  <small>{date(message.createdAt, locale)}</small>
                </div>
                <div className="message-body">{message.body}</div>
                {message.attachments.length > 0 && (
                  <div className="attachments">
                    {message.attachments.map((file) => (
                      <a key={file.id} href={"/api/attachments?id=" + file.id}>
                        <Paperclip
                          size={12}
                          style={{ display: "inline", marginRight: 5 }}
                        />
                        {file.name} · {Math.ceil(file.bytes / 1024)} KB
                      </a>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {ticket.status !== "CLOSED" && (
              <form className="panel stack" onSubmit={submit}>
                <Field label={t("Phản hồi", "Reply")}>
                  <textarea
                    name="body"
                    required
                    minLength={1}
                    maxLength={10000}
                    rows={5}
                  />
                </Field>
                <Field
                  label={t("Đính kèm (tối đa 5 MB)", "Attachment (up to 5 MB)")}
                >
                  <input
                    type="file"
                    name="file"
                    accept="image/png,image/jpeg,application/pdf"
                  />
                </Field>
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
                <div className="form-actions">
                  <Button busy={busy} type="submit">
                    <Send size={14} />
                    {t("Gửi phản hồi", "Send reply")}
                  </Button>
                </div>
              </form>
            )}
          </div>
          <aside className="panel" style={{ height: "fit-content" }}>
            <h2 style={{ fontSize: 15 }}>
              {t("Thông tin ticket", "Ticket details")}
            </h2>
            <Status value={ticket.status} />
            <dl className="detail-grid">
              <div className="full">
                <dt>{t("Danh mục", "Category")}</dt>
                <dd>{ticket.category}</dd>
              </div>
              <div className="full">
                <dt>{t("Ngày tạo", "Created")}</dt>
                <dd>{date(ticket.createdAt, locale)}</dd>
              </div>
              <div className="full">
                <dt>{t("Mã ticket", "Ticket ID")}</dt>
                <dd
                  className="mono"
                  style={{ fontSize: 10, overflowWrap: "anywhere" }}
                >
                  {ticket.id}
                </dd>
              </div>
            </dl>
            {staff ? (
              <div className="stack" style={{ marginTop: 20 }}>
                <Field label={t("Trạng thái", "Status")}>
                  <select
                    value={ticket.status}
                    onChange={(e) => change({ status: e.target.value })}
                  >
                    {[
                      "OPEN",
                      "IN_PROGRESS",
                      "WAITING_CUSTOMER",
                      "RESOLVED",
                      "CLOSED",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t("Ưu tiên", "Priority")}>
                  <select
                    value={ticket.priority}
                    onChange={(e) => change({ priority: e.target.value })}
                  >
                    {["LOW", "NORMAL", "HIGH", "URGENT"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Button
                  variant="secondary"
                  onClick={() => change({ assigneeId: user.id })}
                >
                  {t("Nhận xử lý", "Assign to me")}
                </Button>
              </div>
            ) : (
              <div style={{ marginTop: 20 }}>
                <Confirm
                  danger={ticket.status !== "CLOSED"}
                  label={
                    ticket.status === "CLOSED"
                      ? t("Mở lại ticket", "Reopen ticket")
                      : t("Đóng ticket", "Close ticket")
                  }
                  title={t(
                    "Cập nhật trạng thái ticket?",
                    "Update ticket status?",
                  )}
                  description={t(
                    "Ticket có thể được mở lại trong 30 ngày.",
                    "Tickets can be reopened within 30 days.",
                  )}
                  onConfirm={() =>
                    change({
                      status: ticket.status === "CLOSED" ? "OPEN" : "CLOSED",
                    })
                  }
                />
              </div>
            )}
          </aside>
        </div>
      )}
    </WorkspaceShell>
  );
}
