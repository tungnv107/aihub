# Biến môi trường

Mẫu local: `web/.env.example`. Mẫu máy chủ: `deploy/aihub/.env.example`. Không commit `.env`, không đặt các bí mật thành `NEXT_PUBLIC_*`.

| Biến | Mục đích |
|---|---|
| DATABASE_URL | PostgreSQL AIHub; runtime Docker tự dựng từ POSTGRES_PASSWORD |
| REDIS_URL | Redis rate limit/challenge và BullMQ |
| BETTER_AUTH_URL | URL website; production bắt buộc HTTPS |
| BETTER_AUTH_SECRET | Ký dữ liệu authentication, tối thiểu 32 ký tự |
| LICENSE_HASH_SECRET | HMAC index của license; thay đổi cần kế hoạch reindex |
| LICENSE_ENCRYPTION_KEY | AES-256-GCM; 64 ký tự hex; mất khóa không giải mã được key cũ |
| AIHUB_GATEWAY_SECRET | Chung giữa AIHub và Sub2API; bắt buộc cho key namespace AIHub |
| SUB2API_URL | Endpoint nội bộ máy chủ Sub2API |
| SUB2API_ADMIN_API_KEY | Scoped key chỉ có `chrelay.licenses.write` |
| SUB2API_ADMIN_TOKEN | JWT quản trị thay thế tạm thời; không ưu tiên vì hết hạn |
| SUB2API_LICENSE_USER_ID | User chuyên giữ license, không cần số dư AI |
| PAYMENT_PROVIDER | disabled / sepay / sandbox; sandbox chỉ chạy dev trên localhost |
| SEPAY_AUTH_MODE | hmac (ưu tiên) hoặc apikey |
| SEPAY_WEBHOOK_SECRET | Secret xác thực webhook, không phải mật khẩu ngân hàng |
| BANK_BIN / BANK_ACCOUNT / BANK_ACCOUNT_NAME | Thông tin chuyển khoản và VietQR |
| SANDBOX_PAYMENT_SECRET | Ký webhook local, không sử dụng ở production |
| SMTP_HOST / PORT / SECURE / USER / PASSWORD | SMTP; SECURE=true cho TLS trực tiếp, false cho STARTTLS hoặc Mailpit local |
| MAIL_FROM | Tên và địa chỉ gửi email |
| GOOGLE_CLIENT_ID / SECRET | OAuth tùy chọn; callback `/api/auth/callback/google` |
| AIHUB_NPM_PACKAGE_NAME / AIHUB_NPM_PACKAGE_VERSION / AIHUB_NPM_RELEASE_VERIFIED | Chỉ mở lệnh cài sau khi xác minh registry |
| UPLOAD_DIR | Thư mục attachment riêng tư, mặc định `.data/uploads` |
| BOOTSTRAP_ADMIN_EMAIL / PASSWORD | Seed admin lần đầu; không đổi mật khẩu user đã tồn tại |
| DOMAIN | Hostname Caddy HTTPS |
| SUB2API_POSTGRES_PASSWORD / REDIS_PASSWORD / JWT_SECRET / TOTP_ENCRYPTION_KEY / ADMIN_EMAIL / ADMIN_PASSWORD | Các biến có prefix SUB2API_ dùng riêng cho stack production Sub2API |
| TEST_DATABASE_URL | Database kiểm thử tên kết thúc `_test`; mặc định local `aihub_test` |

Sau khi sửa biến runtime, restart web/worker. Không đổi các khóa mã hóa đang dùng khi chưa có backup và quy trình migration. Proxy ghi đè X-Real-IP; web không expose trực tiếp ra Internet.
