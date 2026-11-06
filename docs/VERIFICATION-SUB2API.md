# Kiểm chứng tích hợp Sub2API / Ch-relay

Ngày kiểm tra: 06/11/2026, Windows, Node.js 24.18.0; Docker Desktop chạy Linux containers.

## Bổ sung 0.4.1 — lệnh `codexunlimit`

- Gói mới: `dist/codexunlimit-0.4.1.tgz`; `bin.codexunlimit` chạy CLI, vẫn có alias `ch-relay`.
- Cài `npm install --global --prefix <thư mục test>` và gọi chính shim `codexunlimit.cmd --version` thành công trên Windows.
- Lệnh không có subcommand mở setup lần đầu; hỏi key ẩn, xác nhận kết nối, khởi động relay trước khi sửa cấu hình. Lần sau dùng credential đã lưu và chỉ khởi động dịch vụ khi cần.
- Kiểm tra hủy setup, tiếp tục không nhập lại key, key hết hạn trong lúc chờ xác nhận, môi trường không tương tác không tự áp dụng cấu hình.
- 17/17 kiểm thử tích hợp client/setup/package đạt. 13/13 kiểm thử Sub2API thật được chạy lại với CLI bundle 0.4.1 và đều đạt.
- SHA-256 artifact 0.4.1: `D4F0B2B80DCB963499D7EBFC5BE1B6B51419127F4FE256366CB0CF07759C88D4`.
- Tên npm `codexunlimit` đã có bản `0.1.0-web.30`, maintainer `datngo68` tại thời điểm đối chiếu metadata registry. Chưa publish hoặc thay đổi bản đó.
- Luồng tham khảo: [hướng dẫn Codex Unlimit](https://codexunlimit.tudonghoa.me/guide). Bản tích hợp này vẫn cần Node.js 24.18.0+; chưa có các tính năng web chat, tray hay tự đóng/mở Codex trong sản phẩm tham khảo.

Các phần bên dưới ghi nhận lần kiểm chứng đầy đủ của bản nền 0.4.0.

## Server thực tế

- Đã build backend Go và frontend Vue từ commit Sub2API `25608d216bb7be04e4a646830cb065cd09b7d7e9` kèm bản tích hợp.
- Sub2API, PostgreSQL 18 và Redis 7 chạy trong Docker; cả ba báo `healthy`.
- `http://127.0.0.1:18080/health` trả HTTP 200, `{"status":"ok"}`.
- Chủ hệ thống đã đọc và ủy quyền chấp nhận cam kết quản trị upstream; xác nhận được gửi thành công.
- Compose chỉ mở cổng 18080 trên loopback; không công khai PostgreSQL hoặc Redis.
- `deploy/sub2api/.env` được loại khỏi Git. ACL Windows chỉ cấp FullControl cho tài khoản hiện tại, SYSTEM, Administrators.

## Kiểm thử với server thật: 13/13 đạt

`node test/check_sub2api_live.mjs` gọi trực tiếp các HTTP endpoint của Sub2API đang chạy, không giả lập database:

1. Tạo khách hàng có số dư AI bằng 0.
2. Quản trị cấp key có ngày hết hạn.
3. Key mở quyền Ch-relay dù không có quota AI.
4. CLI đã bundle đăng nhập bằng key thật trên server local.
5. Khách không thể tự cấp key.
6. Khách không thể tự kéo dài ngày hết hạn.
7. Khách không thể gọi API quản trị cấp key.
8. Không có key bị trả 401.
9. Key hết hạn trong database bị từ chối.
10. CLI đã bundle cũng từ chối key hết hạn.
11. Cùng key được gia hạn, không cần cài lại.
12. CLI quan sát được hạn mới.
13. Thu hồi có hiệu lực lần kiểm tra tiếp theo, không chờ auth cache.

Key thử nghiệm đã bị thu hồi, khách thử nghiệm bị disable. Không ghi key/token/mật khẩu vào báo cáo. Báo cáo máy đọc nằm tại `.runtime/sub2api-live-report.json`.

## Client và package

- Test client mới: 14/14 đạt, gồm hợp đồng endpoint, thời gian monotonic, từ chối quyền offline, ghim máy chủ, chống redirect, DPAPI Windows, HTTP relay và cắt SSE thực tế ở hạn key.
- Test package cài `.tgz` vào thư mục riêng và kiểm tra login, sync, chạy nền, chặn hết hạn, gia hạn, stop, unsync, logout. Cấu hình Codex chính và `auth.json` của người dùng không bị sửa.
- Gói npm gồm đúng 4 file: `package.json`, `README.md`, `bin/ch-relay.mjs`, `bin/device.ps1`.
- Không đóng gói Sub2API checkout, tool quản trị, database, API key hay secret server; không có install/postinstall script.
- SHA-256 `tn-ch-relay-0.4.0.tgz`: `FD1978665BB207D93EF0928DC07F78EE4B7F4BCCF5717D1ADEFEDD0C44B22100`.

## Test Go

Đã chạy `go test ./internal/handler ./internal/server/middleware -run ChRelay -count=1` trong builder container: cả hai package đạt. Kiểm tra key hết hạn/không hạn/thu hồi, key thông thường không được mở Ch-relay, và chặn khách sửa key trong chế độ license-only.

## Hồi quy relay gốc

Đã chạy bộ kiểm thử Node toàn repository: **365/365 đạt, 0 fail, 0 skip**, thời gian 141 giây. Hai lỗi tương thích Windows trong kiểm thử nền được xử lý: đường dẫn fixture có dấu cách và HTTP DELETE có body thiếu framing trong helper test. Server admin cũ cũng trả 413 có cấu trúc mà không phá socket khi từ chối body quá lớn. Kết quả lần chạy cuối nằm trong `.runtime-tests.log`.

## Giới hạn đã xác định

- Chưa kiểm tra inference với tài khoản ChatGPT thật của khách; kiểm tra forwarding dùng transport giả lập. Không có credential ChatGPT được yêu cầu hoặc sử dụng.
- Chưa chạy CLI trên máy macOS/Linux thật.
- Chưa publish package lên npm registry, chưa đưa stack lên VPS hoặc sửa website `codexunlimit.tudonghoa.me`.
- Chưa tích hợp webhook thanh toán của website; tài liệu đã mô tả API backend cần gọi và yêu cầu xử lý đơn hàng không trùng.
- Không áp giới hạn số thiết bị; yêu cầu hiện tại chỉ dùng key và hạn key.
- Đây là kiểm soát quyền trong bản client chuẩn. Không cam kết ngăn được người có toàn quyền máy sửa client.
