# Kiến trúc AIHub

- `web/`: Next.js App Router + React/TypeScript strict, Tailwind v4, Radix/shadcn-style primitives, next-intl, next-themes, Motion, TanStack Table và Recharts.
- Better Auth + Prisma/PostgreSQL: session HttpOnly, email/password, email verification/reset, OAuth khi cấu hình. Kiểm tra quyền ở server cho mọi resource.
- Services tách khỏi UI: commerce, payments, licensing/device, support/content, admin/audit.
- Redis: rate limit/challenge/replay. BullMQ + worker: provisioning Sub2API, email, đối soát hết hạn và retry; DB outbox giữ tác vụ chưa enqueue.
- Payment adapters: SePay/VietQR khi cấu hình, sandbox có HMAC chỉ cho local/test. Success page chỉ đọc trạng thái DB.
- Sub2API adapter chỉ chạy server-side. API key mã hóa trong DB website để chủ sở hữu có thể sao chép; HMAC dùng lookup. Không ghi key vào log.
- Health `/api/health`; Docker tách web/worker/postgres/redis, SMTP local qua Mailpit. Production reverse proxy HTTPS.

AIHub không tự đọc credential ChatGPT trên máy khách. CLI và Sub2API được tích hợp qua hợp đồng quyền, không đưa admin secret vào package.
