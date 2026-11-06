"use client";
import Link from "next/link";
import { useState, useMemo } from "react";
import { useLocale } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Search,
  ArrowUpRight,
  ThumbsUp,
  ThumbsDown,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Header, Footer } from "./navigation";
import { Button, CodeBlock, Empty } from "./ui";
import { useText } from "./providers";
import { api, date, errorMessage } from "@/lib/api";
import type { Document } from "@/generated/prisma/client";
import type { Wire, PublicData } from "@/lib/types";
const anchor = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export function Documentation({
  documents,
  current,
  kind,
  release,
  faqs = [],
}: {
  documents: (Wire<Document> & {
    category?: { id: string; name: string } | null;
  })[];
  current: Wire<Document> | null;
  kind: "docs" | "help" | "legal";
  release: PublicData["release"];
  faqs?: PublicData["faqs"];
}) {
  const t = useText(),
    locale = useLocale(),
    [search, setSearch] = useState(""),
    [os, setOs] = useState("windows");
  const filtered = useMemo(
    () =>
      documents.filter((d) =>
        (d.title + " " + d.description + " " + d.body)
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
      ),
    [documents, search],
  );
  const headings =
    current?.body
      .split("\n")
      .filter((line) => /^#{2,3} /.test(line))
      .map((line) => line.replace(/^#+ /, "")) ?? [];
  return (
    <>
      <Header />
      <main id="main-content" className="docs-container">
        <aside className="docs-sidebar">
          <div className="search-field">
            <Search />
            <input
              aria-label={t("Tìm tài liệu", "Search documentation")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Tìm hướng dẫn…", "Search guides…")}
            />
          </div>
          <h2>
            {kind === "help"
              ? t("TRỢ GIÚP", "HELP CENTER")
              : kind === "legal"
                ? t("CHÍNH SÁCH", "POLICIES")
                : t("TÀI LIỆU", "DOCUMENTATION")}
          </h2>
          <nav>
            <Link href={"/" + kind} className={!current ? "active" : ""}>
              {t("Tổng quan", "Overview")}
            </Link>
            {filtered.map((d, index) => (
              <div key={d.id}>
                {d.category &&
                  d.categoryId !== filtered[index - 1]?.categoryId && (
                    <h3 className="tiny muted" style={{ marginTop: 20 }}>
                      {d.category.name}
                    </h3>
                  )}
                <Link
                  key={d.id}
                  className={current?.id === d.id ? "active" : ""}
                  href={"/" + kind + "/" + d.slug}
                >
                  {d.title}
                </Link>
              </div>
            ))}
          </nav>
          <div className="notice" style={{ marginTop: 30 }}>
            <BookOpen size={15} />
            <div>
              {t("Cần thêm trợ giúp?", "Need a hand?")}
              <br />
              <Link href="/support/new" className="text-link">
                {t("Liên hệ hỗ trợ", "Contact support")}
                <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        </aside>
        <article className="docs-content">
          <p className="eyebrow">AIHUB / {kind.toUpperCase()}</p>
          {current ? (
            <>
              <h1>{current.title}</h1>
              <p>{current.description}</p>
              <p className="tiny muted">
                {t("Cập nhật", "Updated")} {date(current.updatedAt, locale)}
              </p>
              {current.slug === "getting-started" && (
                <div className="panel" style={{ margin: "25px 0" }}>
                  <div className="tab-list" style={{ marginBottom: 15 }}>
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
                  <p className="tiny">
                    {os === "windows"
                      ? t(
                          "Mở PowerShell hoặc Windows Terminal.",
                          "Open PowerShell or Windows Terminal.",
                        )
                      : t(
                          "Mở ứng dụng Terminal.",
                          "Open the Terminal application.",
                        )}{" "}
                    Node.js ≥ 24.18.0.
                  </p>
                  {release ? (
                    <CodeBlock>{`npm i -g ${release.name}@${release.version}\naihub`}</CodeBlock>
                  ) : (
                    <div className="notice" style={{ marginBottom: 0 }}>
                      <Info size={16} />
                      {t(
                        "Bản npm công khai chưa được xác thực. Chưa có lệnh cài từ registry.",
                        "The public npm release is not verified yet. No registry installation command is available.",
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="prose">
                <ReactMarkdown
                  skipHtml
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h2: ({ children }) => (
                      <h2 id={anchor(String(children))}>{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 id={anchor(String(children))}>{children}</h3>
                    ),
                    pre: ({ children }) => (
                      <div className="code-block">{children}</div>
                    ),
                    code: ({ children, className }) =>
                      className ? (
                        <CodeBlock>{String(children).trimEnd()}</CodeBlock>
                      ) : (
                        <code>{children}</code>
                      ),
                    a: ({ href, children }) => (
                      <a href={href} rel="noreferrer noopener">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {current.body}
                </ReactMarkdown>
              </div>
              <div className="doc-feedback">
                <span>
                  {t("Tài liệu này có hữu ích?", "Was this helpful?")}
                </span>
                {[true, false].map((helpful) => (
                  <Button
                    key={String(helpful)}
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await api("documents/" + current.id + "/feedback", {
                          method: "POST",
                          body: JSON.stringify({ helpful }),
                        });
                        toast.success(
                          t(
                            "Cảm ơn phản hồi của bạn",
                            "Thanks for your feedback",
                          ),
                        );
                      } catch (error) {
                        toast.error(errorMessage(error, locale));
                      }
                    }}
                  >
                    {helpful ? (
                      <ThumbsUp size={14} />
                    ) : (
                      <ThumbsDown size={14} />
                    )}{" "}
                    {helpful ? t("Có", "Yes") : t("Chưa", "Not yet")}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h1>
                {kind === "help"
                  ? t("Chúng tôi có thể giúp gì?", "How can we help?")
                  : kind === "legal"
                    ? t("Chính sách AIHub", "AIHub policies")
                    : t(
                        "Bắt đầu xây dựng cùng AIHub.",
                        "Start building with AIHub.",
                      )}
              </h1>
              <p>
                {t(
                  "Tìm câu trả lời, hướng dẫn cài đặt và cách quản lý dịch vụ.",
                  "Find answers, installation guides and ways to manage your services.",
                )}
              </p>
              {filtered.length ? (
                <div className="doc-cards">
                  {filtered.map((d) => (
                    <Link key={d.id} href={"/" + kind + "/" + d.slug}>
                      <BookOpen size={23} style={{ color: "var(--primary)" }} />
                      <h2>{d.title}</h2>
                      <p>{d.description}</p>
                      <span className="text-link">
                        {t("Đọc hướng dẫn", "Read guide")}
                        <ArrowUpRight size={14} />
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty
                  title={t("Chưa có bài viết phù hợp", "No matching articles")}
                  description={t(
                    "Thử từ khóa khác hoặc gửi yêu cầu hỗ trợ.",
                    "Try another keyword or contact support.",
                  )}
                />
              )}{" "}
              {kind === "help" &&
                faqs.map((f) => (
                  <details
                    className="panel"
                    key={f.id}
                    style={{ marginTop: 15 }}
                  >
                    <summary>{f.question}</summary>
                    <p className="tiny" style={{ marginTop: 15 }}>
                      {f.answer}
                    </p>
                  </details>
                ))}
            </>
          )}
        </article>
        <aside className="docs-toc">
          <strong>{t("TRÊN TRANG NÀY", "ON THIS PAGE")}</strong>
          {headings.map((h, i) => (
            <a key={i} href={"#" + anchor(h)}>
              {h}
            </a>
          ))}
        </aside>
      </main>
      <Footer />
    </>
  );
}
