# AIHub — yêu cầu sản phẩm

Phạm vi được xác nhận: triển khai SaaS đầy đủ theo MASTER_PROMPT_AI_CODING_SAAS_PLATFORM.md, đồng thời đổi lệnh CLI thành `aihub` và chuẩn bị package có thể cấu hình tên npm theo scope người sở hữu.

Website gồm marketing, auth, checkout, customer portal, docs/help/support và admin. PostgreSQL là nguồn dữ liệu nghiệp vụ; demo tương tác chỉ mang nhãn minh họa, không chèn số liệu mẫu vào dashboard thật. Giá/gói đến từ DB. Không có đánh giá khách hàng giả.

Sub2API tiếp tục là bên cấp/thu hồi/gia hạn API key. AIHub quản lý đơn hàng, quyền sở hữu và thiết bị; không truy cập token ChatGPT. Chính sách hạn mặc định tính từ lúc cấp key, được công bố trước checkout. Không hứa tăng hay xóa quota upstream.

Thanh toán chỉ được ghi nhận bằng webhook đã xác thực hoặc đối soát admin có bằng chứng và audit. Email dùng SMTP hoặc provider tương thích. Không có credentials thì tính năng bên ngoài báo chưa cấu hình. Sandbox chỉ ở APP_ENV=local/test.

Chưa có quyền phát hành tên npm `aihub` (đã thuộc người khác). Người dùng sẽ đăng ký tài khoản riêng; tên có scope được chọn sau. Không tự publish/deploy/push.
