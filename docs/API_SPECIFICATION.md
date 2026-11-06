# REST API AIHub

Base: `/api/v1`. JSON UTF-8, lỗi `{ "error": { "code": "..." } }`. Cookie session Better Auth dùng cho customer/admin. Mutation cookie yêu cầu header `Origin` đúng BETTER_AUTH_URL. Endpoint license dùng `Authorization: Bearer <key>`, không dùng session.

| Method | Path | Quyền / hành vi |
|---|---|---|
| GET | /health | Readiness PostgreSQL |
| GET | /public?locale=vi | Plans công khai, FAQ, testimonial đã xác minh, cấu hình thanh toán không bí mật |
| GET | /documents?kind=docs&locale=vi&q=... | Tìm tài liệu công khai |
| GET | /documents/:slug?kind=docs&locale=vi | Nội dung Markdown an toàn |
| POST | /documents/:id/feedback | Customer; `{helpful:boolean}` |
| GET/PATCH | /me | Customer; dữ liệu dashboard / sửa name, locale, notificationsEnabled |
| POST | /notifications[/id] | Đánh dấu đã đọc |
| POST | /checkout | `{planId,billingName,renewalLicenseId?}`; giá luôn đọc DB |
| GET | /orders/:id | Chủ đơn hoặc staff; dữ liệu không chứa key |
| POST | /orders/:id/cancel | Chỉ đơn pending |
| POST | /orders/:id/refund-request | Đơn paid, `{reason}` |
| GET | /orders/:id/receipt | Tải chứng từ thật; không phải hóa đơn VAT |
| POST | /licenses/:id/reveal | Chỉ chủ license; trả key, ghi audit, no-store |
| PATCH | /devices/:id | Chủ sở hữu/admin; `{action:rename,name}` hoặc `{action:revoke}` |
| POST | /tickets | Customer; `{subject,category,body}` |
| GET/PATCH | /tickets/:id | Chủ ticket hoặc support/admin; PATCH trạng thái/phân công theo quyền |
| POST | /tickets/:id/messages | Chủ ticket hoặc support/admin; `{body}` |
| POST | /webhooks/sepay | Xác thực SePay rồi đối soát; nhận cả event không khớp để quản trị kiểm tra |
| POST | /webhooks/sandbox | Chỉ localhost development, HMAC như SePay |
| POST | /license/challenge | Bearer; nonce dùng một lần, TTL 60 giây |
| POST | /license/activate | Bearer + proof thiết bị; giới hạn trong Serializable transaction |
| POST | /license/validate, /status, /heartbeat | Bearer + proof; kiểm tra Sub2API online |
| POST | /license/deactivate | Bearer + proof; thu hồi thiết bị và cooldown |
| GET | /admin/overview | Admin: số liệu thật |
| GET | /admin/{users,plans,orders,licenses,support,documents,faqs,announcements,testimonials,audit,jobs} | `q`, `page`, 20 dòng/trang; support được đọc inbox |
| GET | /admin/users/:id/detail | Admin: tài khoản, đơn và license; không password/token |
| PATCH | /admin/users/:id | `{disabled?,role?}`; không hạ quyền admin cuối cùng/tự khóa |
| POST/PATCH/DELETE | /admin/plans[/id] | CRUD; DELETE ngừng bán; snapshot đơn giữ nguyên |
| POST | /admin/orders/:id/reconcile | Admin; `{amount,reference,reason}` |
| POST | /admin/orders/:id/refund | Admin; cần refund-request, `{reference,reason}` của giao dịch đã hoàn; revoke license |
| GET | /admin/orders/export | CSV tối đa 10.000 đơn; chống formula injection |
| POST | /admin/licenses | Admin cấp tặng theo `{userId,planId,reason}`; order 0 VND + outbox |
| POST | /admin/licenses/:id/revoke | Admin; `{reason}`; local block ngay, upstream job bền vững |
| POST | /admin/licenses/:id/extend | Admin; `{days,reason}`; đơn gia hạn 0 VND + job + audit |
| POST/PATCH/DELETE | /admin/{documents,faqs,announcements,testimonials,categories}[/id] | Admin; Zod + audit |
| GET/PATCH | /admin/settings | Trạng thái cấu hình và nội dung thương hiệu; không trả bí mật |
| GET/PATCH | /admin/payment-settings | Chỉ Admin; tài khoản ngân hàng nhận tiền, bật chuyển khoản và SePay tùy chọn |
| POST | /admin/jobs/:id | Admin: lên lịch thử lại job pending |

Upload riêng: `POST /api/attachments` multipart `ticketId,messageId,file`; MIME PNG/JPEG/PDF và magic bytes, 5 MB/file, tối đa 3 file/message. `GET /api/attachments?id=...` kiểm tra quyền và tải dạng attachment.

Danh sách admin hỗ trợ `q`, `page`, `filter` theo trạng thái/ưu tiên; users thêm DISABLED/UNVERIFIED, license có EXPIRED tính từ thời gian hiện tại. `GET /categories` trả danh mục tài liệu. `POST /api/branding?asset=logo|favicon` nhận PNG/JPEG raw body tối đa 1 MB, admin + Origin; GET cùng URL phục vụ ảnh công khai. Nội dung ticket không đi qua endpoint công khai này.

Settings có `maintenanceMode`, `registrationEnabled`, `checkoutEnabled`. Maintenance chặn đăng ký mới và checkout; đăng nhập quản trị, webhook của đơn đã tạo và kiểm tra license còn hạn vẫn hoạt động. Domain và bí mật nhà cung cấp cấu hình qua env; không trả qua API admin.

Authentication: Better Auth tại `/api/auth/*` gồm sign-up/email, sign-in/email, verify-email, send-verification-email, request-password-reset, reset-password, get-session, list-sessions, revoke-session, revoke-other-sessions, change-password, sign-out và callback Google khi cấu hình. Cookie path `/`, HttpOnly, SameSite Lax và Secure trên HTTPS.

## Proof thiết bị

Client sinh UUID ngẫu nhiên và cặp khóa Ed25519 một lần. Đầu tiên POST challenge với bearer. Sau đó gửi JSON:

```json
{"fingerprint":"UUID","publicKey":"PEM SPKI Ed25519","name":"My computer","os":"win32","nonce":"64-hex","signature":"base64url"}
```

Chuỗi ký chính xác (UTF-8, LF, không LF cuối): `aihub-device-v1\nACTION\nNONCE\nFINGERPRINT`. ACTION là activate/validate/heartbeat/deactivate; status dùng validate. Nonce bị tiêu thụ ngay cả khi chữ ký sai. Response hợp lệ giữ contract `ch-relay-license-v1` với server_time/expires_at/key_id/device_id; plaintext key không xuất hiện trong response.

`GET /v1/ch-relay/license` của AIHub trả `device_activation_required` để CLI tự chuyển sang handshake. Endpoint cùng tên trên Sub2API yêu cầu shared gateway secret với namespace AIHub.

## SePay

Trước khi kết nối SePay, Admin có thể mở `/admin/settings` và lưu ngân hàng nhận tiền. `PATCH /admin/payment-settings` nhận `{bankName,bankBin,bankAccount,bankAccountName,enabled,sepayEnabled,publicConsent}`. BIN gồm 6 chữ số, tài khoản 6–19 chữ số (giữ số 0 đầu), `publicConsent` phải là `true`; `enabled` đồng thời cập nhật `site.checkoutEnabled`. Không lưu khóa SePay hoặc mật khẩu ngân hàng qua endpoint này. `sepayEnabled=true` chỉ được chấp nhận khi server đã cấu hình provider và webhook secret hợp lệ; GET trả `sepayReady` và `webhookUrl` để hiển thị trạng thái.

Checkout lưu bản chụp ngân hàng trong đơn, cùng giá và mã tham chiếu do server tạo. VietQR dùng đúng số tiền VND và mã đơn; việc tạo QR không ghi nhận thanh toán. Admin kiểm tra tiền thực nhận rồi dùng `/admin/orders/:id/reconcile` với số tiền khớp, mã giao dịch và lý do. Cho phép đối soát thủ công đơn pending/expired, chặn đơn cancelled/paid/refunded và giao dịch trùng. Sau xác nhận, một job cấp license được tạo trong cùng transaction. Đơn cũ không đổi tài khoản khi Admin sửa cài đặt. Hướng dẫn VietQR: [QR động](https://www.vietqr.io/qr-dong).

SePay chỉ nhận webhook khi được bật trong cài đặt ngân hàng (hoặc cấu hình env cũ chưa được thay thế). Khi bật sau, đối soát vẫn kiểm tra tài khoản đã lưu trên từng đơn; webhook không tự xác nhận đơn đã quá hạn.

Khuyến nghị HMAC: `X-SePay-Timestamp` (Unix giây), `X-SePay-Signature: sha256=<hex(HMAC(secret,timestamp+'.'+raw_body))>`. Chênh lệch tối đa 300 giây. Chế độ API key tùy chọn dùng `Authorization: Apikey <secret>`. Match transferType=in, accountNumber, transferAmount nguyên VND và duy nhất mã AH + 16 ký tự hex. Payload khác với cùng event ID trả 409; duplicate đúng trả success nhưng không cấp quyền thêm.

Mã lỗi tiêu biểu: 400 invalid_input, 401 authentication_required/invalid_signature/challenge_invalid, 403 insufficient_permissions/API_KEY_DISABLED/API_KEY_EXPIRED/device_revoked, 404 not_found, 409 device_limit_reached/event_payload_conflict, 413 body_too_large, 429 too_many_requests/device_change_cooldown, 503 service_unavailable/payment_not_configured.

Nguồn contract SePay: https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc. OpenAPI máy đọc: `web/public/openapi.json`.
