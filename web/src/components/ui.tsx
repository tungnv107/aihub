"use client";
import { useState } from "react";
import { Dialog, AlertDialog, Tooltip } from "radix-ui";
import { X, Copy, Check, Inbox, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useText } from "./providers";
import Link from "next/link";
import { clsx } from "clsx";
export function Button({
  className,
  variant = "primary",
  busy,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={clsx("button", variant, className)}
    >
      {busy ? <span className="spinner" /> : null}
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "danger" | "neutral" | "brand";
}) {
  return (
    <span className={"badge " + tone}>
      <span />
      {children}
    </span>
  );
}
export function Status({ value }: { value: string }) {
  const tone = ["ACTIVE", "PAID", "DONE", "RESOLVED"].includes(value)
    ? "success"
    : ["PENDING", "OPEN", "WAITING_CUSTOMER", "IN_PROGRESS"].includes(value)
      ? "warning"
      : ["EXPIRED", "REVOKED", "FAILED", "CANCELLED", "REFUNDED"].includes(
            value,
          )
        ? "danger"
        : "neutral";
  return <Badge tone={tone}>{value.replaceAll("_", " ")}</Badge>;
}
export function Empty({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {href && (
        <Link className="button secondary" href={href}>
          {label}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function CopyButton({
  value,
  label,
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false),
    t = useText();
  return (
    <button
      className="icon-button"
      aria-label={label ?? t("Sao chép", "Copy")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          toast.error(t("Không sao chép được", "Copy failed"));
        }
      }}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}
export function CodeBlock({ children }: { children: string }) {
  return (
    <div className="code-block">
      <code>{children}</code>
      <CopyButton value={children} />
    </div>
  );
}
export function Modal({
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content">
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted">
            {description ?? title}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Confirm({
  label,
  title,
  description,
  onConfirm,
  danger = true,
}: {
  label: React.ReactNode;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  danger?: boolean;
}) {
  const t = useText(),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>
        <button
          className={"button " + (danger ? "ghost danger-text" : "secondary")}
        >
          {label}
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="modal-overlay" />
        <AlertDialog.Content className="modal-content">
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description className="muted">
            {description}
          </AlertDialog.Description>
          <div className="form-actions">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{t("Hủy", "Cancel")}</Button>
            </AlertDialog.Cancel>
            <Button
              variant={danger ? "danger" : "primary"}
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Xác nhận", "Confirm")}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
export function Hint({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span tabIndex={0}>{children}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tooltip">
            {label}
            <Tooltip.Arrow />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small className="error-text">{error}</small>}
    </label>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
