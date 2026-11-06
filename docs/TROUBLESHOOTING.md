# Chẩn đoán và khôi phục

Không gửi key, token ChatGPT, auth.json, database hoặc signing private key vào issue/log. Khi báo lỗi, lấy version, mã lỗi, thời điểm và trạng thái đã che dữ liệu riêng.

## Không kích hoạt được

- **activation_required:** chạy lại bộ cài và nhập key.
- **license_invalid_or_expired:** kiểm tra key, hạn dùng và trạng thái thu hồi.
- **device_limit_reached:** kiểm tra activation trước khi thay đổi hạn mức/cấp key khác.
- **device_already_bound_or_revoked:** có thể xảy ra sau khi xóa data/cài lại hệ điều hành. Quản trị viên xác minh khách rồi reset đúng activation.
- **license_server_unavailable:** kiểm tra HTTPS, DNS, mạng và container license. Lease đang có chỉ dùng đến hạn ký số.
- **clock_rollback_detected:** đồng bộ giờ hệ điều hành; không sửa SQLite để kéo dài hạn.
- **release_integrity_failed:** cài lại từ domain chính thức; không bỏ kiểm tra chữ ký hoặc sửa manifest.

Xem các lệnh quản trị trong [LICENSE-ADMIN.md](relay-product/LICENSE-ADMIN.md).

## Codex không đi qua relay

Chạy CLI status theo [hướng dẫn desktop](relay-product/README.md), kiểm tra license active và listener 127.0.0.1:18455. Đóng/mở lại Codex sau cài. openai_base_url phải ở root cấu hình user, không nằm trong section TOML khác.

Bộ cài dừng khi gặp profile/vùng quản lý không thể chỉnh an toàn. Không xóa auth.json để sửa routing. HTTP 401 upstream được giữ để Codex xử lý đăng nhập; key TDH không thay thế đăng nhập ChatGPT.

## Cài lại báo managed_configuration_changed_review_required

Nếu đã trả Codex về dùng trực tiếp, bản 0.3.2 vẫn có thể giữ `codex_sync` từ lần cài trước và từ chối `sync`. Cài **0.3.3** bằng lệnh cài thông thường; đóng Codex trước. Bản mới nhận biết cấu hình trực tiếp, sao lưu nó làm baseline mới rồi cài lại relay. Backup cũ, key, mốc kích hoạt và auth.json được giữ nguyên. Định dạng/thứ tự tương đương có thể được phục hồi từ backup đã xác minh.

Nếu còn provider/base URL khác, profile hoạt động, marker hỏng hoặc backup bị sửa/mất trong trường hợp cần khôi phục, bộ cài vẫn dừng. Kiểm tra cấu hình và thư mục `backups` tại `%LOCALAPPDATA%/TDHRelay` trên Windows. Không xóa database, ép ghi đè config.toml hay gửi auth.json/token để xử lý. Xem [phạm vi bản vá 0.3.3](PATCH-0.3.3.md).

## Local trả 413 compressed_request_rejected

Bản desktop 0.3.1 dùng giới hạn 2 MiB cho cả request nén và dữ liệu sau giải nén. Khi lịch sử, tool output hoặc ảnh vượt mức này, zlib trả lỗi vượt kích thước và relay trả 413 trước khi gọi upstream. Vì vậy cần cập nhật relay trên chính máy khách; cập nhật trang web/server cấp key không thay file đã cài trên máy.

Chạy lại lệnh cài từ domain để nâng lên 0.3.2, không gỡ trước; đóng/mở lại Codex rồi gửi lại. Bản mới mặc định 64 MiB trên desktop, giữ dữ liệu kích hoạt và cấu hình Codex. `/healthz` trả version và `limits.requestBodyBytes`. Nếu đã đặt giới hạn riêng, giá trị đó được giữ nguyên. Lỗi vượt giới hạn mới có mã `decompressed_request_too_large`, kèm `max_body_bytes`; nén hỏng vẫn là 400 `compressed_request_rejected`. Không gửi nội dung hội thoại để chẩn đoán; chỉ cần version, mã lỗi, giới hạn và kích thước nếu có.

## Proxy/Sub2API

- **Reconnect / `upstream_stream_timeout` khoảng 120 giây:** bản test đã sửa vòng đọc policy ngày 30/10/2026 để dòng trống/control frame không làm stream treo và comment kèm JSON không gửi lặp dữ liệu. Khách gửi lại request, không cần cài lại desktop. Xem [bằng chứng, kiểm thử và giới hạn kết luận](SUB2API-RECONNECT-2026-10-30.md). Nếu còn lỗi, đối chiếu thời điểm và metadata mới; không tăng timeout để che việc reader ngừng đọc.
- **413 `Request body too large, limit is 2MB`:** kiểm tra `GATEWAY_MAX_BODY_SIZE`, `GATEWAY_TEXT_MAX_BODY_SIZE` ở container Sub2API và `relay.max_body_bytes` trong SQLite của relay. Ngày 30/10/2026, `sub2api-test` đã nâng cả hai tầng lên 64 MiB và xác nhận request 9 MiB trả HTTP 200 qua domain thật. Khách dùng endpoint này chỉ cần gửi lại request; không phải cài lại relay desktop để nhận thay đổi trên server. Xem [cấu hình hai tầng](relay-product/PROXY.md#giới-hạn-kích-thước-request) và [báo cáo kiểm chứng](SUB2API-413-2026-10-30.md).
- Trong Docker network: http://self-relay:8320/v1; từ host: http://127.0.0.1:18320/v1.
- **invalid_host:** kiểm tra hostname/cổng và relay.extra_allowed_hosts trong SQLite. Không tắt Host check toàn cục.
- **account_requires_reauthentication:** kiểm tra bên sở hữu refresh token, tạo phiên riêng và nhập lại. Không cho desktop/proxy cùng refresh một phiên.
- **upstream_sse_required:** media type upstream khác SSE. Body SSE hợp lệ thiếu Content-Type được xử lý trong 0.3.1.
- Usage **unknown** nghĩa là thiếu usage thật từ upstream, không có nghĩa miễn phí.

## Gỡ và khôi phục

Dùng lệnh gỡ chính thức. Các dòng quản lý được khôi phục, chỉnh sửa khác được giữ. Nếu vùng quản lý đã bị sửa, xem backup trước khi thay thế; không ghi đè toàn bộ config.

Gỡ giữ data/backups và không tự giải phóng slot kích hoạt. Khi đổi máy, quản trị viên xử lý activation cũ.

## Đánh giá hiệu quả

So sánh cùng model, effort, tài khoản, nội dung và số lượt. Ghi riêng cache ấm/lạnh, context dài, compaction, tool call, hủy request và quota 5 giờ/tuần. Không suy ra mức tiết kiệm từ một ảnh chẩn đoán hoặc số request đơn thuần.
