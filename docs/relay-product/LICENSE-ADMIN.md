# Quản trị key TDH Relay — chỉ dành cho chủ sản phẩm

Máy cấp phép: `/opt/tdh-relay-license`, container `tdh-relay-license`. API client chỉ có challenge/activate/renew. Từ ngày 30/10/2026 có trang quản trị web tại https://codex.tudonghoa.me/admin, dùng tài khoản chủ sản phẩm, cookie phiên và CSRF. Xem [hướng dẫn quản trị web](../ADMIN-WEB.md). Các lệnh SSH bên dưới vẫn dùng được.

Windows, từ workspace nguồn:

    .\relay_product\admin\Manage-Licenses.ps1 -Action issue -Label "Khach 001" -Days 1 -MaxDevices 1
    .\relay_product\admin\Manage-Licenses.ps1 -Action list
    .\relay_product\admin\Manage-Licenses.ps1 -Action devices -Id "<license-id>"
    .\relay_product\admin\Manage-Licenses.ps1 -Action extend -Id "<license-id>" -Days 30
    .\relay_product\admin\Manage-Licenses.ps1 -Action revoke -Id "<license-id>"
    .\relay_product\admin\Manage-Licenses.ps1 -Action revoke-device -Id "<activation-id>"
    .\relay_product\admin\Manage-Licenses.ps1 -Action reset-device -Id "<activation-id>"

`issue` tạo key và lưu vào `%LOCALAPPDATA%\TDHRelayOwner\keys\<license-id>.json` với ACL riêng. Lệnh chỉ in đường dẫn, không in key. Mở file đó để chuyển riêng cho khách. Không gửi file chứa key lên website hoặc commit vào Git. `-Days 1` là dùng thử 24 giờ tính từ lần kích hoạt thiết bị đầu tiên thành công. Key chưa dùng có `started_at=null`, `expires_at=0` trong DB. `extend` cộng vào thời lượng chờ nếu chưa kích hoạt; nếu đã dùng, cộng từ mốc lớn hơn giữa ngày hết hạn và hiện tại. Gia hạn cũng mở lại license bị thu hồi.

Cấp lô 1–100 key trên web: **Cấp key mới → Số lượng key**, đặt tên lô, số ngày và số máy/key. Key trong lô có hậu tố 001, 002… và chỉ hiển thị một lần; tải CSV hoặc sao chép trước khi đóng. CSV chứa key, chỉ gửi đúng dòng cho từng khách. Khách có trang riêng tại https://codex.tudonghoa.me/portal; đăng nhập portal không tính ngày và không chiếm slot thiết bị.

Mỗi key có một mốc kích hoạt đầu tiên; các thiết bị sau dùng chung ngày hết hạn. Reset máy, cài lại hoặc đăng nhập lại không đặt lại mốc. Migration 1.1.0 giữ nguyên hạn của key từng kích hoạt (kể cả đã reset thiết bị), chuyển key chưa từng dùng sang chờ kích hoạt và giữ trạng thái thu hồi.

`revoke-device` chặn khóa thiết bị cũ và giải phóng một slot. `reset-device` xóa ràng buộc để khách kích hoạt lại sau khi cài lại hệ điều hành/xóa dữ liệu. Cần kiểm tra đúng khách trước thao tác. Thu hồi không hủy request đã gửi OpenAI; chặn request mới khi client biết bị thu hồi hoặc lease cũ hết hạn (tối đa 10 phút).

Key này kích hoạt sản phẩm TDH Relay. Khách vẫn đăng nhập tài khoản ChatGPT của mình. Không phải OpenAI API key, không phải caller key của proxy.

## Domain và vận hành

`codex.tudonghoa.me` dùng A record trực tiếp `134.185.93.244`, HTTPS do Caddy cấp qua DNS challenge. Domain này không bật proxy/cache Cloudflare: token DNS hiện tại không có quyền purge cache và bản thử 0.2.0 từng bị cache dài hạn. Không bật lại proxy cho domain trước khi xóa cache các release đã thu hồi. Không ảnh hưởng các record khác.

Distribution: `/opt/tdh-relay-distribution`, container `tdh-relay-distribution`, cổng nội bộ `127.0.0.1:18330`. License: container `tdh-relay-license`, cổng nội bộ `127.0.0.1:18331`; Caddy route `/api/licenses/*` tới service này. Chỉ 80/443 của reverse proxy cần public.

Bản 0.2.0 không key đã bị gỡ ở origin. Không thể xóa các bản đã tải về hoặc nằm trong cache của người dùng. Gói owner/source chỉ lưu nội bộ; không đưa ZIP owner lên thư mục `public`.

## Sao lưu và khôi phục

Giữ `data/signing-private.pem` và toàn bộ SQLite `licenses.sqlite` bằng backup SQLite nhất quán; thư mục `data/issued` chứa bản key đã cấp, chỉ chủ sản phẩm được đọc. Không sao chép riêng file SQLite đang có WAL. Dừng container trước khi sao chép lạnh, rồi khởi động lại; gián đoạn không được vượt TTL lease nếu cần tránh ảnh hưởng khách.

Khóa ký bị mất thì không thể gia hạn lease cũ bằng cùng public key; phải phục hồi backup hoặc phát hành client ghim public key mới và chuyển license có kiểm soát. Khóa ký bị lộ thì thu hồi bản phát hành và xoay khóa, không chỉ đổi password SSH.

## Phạm vi chống sửa đổi

Đã có key ngẫu nhiên, hash key trong DB, giới hạn thiết bị giao dịch nguyên tử, proof Ed25519 chống phát lại, lease ngắn hạn, thu hồi từ server, DPAPI trên Windows, manifest ký số và mã đã bundle/làm rối.

Không thể bảo đảm chống crack tuyệt đối cho phần mềm và policy chạy trên máy khách. Chưa có code signing Authenticode/notarization hoặc hardware attestation. Nếu cần mức bảo vệ mạnh hơn, chuyển phần xử lý giá trị lên server do bạn kiểm soát; đó là thay đổi mô hình “hoàn toàn local”.
