# Rà soát bảo mật 06/11/2026

Phạm vi: AIHub web/worker, relay/CLI, lớp tích hợp Sub2API, dependency và cấu hình triển khai. Đây là rà soát source và kiểm chứng có giới hạn, không phải chứng nhận hệ thống không còn lỗ hổng.

## Các bản sửa

- AIHub: Nodemailer 10.3.1; minimatch 11.0.5 cho TypeScript ESLint. Audit toàn bộ và production đều không còn advisory tại thời điểm kiểm tra. SMTP production bắt buộc TLS, cấm đọc file/URL từ message.
- Xác thực chỉ tin `X-Real-IP` do ingress ghi đè. Test thực tế đổi `X-Forwarded-For` vẫn nhận 429. POST auth giới hạn 64 KiB theo byte thực, kể cả Content-Length giả.
- Xuất CSV chặn công thức có tiền tố khoảng trắng/ký tự điều khiển và giữ nguyên nội dung/escaping.
- Sub2API frontend: cập nhật dependency, Vite/Vitest và các transitive override có bản vá; audit sau cập nhật không còn advisory. SheetJS dùng bản 0.20.3 từ [nguồn phân phối chính thức](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), lockfile ghim integrity.
- Sub2API Go: cập nhật compress 1.20.3, brotli 1.2.8, x/image 0.47.0 và x/crypto tới revision đã sửa GO-2026-5932. `govulncheck ./cmd/server` trả `No vulnerabilities found` sau vá.
- Production dùng Node 24.22.1. DB/Redis không publish port; ingress chỉ tin IP NPM cụ thể, ghi đè forwarded headers, giới hạn body. Web/worker không nhận mật khẩu bootstrap. Secrets không đưa vào Git.
- Sub2API giữ dữ liệu và JWT/TOTP hiện có khi nâng cấp; cấu hình chặn upstream HTTP/private host. Hai tài khoản upstream hiện tại không dùng private host.

Lockfile/manifest Sub2API được lưu trong `integrations/sub2api/overlay`; `scripts/prepare-sub2api.mjs` áp dụng lên revision upstream đã ghim, không theo nhánh latest.

## Kiểm chứng trước triển khai

- Relay/CLI: 368/368 tests, không skip.
- Web: 17/17 tests; lint và TypeScript đạt. Kiểm thử mới gồm auth body limit, CSV injection và rate limit qua forwarded header.
- Dependency bộ build relay: npm audit 0 advisory.
- Scanner publication: không phát hiện private key, token hoặc file runtime bị cấm trong tập source xuất bản; không đưa lịch sử thiếu của shallow clone vào repo mới.

Kết quả build/runtime/deploy được cập nhật trong biên bản triển khai riêng. Scanner dependency chỉ phản ánh advisory và luồng gọi đã nhận diện tại thời điểm chạy.
