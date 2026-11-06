"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import {
  Layers3,
  Menu,
  X,
  ArrowUpRight,
  LayoutDashboard,
  KeyRound,
  Monitor,
  ChartNoAxesCombined,
  CreditCard,
  Settings,
  LifeBuoy,
  Users,
  Package,
  ShoppingBag,
  FileText,
  ScrollText,
  Workflow,
  PanelLeftClose,
  LogOut,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { Preferences, useText, useBranding } from "./providers";
import { authClient } from "@/lib/auth-client";
export function Logo() {
  const brand = useBranding();
  return (
    <Link href="/" className="logo" aria-label="AIHub home">
      {brand.logoUrl ? (
        <img
          src={brand.logoUrl}
          alt=""
          width={33}
          height={33}
          style={{ marginRight: 9, borderRadius: 9, objectFit: "contain" }}
        />
      ) : (
        <span className="logo-icon">
          <Layers3 size={20} />
        </span>
      )}
      {brand.name === "AIHub" ? (
        <>
          AI<span>Hub</span>
        </>
      ) : (
        brand.name
      )}
      <span className="logo-dot" />
    </Link>
  );
}
export function Header() {
  const tr = useTranslations("nav"),
    t = useText(),
    [open, setOpen] = useState(false),
    brand = useBranding();
  const links = [
    ["/#features", "features"],
    ["/pricing", "pricing"],
    ["/docs", "docs"],
    ["/support", "support"],
  ];
  return (
    <header className="site-header">
      {brand.maintenanceMode && (
        <div className="notice" role="status">
          {t(
            "Đang bảo trì đăng ký và mua gói. License hiện có vẫn sử dụng được.",
            "Registration and checkout are under maintenance. Existing licenses remain available.",
          )}
        </div>
      )}
      <div className="header-inner">
        <Logo />
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map(([href, key]) => (
            <Link key={key} href={href}>
              {tr(key)}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Preferences />
          <Link className="login-link" href="/login">
            {tr("login")}
          </Link>
          <Link className="button primary header-cta" href="/register">
            {tr("start")}
            <ArrowUpRight size={16} />
          </Link>
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger
              className="icon-button mobile-menu"
              aria-label={t("Mở menu", "Open menu")}
            >
              <Menu size={22} />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="modal-overlay" />
              <Dialog.Content className="mobile-drawer">
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Dialog.Description className="sr-only">
                  AIHub navigation
                </Dialog.Description>
                <div className="row between">
                  <Logo />
                  <Dialog.Close className="icon-button" aria-label="Close menu">
                    <X />
                  </Dialog.Close>
                </div>
                <nav>
                  {links.map(([href, key]) => (
                    <Link key={key} href={href} onClick={() => setOpen(false)}>
                      {tr(key)}
                      <ChevronRight size={16} />
                    </Link>
                  ))}
                  <Link href="/login">{tr("login")}</Link>
                  <Link className="button primary" href="/register">
                    {tr("start")}
                  </Link>
                </nav>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  const t = useText(),
    brand = useBranding();
  return (
    <footer className="site-footer">
      <div>
        <Logo />
        <p>
          {t(
            "Không gian cho những ý tưởng tiếp theo.",
            "A workspace for what comes next.",
          )}
        </p>
        <span className="status-dot" />{" "}
        {t("AI của bạn. Quyền kiểm soát của bạn.", "Your AI. Your control.")}
      </div>
      <div>
        <strong>{t("Sản phẩm", "Product")}</strong>
        <Link href="/pricing">{t("Bảng giá", "Pricing")}</Link>
        <Link href="/dashboard">Workspace</Link>
        <Link href="/docs">{t("Cài đặt", "Installation")}</Link>
      </div>
      <div>
        <strong>{t("Tài nguyên", "Resources")}</strong>
        <Link href="/docs">{t("Tài liệu", "Documentation")}</Link>
        <Link href="/help">{t("Trợ giúp", "Help center")}</Link>
        <Link href="/support">{t("Liên hệ hỗ trợ", "Contact support")}</Link>
        {brand.contactEmail && (
          <a href={"mailto:" + brand.contactEmail}>{brand.contactEmail}</a>
        )}
        {brand.supportHours && <small>{brand.supportHours}</small>}
      </div>
      <div>
        <strong>{t("Pháp lý", "Legal")}</strong>
        <Link href="/legal/privacy">{t("Quyền riêng tư", "Privacy")}</Link>
        <Link href="/legal/terms">{t("Điều khoản", "Terms")}</Link>
        <small>
          © {new Date().getFullYear()} {brand.name}
        </small>
      </div>
    </footer>
  );
}
const customerLinks = [
  ["/dashboard", "overview", LayoutDashboard],
  ["/dashboard/licenses", "licenses", KeyRound],
  ["/dashboard/devices", "devices", Monitor],
  ["/dashboard/usage", "usage", ChartNoAxesCombined],
  ["/dashboard/billing", "billing", CreditCard],
  ["/support", "support", LifeBuoy],
  ["/dashboard/settings", "settings", Settings],
] as const;
const adminLinks = [
  ["/admin", "overview", LayoutDashboard],
  ["/admin/users", "users", Users],
  ["/admin/plans", "plans", Package],
  ["/admin/orders", "orders", ShoppingBag],
  ["/admin/licenses", "licenses", KeyRound],
  ["/admin/support", "support", LifeBuoy],
  ["/admin/content", "content", FileText],
  ["/admin/settings", "settings", Settings],
  ["/admin/audit", "audit", ScrollText],
  ["/admin/jobs", "jobs", Workflow],
] as const;
export function WorkspaceShell({
  children,
  user,
  admin = false,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; roles: string[] };
  admin?: boolean;
}) {
  const pathname = usePathname(),
    router = useRouter(),
    tr = useTranslations("nav"),
    t = useText(),
    [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false);
  const links = admin ? adminLinks : customerLinks;
  const nav = (
    <>
      <div className="sidebar-logo">
        <Logo />
        <button
          className="icon-button collapse-button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose size={17} />
        </button>
      </div>
      <div className="workspace-select">
        <span className="workspace-avatar">
          {admin ? (
            <ShieldCheck size={18} />
          ) : (
            user.name.slice(0, 1).toUpperCase()
          )}
        </span>
        <div>
          <strong>
            {admin
              ? "AIHub Admin"
              : t("Không gian cá nhân", "Personal workspace")}
          </strong>
          <small>{admin ? "Operations" : user.name}</small>
        </div>
      </div>
      <span className="nav-section">{admin ? "MANAGEMENT" : "WORKSPACE"}</span>
      <nav className="sidebar-nav">
        {links.map(([href, key, Icon]) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMobile(false)}
            className={pathname === href ? "active" : ""}
            title={tr(key)}
          >
            <Icon size={19} />
            <span>{tr(key)}</span>
            {pathname === href && <span className="active-dot" />}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Link href="/docs">
          <FileText size={18} />
          <span>
            {tr("docs")} <ArrowUpRight size={14} />
          </span>
        </Link>
        {user.roles.includes("ADMIN") && (
          <Link href={admin ? "/dashboard" : "/admin"}>
            <ShieldCheck size={18} />
            <span>{admin ? "Workspace" : tr("admin")}</span>
          </Link>
        )}
        <button
          onClick={async () => {
            await authClient.signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut size={18} />
          <span>{tr("logout")}</span>
        </button>
        <div className="sidebar-user">
          <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
        </div>
      </div>
    </>
  );
  return (
    <div className={"workspace " + (collapsed ? "collapsed" : "")}>
      <aside className="sidebar">{nav}</aside>
      <Dialog.Root open={mobile} onOpenChange={setMobile}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="mobile-drawer sidebar-mobile">
            <Dialog.Title className="sr-only">
              Workspace navigation
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Navigate workspace
            </Dialog.Description>
            <Dialog.Close
              className="icon-button drawer-close"
              aria-label="Close"
            >
              <X />
            </Dialog.Close>
            {nav}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="row">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </button>
            <span>{admin ? "Administration" : "Workspace"}</span>
            <ChevronRight size={14} />
            <strong>
              {links.find(([href]) => href === pathname)?.[1]
                ? tr(links.find(([href]) => href === pathname)![1])
                : "AIHub"}
            </strong>
          </div>
          <div className="row">
            <span className="private-label">
              <ShieldCheck size={14} />
              {t("Kết nối bảo mật", "Secure workspace")}
            </span>
            <Preferences />
            <span className="avatar small">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main id="main-content" className="workspace-content">
          {children}
        </main>
        <footer className="workspace-footer">
          AIHub ·{" "}
          {t(
            "Tập trung vào điều bạn muốn xây dựng.",
            "Focus on what you want to build.",
          )}
          <Link href="/support">{tr("support")} ↗</Link>
        </footer>
      </div>
    </div>
  );
}
