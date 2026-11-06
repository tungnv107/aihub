# Sub2API test: sửa lỗi treo stream ở lớp bọc policy

Ngày 30/10/2026, người dùng xác nhận reconnect xảy ra ở `sub2api-test.tudonghoa.me`. Bản vá chỉ triển khai vào relay độc lập phía sau endpoint test, lúc **10:39 UTC (17:39 UTC+7)**. Bản Sub2API chính đang dùng relay có key không được chuyển đổi trong lần này.

## Bằng chứng và phạm vi kết luận

Trong cửa sổ ba giờ trước kiểm tra, SQLite của relay ghi nhận 49 lỗi `504 upstream_stream_timeout`, thời gian trung bình 127.956 ms; đa số kết thúc khoảng 124–128 giây. Có 93 lượt `policy_completed` thành công. Container relay không restart trong cửa sổ này. Giới hạn đọc stream là 120.000 ms. Các lỗi 413/400 từ kiểm thử giới hạn body trước đó được tách khỏi sự cố reconnect.

Tái hiện bằng chính policy engine: đặt một dòng trống, `event: ping` không có data hoặc `retry: 1000` trước câu trả lời hợp lệ. Cả ba trường hợp đều treo với code cũ; comment `: keep-alive` độc lập vẫn đi qua. Đây là lỗi xác định được trong code đang chạy (đã đối chiếu SHA-256 với VPS), phù hợp với mốc timeout quan sát được. Không lưu nội dung stream của khách, nên chưa thể quy toàn bộ 49 lỗi lịch sử cho cùng một loại frame; lỗi upstream/mạng khác vẫn có thể gây reconnect.

## Nguyên nhân và thay đổi

`wrapPolicyResponse` dùng `ReadableStream` với `highWaterMark: 0`. `pull()` cũ chỉ đọc một chunk. Nếu chunk không tạo được JSON event và không phải comment nguyên vẹn, hàm kết thúc mà không enqueue, close hoặc đọc tiếp. Lượt đọc phía dưới bị treo dù engine đã có dữ liệu tiếp theo. Proxy ngắt sau 120 giây. Desktop cũng dùng lớp bọc này nhưng không có cùng bộ đếm 120 giây bên ngoài; điều đó không chứng minh desktop miễn nhiễm với lỗi.

Vòng đọc mới tiếp tục khi chunk rỗng hoặc còn frame chưa đủ. Frame điều khiển đã hoàn chỉnh được chuyển thành SSE comment giữ kết nối. Chunk chứa cả comment và JSON chỉ gửi JSON đã chuẩn hóa một lần, tránh gửi lại event gốc chưa được sửa usage. Usage vẫn lấy từ upstream thực đo, thiếu thì giữ `null`.

`core.mjs` bổ sung log `relay_policy_stream_progress` gồm thời điểm, status, outcome, duration và ba bộ đếm `buffered_reads`, `control_reads`, `empty_reads`. Không ghi prompt, tool output, key hay token. Giữ nguyên timeout 120 giây, body limit 64 MiB, policy revision và file engine đã xác minh; không sửa thuật toán policy.

## Kiểm chứng

- **351/351** test toàn bộ qua trên Windows Node 24.22.1, gồm 10 test mới. Kiểm tra frame điều khiển, UTF-8 chia byte, chunk rỗng, JSON/comment chung gói, usage, hủy request, timeout thật và không cache câu trả lời dở.
- **23/23** test policy/stream qua trên Node 24.22.1 ARM64 của VPS, container riêng `--network none`.
- Stream HTTP giả lập **125.063 ms**, vượt mốc 120 giây: byte đầu 75 ms, khoảng cách lớn nhất 10.001 ms, đúng một `response.completed`, usage giữ nguyên. Có 1 lượt đọc frame chưa đủ và 12 control frame. Không gọi mô hình; dùng SQLite/tokens giả và loopback trong container riêng. Bài này kiểm tra relay HTTP, không đi qua Caddy/Sub2API public.
- Sau triển khai, hai request thật nhỏ qua relay nội bộ và domain `sub2api-test.tudonghoa.me` đều HTTP 200, `response.completed`, nội dung JSON kiểm tra đúng. Thời gian lần lượt **3.332 ms** và **1.966 ms**. Policy kết thúc sớm nên usage upstream chưa có; báo `null`, không suy diễn là miễn phí.
- Các container gateway test, database, Redis, Sub2API chính, Caddy, admin, license và distribution giữ nguyên ID/start time. Cấu hình runtime đối chiếu trước/sau không đổi. Chưa có quan sát đủ dài trên hội thoại thật của khách để cam kết mọi reconnect đã hết.

## Triển khai, quay lui và kiểm tra tiếp

Backup hai file nguồn: `/opt/independent-relay-test/backups/reconnect-20261030T103902Z`. Shutdown relay chờ request đang xử lý, rồi chỉ chép `core.mjs` và `policy-runtime.mjs`, khởi động lại và kiểm tra health/hash/config. Quay lui chỉ phục hồi hai file nguồn; không phục hồi SQLite cũ vì có thể làm mất refresh token đã cập nhật.

Helper [vps_fix_reconnect.py](../test/vps_fix_reconnect.py) có `apply`, `verify`, `status`; `apply` chỉ chấp nhận hash baseline của bản trước. `verify` thực hiện hai request model thật; `status` chỉ đọc metadata. [vps_inspect_reconnect.py](../test/vps_inspect_reconnect.py) tổng hợp metadata lỗi trong ba giờ, không xuất payload. Các log kiểm thử chi tiết nằm trong `artifacts/` được gitignore.

Khách dùng endpoint test chỉ cần gửi lại yêu cầu; không cài lại desktop. Nếu còn reconnect, lấy thời điểm, endpoint và mã lỗi/request ID để đối chiếu, không gửi key hoặc toàn bộ hội thoại.

Source dùng chung đã được sửa trong Git; **bộ cài desktop đang phát hành vẫn là 0.3.3, chưa đóng gói lại bản sửa stream này**. Lần triển khai này không thay các file phát hành đã ký.
