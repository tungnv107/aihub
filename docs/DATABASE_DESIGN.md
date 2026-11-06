# Cơ sở dữ liệu AIHub

Schema thực thi: `web/prisma/schema.prisma`; migration đầu tiên: `web/prisma/migrations/20261106040222_initial/migration.sql`. PostgreSQL 18, Prisma 7 với adapter pg. AIHub và Sub2API có database/Redis riêng.

| Nhóm | Bảng | Ràng buộc chính |
|---|---|---|
| Identity | User, Account, Session, Verification, RateLimit, Role, UserRole | email/token unique; provider+account unique; role quản lý ở server |
| Catalog | Plan, PlanFeature | slug unique; giá VND số nguyên; snapshot giá/quyền vào OrderItem |
| Commerce | Order, OrderItem, Payment, PaymentEvent | code unique; provider+reference/eventId unique; trạng thái đơn trong transaction |
| Access | License, Subscription, Device, Activation, LicenseEvent | orderId/keyHash/upstreamKeyId unique; license+fingerprint unique |
| Analytics | UsageAggregate, QuotaSnapshot | user+day+source+model unique; không seed quota giả |
| Support | Ticket, TicketMessage, Attachment | attachment liên kết message, kiểm tra ownership qua ticket |
| Content | Document, ContentCategory, DocumentFeedback, FAQ, Announcement, Testimonial | slug+locale+kind unique; phản hồi một lần mỗi tài khoản/tài liệu |
| Operations | Setting, AuditLog, Notification, Job | dedupeKey unique; index trạng thái và thời điểm job |

License lưu HMAC-SHA256 làm chỉ mục tra cứu và AES-256-GCM để chủ sở hữu lấy lại key. Mật khẩu dùng scrypt do Better Auth quản lý. Không có bảng lưu tài khoản/token ChatGPT.

Thanh toán, giới hạn thiết bị, cấp quyền và thay đổi quản trị quan trọng dùng transaction Serializable, retry xung đột tối đa 5 lần. Dịch vụ ngoài được gọi ngoài transaction. Outbox Job tạo cùng transaction xác nhận thanh toán; BullMQ chỉ điều phối, PostgreSQL là nguồn công việc bền vững.

Không cascade xóa dữ liệu tài chính theo user. Vô hiệu hóa tài khoản giữ lịch sử đối soát. Quản trị plan ngừng bán thay vì xóa các snapshot cũ. Migration chạy bằng `prisma migrate deploy`; không dùng `db push` trên production.
