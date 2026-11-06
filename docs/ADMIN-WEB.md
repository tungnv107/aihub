# Quản trị và trang khách hàng TDH Relay

Admin/portal phiên bản **1.1.0**, ngày 30/10/2026. Khi triển khai portal, gói khách là 0.3.1. Hotfix [0.3.2](PATCH-0.3.2.md) sau đó sửa giới hạn request desktop; policy, khóa ký và archive cũ vẫn giữ nguyên.

- Chủ sản phẩm: https://codex.tudonghoa.me/admin
- Khách hàng: https://codex.tudonghoa.me/portal
- Bộ cài và hướng dẫn công khai: https://codex.tudonghoa.me

## Tài khoản chủ sản phẩm

Username: **owner**. Thông tin bàn giao ban đầu nằm tại `%LOCALAPPDATA%\TDHRelayOwner\admin-login.json`, có ACL giới hạn. Không đưa file này vào repo hoặc gửi cho khách. Lần đầu cần đổi mật khẩu tối thiểu 14 ký tự; file bàn giao không tự cập nhật sau khi đổi. Bản cập nhật không reset mật khẩu của bạn.

Admin dùng mật khẩu riêng, không dùng key khách hoặc đăng nhập ChatGPT. Đổi mật khẩu kết thúc mọi phiên. Phiên hết sau 30 phút không hoạt động hoặc tối đa 8 giờ. Chưa có MFA/TOTP.

## Cấp nhiều key và tính thời hạn

1. Chọn **Cấp key mới**.
2. Điền tên khách/tên lô, số lượng **1–100**, số ngày và số máy tối đa cho mỗi key.
3. Key trong lô tự thêm số thứ tự 001, 002…; việc tạo lô là một giao dịch, lỗi giữa chừng không để lại nửa lô.
4. Tải CSV hoặc sao chép ngay. Server chỉ lưu hash, không thể xem lại key rõ sau khi đóng. CSV có bảo vệ giá trị bắt đầu bằng công thức Excel; vẫn là file chứa bí mật cần giữ riêng.
5. Gửi đúng key cho từng khách cùng địa chỉ portal.

Key mới ở trạng thái **Chờ kích hoạt**. Ví dụ key 30 ngày cấp ngày 30/10, kích hoạt thiết bị lần đầu ngày 05/11 thì hạn là 30 × 24 giờ từ thời điểm kích hoạt đó. Tạo key, nhập key vào portal hoặc kích hoạt lỗi không bắt đầu thời hạn.

Mỗi key có một thời điểm bắt đầu. Thiết bị thứ hai, reset thiết bị hay cài lại không đặt lại thời hạn. Các thao tác kích hoạt đồng thời được tuần tự hóa trong SQLite, tránh hai mốc hết hạn khác nhau.

Gia hạn key chưa dùng cộng vào số ngày chờ và vẫn chưa tính giờ. Với key đã kích hoạt, cộng từ mốc lớn hơn giữa hiện tại và ngày hết hạn. Gia hạn cũng mở lại key đang bị thu hồi. Key bị thu hồi chặn lease mới; lease cũ có thể còn dùng tối đa 10 phút.

Migration 1.1.0 kiểm tra lịch sử kích hoạt và thiết bị: giữ **đúng ngày hết hạn cũ** của key từng dùng, kể cả thiết bị đã reset; key chưa từng kích hoạt được chuyển sang chờ với đủ thời lượng đã cấp. Không đổi key, giới hạn máy hoặc trạng thái thu hồi.

## Công việc quản trị

- Tổng quan: key còn hạn/chờ kích hoạt, sắp hết hạn, thu hồi và thiết bị liên hệ gần đây.
- Danh sách: tìm tên hoặc mã license, lọc trạng thái, mở chi tiết.
- Chi tiết: xem ngày cấp, lần kích hoạt đầu tiên, hạn dùng; sửa tên/số máy, gia hạn, thu hồi, reset thiết bị.
- Không hạ số máy tối đa dưới số slot đang dùng; reset không gia hạn key.
- Nhật ký: thời điểm, thao tác, chủ thể và đối tượng. Cấp lô có sự kiện tổng hợp cùng sự kiện cấp từng key.
- Chẩn đoán: trạng thái license/distribution, SQLite và báo cáo thủ công của khách.

## Trang khách hàng

Khách đăng nhập bằng key TDH, không phải mật khẩu/token ChatGPT. Portal chỉ cho xem license đang đăng nhập. Muốn xem key khác, chọn **Đăng xuất / đổi key**. Phiên riêng với admin; key không được đưa vào URL, localStorage hoặc nhật ký.

- **Key của tôi:** trạng thái, ngày cấp/kích hoạt/hết hạn, ngày còn lại và số máy.
- **Thiết bị:** fingerprint rút gọn, trạng thái, ngày kích hoạt, lần liên hệ. Khách liên hệ nơi cấp key để reset máy; không tự mở rộng số slot.
- **Thống kê:** số request, lỗi, lượt thử upstream, thời gian trung bình và mã HTTP trong báo cáo đã tải lên.
- **Cài đặt & hỗ trợ:** Windows/macOS/Sub2API, sao chép lệnh cài/gỡ, cách xử lý lỗi, phạm vi dữ liệu.

Key hết hạn/thu hồi vẫn xem được thông tin hỗ trợ nhưng không kích hoạt hoặc gia hạn lease relay. Phiên portal hết sau 30 phút không hoạt động hoặc tối đa 24 giờ. Key có entropy cao và đăng nhập được giới hạn lần thử. Ai có key có thể xem portal của key đó, nên không chia sẻ key công khai.

## Thống kê và dữ liệu

Server tự có số liệu cấp phép, thiết bị và lần liên hệ. “Liên hệ gần nhất” không chứng minh máy đang trực tuyến hay đang inference. Request/token không suy ra từ số lần kích hoạt.

Windows xuất báo cáo:

    irm "https://codex.tudonghoa.me/diagnose.ps1" | iex

Công cụ đọc SQLite local theo chế độ read-only, tạo JSON trên Desktop. Không tự upload, không đọc token/prompt. Khách xem file rồi tải lên mục Thống kê; quản trị viên cũng có thể nhập tại chi tiết license. Portal nhận tối đa 20 KB/file và 10 báo cáo/key/giờ. Server chỉ giữ field tổng hợp được cho phép, tối đa 20 báo cáo; giao diện hiện 10 bản mới nhất.

Báo cáo là dữ liệu tự khai, chưa được xác thực với upstream. Hiển thị bản mới nhất, không cộng dồn vì có thể trùng khoảng dữ liệu. Không phải phép đo quota, token toàn tài khoản hoặc bằng chứng tính tiền. Thống kê proxy chi tiết dùng API quản trị riêng, xem [PROXY.md](relay-product/PROXY.md).

## Cài đặt

setup.ps1 cài relay, Node runtime và cấu hình kết nối trên máy cá nhân; cần có ứng dụng Codex và tài khoản ChatGPT riêng. Windows tạo shortcut portal trong thư mục cài TDHRelay. Người đã cài có thể mở portal trực tiếp, không cần cài lại. Gói proxy/Docker cho Sub2API là luồng riêng trên server.

## Kiến trúc, cập nhật và khôi phục

Container `tdh-relay-admin` phục vụ cả `/admin` và `/portal`, bind `127.0.0.1:18332 → 8082`. Caddy chuyển đúng hai prefix này; `/api/licenses/*` tới `tdh-relay-license`. Hai process dùng chung SQLite tại `/opt/tdh-relay-license/data`, giao dịch WAL và busy timeout. Khóa ký không thay đổi.

Admin dùng scrypt; cả hai portal dùng cookie Secure/HttpOnly/SameSite=Strict, CSRF, kiểm tra Origin/Host, throttling, CSP và escape HTML. Cookie, session và quyền customer/admin tách biệt. Container không có Docker socket, chạy user 1000, filesystem read-only, bỏ capabilities, no-new-privileges và giới hạn tài nguyên. Runtime không có dependency npm mới.

Đóng gói: `python test/package_admin_20261030.py`. Cập nhật VPS bằng `test/vps_update_portal_20261030.py`: chạy `--check` với archive/checksum trước, sau đó `--apply` cùng tham số. Script kiểm tra release/checksum, Caddy, dữ liệu cũ; tạo backup mới tại `/opt/tdh-relay-admin/backups/portal-<UTC>`; dừng ngắn hai service admin/license, backup SQLite nhất quán, cập nhật schema/code, đối chiếu từng license và mật khẩu rồi khởi động lại. Sub2API, relay test và distribution không restart.

Chỉ rollback toàn DB nếu hai service vẫn chưa tiếp nhận traffic trở lại. Sau khi đã chạy, phải giữ dữ liệu mới và sửa tiếp; không phục hồi backup cũ để làm mất key, kích hoạt hoặc thay đổi mật khẩu vừa phát sinh. Script phân biệt rõ hai trường hợp. Không dùng backup của lần triển khai 1.0.0 để ghi đè dữ liệu hiện tại.

## Kiểm thử

- **324/324** bài qua: relay/protocol, license/auth, migration cũ, bulk atomicity, first activation đồng thời, phân quyền portal, CSRF/Origin, session, throttling, báo cáo allowlist.
- Chrome: admin login/đổi mật khẩu/cấp/gia hạn/thu hồi, cấp lô và CSV, chống XSS/công thức CSV, portal login/thiết bị/báo cáo/setup/logout.
- Viewport 375, 768, 992 và 1440 px không tràn ngang hoặc lỗi JavaScript.
- PowerShell parser và bash syntax; chưa có máy Mac để kiểm thử cài native.
- Kiểm tra HTTPS sau cập nhật dùng key smoke riêng, tự thu hồi khi xong; không đăng nhập hoặc reset mật khẩu owner, không dùng key khách.
