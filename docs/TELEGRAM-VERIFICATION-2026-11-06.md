# Liên hệ và thông báo Telegram — 06/11/2026

Liên hệ công khai `https://t.me/tungnv91` được quản lý tại Admin/Cài đặt, hiển thị trong footer và trang hỗ trợ. Bài Facebook bàn giao riêng cũng đã bổ sung liên hệ này; không đưa lô key trải nghiệm vào Git.

Bot `@aihubadminbot` nhận thông báo đơn hàng mới qua hàng đợi bền vững. Token chỉ lưu trong env server quyền 0600. Người nhận đã bấm Start và được xác minh qua `getUpdates`/`getChat` là cuộc trò chuyện riêng của `@tungnv91`. API công khai/quản trị không trả token hoặc chat ID.

- 29/29 kiểm thử backend đạt; gồm tạo job cùng transaction checkout, giữ đơn khi thiếu chat ID, retry sau Telegram 429, làm sạch lỗi có thể chứa token, xác nhận receipt trước khi gửi lại và kiểm tra URL liên hệ.
- Playwright trên Edge thật đạt: Admin lưu liên hệ, footer và trang hỗ trợ hiển thị đúng URL; kiểm tra desktop và mobile 390px, không tràn ngang. Database thử được dọn sau test.
- Nội dung tin gồm mã đơn, khách hàng, email, gói, số tiền, trạng thái thực tế, thời gian Việt Nam và nút mở trang quản trị. Không gửi key/license hoặc ngân hàng.
- Chỉ job của checkout mới được tạo, không gửi lại các đơn cũ/lô key cấp tặng. Biên nhận chống gửi lại sau khi đã ghi nhận; giới hạn khi Telegram đã nhận nhưng tiến trình chết trước ghi receipt được nêu trong hướng dẫn triển khai.
- Backup dữ liệu trước triển khai: `20261106T095123Z`; giữ image `aihub-web:before-telegram` và `aihub-worker:before-telegram`.

Triển khai production commit `e3ef7570b3758ddf7caf2a9a194b67aedf4fd99e`: build web/worker thành công, migration/seed hoàn tất, web healthy; AIHub và Sub2API HTTPS trả 200. [GitHub Actions](https://github.com/tungnv107/aihub/actions/runs/42198647914) thành công. Lint và TypeScript cũng đạt.

Kiểm chứng trực tiếp qua HTTPS bằng phiên admin: lưu liên hệ, giữ nguyên các thiết lập khác, xác nhận liên kết trong footer/trang hỗ trợ và trường cài đặt. Đơn thử `AHEC60F8AD8F56ECA8` mang tên “KIỂM THỬ THÔNG BÁO — không thanh toán” tạo đúng một job. Telegram chấp nhận tin nhắn `message_id=2` vào chat đã cấu hình; worker ghi receipt, job DONE, không có retry. Sau kiểm chứng đã hủy đơn qua API: trạng thái CANCELLED, 0 payment, 0 license.

File env server vẫn quyền 0600; kiểm tra response công khai/quản trị không lộ token. Email vẫn được cấu hình. Biên bản smoke test riêng lưu ở `/home/ubuntu/aihub-issued/telegram-smoke-20261106.json` quyền 0600.
