"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import {
  Users,
  KeyRound,
  ShoppingBag,
  LifeBuoy,
  Plus,
  Search,
  Download,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { WorkspaceShell } from "./navigation";
import {
  PageHeading,
  Button,
  Field,
  Modal,
  Status,
  Confirm,
  Badge,
  Empty,
} from "./ui";
import { StatCard, ActivityChart } from "./charts";
import { DataTable } from "./data-table";
import { useText } from "./providers";
import { adminFilters } from "@/lib/admin-filters";
import { api, money, date, errorMessage } from "@/lib/api";
import type { CustomerData, AdminOverviewData } from "@/lib/types";
type Row = Record<string, unknown> & { id: string };
type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "checkbox" | "email" | "select";
  options?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  full?: boolean;
};
const fields: Record<string, FieldSpec[]> = {
  categories: [
    { name: "name", label: "Tên danh mục / Category", required: true },
    { name: "slug", label: "Slug", required: true },
    {
      name: "sortOrder",
      label: "Thứ tự / Sort order",
      type: "number",
      min: 0,
      max: 999,
    },
  ],
  plans: [
    { name: "name", label: "Tên gói / Plan name", required: true },
    { name: "slug", label: "Slug", required: true },
    {
      name: "description",
      label: "Mô tả / Description",
      type: "textarea",
      full: true,
    },
    {
      name: "price",
      label: "Giá / Price (VND)",
      type: "number",
      min: 1000,
      max: 2000000000,
      required: true,
    },
    {
      name: "originalPrice",
      label: "Giá gốc / Original price (VND)",
      type: "number",
      min: 1000,
    },
    {
      name: "durationDays",
      label: "Thời hạn / Days",
      type: "number",
      min: 1,
      max: 3650,
      required: true,
    },
    {
      name: "maxDevices",
      label: "Thiết bị / Devices",
      type: "number",
      min: 1,
      max: 100,
      required: true,
    },
    {
      name: "features",
      label: "Quyền lợi — mỗi dòng một mục / One feature per line",
      type: "textarea",
      full: true,
    },
    {
      name: "sortOrder",
      label: "Thứ tự / Sort order",
      type: "number",
      min: 0,
      max: 999,
    },
    {
      name: "active",
      label: "Đang bán / Available for sale",
      type: "checkbox",
    },
    { name: "recommended", label: "Nổi bật / Recommended", type: "checkbox" },
  ],
  documents: [
    { name: "title", label: "Tiêu đề / Title", required: true },
    { name: "slug", label: "Slug", required: true },
    {
      name: "locale",
      label: "Ngôn ngữ / Language",
      type: "select",
      options: ["vi", "en"],
    },
    {
      name: "kind",
      label: "Loại / Type",
      type: "select",
      options: ["docs", "help", "legal"],
    },
    {
      name: "description",
      label: "Mô tả / Description",
      type: "textarea",
      full: true,
    },
    {
      name: "body",
      label: "Nội dung Markdown / Markdown content",
      type: "textarea",
      full: true,
      required: true,
    },
    {
      name: "sortOrder",
      label: "Thứ tự / Sort order",
      type: "number",
      min: 0,
      max: 999,
    },
    {
      name: "published",
      label: "Hiển thị công khai / Published",
      type: "checkbox",
    },
  ],
  faqs: [
    {
      name: "question",
      label: "Câu hỏi / Question",
      full: true,
      required: true,
    },
    {
      name: "answer",
      label: "Trả lời / Answer",
      type: "textarea",
      full: true,
      required: true,
    },
    {
      name: "locale",
      label: "Ngôn ngữ / Language",
      type: "select",
      options: ["vi", "en"],
    },
    {
      name: "sortOrder",
      label: "Thứ tự / Sort order",
      type: "number",
      min: 0,
      max: 999,
    },
    {
      name: "published",
      label: "Hiển thị công khai / Published",
      type: "checkbox",
    },
  ],
  announcements: [
    { name: "title", label: "Tiêu đề / Title", full: true, required: true },
    {
      name: "body",
      label: "Nội dung / Content",
      type: "textarea",
      full: true,
      required: true,
    },
    {
      name: "published",
      label: "Hiển thị công khai / Published",
      type: "checkbox",
    },
  ],
  testimonials: [
    { name: "name", label: "Tên khách hàng / Customer name", required: true },
    { name: "role", label: "Vai trò / Role" },
    {
      name: "quote",
      label: "Đánh giá / Testimonial",
      type: "textarea",
      full: true,
      required: true,
    },
    {
      name: "consentReference",
      label: "Bằng chứng đồng ý / Consent reference",
      full: true,
      required: true,
    },
    { name: "verified", label: "Đã xác minh / Verified", type: "checkbox" },
    {
      name: "published",
      label: "Hiển thị công khai / Published",
      type: "checkbox",
    },
  ],
  settings: [
    {
      name: "maintenanceMode",
      label: "Bảo trì đăng ký và mua gói / Maintenance",
      type: "checkbox",
    },
    {
      name: "registrationEnabled",
      label: "Mở đăng ký / Enable registration",
      type: "checkbox",
    },
    {
      name: "checkoutEnabled",
      label: "Mở mua gói / Enable checkout",
      type: "checkbox",
    },
    { name: "name", label: "Tên website / Website name", required: true },
    {
      name: "contactEmail",
      label: "Email liên hệ / Contact email",
      type: "email",
      required: true,
    },
    {
      name: "headline",
      label: "Tiêu đề landing / Landing headline",
      full: true,
      required: true,
    },
    {
      name: "description",
      label: "Mô tả landing / Landing description",
      type: "textarea",
      full: true,
      required: true,
    },
    { name: "supportHours", label: "Giờ hỗ trợ / Support hours", full: true },
    { name: "seoTitle", label: "SEO title", full: true },
    {
      name: "seoDescription",
      label: "SEO description",
      type: "textarea",
      full: true,
    },
  ],
  grant: [
    { name: "userId", label: "User ID", required: true },
    { name: "planId", label: "Plan ID", required: true },
    {
      name: "reason",
      label: "Lý do cấp / Grant reason",
      type: "textarea",
      required: true,
      full: true,
    },
  ],
  reconcile: [
    {
      name: "amount",
      label: "Số tiền / Amount (VND)",
      type: "number",
      required: true,
      min: 1,
    },
    {
      name: "reference",
      label: "Mã giao dịch / Transaction reference",
      required: true,
    },
    {
      name: "reason",
      label: "Lý do đối soát / Reconciliation reason",
      type: "textarea",
      required: true,
      full: true,
    },
  ],
  refund: [
    {
      name: "reference",
      label: "Mã giao dịch hoàn tiền / Refund transaction",
      required: true,
      full: true,
    },
    {
      name: "reason",
      label: "Ghi chú / Notes",
      type: "textarea",
      required: true,
      full: true,
    },
  ],
  revoke: [
    {
      name: "reason",
      label: "Lý do thu hồi / Revocation reason",
      type: "textarea",
      required: true,
      full: true,
    },
  ],
  extend: [
    {
      name: "days",
      label: "Số ngày thêm / Additional days",
      type: "number",
      min: 1,
      max: 3650,
      required: true,
    },
    {
      name: "reason",
      label: "Lý do gia hạn / Extension reason",
      type: "textarea",
      required: true,
      full: true,
    },
  ],
  users: [
    {
      name: "role",
      label: "Vai trò / Role",
      type: "select",
      options: ["CUSTOMER", "SUPPORT", "ADMIN"],
    },
    {
      name: "disabled",
      label: "Khóa tài khoản / Disable account",
      type: "checkbox",
    },
  ],
};
function Editor({
  kind,
  initial,
  onSave,
}: {
  kind: string;
  initial?: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const t = useText(),
    locale = useLocale(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const schema = fields[kind] ?? [];
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  useEffect(() => {
    if (kind === "documents")
      api<{ id: string; name: string }[]>("categories")
        .then(setCategories)
        .catch(() => {});
  }, [kind]);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget),
          data: Record<string, unknown> = {};
        for (const spec of schema) {
          const value = form.get(spec.name);
          data[spec.name] =
            spec.type === "checkbox"
              ? value === "on"
              : spec.type === "number"
                ? value === "" && spec.name === "originalPrice"
                  ? null
                  : Number(value)
                : String(value ?? "");
        }
        if (kind === "documents")
          data.categoryId = form.get("categoryId") || null;
        if (kind === "plans")
          data.features = String(data.features)
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        setBusy(true);
        setError("");
        try {
          await onSave(data);
        } catch (err) {
          setError(errorMessage(err, locale));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        {kind === "documents" && (
          <Field label="Danh mục / Category">
            <select
              name="categoryId"
              defaultValue={String(initial?.categoryId ?? "")}
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {schema.map((spec) => {
          let value = initial?.[spec.name];
          if (spec.name === "features" && Array.isArray(value))
            value = value
              .map((v) =>
                typeof v === "string" ? v : (v as { label: string }).label,
              )
              .join("\n");
          if (spec.type === "checkbox")
            return (
              <label className="checkbox-field" key={spec.name}>
                <input
                  name={spec.name}
                  type="checkbox"
                  defaultChecked={value === true}
                />
                {spec.label}
              </label>
            );
          return (
            <div className={spec.full ? "full" : ""} key={spec.name}>
              <Field label={spec.label}>
                {spec.type === "textarea" ? (
                  <textarea
                    name={spec.name}
                    defaultValue={String(value ?? "")}
                    required={spec.required}
                    rows={spec.name === "body" ? 10 : 4}
                  />
                ) : spec.type === "select" ? (
                  <select
                    name={spec.name}
                    defaultValue={String(value ?? spec.options?.[0])}
                  >
                    {spec.options?.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    name={spec.name}
                    type={spec.type ?? "text"}
                    defaultValue={String(
                      value ??
                        (spec.type === "number" && spec.name !== "originalPrice"
                          ? spec.name === "durationDays"
                            ? 30
                            : spec.name === "maxDevices"
                              ? 1
                              : 0
                          : ""),
                    )}
                    required={spec.required}
                    min={spec.min}
                    max={spec.max}
                  />
                )}
              </Field>
            </div>
          );
        })}
      </div>
      {error && (
        <p className="form-error" role="alert" style={{ marginTop: 20 }}>
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button busy={busy} type="submit">
          {t("Lưu thay đổi", "Save changes")}
        </Button>
      </div>
    </form>
  );
}
const str = (v: unknown) => (v === null || v === undefined ? "—" : String(v));
export function Admin({
  user,
  section,
  resource,
  list,
  overview,
  configuration,
}: {
  user: CustomerData["user"];
  section: string;
  resource: string;
  list: { rows: Row[]; total: number };
  overview?: AdminOverviewData;
  configuration?: {
    site: Record<string, unknown> | null;
    payment: { available: boolean; provider: string };
    emailConfigured: boolean;
    sub2apiConfigured: boolean;
    releaseVerified: boolean;
  };
}) {
  const t = useText(),
    locale = useLocale(),
    router = useRouter(),
    params = useSearchParams(),
    page = Math.max(1, Number(params.get("page")) || 1),
    [search, setSearch] = useState(params.get("q") ?? ""),
    [edit, setEdit] = useState<{
      kind: string;
      row?: Row;
      endpoint?: string;
    } | null>(null),
    [detail, setDetail] = useState<Row | null>(null);
  const names: Record<string, string> = {
    overview: t("Tổng quan vận hành", "Operations overview"),
    users: t("Khách hàng", "Customers"),
    plans: t("Gói dịch vụ", "Service plans"),
    orders: t("Đơn hàng & thanh toán", "Orders & payments"),
    licenses: t("Quản lý license", "License management"),
    support: t("Hộp thư hỗ trợ", "Support inbox"),
    content: t("Nội dung website", "Website content"),
    settings: t("Cài đặt hệ thống", "System settings"),
    audit: t("Nhật ký quản trị", "Audit log"),
    jobs: t("Tác vụ nền", "Background jobs"),
  };
  const query = (
    newPage: number,
    q = search,
    newResource = resource,
    filter = params.get("filter") ?? "",
  ) => {
    const next = new URLSearchParams({ page: String(newPage), q });
    if (newResource === resource && filter) next.set("filter", filter);
    if (section === "content") next.set("type", newResource);
    router.push(
      "/admin" + (section === "overview" ? "" : "/" + section) + "?" + next,
    );
  };
  async function mutate(path: string, method: string, body?: unknown) {
    try {
      await api(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      router.refresh();
      toast.success(t("Đã cập nhật", "Updated"));
    } catch (err) {
      toast.error(errorMessage(err, locale));
    }
  }
  let columns: ColumnDef<Row>[] = [];
  const simple = (key: string, label: string): ColumnDef<Row> => ({
    accessorKey: key,
    header: label,
    cell: ({ getValue }) => str(getValue()),
  });
  const statusColumn = (key = "status"): ColumnDef<Row> => ({
    accessorKey: key,
    header: t("Trạng thái", "Status"),
    cell: ({ getValue }) => <Status value={str(getValue())} />,
  });
  const dateColumn = (key = "createdAt"): ColumnDef<Row> => ({
    accessorKey: key,
    header: t("Thời gian", "Date"),
    cell: ({ getValue }) => date(getValue<string>(), locale),
  });
  const editColumn: ColumnDef<Row> = {
    id: "edit",
    header: "",
    cell: ({ row }) => (
      <div className="row">
        <Button
          variant="secondary"
          onClick={() => setEdit({ kind: resource, row: row.original })}
        >
          {t("Chỉnh sửa", "Edit")}
        </Button>
        <Confirm
          label={
            resource === "plans"
              ? t("Ngừng bán", "Archive")
              : t("Xóa", "Delete")
          }
          title={t("Xác nhận thay đổi?", "Confirm this change?")}
          description={t(
            "Thao tác được ghi lại trong nhật ký quản trị.",
            "This action is recorded in the audit log.",
          )}
          onConfirm={() =>
            mutate("admin/" + resource + "/" + row.original.id, "DELETE")
          }
        />
      </div>
    ),
  };
  if (resource === "users")
    columns = [
      {
        accessorKey: "name",
        header: t("Khách hàng", "Customer"),
        cell: ({ row }) => (
          <div>
            <strong>{str(row.original.name)}</strong>
            <small>{str(row.original.email)}</small>
            <small className="mono" style={{ display: "block" }}>
              {row.original.id}
            </small>
          </div>
        ),
      },
      {
        id: "roles",
        header: t("Vai trò", "Roles"),
        cell: ({ row }) =>
          (row.original.roles as { role: { name: string } }[])
            .map((r) => r.role.name)
            .join(", ") || "CUSTOMER",
      },
      {
        id: "disabled",
        header: t("Trạng thái", "Status"),
        cell: ({ row }) => (
          <Status value={row.original.disabled ? "DISABLED" : "ACTIVE"} />
        ),
      },
      dateColumn(),
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="row">
            <Button
              variant="secondary"
              onClick={() =>
                setEdit({
                  kind: "users",
                  row: {
                    ...row.original,
                    role:
                      (row.original.roles as { role: { name: string } }[])[0]
                        ?.role.name ?? "CUSTOMER",
                  },
                })
              }
            >
              {t("Quyền truy cập", "Access")}
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  setDetail(
                    await api<Row>(
                      "admin/users/" + row.original.id + "/detail",
                    ),
                  );
                } catch (err) {
                  toast.error(errorMessage(err, locale));
                }
              }}
            >
              {t("Chi tiết", "Details")}
            </Button>
          </div>
        ),
      },
    ];
  if (resource === "plans")
    columns = [
      {
        accessorKey: "name",
        header: t("Gói dịch vụ", "Plan"),
        cell: ({ row }) => (
          <div>
            <strong>{str(row.original.name)}</strong>
            <small className="mono">{row.original.id}</small>
          </div>
        ),
      },
      {
        accessorKey: "price",
        header: t("Giá", "Price"),
        cell: ({ getValue }) => money(getValue<number>(), locale),
      },
      simple("durationDays", t("Ngày", "Days")),
      simple("maxDevices", t("Thiết bị", "Devices")),
      {
        accessorKey: "active",
        header: t("Đang bán", "Available"),
        cell: ({ getValue }) => (
          <Status value={getValue() ? "ACTIVE" : "INACTIVE"} />
        ),
      },
      editColumn,
    ];
  if (resource === "orders")
    columns = [
      {
        accessorKey: "code",
        header: t("Đơn hàng", "Order"),
        cell: ({ row }) => (
          <div>
            <strong>{str(row.original.code)}</strong>
            <small>{str(row.original.billingEmail)}</small>
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: t("Số tiền", "Amount"),
        cell: ({ getValue }) => money(getValue<number>(), locale),
      },
      statusColumn(),
      dateColumn(),
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="row">
            <Button variant="ghost" onClick={() => setDetail(row.original)}>
              {t("Chi tiết", "Details")}
            </Button>
            {row.original.status === "PENDING" && (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setEdit({
                      kind: "reconcile",
                      row: row.original,
                      endpoint:
                        "admin/orders/" + row.original.id + "/reconcile",
                    })
                  }
                >
                  {t("Đối soát", "Reconcile")}
                </Button>
                <Confirm
                  label={t("Hủy", "Cancel")}
                  title={t("Hủy đơn?", "Cancel order?")}
                  description={t(
                    "Kiểm tra giao dịch trước khi hủy.",
                    "Check for incoming payment before cancelling.",
                  )}
                  onConfirm={() =>
                    mutate("orders/" + row.original.id + "/cancel", "POST", {})
                  }
                />
              </>
            )}
            {row.original.status === "PAID" &&
              !!row.original.refundRequestedAt && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setEdit({
                      kind: "refund",
                      row: row.original,
                      endpoint: "admin/orders/" + row.original.id + "/refund",
                    })
                  }
                >
                  {t("Xác nhận hoàn tiền", "Confirm refund")}
                </Button>
              )}
          </div>
        ),
      },
    ];
  if (resource === "licenses")
    columns = [
      {
        accessorKey: "keySuffix",
        header: "License",
        cell: ({ row }) => (
          <div>
            <strong className="mono">•••• {str(row.original.keySuffix)}</strong>
            <small>{str((row.original.user as { email: string }).email)}</small>
          </div>
        ),
      },
      statusColumn(),
      {
        accessorKey: "expiresAt",
        header: t("Hết hạn", "Expires"),
        cell: ({ getValue }) => date(getValue<string>(), locale),
      },
      simple("maxDevices", t("Thiết bị", "Device limit")),
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="row">
            <Button variant="ghost" onClick={() => setDetail(row.original)}>
              {t("Chi tiết", "Details")}
            </Button>
            {row.original.status === "ACTIVE" && (
              <Button
                variant="secondary"
                onClick={() =>
                  setEdit({
                    kind: "extend",
                    row: row.original,
                    endpoint: "admin/licenses/" + row.original.id + "/extend",
                  })
                }
              >
                {t("Gia hạn", "Extend")}
              </Button>
            )}
            {row.original.status !== "REVOKED" && (
              <Button
                variant="ghost"
                className="danger-text"
                onClick={() =>
                  setEdit({
                    kind: "revoke",
                    row: row.original,
                    endpoint: "admin/licenses/" + row.original.id + "/revoke",
                  })
                }
              >
                {t("Thu hồi", "Revoke")}
              </Button>
            )}
          </div>
        ),
      },
    ];
  if (resource === "support")
    columns = [
      {
        accessorKey: "subject",
        header: t("Yêu cầu", "Request"),
        cell: ({ row }) => (
          <Link href={"/support/tickets/" + row.original.id}>
            <strong>{str(row.original.subject)}</strong>
            <small>{str((row.original.user as { email: string }).email)}</small>
          </Link>
        ),
      },
      statusColumn(),
      simple("priority", t("Ưu tiên", "Priority")),
      dateColumn("updatedAt"),
      {
        id: "response",
        header: t("Phản hồi đầu tiên", "First response"),
        cell: ({ row }) =>
          row.original.firstResponseAt
            ? Math.round(
                (new Date(str(row.original.firstResponseAt)).getTime() -
                  new Date(str(row.original.createdAt)).getTime()) /
                  60000,
              ) + " min"
            : "—",
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Link
            className="button secondary"
            href={"/support/tickets/" + row.original.id}
          >
            {t("Xử lý", "Open")}
            <ArrowUpRight size={13} />
          </Link>
        ),
      },
    ];
  if (
    [
      "documents",
      "faqs",
      "announcements",
      "testimonials",
      "categories",
    ].includes(resource)
  )
    columns = [
      simple(
        resource === "faqs"
          ? "question"
          : ["testimonials", "categories"].includes(resource)
            ? "name"
            : "title",
        t("Nội dung", "Content"),
      ),
      ...(["documents", "faqs"].includes(resource)
        ? [simple("locale", t("Ngôn ngữ", "Language"))]
        : []),
      {
        accessorKey: "published",
        header: t("Công khai", "Published"),
        cell: ({ getValue }) => (
          <Status value={getValue() ? "PUBLISHED" : "DRAFT"} />
        ),
      },
      editColumn,
    ];
  if (resource === "categories")
    columns = [
      simple("name", t("Danh mục", "Category")),
      simple("slug", "Slug"),
      simple("sortOrder", t("Thứ tự", "Order")),
      editColumn,
    ];
  if (resource === "audit")
    columns = [
      dateColumn(),
      simple("action", t("Hành động", "Action")),
      simple("actorId", t("Người thực hiện", "Actor")),
      simple("target", t("Đối tượng", "Target")),
      {
        id: "details",
        header: "",
        cell: ({ row }) => (
          <Button variant="ghost" onClick={() => setDetail(row.original)}>
            {t("Chi tiết", "Details")}
          </Button>
        ),
      },
    ];
  if (resource === "jobs")
    columns = [
      simple("type", t("Loại", "Type")),
      statusColumn(),
      simple("attempts", t("Lần thử", "Attempts")),
      simple("lastError", t("Lỗi gần nhất", "Last error")),
      dateColumn("availableAt"),
      {
        id: "retry",
        header: "",
        cell: ({ row }) =>
          row.original.status === "PENDING" ? (
            <Button
              variant="secondary"
              onClick={() =>
                mutate("admin/jobs/" + row.original.id, "POST", {})
              }
            >
              <RefreshCw size={13} />
              {t("Thử lại", "Retry")}
            </Button>
          ) : null,
      },
    ];
  const counts = overview
    ? Object.entries(
        overview.payments.reduce<Record<string, number>>((acc, item) => {
          const day = item.paidAt?.slice(0, 10) ?? "";
          acc[day] = (acc[day] ?? 0) + item.amount;
          return acc;
        }, {}),
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, value]) => ({ label: label.slice(5), value }))
    : [];
  return (
    <WorkspaceShell user={user} admin>
      <PageHeading
        eyebrow="AIHUB ADMINISTRATION"
        title={names[section] ?? section}
        description={t(
          "Quản lý dịch vụ với dữ liệu thật và lịch sử thao tác rõ ràng.",
          "Manage your service with live data and a clear audit trail.",
        )}
        action={
          ["plans", "content"].includes(section) ? (
            <Button onClick={() => setEdit({ kind: resource })}>
              <Plus size={15} />
              {t("Tạo mới", "Create")}
            </Button>
          ) : section === "licenses" ? (
            <Button
              onClick={() =>
                setEdit({ kind: "grant", endpoint: "admin/licenses" })
              }
            >
              <Plus size={15} />
              {t("Cấp license", "Grant license")}
            </Button>
          ) : section === "orders" ? (
            <a
              className="button secondary"
              href="/api/v1/admin/orders/export"
              download
            >
              <Download size={15} />
              CSV
            </a>
          ) : undefined
        }
      />
      {section === "overview" && overview && (
        <>
          <div className="kpi-grid">
            <StatCard
              label={t("Khách hàng", "Customers")}
              value={overview.users}
              detail={t("Tài khoản đã đăng ký", "Registered accounts")}
              icon={<Users size={17} />}
            />
            <StatCard
              label={t("Doanh thu", "Revenue")}
              value={money(overview.revenue, locale)}
              detail={t(
                "Đơn đã thanh toán, chưa hoàn",
                "Paid, non-refunded orders",
              )}
              icon={<ShoppingBag size={17} />}
            />
            <StatCard
              label={t("License hoạt động", "Active licenses")}
              value={overview.licenses}
              detail={t("Còn trong thời hạn", "Within validity")}
              icon={<KeyRound size={17} />}
            />
            <StatCard
              label={t("Ticket đang mở", "Open tickets")}
              value={overview.tickets}
              detail={t("Cần theo dõi và phản hồi", "Awaiting follow-up")}
              icon={<LifeBuoy size={17} />}
            />
          </div>
          {overview.jobs > 0 && (
            <div className="notice warning">
              <RefreshCw size={18} />
              <Link href="/admin/jobs">
                {overview.jobs}{" "}
                {t(
                  "tác vụ cần kiểm tra hoặc thử lại.",
                  "jobs need review or a retry.",
                )}
              </Link>
            </div>
          )}
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-header">
                <h2>{t("Doanh thu 30 ngày", "30-day revenue")}</h2>
                <Badge>VND</Badge>
              </div>
              {counts.length ? (
                <ActivityChart data={counts} currency />
              ) : (
                <Empty
                  title={t("Chưa có giao dịch", "No transactions yet")}
                  description={t(
                    "Doanh thu sẽ xuất hiện sau khi có thanh toán được xác thực.",
                    "Revenue appears after verified payments.",
                  )}
                />
              )}
            </section>
            <section className="panel">
              <div className="panel-header">
                <h2>{t("Khách hàng gần đây", "Recent customers")}</h2>
              </div>
              {overview.recentUsers.map((u) => (
                <div className="license-row" key={u.id}>
                  <span className="avatar small">{u.name.slice(0, 1)}</span>
                  <div className="details" style={{ flex: 1 }}>
                    <strong>{u.name}</strong>
                    <small>{u.email}</small>
                  </div>
                </div>
              ))}
            </section>
          </div>
          <section className="panel">
            <div className="panel-header">
              <h2>{t("Giao dịch gần đây", "Recent orders")}</h2>
              <Link className="text-link" href="/admin/orders">
                {t("Xem tất cả", "View all")}
                <ArrowUpRight size={13} />
              </Link>
            </div>
            <DataTable
              rows={overview.recentOrders}
              columns={[
                { accessorKey: "code", header: t("Mã đơn", "Order") },
                {
                  id: "user",
                  header: t("Khách hàng", "Customer"),
                  cell: ({ row }) => row.original.user.email,
                },
                {
                  accessorKey: "amount",
                  header: t("Giá trị", "Amount"),
                  cell: ({ getValue }) => money(getValue<number>(), locale),
                },
                {
                  accessorKey: "status",
                  header: t("Trạng thái", "Status"),
                  cell: ({ getValue }) => <Status value={getValue<string>()} />,
                },
              ]}
            />
          </section>
        </>
      )}
      {section === "overview" && overview && (
        <div className="dashboard-grid equal" style={{ marginTop: 24 }}>
          <section className="panel">
            <div className="panel-header">
              <h2>{t("Phân bố gói dịch vụ", "Plan distribution")}</h2>
              <Badge tone="warning">
                {overview.expired} {t("license hết hạn", "expired licenses")}
              </Badge>
            </div>
            {overview.distribution.length ? (
              <ActivityChart data={overview.distribution} bar />
            ) : (
              <Empty
                title={t("Chưa có thuê bao", "No subscriptions yet")}
                description={t(
                  "Phân bố sẽ xuất hiện sau khi cấp license.",
                  "Distribution appears after licenses are issued.",
                )}
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>{t("Trạng thái đơn hàng", "Order status")}</h2>
            </div>
            <ActivityChart
              data={overview.orderStatuses.map((item) => ({
                label: item.status,
                value: item._count,
              }))}
              bar
            />
          </section>
        </div>
      )}
      {section === "settings" && configuration ? (
        <>
          <div className="system-grid">
            {[
              [
                t("Thanh toán", "Payments"),
                configuration.payment.available,
                configuration.payment.provider,
              ],
              [t("Email", "Email"), configuration.emailConfigured, "SMTP"],
              ["Sub2API", configuration.sub2apiConfigured, "License authority"],
              [
                "npm",
                configuration.releaseVerified,
                t("Bản phát hành đã xác thực", "Verified release"),
              ],
            ].map(([label, ok, detail]) => (
              <div key={String(label)}>
                <h3>{label}</h3>
                <Badge tone={ok ? "success" : "warning"}>
                  {ok
                    ? t("Đã cấu hình", "Configured")
                    : t("Chưa cấu hình", "Not configured")}
                </Badge>
                <p className="tiny" style={{ margin: "10px 0 0" }}>
                  {detail}
                </p>
              </div>
            ))}
          </div>
          <div className="notice">
            <ShieldCheck size={17} />
            {t(
              "Bí mật thanh toán, SMTP và Sub2API được cấu hình qua biến môi trường của máy chủ. Giao diện chỉ hiển thị trạng thái kết nối.",
              "Payment, SMTP and Sub2API secrets are configured through server environment variables. Only configuration status is shown here.",
            )}
          </div>
          <section className="panel">
            <div className="form-grid" style={{ marginBottom: 25 }}>
              {["logo", "favicon"].map((asset) => (
                <Field
                  key={asset}
                  label={
                    asset === "logo"
                      ? "Logo (PNG/JPEG, ≤1 MB)"
                      : "Favicon (PNG/JPEG, ≤1 MB)"
                  }
                >
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const response = await fetch(
                          "/api/branding?asset=" + asset,
                          {
                            method: "POST",
                            body: file,
                            headers: { "content-type": file.type },
                          },
                        );
                        if (!response.ok) {
                          const result = await response.json();
                          throw Error(result.error?.code);
                        }
                        router.refresh();
                        toast.success(
                          t("Đã cập nhật hình ảnh", "Image updated"),
                        );
                      } catch (error) {
                        toast.error(errorMessage(error, locale));
                      }
                    }}
                  />
                </Field>
              ))}
            </div>
            <Editor
              kind="settings"
              initial={{
                name: "AIHub",
                registrationEnabled: true,
                checkoutEnabled: true,
                ...configuration.site,
              }}
              onSave={async (data) => {
                await api("admin/settings", {
                  method: "PATCH",
                  body: JSON.stringify(data),
                });
                router.refresh();
                toast.success(t("Đã lưu", "Saved"));
              }}
            />
          </section>
        </>
      ) : (
        section !== "overview" && (
          <>
            {section === "content" && (
              <div className="tab-list content-tabs">
                {[
                  ["documents", t("Tài liệu", "Documents")],
                  ["faqs", "FAQ"],
                  ["categories", t("Danh mục", "Categories")],
                  ["announcements", t("Thông báo", "Announcements")],
                  ["testimonials", t("Đánh giá", "Testimonials")],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={resource === value ? "selected" : ""}
                    onClick={() => query(1, "", value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <form
              className="table-toolbar"
              onSubmit={(e) => {
                e.preventDefault();
                query(1);
              }}
            >
              <div className="search-field">
                <Search />
                <input
                  aria-label={t("Tìm kiếm", "Search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("Tìm kiếm…", "Search…")}
                />
              </div>
              <Button variant="secondary" type="submit">
                {t("Tìm kiếm", "Search")}
              </Button>
              {adminFilters[resource] && (
                <select
                  aria-label={t(
                    "Lọc trạng thái hoặc ưu tiên",
                    "Filter status or priority",
                  )}
                  value={params.get("filter") ?? ""}
                  onChange={(e) => query(1, search, resource, e.target.value)}
                >
                  <option value="">
                    {t("Tất cả trạng thái", "All statuses")}
                  </option>
                  {adminFilters[resource].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              )}
            </form>
            <DataTable
              rows={list.rows}
              columns={columns}
              page={page}
              total={list.total}
              onPage={query}
            />
          </>
        )
      )}
      <Modal
        title={
          edit
            ? t(
                edit.row
                  ? "Chỉnh sửa / " + edit.kind
                  : "Tạo mới / " + edit.kind,
                edit.row ? "Edit " + edit.kind : "Create " + edit.kind,
              )
            : ""
        }
        open={!!edit}
        onOpenChange={() => setEdit(null)}
        description={
          edit?.kind === "refund"
            ? t(
                "Chỉ xác nhận sau khi đã thực hiện hoàn tiền và có mã giao dịch thật. License liên quan sẽ bị thu hồi.",
                "Confirm only after completing the refund transfer and obtaining a real reference. The related license will be revoked.",
              )
            : t(
                "Thay đổi được xác thực phía máy chủ và ghi nhật ký.",
                "Changes are validated on the server and audited.",
              )
        }
      >
        {edit && (
          <Editor
            key={edit.kind + edit.row?.id}
            kind={edit.kind}
            initial={edit.row}
            onSave={async (value) => {
              const endpoint =
                edit.endpoint ??
                "admin/" + resource + (edit.row ? "/" + edit.row.id : "");
              await api(endpoint, {
                method: edit.endpoint ? "POST" : edit.row ? "PATCH" : "POST",
                body: JSON.stringify(value),
              });
              setEdit(null);
              router.refresh();
              toast.success(t("Đã lưu", "Saved"));
            }}
          />
        )}
      </Modal>
      <Modal
        title={t("Chi tiết bản ghi", "Record details")}
        open={!!detail}
        onOpenChange={() => setDetail(null)}
      >
        {detail && <RecordDetails data={detail} />}
        {resource === "licenses" && Array.isArray(detail?.devices) && (
          <div className="stack">
            {(
              detail.devices as {
                id: string;
                name: string;
                revokedAt: string | null;
              }[]
            )
              .filter((device) => !device.revokedAt)
              .map((device) => (
                <Confirm
                  key={device.id}
                  label={t("Thu hồi máy: ", "Revoke device: ") + device.name}
                  title={t("Thu hồi thiết bị này?", "Revoke this device?")}
                  description={t(
                    "Thiết bị sẽ bị chặn và license áp dụng thời gian chờ chuyển máy.",
                    "This device will be blocked and a device-change cooldown will apply.",
                  )}
                  onConfirm={async () => {
                    await api("devices/" + device.id, {
                      method: "PATCH",
                      body: JSON.stringify({ action: "revoke" }),
                    });
                    setDetail(null);
                    router.refresh();
                  }}
                />
              ))}
          </div>
        )}
      </Modal>
    </WorkspaceShell>
  );
}
function RecordDetails({ data }: { data: Record<string, unknown> }) {
  return (
    <dl className="detail-grid">
      {Object.entries(data)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => (
          <div className="full" key={key}>
            <dt>{key}</dt>
            <dd
              style={{
                overflowWrap: "anywhere",
                whiteSpace: "pre-wrap",
                fontSize: 11,
              }}
            >
              {typeof value === "object" ? (
                <pre
                  style={{
                    fontFamily: "inherit",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}
                >
                  {JSON.stringify(value, null, 2)}
                </pre>
              ) : (
                String(value)
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
