# Kiểm soát bảo mật

Các kiểm soát đã triển khai (bằng chứng kiểm thử được ghi riêng trong TEST_PLAN và VERIFICATION):

- Better Auth, mật khẩu scrypt, email verification bắt buộc, reset token, cookie HttpOnly/SameSite/Secure trên HTTPS; khóa user thu hồi session.
- Phân quyền CUSTOMER/SUPPORT/ADMIN kiểm tra ở API và trang server; không tin role trong request.
- Mutation dùng cookie yêu cầu Origin khớp. Webhook dùng chữ ký/API key riêng; license dùng bearer và proof thiết bị.
- Zod kiểm tra input, giới hạn request body, rate limit Redis/DB, no-store dữ liệu riêng tư.
- SePay HMAC trên `timestamp.raw_body`, giới hạn lệch thời gian 5 phút; unique provider/event và payment reference; tiền VND integer, match chính xác mã đơn/account/số tiền.
- Outbox cùng transaction thanh toán; cấp key dùng custom key ổn định cho retry; không cấp quyền từ trang redirect thành công.
  Khi hoàn tiền/thu hồi xảy ra trong lúc gọi upstream, provisioning kiểm tra lại order và license trong transaction, lưu upstream ID và xếp lại job revoke. Gia hạn có khóa và target bền vững; job bị gián đoạn phải hoàn tất trước target tiếp theo.
- License CSPRNG, HMAC lookup, AES-GCM lưu trữ; không log key, password, cookie hay payload webhook.
- Thiết bị dùng Ed25519; challenge Redis 60 giây dùng một lần; Serializable giới hạn thiết bị; cooldown một giờ; thiết bị revoked không tự kích hoạt lại.
- Sub2API chỉ xác nhận key AIHub qua shared gateway secret. CLI kiểm tra online mỗi yêu cầu/phân đoạn và khi stream; không tự gia hạn offline.
- Markdown không HTML; attachment PNG/JPEG/PDF tối đa 5 MB, kiểm tra magic bytes, lưu ngoài public, kiểm tra quyền khi tải, Content-Disposition attachment và nosniff.
- CSP, chống iframe, giới hạn body proxy, TLS Caddy; container web non-root.
- Admin audit log cho thay đổi user/role/plan/content/license/payment; không tự xóa lịch sử tài chính.

Giới hạn mô hình local: khách sở hữu máy có thể sửa mã JavaScript hoặc sao chép cả profile/key thiết bị. Kiểm tra server bảo vệ dịch vụ/key do server cấp; không thể cam kết chống sửa mã tuyệt đối. AIHub không nhận token ChatGPT để xử lý thanh toán hoặc license.

Vận hành: bảo vệ database, secrets và backup; kiểm tra restore định kỳ; đặt chính sách lưu trữ và thông tin liên hệ thực tế trước mở bán. Thanh toán live, Google OAuth và SMTP production cần cấu hình của chủ hệ thống.
