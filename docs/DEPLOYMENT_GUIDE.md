# Cài đặt và vận hành AIHub

## Local (Windows/macOS/Linux)

Node.js ≥24.18.0, Git, Docker Compose. Không dùng secret thật trong môi trường thử nghiệm.

```powershell
node scripts/prepare-sub2api.mjs
node scripts/init-sub2api.mjs
docker compose --env-file deploy/sub2api/.env -f deploy/sub2api/compose.yaml up -d --build --wait
cd web
npm ci
node scripts/init-local.mjs
docker compose --env-file .env -f compose.local.yaml up -d --wait
npm run db:generate
npm run db:migrate
npm run db:seed
```

Các script init không ghi đè file đã tồn tại; bỏ qua khi đã khởi tạo. Tài khoản quản trị AIHub nằm trong `web/.env`; không in hoặc gửi file này. Sub2API yêu cầu chủ hệ thống chấp nhận cam kết vận hành trước khi API quản trị hoạt động. Sau khi tự đọc và đồng ý, dùng `node scripts/accept-sub2api-compliance.mjs --accept-after-reading` từ root (lần local hiện tại đã được chủ hệ thống cho phép và hoàn tất).

```powershell
node web/scripts/sync-gateway-secret.mjs
node scripts/prepare-sub2api.mjs
docker compose --env-file deploy/sub2api/.env -f deploy/sub2api/compose.yaml up -d --build --wait
cd web
node scripts/connect-sub2api.mjs
npm run dev
```

Mở terminal thứ hai tại web và chạy `npm run worker`. Website http://127.0.0.1:3000; Sub2API http://127.0.0.1:18080; Mailpit http://127.0.0.1:18025. Local seed có bảng giá mẫu và nhãn sandbox. SMTP vào Mailpit, không gửi email ra ngoài.

Thanh toán thử: tạo đơn trong UI rồi `node --env-file=.env scripts/sandbox-payment.mjs AH... 99000` tại web, dùng đúng mã và số tiền từ đơn. Worker cấp key thật ở Sub2API local. Không chuyển tiền thật.

## VPS production

Chuẩn bị domain của bạn trỏ đến VPS, Docker Compose và cổng 80/443. Không chạy stack này trên cùng máy với local Sub2API đang chiếm 18080 mà chưa đổi port. Chỉ mở port web; DB/Redis không có port public.

1. Chép source, chạy `node scripts/prepare-sub2api.mjs` và `node scripts/init-aihub-production.mjs aihub.tungnv.com admin@your-domain.com`.
2. Mở `deploy/aihub/.env` trực tiếp để cấu hình SMTP và thông tin nhà cung cấp. Mặc định payment disabled, không nhận tiền khi chưa sẵn sàng.
3. Chạy `docker compose --env-file deploy/aihub/.env -f deploy/aihub/compose.yaml up -d --build`. Migration và seed admin chạy trước web/worker; production không seed giá mẫu.
4. Truy cập Sub2API qua SSH tunnel tới loopback 18080. Đọc/chấp nhận cam kết vận hành; tạo user giữ license (0 số dư AI), tạo scoped admin key chỉ có `chrelay.licenses.write`. Ghi ID và key vào SUB2API_LICENSE_USER_ID / SUB2API_ADMIN_API_KEY. Không dùng tài khoản khách ChatGPT ở đây.
5. Restart web/worker: `docker compose --env-file deploy/aihub/.env -f deploy/aihub/compose.yaml up -d web worker`.
6. Đăng nhập AIHub bằng bootstrap admin. Tạo giá/quyền lợi thực, rà soát nội dung và chính sách; thay bootstrap password trong UI rồi bỏ password bootstrap khỏi env khi không cần seed thêm.
7. SePay: cấu hình webhook HTTPS `/api/v1/webhooks/sepay`, HMAC secret chung, BANK_BIN/ACCOUNT/ACCOUNT_NAME đúng tài khoản nhận, PAYMENT_PROVIDER=sepay. Thực hiện một giao dịch kiểm chứng nhỏ do chủ hệ thống chủ động thực hiện; đối chiếu order/payment/event/key. Chưa kiểm chứng bằng giao dịch ngân hàng thật trong workspace này.
8. Google tùy chọn: đăng ký callback `https://your-domain/api/auth/callback/google`, cấu hình client ID/secret.
9. npm: xem NPM-REGISTRATION.md. Build tên gói có scope và pin domain AIHub, kiểm thử tgz, chủ gói tự publish. Sau khi registry xác thực, cấu hình AIHUB_NPM_PACKAGE_NAME / AIHUB_NPM_PACKAGE_VERSION / AIHUB_NPM_RELEASE_VERIFIED. Không dùng tên `aihub` của người khác.

Caddy tự cấp TLS; cấu hình nằm tại `deploy/aihub/Caddyfile`. Web image chạy non-root. Reverse proxy ghi đè X-Real-IP và giới hạn body 6 MB. `/api/v1/health` kiểm tra PostgreSQL; theo dõi thêm worker/jobs và Redis. Provider bị lỗi sẽ giữ job retry, không trả thành công giả.

## Backup và phục hồi

Service backup tạo pg_dump định dạng custom cho cả hai DB và tar attachments mỗi 24 giờ; giữ 14 ngày tại `deploy/aihub/backups`. Thư mục mode theo umask 077. Chủ hệ thống cần sao chép backup ra máy khác và mã hóa kho backup theo hạ tầng của mình. Lưu riêng secrets mã hóa/HMAC và env bằng kho bí mật; backup DB không đủ để giải mã license nếu mất LICENSE_ENCRYPTION_KEY.

Trên stack local, tại `web` chạy `node scripts/verify-local-restore.mjs` khi không có bài test đang tạo dữ liệu. Script dump cả hai database, restore vào database riêng, so sánh số bản ghi rồi dọn database tạm. Với dữ liệu lớn/máy bận, restore có thể mất vài phút.

Phục hồi trên môi trường tách biệt trước: dừng web/worker; tạo database trống; `pg_restore --no-owner --no-privileges -d <database> <dump>`; phục hồi attachments và đúng bộ secrets; chạy migrations; kiểm tra đăng nhập, key, order, job; sau đó mới chuyển traffic. Không chạy restore đè database đang phục vụ khách.

## Kiểm thử

Tại thư mục `web`, chạy `node scripts/prepare-test-db.mjs`; sau đó `npm test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck`, `npm run build`. E2E dùng web/worker local đang chạy, Mailpit và Sub2API; PostgreSQL unit/integration dùng database `aihub_test` riêng. Trên Linux cần `npx playwright install --with-deps chromium`; Windows dùng Edge đã cài.

Không tự push, publish npm hoặc deploy VPS từ quy trình build/test này.

Trong Admin → Settings, có thể tạm dừng đăng ký/mua gói hoặc bật maintenance. Các license còn hạn tiếp tục được kiểm tra online; webhook của đơn đã tạo vẫn được xử lý. Domain, SMTP và bí mật SePay/Sub2API nằm trong env để không xuất hiện trong giao diện.
