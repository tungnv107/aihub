"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import {
  KeyRound,
  Monitor,
  ShoppingBag,
  Clock,
  ArrowUpRight,
  Plus,
  ShieldCheck,
  Activity,
  BookOpen,
  Download,
  RefreshCw,
  Mail,
} from "lucide-react";
import { WorkspaceShell } from "./navigation";
import { useText, Preferences } from "./providers";
import {
  PageHeading,
  Button,
  Badge,
  Status,
  Empty,
  Confirm,
  Modal,
  Field,
  CodeBlock,
} from "./ui";
import { DataTable } from "./data-table";
import { StatCard, ActivityChart } from "./charts";
import { api, date, money, errorMessage } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import type { CustomerData } from "@/lib/types";
export function Customer({
  data,
  section,
}: {
  data: CustomerData;
  section: string;
}) {
  const t = useText(),
    locale = useLocale(),
    router = useRouter(),
    [key, setKey] = useState<string | null>(null),
    [history, setHistory] = useState<CustomerData["licenses"][number] | null>(
      null,
    ),
    [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
      null,
    ),
    [range, setRange] = useState(30),
    [now] = useState(() => Date.now());
  const perform = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      router.refresh();
      toast.success(t("Đã cập nhật", "Updated"));
    } catch (error) {
      toast.error(errorMessage(error, locale));
    }
  };
  const active = data.licenses.filter(
      (l) =>
        l.status === "ACTIVE" &&
        l.expiresAt &&
        new Date(l.expiresAt) > new Date(),
    ),
    devices = data.licenses.flatMap((l) =>
      l.devices.map((d) => ({
        ...d,
        licenseName: l.order.items[0]?.name ?? "AIHub",
      })),
    ),
    online = devices.filter((d) => !d.revokedAt);
  const status = (l: CustomerData["licenses"][number]) =>
    l.status === "ACTIVE" && l.expiresAt && new Date(l.expiresAt) <= new Date()
      ? "EXPIRED"
      : l.status;
  const titles: Record<string, [string, string]> = {
    overview: [
      t(
        "Chào " + data.user.name.split(" ").at(-1) + ",",
        "Welcome back, " + data.user.name.split(" ").at(-1) + ".",
      ),
      t(
        "Mọi thứ bạn cần, trong không gian của bạn.",
        "Everything you need, in your workspace.",
      ),
    ],
    licenses: [
      t("License của bạn", "Your licenses"),
      t(
        "Quản lý key, thời hạn và quyền truy cập AIHub.",
        "Manage keys, validity and access to AIHub.",
      ),
    ],
    devices: [
      t("Thiết bị đã kết nối", "Connected devices"),
      t(
        "Biết rõ nơi nào đang sử dụng quyền truy cập của bạn.",
        "Know where your access is being used.",
      ),
    ],
    usage: [
      t("Mức sử dụng", "Usage analytics"),
      t(
        "Dữ liệu từ những nguồn được kết nối và xác thực.",
        "Data from connected, verified sources.",
      ),
    ],
    billing: [
      t("Thanh toán & đơn hàng", "Billing & orders"),
      t(
        "Theo dõi giao dịch và gia hạn dịch vụ.",
        "Track transactions and renew your services.",
      ),
    ],
    settings: [
      t("Tài khoản & bảo mật", "Account & security"),
      t(
        "Cá nhân hóa không gian và bảo vệ tài khoản.",
        "Personalize your workspace and protect your account.",
      ),
    ],
  };
  const title = titles[section] ?? titles.overview;
  return (
    <WorkspaceShell user={data.user}>
      <PageHeading
        eyebrow="YOUR WORKSPACE"
        title={title[0]}
        description={title[1]}
        action={
          ["overview", "licenses", "billing"].includes(section) ? (
            <Link className="button primary" href="/pricing">
              <Plus size={15} />
              {t("Thêm dịch vụ", "Add a service")}
            </Link>
          ) : undefined
        }
      />
      {data.announcements.map((a) => (
        <div className="notice" key={a.id}>
          <Mail size={17} />
          <div>
            <strong>{a.title}</strong>
            {a.body}
          </div>
        </div>
      ))}
      {section === "overview" && (
        <>
          <div className="kpi-grid">
            <StatCard
              label={t("Tổng license", "Total licenses")}
              value={String(data.licenses.length).padStart(2, "0")}
              detail={t("Toàn bộ dịch vụ của bạn", "All your services")}
              icon={<KeyRound size={17} />}
            />
            <StatCard
              label={t("Đang hoạt động", "Active licenses")}
              value={String(active.length).padStart(2, "0")}
              detail={t("Quyền truy cập còn hạn", "Valid access")}
              icon={<ShieldCheck size={17} />}
            />
            <StatCard
              label={t("Thiết bị", "Devices")}
              value={String(online.length).padStart(2, "0")}
              detail={t("Được cấp quyền sử dụng", "Authorized devices")}
              icon={<Monitor size={17} />}
            />
            <StatCard
              label={t("Đơn hàng", "Orders")}
              value={String(data.orders.length).padStart(2, "0")}
              detail={t("Giao dịch trong tài khoản", "Account transactions")}
              icon={<ShoppingBag size={17} />}
            />
          </div>
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>{t("Hoạt động sử dụng", "Usage activity")}</h2>
                  <p>{t("Dữ liệu trong 30 ngày gần nhất", "Last 30 days")}</p>
                </div>
                <Badge>{t("Nguồn dữ liệu", "Data source")}</Badge>
              </div>
              {data.usage.length ? (
                <ActivityChart
                  data={data.usage.map((u) => ({
                    label: new Date(u.day).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                    }),
                    value: u.requests,
                  }))}
                />
              ) : (
                <Empty
                  title={t("Chưa có dữ liệu sử dụng", "No usage data yet")}
                  description={t(
                    "Chưa kết nối nguồn quota hợp lệ. Tài khoản AI vẫn được quản lý trong công cụ local của bạn.",
                    "No verified quota source is connected. Your AI account remains managed in your local tool.",
                  )}
                  href="/docs"
                  label={t("Tìm hiểu thêm", "Learn more")}
                />
              )}
            </section>
            <section className="panel">
              <div className="panel-header">
                <h2>{t("Dịch vụ của bạn", "Your services")}</h2>
                <Link className="text-link" href="/dashboard/licenses">
                  <ArrowUpRight size={16} />
                </Link>
              </div>
              {data.licenses.length ? (
                data.licenses.slice(0, 3).map((l) => (
                  <div key={l.id} className="license-row">
                    <div className="row">
                      <span className="key-icon">
                        <KeyRound size={17} />
                      </span>
                      <div className="details">
                        <strong>{l.order.items[0]?.name}</strong>
                        <small>{date(l.expiresAt, locale)}</small>
                      </div>
                    </div>
                    <Status value={status(l)} />
                  </div>
                ))
              ) : (
                <Empty
                  title={t("Workspace đang chờ bạn", "Your workspace is ready")}
                  description={t(
                    "Chọn gói đầu tiên để bắt đầu sử dụng AIHub.",
                    "Choose your first plan to start using AIHub.",
                  )}
                  href="/pricing"
                  label={t("Khám phá các gói", "Explore plans")}
                />
              )}
              <div
                className="notice"
                style={{ marginTop: 20, marginBottom: 0 }}
              >
                <BookOpen size={17} />
                <div>
                  <strong>{t("Lần đầu sử dụng?", "First time here?")}</strong>
                  <Link href="/docs">
                    {t("Hướng dẫn cài đặt từng bước", "Follow our setup guide")}{" "}
                    ↗
                  </Link>
                </div>
              </div>
            </section>
          </div>
          <div className="dashboard-grid equal">
            <section className="panel">
              <div className="panel-header">
                <h2>{t("Hoạt động gần đây", "Recent activity")}</h2>
              </div>
              {data.licenses
                .flatMap((l) => l.events)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 5)
                .map((e) => (
                  <div className="activity-item" key={e.id}>
                    <Activity size={16} />
                    <div>
                      {e.type.replaceAll("_", " ")}
                      <p>{date(e.createdAt, locale)}</p>
                    </div>
                  </div>
                ))}
              {!data.licenses.some((l) => l.events.length) && (
                <p className="muted tiny">
                  {t(
                    "Các lần kích hoạt và thay đổi license sẽ hiển thị ở đây.",
                    "License activations and changes will appear here.",
                  )}
                </p>
              )}
            </section>
            <section className="panel">
              <div className="panel-header">
                <h2>{t("Thông báo", "Notifications")}</h2>
                {data.notifications.some((n) => !n.readAt) && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      perform(() =>
                        api("notifications", { method: "POST", body: "{}" }),
                      )
                    }
                  >
                    {t("Đã đọc tất cả", "Mark all read")}
                  </Button>
                )}
              </div>
              {data.notifications.length ? (
                data.notifications.slice(0, 5).map((n) => (
                  <Link className="activity-item" href={n.href} key={n.id}>
                    <Mail size={16} />
                    <div>
                      <strong>{n.title}</strong>
                      <p>{n.body}</p>
                      <small className="muted">
                        {date(n.createdAt, locale)}
                      </small>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="tiny muted">
                  {t(
                    "Bạn đã cập nhật mọi thông tin.",
                    "You are all caught up.",
                  )}
                </p>
              )}
            </section>
          </div>
        </>
      )}
      {section === "licenses" && (
        <>
          {!data.licenses.length ? (
            <Empty
              title={t("Chưa có license", "No licenses yet")}
              description={t(
                "License sẽ xuất hiện sau khi đơn hàng được thanh toán và cấp key thành công.",
                "Licenses appear after your payment is verified and a key is issued.",
              )}
              href="/pricing"
              label={t("Chọn gói dịch vụ", "Choose a plan")}
            />
          ) : (
            <div className="license-list">
              {data.licenses.map((l) => (
                <article className="license-card" key={l.id}>
                  <div className="row between">
                    <span className="key-icon">
                      <KeyRound size={20} />
                    </span>
                    <Status value={status(l)} />
                  </div>
                  <h2>{l.order.items[0]?.name}</h2>
                  <div className="code-block">
                    <code>•••• •••• •••• {l.keySuffix}</code>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          const result = await api<{ key: string }>(
                            "licenses/" + l.id + "/reveal",
                            { method: "POST", body: "{}" },
                          );
                          setKey(result.key);
                        } catch (error) {
                          toast.error(errorMessage(error, locale));
                        }
                      }}
                    >
                      {t("Xem key", "Reveal key")}
                    </Button>
                  </div>
                  <dl className="detail-grid">
                    <div>
                      <dt>{t("Kích hoạt đầu tiên", "First activation")}</dt>
                      <dd>{date(l.activatedAt, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t("Hết hạn", "Expires")}</dt>
                      <dd>{date(l.expiresAt, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t("Thiết bị", "Devices")}</dt>
                      <dd>
                        {l.devices.filter((d) => !d.revokedAt).length} /{" "}
                        {l.maxDevices}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("Mã đơn", "Order")}</dt>
                      <dd>
                        <Link href={"/orders/" + l.orderId}>
                          {l.order.code.slice(0, 12)}…
                        </Link>
                      </dd>
                    </div>
                  </dl>
                  <div className="license-actions">
                    <Button variant="ghost" onClick={() => setHistory(l)}>
                      <Clock size={14} />
                      {t("Lịch sử", "History")}
                    </Button>
                    {l.status === "ACTIVE" && (
                      <Link
                        className="button secondary"
                        href={
                          "/checkout?renew=" +
                          l.id +
                          "&plan=" +
                          l.order.items[0]?.planId
                        }
                      >
                        <RefreshCw size={14} />
                        {t("Gia hạn", "Renew")}
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          <Modal
            title={t("License key của bạn", "Your license key")}
            open={key !== null}
            onOpenChange={(open) => {
              if (!open) setKey(null);
            }}
            description={t(
              "Giữ key riêng tư. Dán key vào lời nhắc ẩn của AIHub.",
              "Keep this key private. Paste it into the hidden prompt in AIHub.",
            )}
          >
            {key && <CodeBlock>{key}</CodeBlock>}
          </Modal>
          <Modal
            title={t("Lịch sử license", "License history")}
            open={!!history}
            onOpenChange={() => setHistory(null)}
          >
            {history?.events.map((e) => (
              <div className="activity-item" key={e.id}>
                <Activity size={16} />
                <div>
                  {e.type.replaceAll("_", " ")}
                  <p>{date(e.createdAt, locale)}</p>
                </div>
              </div>
            ))}
          </Modal>
        </>
      )}
      {section === "devices" && (
        <>
          <div className="notice">
            <ShieldCheck size={17} />
            <div>
              {t(
                "Sau khi thu hồi, cần chờ 1 giờ trước khi thêm máy mới. Thiết bị đã thu hồi không tự kích hoạt lại.",
                "After revoking a device, wait one hour before adding a new one. Revoked devices cannot reactivate automatically.",
              )}
            </div>
          </div>
          <DataTable
            rows={devices}
            columns={[
              {
                accessorKey: "name",
                header: t("Thiết bị", "Device"),
                cell: ({ row }) => (
                  <div className="row">
                    <Monitor size={18} />
                    <div>
                      <strong>{row.original.name}</strong>
                      <small>
                        {row.original.os} ·{" "}
                        {row.original.fingerprint.slice(0, 8)}
                      </small>
                    </div>
                  </div>
                ),
              },
              { accessorKey: "licenseName", header: "License" },
              {
                accessorKey: "lastSeenAt",
                header: t("Gần nhất", "Last seen"),
                cell: ({ getValue }) => date(getValue<string>(), locale),
              },
              {
                id: "status",
                header: t("Trạng thái", "Status"),
                cell: ({ row }) => (
                  <Status
                    value={row.original.revokedAt ? "REVOKED" : "ACTIVE"}
                  />
                ),
              },
              {
                id: "actions",
                header: "",
                cell: ({ row }) => (
                  <div className="row">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setRenaming({
                          id: row.original.id,
                          name: row.original.name,
                        })
                      }
                    >
                      {t("Đổi tên", "Rename")}
                    </Button>
                    {!row.original.revokedAt && (
                      <Confirm
                        label={t("Thu hồi", "Revoke")}
                        title={t("Thu hồi thiết bị?", "Revoke this device?")}
                        description={t(
                          "Quyền truy cập trên thiết bị này sẽ bị chặn.",
                          "Access from this device will be blocked.",
                        )}
                        onConfirm={() =>
                          perform(() =>
                            api("devices/" + row.original.id, {
                              method: "PATCH",
                              body: JSON.stringify({ action: "revoke" }),
                            }),
                          )
                        }
                      />
                    )}
                  </div>
                ),
              },
            ]}
          />
          <Modal
            title={t("Đổi tên thiết bị", "Rename device")}
            open={!!renaming}
            onOpenChange={() => setRenaming(null)}
          >
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (renaming)
                  await perform(() =>
                    api("devices/" + renaming.id, {
                      method: "PATCH",
                      body: JSON.stringify({
                        action: "rename",
                        name: renaming.name,
                      }),
                    }),
                  );
                setRenaming(null);
              }}
            >
              <Field label={t("Tên thiết bị", "Device name")}>
                <input
                  required
                  maxLength={80}
                  value={renaming?.name ?? ""}
                  onChange={(e) =>
                    setRenaming((value) =>
                      value ? { ...value, name: e.target.value } : value,
                    )
                  }
                />
              </Field>
              <div className="form-actions">
                <Button type="submit">{t("Lưu", "Save")}</Button>
              </div>
            </form>
          </Modal>
        </>
      )}
      {section === "usage" && (
        <>
          <div className="table-toolbar">
            <div className="tab-list">
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  className={range === days ? "selected" : ""}
                  onClick={() => setRange(days)}
                >
                  {days} {t("ngày", "days")}
                </button>
              ))}
            </div>
            <Badge>{t("Dữ liệu xác thực", "Verified sources")}</Badge>
          </div>
          {data.usage.length ? (
            <section className="panel">
              <ActivityChart
                data={data.usage
                  .filter(
                    (u) => new Date(u.day).getTime() > now - range * 86400000,
                  )
                  .map((u) => ({
                    label: new Date(u.day).toLocaleDateString(locale),
                    value: u.requests,
                  }))}
              />
              <DataTable
                rows={data.usage.filter(
                  (u) => new Date(u.day).getTime() > now - range * 86400000,
                )}
                columns={[
                  {
                    accessorKey: "day",
                    header: t("Ngày", "Date"),
                    cell: ({ getValue }) => date(getValue<string>(), locale),
                  },
                  { accessorKey: "source", header: t("Nguồn", "Source") },
                  { accessorKey: "model", header: "Model" },
                  { accessorKey: "requests", header: t("Yêu cầu", "Requests") },
                  {
                    accessorKey: "succeeded",
                    header: t("Thành công", "Success"),
                  },
                  { accessorKey: "failed", header: t("Lỗi", "Failed") },
                ]}
              />
            </section>
          ) : (
            <Empty
              title={t("Chưa có dữ liệu", "No data available")}
              description={t(
                "AIHub chưa kết nối API quota hợp lệ của tài khoản AI. Chúng tôi không suy đoán số liệu sử dụng.",
                "AIHub has no verified quota API connected to your AI account. Usage values are not estimated.",
              )}
              href="/docs"
              label={t("Tìm hiểu nguồn dữ liệu", "Learn about data sources")}
            />
          )}
          <section className="panel" style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 16 }}>Quota</h2>
            {data.quota ? (
              <>
                <strong>
                  {data.quota.used} / {data.quota.limit}
                </strong>
                <div className="progress">
                  <span
                    style={{
                      width:
                        Math.min(
                          100,
                          (data.quota.used / data.quota.limit) * 100,
                        ) + "%",
                    }}
                  />
                </div>
                <p className="tiny">
                  {data.quota.source} · {date(data.quota.capturedAt, locale)}
                </p>
              </>
            ) : (
              <p className="tiny muted">
                {t(
                  "Chưa có dữ liệu quota hoặc thời gian reset từ nguồn xác thực.",
                  "No verified quota or reset-time data is available.",
                )}
              </p>
            )}
          </section>
        </>
      )}
      {section === "billing" && (
        <DataTable
          rows={data.orders}
          columns={[
            {
              accessorKey: "code",
              header: t("Đơn hàng", "Order"),
              cell: ({ row }) => (
                <Link className="text-link" href={"/orders/" + row.original.id}>
                  {row.original.code}
                  <ArrowUpRight size={12} />
                </Link>
              ),
            },
            {
              id: "plan",
              header: t("Gói", "Plan"),
              cell: ({ row }) => row.original.items[0]?.name,
            },
            {
              accessorKey: "createdAt",
              header: t("Ngày tạo", "Created"),
              cell: ({ getValue }) => date(getValue<string>(), locale),
            },
            {
              accessorKey: "amount",
              header: t("Số tiền", "Amount"),
              cell: ({ getValue }) => money(getValue<number>(), locale),
            },
            {
              accessorKey: "status",
              header: t("Trạng thái", "Status"),
              cell: ({ getValue }) => <Status value={getValue<string>()} />,
            },
            {
              id: "receipt",
              header: "",
              cell: ({ row }) =>
                ["PAID", "REFUNDED"].includes(row.original.status) ? (
                  <a
                    className="button ghost"
                    href={"/api/v1/orders/" + row.original.id + "/receipt"}
                  >
                    <Download size={14} />
                    {t("Chứng từ", "Receipt")}
                  </a>
                ) : null,
            },
          ]}
        />
      )}
      {section === "settings" && <AccountSettings data={data} />}
    </WorkspaceShell>
  );
}
function AccountSettings({ data }: { data: CustomerData }) {
  const t = useText(),
    locale = useLocale(),
    [busy, setBusy] = useState(false),
    [sessions, setSessions] = useState<
      {
        id: string;
        token: string;
        userAgent?: string | null;
        createdAt: Date;
        expiresAt: Date;
      }[]
    >([]);
  useEffect(() => {
    authClient.listSessions().then((result) => {
      if (result.data) setSessions(result.data);
    });
  }, []);
  async function execute(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      toast.success(t("Đã cập nhật", "Updated"));
    } catch (error) {
      toast.error(errorMessage(error, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <section className="panel">
        <h2>{t("Hồ sơ cá nhân", "Profile")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            execute(() =>
              api("me", {
                method: "PATCH",
                body: JSON.stringify({
                  name: form.get("name"),
                  locale: form.get("locale"),
                  notificationsEnabled: form.get("notifications") === "on",
                }),
              }),
            );
          }}
        >
          <Field label={t("Tên", "Name")}>
            <input
              name="name"
              defaultValue={data.user.name}
              required
              minLength={2}
              maxLength={100}
            />
          </Field>
          <Field label="Email">
            <input value={data.user.email} disabled />
          </Field>
          <Badge tone="success">
            {t("Email đã xác minh", "Email verified")}
          </Badge>
          <Field label={t("Ngôn ngữ thông báo", "Notification language")}>
            <select name="locale" defaultValue={data.user.locale}>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </Field>
          <label className="checkbox-field">
            <input
              type="checkbox"
              name="notifications"
              defaultChecked={data.user.notificationsEnabled}
            />
            {t("Nhận thông báo qua email", "Receive email notifications")}
          </label>
          <Button busy={busy} type="submit">
            {t("Lưu thay đổi", "Save changes")}
          </Button>
        </form>
      </section>
      <section className="panel">
        <h2>{t("Đổi mật khẩu", "Change password")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            execute(async () => {
              const result = await authClient.changePassword({
                currentPassword: String(form.get("current")),
                newPassword: String(form.get("next")),
                revokeOtherSessions: true,
              });
              if (result.error) throw Error(result.error.message);
            });
          }}
        >
          <Field label={t("Mật khẩu hiện tại", "Current password")}>
            <input
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label={t("Mật khẩu mới", "New password")}>
            <input
              name="next"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </Field>
          <p className="tiny muted">
            {t(
              "Các phiên đăng nhập khác sẽ bị thu hồi sau khi đổi mật khẩu.",
              "Other sessions will be revoked after the password is changed.",
            )}
          </p>
          <Button busy={busy} type="submit">
            {t("Cập nhật mật khẩu", "Update password")}
          </Button>
        </form>
        <div style={{ marginTop: 30 }}>
          <h2>{t("Giao diện & ngôn ngữ", "Theme & language")}</h2>
          <Preferences />
        </div>
      </section>
      <section className="panel full-span">
        <div className="panel-header">
          <h2>{t("Phiên đăng nhập", "Active sessions")}</h2>
          <Confirm
            label={t("Đăng xuất các phiên khác", "Sign out other sessions")}
            title={t("Thu hồi phiên đăng nhập?", "Revoke other sessions?")}
            description={t(
              "Các trình duyệt khác sẽ cần đăng nhập lại.",
              "Other browsers will need to sign in again.",
            )}
            onConfirm={() =>
              execute(async () => {
                const result = await authClient.revokeOtherSessions();
                if (result.error) throw Error(result.error.message);
                const latest = await authClient.listSessions();
                setSessions(latest.data ?? []);
              })
            }
          />
        </div>
        {sessions.map((s) => (
          <div className="session-row" key={s.id}>
            <div className="row">
              <Monitor size={17} />
              <div>
                <strong>{(s.userAgent ?? "Browser").slice(0, 100)}</strong>
                <p>{date(s.createdAt, locale)}</p>
              </div>
            </div>
            <Confirm
              label={t("Đăng xuất", "Sign out")}
              title={t("Thu hồi phiên này?", "Revoke this session?")}
              description={t(
                "Nếu là phiên hiện tại, bạn sẽ cần đăng nhập lại.",
                "If this is your current session, you will need to sign in again.",
              )}
              onConfirm={() =>
                execute(async () => {
                  const result = await authClient.revokeSession({
                    token: s.token,
                  });
                  if (result.error) throw Error(result.error.message);
                  setSessions((current) =>
                    current.filter((x) => x.id !== s.id),
                  );
                })
              }
            />
          </div>
        ))}
      </section>
    </div>
  );
}
