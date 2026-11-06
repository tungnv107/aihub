# Kế hoạch triển khai AIHub

| ID | Công việc | Ưu tiên | Phụ thuộc | Nghiệm thu / bằng chứng | Trạng thái |
|---|---|---|---|---|---|
| P01 | Khảo sát, kiến trúc, sitemap, design tokens | P0 | — | Tài liệu và source scaffold đọc được | [x] |
| P02 | Đổi CLI/package sang AIHub, tên npm cấu hình được | P0 | — | Cài tgz global tách biệt, shim aihub chạy | [x] |
| P03 | PostgreSQL/Prisma schema và migration sạch | P0 | P01 | migrate deploy DB mới, seed cấu hình | [x] |
| P04 | Auth, verification/reset, session, RBAC | P0 | P03 | auth integration/e2e và chặn trái quyền | [x] |
| P05 | Design system, landing, pricing VI/EN, theme responsive | P0 | P01,P03 | ảnh desktop/mobile, build, accessibility | [x] |
| P06 | Checkout, order, webhook, outbox, chống cấp trùng | P0 | P04 | đúng/sai chữ ký, số tiền, replay, timeout | [x] |
| P07 | Provisioning Sub2API + license/devices/challenge | P0 | P06 | cấp, hết hạn, thu hồi, concurrency, renewal | [x] |
| P08 | Customer dashboard/licenses/devices/usage/billing/settings | P0 | P07 | ownership, empty/loading/error states, e2e | [x] |
| P09 | Docs/search/FAQ và support ticket/attachment | P1 | P04 | tìm kiếm, ticket trao đổi, ACL attachment | [x] |
| P10 | Admin users/plans/orders/licenses/support/content/settings/audit | P0 | P06,P09 | CRUD, lọc, phân trang, RBAC, audit | [x] |
| P11 | Docker, CI, OpenAPI, backup/restore và tài liệu vận hành | P1 | P03–P10 | compose config, health, migration, scripts | [x] |
| P12 | QA tổng thể, lint/typecheck/build/tests, cập nhật bằng chứng | P0 | tất cả | kết quả lệnh thực tế, giới hạn ghi rõ | [x] |

Chỉ chuyển [x] sau khi có bằng chứng đạt nghiệm thu. Provider production, npm publishing và VPS deployment cần cấu hình/quyền riêng; không xem sandbox là thanh toán live.

Bằng chứng nghiệm thu ngày 06/11/2026: xem [VERIFICATION-AIHUB.md](VERIFICATION-AIHUB.md) và [TEST_PLAN.md](TEST_PLAN.md). P02: cài tgz thực trong bộ root 368/368; P04–P10: backend 14/14 và E2E 8/8; P05: ảnh desktop/tablet/mobile và Axe dark/light; P11: compose config, build production, restore hai database; P12: lint/typecheck/build đều đạt. Tài khoản/provider production chưa cấu hình được ghi riêng trong biên bản, không coi là đã deploy.
