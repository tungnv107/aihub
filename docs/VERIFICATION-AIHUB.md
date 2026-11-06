# Biên bản kiểm chứng AIHub — 06/11/2026


## Phát hành công khai 0.5.0

Đã publish `@tungnv107/aihub@0.5.0` bằng token theo yêu cầu chủ tài khoản ngày 06/11/2026, khoảng 13:38 giờ Việt Nam. Đã kiểm tra metadata public/latest, tải và cài chính package từ registry trong prefix riêng; shim `aihub --version` trả `0.5.0`, help chạy thành công. SHA-512 registry khớp artifact local.

- Registry: https://www.npmjs.com/package/@tungnv107/aihub
- Máy chủ ghim: `https://aihub.tungnv.com`.
- SHA-256 release: `A001248A107262BFFACD8408799F707AA6C19E75D154C46968D0A171BA5503CF`.
- SHA-512: `hcO56ORLWnkuEVueL6bMahur00mKDvQ23P2j73SDIfiPENfmLFhTXulcRcm2QdDJE/oqd9MvpaTnGKw7aut1NA==`.
- 16/16 kiểm thử license/setup đạt trước publish; kiểm thử cài từ registry đã đạt sau publish.
- Registry tạm trả 404 metadata sau publish; kiểm tra lại sau khi đồng bộ đã trả latest 0.5.0 và cài được bằng tên package.
- Domain public trả `ERR_SSL_TLSV1_UNRECOGNIZED_NAME`; chưa kiểm chứng activation với backend production. Cài npm được nhưng chưa sử dụng key qua domain đến khi triển khai backend/TLS. Không thực hiện deploy VPS hay push Git.
- Trang chủ local và `/api/v1/public` đã hiển thị đúng `@tungnv107/aihub` / `0.5.0`; lint, TypeScript và production build trong Docker đạt sau cập nhật cấu hình.
- Web dùng các biến `AIHUB_NPM_PACKAGE_NAME`, `AIHUB_NPM_PACKAGE_VERSION`, `AIHUB_NPM_RELEASE_VERIFIED` để tránh trùng với biến `npm_package_*` của npm trên Windows.
- Token chỉ dùng trong bộ nhớ tiến trình; npmrc tạm chứa tham chiếu biến môi trường, đã xóa sau publish.

## Kiểm chứng staging trước phát hành (lịch sử)

Đã chốt scope `@tungnv107/aihub`, giữ lệnh `aihub`. Artifact staging đã được thay thế bởi release: `dist/tungnv107-aihub-0.5.0.tgz`, SHA-256 `93D4FB42AF2136A853A5F34447A772AEE24D7BB1BA9BCCAE0F6D0BAA72399C07`. Kiểm thử cài global trong prefix riêng và login/start/expire/renew/unsync/logout đạt 1/1 trên chính artifact có scope. Package chỉ có 4 file được phép, không có mẫu credential npm trong nội dung.

Registry công khai trả 404 cho tên gói tại thời điểm kiểm tra. Chưa publish; artifact có `private: true` và chưa ghim URL production. Website giữ `AIHUB_NPM_RELEASE_VERIFIED=false`. Cần domain HTTPS thật trước khi tạo build `--publish-ready`; không lưu token npm trong dự án.

Môi trường thực tế: Windows, Node 24.18.0, Docker Desktop Linux, Edge/Playwright. SaaS tại http://127.0.0.1:3000; Sub2API tại http://127.0.0.1:18080; SMTP thử nghiệm qua Mailpit local.

| Kiểm tra | Kết quả |
|---|---|
| Bộ hồi quy root `npm test` | **368/368 đạt**, bao gồm 17 kiểm thử CLI/npm/setup/license |
| SaaS backend | **14/14 đạt** trên database riêng; lần cuối chạy thành hai nhóm auth+commerce 7/7 và licenses+provision-race 7/7 |
| Playwright E2E | **8/8 đạt** trong một lượt hoàn chỉnh, 3,5 phút |
| ESLint / TypeScript | Đạt |
| Build Next production trong Docker | Đạt; Prisma generate, compile, TypeScript, routes |
| Runtime production | Container healthy; health, trang chủ, OpenAPI và icon đều HTTP 200; UID 1001 |
| Image worker/migrate | Đạt trên database mới riêng: migrate deploy, seed admin và policy; có 1 admin, không có gói giá mẫu production |
| Sub2API Go handler/middleware | Đạt; có kiểm tra shared gateway secret |
| CLI tgz | `dist/aihub-local-0.5.0.tgz`; private mặc định, bin `aihub` và alias `ch-relay` |
| SHA-256 tgz | `39619E4F21D9FB429AD4636803DDAED4FB7F510FDEBE1100B8B8C4AAC9C3FA23` |
| OpenAPI | 54 paths trong `web/public/openapi.json` |
| Backup/restore local | Đạt cho cả hai PostgreSQL: dump custom, restore vào database riêng, số bản ghi khớp trên 4 bảng SaaS và 2 bảng Sub2API; đã dọn database tạm |
| UI | Đã xem ảnh desktop 1440, tablet 768, mobile 390; dark/light, VI/EN; không tràn ngang ở các viewport đã kiểm tra |
| Accessibility | Axe không phát hiện vi phạm WCAG 2A/AA/2.1AA trên landing ở dark/light; menu Escape/focus kiểm tra qua E2E |

Các tình huống quan trọng đã kiểm chứng: không cấp key từ trang success; webhook trùng chỉ cấp một lần; key hết hạn/thu hồi chặn CLI; SSE bị cắt khi hết hạn; giới hạn thiết bị khi request đồng thời; proof replay/chữ ký sai; owner khác bị chặn; khách không vào admin; đối soát sai tiền bị từ chối; hoàn tiền cần yêu cầu khách; gia hạn cộng đủ ngày và retry không cộng hai lần; refund trong lúc cấp key giữ trạng thái REVOKED và xếp lại job cleanup.

Maintenance chặn đăng ký và checkout qua backend nhưng vẫn cho admin đăng nhập. Email verification/reset chạy qua SMTP Mailpit thật. Ticket và file riêng tư được kiểm tra quyền. Các tài khoản E2E đã khóa, license đã thu hồi, gói test đã ngừng bán; giữ lịch sử giao dịch và audit.

Ảnh kiểm tra tại `.runtime/aihub-landing-desktop.png`, `aihub-landing-768.png`, `aihub-landing-390.png`, `aihub-mobile-light.png`, `aihub-dashboard-empty.png`, `aihub-admin-overview.png`. Dữ liệu doanh thu trong ảnh quản trị là giao dịch sandbox local.

## Giới hạn nghiệm thu

- npm đã phát hành theo mục mới nhất phía trên. Chưa push Git hoặc deploy VPS. Tên `aihub` đã có chủ; dùng scope `@tungnv107/aihub`, lệnh vẫn là `aihub`.
- SePay đã kiểm thử chữ ký, API key và đối soát bằng payload thử; chưa có giao dịch ngân hàng thật. SMTP production, Google OAuth và domain/TLS public cần thông tin chủ hệ thống.
- UI không giả số liệu quota/token. Vì AI đi qua tài khoản ChatGPT trên máy khách, màn usage hiển thị chưa có dữ liệu khi chưa có nguồn báo cáo xác thực.
- Kiểm thử thực thi CLI hiện trên Windows; hướng dẫn macOS/Linux có trong package nhưng chưa có máy thật để nghiệm thu hai hệ điều hành đó.
- Bảo vệ local không phải DRM tuyệt đối: người kiểm soát máy có thể sửa JavaScript/copy profile. Giới hạn thiết bị và quyền dịch vụ do server kiểm tra; không hứa chống sửa client tuyệt đối.
- Ban đầu E2E có timeout khi máy gần hết RAM; sau khi giới hạn heap, giảm worker build và tách các lượt nặng, lượt cuối đạt. Không bỏ assertion hoặc tắt rate limit để vượt kiểm thử.

Hướng dẫn chạy/đăng ký: DEPLOYMENT_GUIDE.md, TEST_PLAN.md và NPM-REGISTRATION.md. Các bí mật local nằm trong file env bị gitignore, không đưa vào artifact npm.
