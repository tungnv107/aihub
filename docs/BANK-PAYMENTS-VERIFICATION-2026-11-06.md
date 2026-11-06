# Thanh toán ngân hàng thủ công — 06/11/2026

Admin cấu hình tại `/admin/settings` → **Tài khoản ngân hàng nhận tiền**. Khách chọn gói và tạo đơn để nhận VietQR đúng giá/mã đơn. SePay là tùy chọn, chưa cần kết nối để nhận chuyển khoản. Admin chỉ xác nhận tại `/admin/orders` → **Đối soát** sau khi đã kiểm tra tiền thực nhận. Không tự lưu tài khoản từ ảnh tham khảo của người dùng.

Mỗi đơn lưu riêng ngân hàng nhận tiền; sửa cấu hình chỉ tác động đơn mới. Thanh toán thủ công cho phép kiểm tra giao dịch của đơn đã hết thời gian chờ, nhưng chặn đơn đã hủy, đã trả tiền hoặc hoàn tiền. Kiểm tra số tiền, chống giao dịch trùng và tạo duy nhất job cấp license trong transaction. API cấu hình giới hạn ADMIN, kiểm tra Origin và ghi audit với số tài khoản rút gọn. SePay không nhận webhook trong chế độ thủ công.

## Kiểm chứng cục bộ

- Backend: 23/23 kiểm thử, gồm phân quyền, Origin, consent, validation, giá server, QR, snapshot ngân hàng, SePay bật sau và đối soát đồng thời không trùng.
- Lint và TypeScript đạt.
- Playwright trên Edge thật: Admin lưu ngân hàng khi SePay chưa cấu hình; khách tạo đơn 99.000 VND; ảnh VietQR thực sự tải từ nhà cung cấp; mã QR chứa đúng ngân hàng, tài khoản, giá và mã đơn. Trước đối soát không có Payment/License. Đổi tài khoản không đổi QR cũ. Khách tự đối soát bị 403. Admin xác nhận được, trang khách cập nhật PAID và chỉ có một job cấp quyền.
- Kiểm tra ảnh desktop và mobile 390px; không tràn chiều ngang. Ảnh trong `.runtime/bank-admin-desktop.png`, `.runtime/bank-order-desktop.png`, `.runtime/bank-order-mobile.png` chỉ dùng dữ liệu giả và không commit.
- Test UI chạy bằng `node scripts/test-bank-ui.mjs` từ `web/`: database tạm có hậu tố `_test`, app test riêng, tự đóng server và xóa database sau test. Chưa chạy worker, chưa chuyển tiền thật. Thư mục app/cache thử bị Git ignore.
- Quét file trước xuất bản: không phát hiện secret hay file bị cấm.

## Chuẩn bị triển khai

- Backup AIHub/Sub2API/uploads tại server: `20261106T082202Z`.
- Giữ image rollback `aihub-web:before-bank-settings`, `aihub-worker:before-bank-settings`.
- Migration chỉ thêm cột `Order.paymentInstructions` JSONB nullable. Không sửa/xóa đơn hoặc tài khoản có sẵn. Không thay đổi Sub2API trong đợt cập nhật này.
