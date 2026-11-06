# Kiểm thử AIHub

## Môi trường

Chạy tại `web`, khởi tạo `.env` local và Compose theo DEPLOYMENT_GUIDE.md. `node scripts/prepare-test-db.mjs` tạo database `aihub_test` riêng rồi áp dụng migration. Test runner từ chối tên database không kết thúc bằng `_test`. Không trỏ bộ test vào production.

## Backend: `npm test`

- Auth: đăng ký, email trùng, sai mật khẩu, chưa xác minh, phiên hết hạn trong database.
- Commerce: HMAC raw body, timestamp, SePay API key, account nhận sai, số tiền sai, chuyển tiền ra, mã đơn mơ hồ, đơn quá hạn; 5 webhook đồng thời chỉ có một payment và một job; event ID đổi payload bị từ chối.
- License: cấp Sub2API idempotent, chặn truy cập trực tiếp bỏ qua gateway, giới hạn thiết bị khi kích hoạt đồng thời, challenge một lần, chữ ký sai, cooldown, hết hạn, user bị khóa và upstream thu hồi.
- Renewal: hai đơn cộng đủ ngày; job chạy lại không cộng thêm; target đã lưu trước khi gián đoạn được hoàn tất trước đơn tiếp theo.
- Hoàn tiền trong lúc upstream cấp key: giữ trạng thái REVOKED, lưu upstream ID và xếp lại job cleanup dù job revoke trước đó đã DONE.
- Lưu key: AES-GCM từ chối ciphertext bị sửa và HMAC phân biệt key.

## Trình duyệt: `npm run test:e2e`

Chạy web và worker trước; dùng Mailpit và Sub2API local. Windows dùng Edge, Linux cài Chromium qua Playwright. Có 8 kịch bản nối tiếp trên tài khoản thử riêng:

1. Đăng ký UI, email xác minh, đăng nhập, CSRF và phân quyền customer/admin.
2. Checkout, trang success không tự xác nhận, webhook sai chữ ký/trùng, cấp một key, chứng từ.
3. CLI thật ký proof thiết bị; khách thu hồi máy thì CLI bị chặn.
4. Ticket UI, file riêng tư, kiểm tra quyền tải, phản hồi nhân viên.
5. CRUD gói, audit, khóa/mở tài khoản, điều hướng mobile và docs không tràn ngang.
6. Gia hạn quản trị, đối soát đúng/sai tiền, hoàn tiền cần yêu cầu khách, bộ lọc, maintenance chặn checkout/signup.
7. Ownership giữa hai khách, CRUD danh mục/tài liệu, bảo vệ quyền admin, password reset qua email.
8. Axe WCAG 2A/AA/2.1AA ở dark/light, menu mobile và Escape.

Fixture sau chạy được khóa/thu hồi và ngừng bán gói test; giữ lịch sử giao dịch/audit để kiểm tra. Không gửi email ra ngoài hoặc chuyển tiền ngân hàng thật. Playwright traces chứa tài khoản thử, nằm trong thư mục bị gitignore.

## CLI và build

Tại root: `node scripts/build-npm.mjs`, `npm test`. Bộ hồi quy bao gồm cài tgz global vào prefix tạm, lệnh `aihub`, setup có xác nhận, key nhập ẩn, sao lưu cấu hình, hết hạn trong SSE và logout/unsync. Không chạy npm publish.

Tại web: `npm run lint`, `npm run typecheck`, `npm run build`. Build container: `docker build --target web -t aihub-platform:test web` từ root. Image runtime phải trả HTTP 200 cho health và trang chủ, giữ DB/Redis riêng tư. CI tự chạy lint/typecheck/commerce/build và CLI; integration Sub2API/E2E cần đủ stack local.

## Phục hồi và production

`node scripts/verify-local-restore.mjs` tạo bản dump của hai container local đã biết, phục hồi vào database có tên ngẫu nhiên `aihub_restore_verify_*`, so sánh số bản ghi rồi xóa đúng database tạm. Không restore đè database gốc. Backup attachments và secrets vẫn cần lưu riêng.

Trước khi vận hành thật: kiểm chứng HTTPS/domain, SMTP, một giao dịch SePay thật, registry npm và OAuth nếu bật. Các mục này cần cấu hình tài khoản của chủ hệ thống; test local không thay thế bằng chứng production. Kết quả thực tế ghi trong VERIFICATION-AIHUB.md.

Kiểm tra image migration: build `docker build --target worker -t aihub-worker:test web` tại root, sau đó chạy `node scripts/verify-container-migration.mjs` tại web. Script lấy `.env` local, tạo database và file env tạm, chạy migrate/seed trong image production, xác minh không seed giá mẫu rồi dọn fixture.
