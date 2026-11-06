"use client";
import Link from "next/link";
import { useState } from "react";
import { useLocale } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import { Accordion, Tabs } from "radix-ui";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  KeyRound,
  Monitor,
  ShieldCheck,
  Terminal,
  Layers3,
  Activity,
  Command,
  BookOpen,
  LifeBuoy,
  ChartNoAxesCombined,
  Plus,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { Header, Footer } from "./navigation";
import { useText } from "./providers";
import { Badge, Empty, CodeBlock } from "./ui";
import { ActivityChart, StatCard } from "./charts";
import { money } from "@/lib/api";
import type { PublicData } from "@/lib/types";
const sample = [
  { label: "T2", value: 24 },
  { label: "T3", value: 40 },
  { label: "T4", value: 32 },
  { label: "T5", value: 68 },
  { label: "T6", value: 45 },
  { label: "T7", value: 84 },
  { label: "CN", value: 76 },
];
export function ProductPreview({ large = false }: { large?: boolean }) {
  const t = useText();
  return (
    <div className={"product-preview " + (large ? "large" : "")}>
      <div className="preview-chrome">
        <div className="window-dots">
          <i />
          <i />
          <i />
        </div>
        <span>
          <Layers3 size={12} /> AIHub / Workspace
        </span>
        <Badge tone="brand">{t("Minh họa", "Demo data")}</Badge>
      </div>
      <div className="preview-body">
        <aside className="preview-rail">
          <span className="preview-logo">
            <Layers3 size={20} />
          </span>
          <Command size={18} />
          <KeyRound size={18} />
          <Monitor size={18} />
          <Activity size={18} />
          <span className="preview-rail-bottom">
            <LifeBuoy size={18} />
          </span>
        </aside>
        <div className="preview-content">
          <div className="row between">
            <div>
              <p className="eyebrow">YOUR WORKSPACE</p>
              <h3>
                {t("Sẵn sàng cho ý tưởng mới.", "Ready for your next idea.")}
              </h3>
            </div>
            <span className="avatar small">A</span>
          </div>
          <div className="preview-stats">
            <StatCard
              label={t("License hoạt động", "Active license")}
              value="01"
              detail="Professional"
              icon={<KeyRound size={15} />}
            />
            <StatCard
              label={t("Thiết bị kết nối", "Connected devices")}
              value={
                <span>
                  2 <small>/ 3</small>
                </span>
              }
              detail={t("Dữ liệu minh họa", "Sample data")}
              icon={<Monitor size={15} />}
            />
          </div>
          <Tabs.Root defaultValue="activity">
            <div className="row between preview-chart-heading">
              <Tabs.List className="tab-list">
                <Tabs.Trigger value="activity">
                  {t("Hoạt động", "Activity")}
                </Tabs.Trigger>
                <Tabs.Trigger value="devices">
                  {t("Thiết bị", "Devices")}
                </Tabs.Trigger>
              </Tabs.List>
              <span className="muted tiny">7 {t("ngày", "days")}</span>
            </div>
            <Tabs.Content value="activity">
              <ActivityChart data={sample} />
            </Tabs.Content>
            <Tabs.Content value="devices">
              <div className="preview-devices">
                {["MacBook Pro", "Windows Desktop"].map((name) => (
                  <div className="row between" key={name}>
                    <span className="row">
                      <Monitor size={16} />
                      {name}
                    </span>
                    <Badge tone="success">Online</Badge>
                  </div>
                ))}
              </div>
            </Tabs.Content>
          </Tabs.Root>
          <div className="preview-license">
            <div className="row">
              <span className="key-icon">
                <KeyRound size={17} />
              </span>
              <div>
                <strong>Professional license</strong>
                <small className="mono">•••• •••• •••• DEMO</small>
              </div>
            </div>
            <Badge tone="success">Active</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
export function PricingCards({ data }: { data: PublicData }) {
  const locale = useLocale(),
    t = useText();
  if (!data.plans.length)
    return (
      <Empty
        title={t("Gói dịch vụ đang được chuẩn bị", "Plans are being prepared")}
        description={t(
          "Liên hệ hỗ trợ để nhận thông báo khi mở bán.",
          "Contact support to hear when plans are available.",
        )}
        href="/support"
        label={t("Liên hệ", "Contact")}
      />
    );
  return (
    <div className="pricing-grid">
      {data.plans.map((plan) => (
        <article
          className={"pricing-card " + (plan.recommended ? "recommended" : "")}
          key={plan.id}
        >
          {plan.recommended && (
            <span className="recommended-label">
              <Sparkles size={13} />
              {t("Lựa chọn nổi bật", "Recommended")}
            </span>
          )}
          <span className="plan-symbol">
            <Layers3 size={23} />
          </span>
          <h3>{plan.name}</h3>
          <p>{plan.description}</p>
          <div className="plan-price">
            {plan.originalPrice && (
              <del>{money(plan.originalPrice, locale)}</del>
            )}
            <strong>{money(plan.price, locale)}</strong>
            <span>
              / {plan.durationDays} {t("ngày", "days")}
            </span>
          </div>
          <div className="plan-meta">
            <span>
              <Monitor size={15} />
              {plan.maxDevices} {t("thiết bị", "devices")}
            </span>
            <span>
              <KeyRound size={15} />
              {t("Key cá nhân", "Personal key")}
            </span>
          </div>
          <Link
            className={"button " + (plan.recommended ? "primary" : "secondary")}
            href={"/checkout?plan=" + plan.id}
          >
            {t("Chọn gói", "Choose plan")}
            <ArrowUpRight size={16} />
          </Link>
          <ul>
            {plan.features.map((f) => (
              <li key={f.id}>
                <Check size={15} />
                {f.label}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
export function Marketing({
  data,
  pricingOnly = false,
}: {
  data: PublicData;
  pricingOnly?: boolean;
}) {
  const t = useText(),
    reduced = useReducedMotion(),
    [os, setOs] = useState("windows");
  const site =
    data.site && typeof data.site === "object" && !Array.isArray(data.site)
      ? data.site
      : null;
  return (
    <>
      <Header />
      <main id="main-content">
        {!pricingOnly && (
          <>
            <section className="hero container">
              <div className="hero-grid" aria-hidden="true" />
              <motion.div
                className="hero-copy"
                initial={reduced ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <span className="hero-pill">
                  <span className="status-dot" />
                  THE DEVELOPER WORKSPACE
                  <ArrowUpRight size={13} />
                </span>
                <h1>
                  {typeof site?.headline === "string"
                    ? site.headline
                    : t("Không gian AI.", "Your AI workspace.")}
                  <br />
                  <span>
                    {t("Sẵn sàng để xây dựng.", "Built for your flow.")}
                  </span>
                </h1>
                <p>
                  {typeof site?.description === "string"
                    ? site.description
                    : t(
                        "Từ dòng code đầu tiên đến ý tưởng tiếp theo. Quản lý license, thiết bị và dịch vụ của bạn trong một không gian gọn gàng, liền mạch.",
                        "From your first line of code to your next big idea. Bring your licenses, devices and services together in one focused workspace.",
                      )}
                </p>
                <div className="hero-actions">
                  <Link href="/register" className="button primary">
                    {t("Khám phá AIHub", "Explore AIHub")}
                    <ArrowRight size={17} />
                  </Link>
                  <Link href="/pricing" className="button secondary">
                    {t("Xem bảng giá", "View pricing")}
                  </Link>
                </div>
                <div className="hero-notes">
                  <span>
                    <ShieldCheck size={15} />
                    {t("Tài khoản AI của bạn", "Your own AI account")}
                  </span>
                  <span>
                    <Check size={15} />
                    {t("Bạn luôn kiểm soát", "Always in your control")}
                  </span>
                </div>
              </motion.div>
              <motion.div
                className="hero-visual"
                initial={reduced ? false : { opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.12 }}
              >
                <div className="orb" />
                <ProductPreview />
                <div className="floating-terminal">
                  <div className="row">
                    <Terminal size={14} />
                    <span>aihub</span>
                    <Badge tone="success">Ready</Badge>
                  </div>
                  <p>
                    <span>✓</span>{" "}
                    {t("Workspace đã sẵn sàng.", "Your workspace is ready.")}
                  </p>
                </div>
                <div className="floating-secure">
                  <ShieldCheck size={18} />
                  <span>
                    {t("Quyền truy cập được xác thực", "Access verified")}
                    <small>
                      {t("Minh họa giao diện", "Interface preview")}
                    </small>
                  </span>
                </div>
              </motion.div>
            </section>
            <div className="platform-strip container">
              <span>
                {t("THIẾT KẾ CHO QUY TRÌNH CỦA BẠN", "BUILT FOR YOUR WORKFLOW")}
              </span>
              <div>
                <Terminal size={18} /> Terminal
              </div>
              <div>
                <Command size={18} /> macOS
              </div>
              <div>
                <Monitor size={18} /> Windows
              </div>
              <div>
                <Layers3 size={18} /> Linux
              </div>
              <div>
                <ShieldCheck size={18} />{" "}
                {t("Private by design", "Private by design")}
              </div>
            </div>
            <section id="features" className="section container">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">LESS FRICTION. MORE FOCUS.</p>
                  <h2>
                    {t("Mọi thứ đúng chỗ.", "Everything in its place.")}
                    <br />
                    <span className="muted">
                      {t(
                        "Để bạn tập trung xây dựng.",
                        "So you can focus on building.",
                      )}
                    </span>
                  </h2>
                </div>
                <p>
                  {t(
                    "Một góc làm việc rõ ràng cho những công cụ bạn dùng mỗi ngày.",
                    "A clear home for the tools you work with every day.",
                  )}
                </p>
              </div>
              <div className="bento">
                <article className="bento-card bento-wide">
                  <div className="feature-icon">
                    <KeyRound />
                  </div>
                  <h3>
                    {t(
                      "License & thiết bị, luôn trong tầm tay.",
                      "Licenses & devices, under control.",
                    )}
                  </h3>
                  <p>
                    {t(
                      "Biết chính xác key nào đang hoạt động, thời điểm hết hạn và máy nào được cấp quyền.",
                      "Know which keys are active, when they expire and which devices have access.",
                    )}
                  </p>
                  <div className="mini-device-list">
                    {["MacBook Pro", "Windows Desktop"].map((name, i) => (
                      <div key={name}>
                        <span className="device-art">
                          <Monitor size={22} />
                        </span>
                        <span>
                          <strong>{name}</strong>
                          <small>
                            {t("Thiết bị minh họa", "Sample device")} ·{" "}
                            {i ? "Windows" : "macOS"}
                          </small>
                        </span>
                        <Badge tone="success">Active</Badge>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="bento-card">
                  <div className="feature-icon cyan">
                    <ChartNoAxesCombined />
                  </div>
                  <h3>{t("Dữ liệu rõ ràng.", "Clarity in your data.")}</h3>
                  <p>
                    {t(
                      "Chỉ hiển thị mức sử dụng và quota khi có nguồn dữ liệu xác thực.",
                      "Usage and quotas appear only when a verified source is connected.",
                    )}
                  </p>
                  <div className="mini-chart" aria-hidden="true">
                    {[28, 48, 34, 65, 52, 78, 64, 90, 72].map((n, i) => (
                      <i key={i} style={{ height: n + "%" }} />
                    ))}
                  </div>
                  <span className="tiny muted">
                    {t("Minh họa biểu đồ", "Chart illustration")}
                  </span>
                </article>
                <article className="bento-card">
                  <div className="feature-icon">
                    <Layers3 />
                  </div>
                  <h3>
                    {t("Một nơi. Một nhịp làm việc.", "One place. One flow.")}
                  </h3>
                  <p>
                    {t(
                      "Đơn hàng, quyền truy cập và thông báo gắn kết trong cùng workspace.",
                      "Orders, access and notifications connected in one workspace.",
                    )}
                  </p>
                  <div className="stacked-labels">
                    <span>
                      <CheckCircle2 size={15} /> Workspace
                    </span>
                    <span>
                      <KeyRound size={15} /> License
                    </span>
                    <span>
                      <Plus size={15} />{" "}
                      {t("Ý tưởng tiếp theo", "Your next idea")}
                    </span>
                  </div>
                </article>
                <article className="bento-card">
                  <div className="feature-icon cyan">
                    <Activity />
                  </div>
                  <h3>
                    {t("Theo dõi hành trình.", "Keep track of your work.")}
                  </h3>
                  <p>
                    {t(
                      "Lịch sử kích hoạt và giao dịch giúp bạn nắm rõ mọi thay đổi.",
                      "Activation and transaction history keep every change visible.",
                    )}
                  </p>
                  <div className="event-line">
                    <span />
                    {t("License được cấp", "License issued")}
                    <small>09:41</small>
                  </div>
                  <div className="event-line">
                    <span />
                    {t("Thiết bị kết nối", "Device connected")}
                    <small>09:42</small>
                  </div>
                </article>
                <article className="bento-card">
                  <div className="feature-icon">
                    <BookOpen />
                  </div>
                  <h3>{t("Bắt đầu nhẹ nhàng.", "An easy start.")}</h3>
                  <p>
                    {t(
                      "Tài liệu từng bước và hỗ trợ theo ticket ngay khi bạn cần.",
                      "Step-by-step documentation and ticket support when you need it.",
                    )}
                  </p>
                  <Link className="text-link" href="/docs">
                    {t("Mở hướng dẫn", "Open documentation")}
                    <ArrowUpRight size={16} />
                  </Link>
                </article>
                <article className="bento-card bento-wide security-feature">
                  <div>
                    <div className="feature-icon cyan">
                      <ShieldCheck />
                    </div>
                    <h3>
                      {t(
                        "Tài khoản của bạn. Quyền kiểm soát của bạn.",
                        "Your account. Your control.",
                      )}
                    </h3>
                    <p>
                      {t(
                        "AIHub xác thực quyền dùng relay. Tài khoản ChatGPT tiếp tục nằm trong công cụ local của bạn.",
                        "AIHub verifies relay access. Your ChatGPT account stays in your local tool.",
                      )}
                    </p>
                  </div>
                  <div className="security-ring">
                    <ShieldCheck size={48} />
                  </div>
                </article>
              </div>
            </section>
            <section className="section container steps-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">FROM ZERO TO WORKSPACE</p>
                  <h2>
                    {t(
                      "Ba bước. Sẵn sàng làm việc.",
                      "Three steps. Ready to work.",
                    )}
                  </h2>
                </div>
              </div>
              <div className="steps">
                {[
                  [
                    t("Chọn không gian phù hợp", "Choose your workspace"),
                    t(
                      "So sánh thời hạn, số thiết bị và chọn gói dành cho bạn.",
                      "Compare validity and devices to find the right plan.",
                    ),
                  ],
                  [
                    t("Kích hoạt AIHub", "Activate AIHub"),
                    t(
                      "Nhận key sau khi thanh toán được xác nhận và kết nối công cụ local.",
                      "Receive your key after verified payment and connect your local tool.",
                    ),
                  ],
                  [
                    t("Tập trung vào ý tưởng", "Focus on your ideas"),
                    t(
                      "Quản lý dịch vụ và nhận hỗ trợ từ một nơi duy nhất.",
                      "Manage your services and get support from one place.",
                    ),
                  ],
                ].map(([title, description], i) => (
                  <div key={title}>
                    <span className="step-number">0{i + 1}</span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        <section
          className={
            "section container pricing-section " +
            (pricingOnly ? "pricing-page" : "")
          }
        >
          <div className="center-heading">
            <p className="eyebrow">SIMPLE PLANS. ROOM TO BUILD.</p>
            <h2>
              {t("Một gói phù hợp với bạn.", "A plan that fits your flow.")}
            </h2>
            <p>
              {t(
                "Thời hạn rõ ràng. Quyền truy cập minh bạch. Không tự động gia hạn.",
                "Clear validity. Transparent access. No automatic renewals.",
              )}
            </p>
            {data.payment.sandbox && (
              <Badge tone="warning">
                {t(
                  "Môi trường thử nghiệm · Bảng giá mẫu",
                  "Test environment · Sample catalog",
                )}
              </Badge>
            )}
          </div>
          <PricingCards data={data} />
          <p className="pricing-footnote">
            <ShieldCheck size={15} />
            {t(
              "Giá cho quyền sử dụng AIHub. Tài khoản và hạn mức AI được cung cấp riêng.",
              "Prices cover AIHub access. AI accounts and quotas are provided separately.",
            )}
          </p>
        </section>
        {!pricingOnly && (
          <section className="section container demo-section">
            <div className="center-heading">
              <p className="eyebrow">MEET YOUR NEW WORKSPACE</p>
              <h2>
                {t(
                  "Một góc nhìn. Toàn bộ không gian.",
                  "One view. Your whole workspace.",
                )}
              </h2>
              <p>
                {t(
                  "Thử các tab bên dưới. Đây là dữ liệu minh họa, không phải số liệu khách hàng.",
                  "Try the tabs below. This is sample data, not customer activity.",
                )}
              </p>
            </div>
            <ProductPreview large />
            <div className="setup-strip">
              <div>
                <Terminal size={22} />
                <h3>
                  {t(
                    "Từ terminal đến workspace.",
                    "From terminal to workspace.",
                  )}
                </h3>
              </div>
              <div className="tab-list">
                {["windows", "macos", "linux"].map((value) => (
                  <button
                    key={value}
                    className={os === value ? "selected" : ""}
                    onClick={() => setOs(value)}
                  >
                    {value === "macos"
                      ? "macOS"
                      : value === "windows"
                        ? "Windows"
                        : "Linux"}
                  </button>
                ))}
              </div>
              {data.release ? (
                <CodeBlock>{`npm i -g ${data.release.name}@${data.release.version}\naihub`}</CodeBlock>
              ) : (
                <p className="muted">
                  {t(
                    "Bản npm công khai đang được chuẩn bị. Hướng dẫn cài sẽ mở khi bản phát hành được xác thực.",
                    "The public npm package is being prepared. Installation instructions will appear after release verification.",
                  )}
                </p>
              )}
            </div>
          </section>
        )}
        {data.testimonials.length > 0 && (
          <section className="section container">
            <div className="center-heading">
              <p className="eyebrow">FROM THE COMMUNITY</p>
              <h2>
                {t("Từ những người đang xây dựng.", "From people who build.")}
              </h2>
            </div>
            <div className="testimonial-grid">
              {data.testimonials.map((item) => (
                <blockquote key={item.id}>
                  <p>“{item.quote}”</p>
                  <footer>
                    <strong>{item.name}</strong>
                    <span>{item.role}</span>
                  </footer>
                </blockquote>
              ))}
            </div>
          </section>
        )}
        <section className="section container faq-section">
          <div>
            <p className="eyebrow">A LITTLE MORE CLARITY</p>
            <h2>{t("Bạn muốn biết thêm?", "A few good questions.")}</h2>
            <p className="muted">
              {t(
                "Những điều cần biết trước khi bắt đầu.",
                "What to know before you get started.",
              )}
            </p>
            <Link className="text-link" href="/help">
              {t("Trung tâm trợ giúp", "Help center")}
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <Accordion.Root type="single" collapsible className="faq-list">
            {data.faqs.map((faq) => (
              <Accordion.Item key={faq.id} value={faq.id}>
                <Accordion.Header>
                  <Accordion.Trigger>
                    {faq.question}
                    <ChevronDown size={18} />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content>
                  <p>{faq.answer}</p>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </section>
        <section className="container final-cta">
          <div>
            <p className="eyebrow">YOUR NEXT CHAPTER</p>
            <h2>
              {t(
                "Ý tưởng tiếp theo bắt đầu ở đây.",
                "Your next idea starts here.",
              )}
            </h2>
            <p>
              {t(
                "Tạo workspace của bạn và bắt đầu xây dựng.",
                "Create your workspace and start building.",
              )}
            </p>
          </div>
          <Link className="button primary" href="/register">
            {t("Bắt đầu với AIHub", "Get started with AIHub")}
            <ArrowRight size={18} />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
