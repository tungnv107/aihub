# Biên bản triển khai 06/11/2026

Server `161.118.222.102`, Ubuntu ARM64. Source từ `https://github.com/tungnv107/aihub`, checkout `/home/ubuntu/aihub`. Mã nguồn đã được push, server clone/pull bằng Git và build tại server; không chép image từ môi trường local.

## Địa chỉ Nginx Proxy Manager

| Domain | Scheme | Forward hostname | Forward port | Host loopback |
|---|---|---|---:|---|
| aihub.tungnv.com | http | aihub-ingress | 8080 | 127.0.0.1:13000 |
| sub2api.tungnv.com | http | sub2api | 8080 | 127.0.0.1:18080 |

NPM đang dùng mạng `npm_proxy`; cả hai đích đã được kiểm tra từ container `npm-app-1`, HTTP 200. Không dùng localhost của container NPM để trỏ tới port host. AIHub public HTTPS chưa hoạt động tại thời điểm nghiệm thu: TLS trả `unrecognized name`; chủ hệ thống cần tạo Proxy Host và chứng chỉ SSL/Force SSL. Domain Sub2API hiện hữu trả HTTPS 200 sau nâng cấp. Không chỉnh cấu hình NPM của chủ hệ thống.

Đã chạy đầy đủ web, worker, PostgreSQL và Redis AIHub, ingress, backup; cùng Sub2API đã vá và PostgreSQL/Redis Sub2API hiện hữu. Không public port DB/Redis; worker và backup không cần domain.

## Kết quả thực tế

- AIHub và Sub2API healthy; Next build ARM64 và Sub2API Go/frontend build đạt.
- Relay/CLI 368/368; backend web 17/17; Sub2API Usage/export 14/14; locale 3/3; Go handler/middleware license đạt; lint/TypeScript web đạt. CI GitHub cho commit `6681c87` đạt cả hai jobs.
- npm audit web (toàn bộ + runtime), dependency bộ build relay, pnpm audit frontend Sub2API: 0 advisory; `govulncheck ./cmd/server`: không phát hiện lỗ hổng sau vá.
- Đăng nhập admin thật, cookie Secure/HttpOnly, phân quyền và CSRF đã thử. Scoped key Sub2API không được đọc danh sách users (403).
- Cấp grant thử 0 đồng qua API quản trị, worker thực sự tạo key ở Sub2API; kích hoạt Ed25519 thành công; replay bị chặn; gọi trực tiếp Sub2API không có gateway secret bị chặn. Thu hồi ở AIHub và Sub2API thành công. License thử ở trạng thái REVOKED; 3 jobs DONE; gói thử không hiển thị để bán.
- SheetJS 0.20.3 xuất/đọc XLSX đúng; chuỗi bắt đầu bằng `=` vẫn là cell text, không trở thành formula.
- Trước nâng cấp: 1 user, 2 API keys, 2 accounts Sub2API. Sau migration, ba số lượng này vẫn khớp trước khi thêm authority user/test key. Tài khoản và secrets Sub2API cũ được giữ lại.
- Backup trước nâng cấp: `/home/ubuntu/aihub-backups/pre-upgrade-20261106T073026Z`. Backup định kỳ cả hai DB/uploads: `/home/ubuntu/aihub/deploy/aihub/backups`. Đã thử restore Sub2API và AIHub vào database tạm riêng, đối chiếu số bản ghi rồi dọn database tạm.
- File thông tin đăng nhập riêng tư: `/home/ubuntu/aihub-access.txt`, quyền 0600. Bản local `.runtime/AIHub-production-access.txt` có ACL giới hạn và bị Git ignore. Không ghi secret vào repo hoặc báo cáo.

## Cấu hình còn do chủ hệ thống cung cấp

- Proxy Host/SSL cho AIHub trong NPM.
- SMTP thật, thông tin SePay/ngân hàng và Google OAuth nếu dùng. Hiện đăng ký và checkout bị tắt, payment provider disabled; không có bảng giá mẫu production. Admin có thể cấu hình sau khi sẵn sàng.
- Đổi mật khẩu bootstrap AIHub sau đăng nhập, cấu hình nội dung/chính sách/giá thực tế trước mở bán. Không thực hiện giao dịch ngân hàng hoặc gửi email production khi kiểm thử.
