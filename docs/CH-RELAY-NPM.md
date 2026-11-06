# AIHub — thiết lập bằng hai lệnh

AIHub chạy Ch-relay local; API key Sub2API chỉ mở quyền sử dụng relay. Bạn vẫn dùng tài khoản ChatGPT riêng trong Codex. Key không cấp thuê bao ChatGPT và không bảo đảm mức tiết kiệm quota cố định.

## Cài đặt

Cần Node.js 24.18.0 trở lên. Phiên bản **0.5.0**, gói **`@tungnv107/aihub`**, lệnh **`aihub`**. Bản cho khách kết nối cố định đến **https://aihub.tungnv.com**.

Sau khi máy chủ AIHub được triển khai và HTTPS hoạt động, khách dùng:

```text
npm i -g @tungnv107/aihub
aihub
```

Lần đầu, terminal hỏi key ở chế độ ẩn, kiểm tra hạn key và hỏi xác nhận áp dụng kết nối. Nhấn Enter để đồng ý, hoặc gõ `n` để hủy. Chương trình khởi động dịch vụ nền rồi sao lưu và cập nhật cấu hình Codex. Mở lại Codex và đăng nhập ChatGPT của bạn. Có thể đóng terminal sau khi thấy **Hoàn tất**.

Những lần sau chỉ cần `aihub`: dùng key đã lưu, kiểm tra quyền online rồi chạy nền; không hỏi lại key và không ghi lại cấu hình nếu đã kết nối. `aihub setup` tiếp tục hoặc áp dụng lại thiết lập.

Nếu PowerShell chặn file `.ps1`, dùng `npm.cmd i -g @tungnv107/aihub` và `aihub.cmd`.

**Thử bản 0.5.0 local trước khi phát hành:**

```powershell
npm i -g ./dist/tungnv107-aihub-0.5.0.tgz
aihub
```

Artifact trên dùng cùng máy chủ đã ghim với bản npm. Muốn kiểm thử với SaaS local, quản trị viên build một gói staging chưa ghim bằng `npm run build:npm:aihub`; gói staging hỏi URL, có thể nhập `http://127.0.0.1:3000`. Bản cho khách được build với `--server https://aihub.tungnv.com` và không cho đổi sang máy chủ khác.

Cài npm thành công không đồng nghĩa máy chủ đã hoạt động. Nếu domain chưa được cấu hình HTTPS hoặc backend chưa triển khai, CLI báo lỗi và không kích hoạt relay. Không tắt kiểm tra chứng chỉ TLS.

Đóng/mở lại Codex sau khi setup và đăng nhập ChatGPT như bình thường. Relay mặc định dùng `127.0.0.1:18456`. `setup` sửa `config.toml`, không sửa `auth.json`. Gói không có script chạy khi npm install. Cài lại gói không xóa key hoặc thay đổi ngày hết hạn.

Nếu chỉ muốn đăng nhập trước:

```text
aihub login
aihub sync
aihub start
aihub status
aihub license
```

`start` chạy nền; `serve` chạy trong terminal. Sau khi khởi động lại máy, chạy `aihub`. Chưa cài service tự khởi động cùng hệ điều hành. Bản này chưa tự đóng/mở ứng dụng Codex; hãy lưu công việc rồi mở lại Codex sau khi kết nối. Lệnh `ch-relay` được giữ làm alias cho người đã dùng bản 0.4.0.

Tự động hóa dùng `aihub --server <URL> --key-stdin --yes`, hoặc biến môi trường `AIHUB_API_KEY` (vẫn nhận `CH_RELAY_API_KEY`). `--yes` đồng ý áp dụng cấu hình. Không có tham số `--key` để tránh ghi key vào lịch sử lệnh. Không đưa key vào URL. `AIHUB_HOME` cho phép dùng thư mục dữ liệu riêng; `AIHUB_SERVER` chỉ là cấu hình cho gói chưa ghim máy chủ.

## Thời hạn và mất kết nối

- Phải có ngày hết hạn cụ thể trên API key. Hạn tính theo `expires_at` đã đặt trong Sub2API, không tự dời sang ngày cài phần mềm.
- Kiểm tra online lúc login, start, sync, mỗi request và mỗi đoạn tiếp tục do relay gửi. Không dùng quyền đã cache để chạy offline.
- Stream đang chạy có bộ hẹn giờ hết hạn dựa trên giờ máy chủ và kiểm tra lại mỗi 30 giây. Thu hồi key, đăng xuất hoặc lỗi mạng sẽ ngắt stream ở lần kiểm tra tiếp theo; timeout mạng tối đa 10 giây.
- Đến hạn đã biết, stream bị hủy ngay theo bộ hẹn giờ (có thể chậm do hệ điều hành/event loop). Request mới bị từ chối. Không ngắt ứng dụng Codex hoặc các chức năng ChatGPT độc lập.
- Gia hạn key trong Sub2API rồi chạy lại `aihub`; không cần cài lại. Nếu key hết hạn trong khi terminal đang chờ xác nhận, chương trình kiểm tra lại và không áp dụng cấu hình.

## Dừng và gỡ

```text
aihub stop
aihub unsync
aihub logout
npm uninstall -g @tungnv107/aihub
```

`stop`, `unsync`, `logout` hoạt động cả khi key đã hết hạn hoặc máy chủ offline. Luôn `unsync` trước khi gỡ package để Codex không trỏ vào relay đã bị gỡ. Nếu cấu hình bị thay đổi ở phần relay quản lý, công cụ báo xung đột thay vì ghi đè.

## Dữ liệu local

Windows: `%LOCALAPPDATA%/ChRelay`; macOS: `~/Library/Application Support/ChRelay`; Linux: `~/.local/share/ch-relay`. Có thể dùng `--home` và `--codex-home` riêng để thử nghiệm.

Key lưu bằng Windows DPAPI CurrentUser trên Windows. Trên macOS/Linux, file credential dùng quyền 0600 trong thư mục 0700; không phải mã hóa keychain. Log không ghi API key hay token ChatGPT.

## Lỗi thường gặp

| Lỗi | Cách xử lý |
| --- | --- |
| `sub2api_license_endpoint_missing` | Máy chủ chưa cài bản tích hợp Ch-relay hoặc sai URL |
| `api_key_expired` | Gia hạn `expires_at` và bật lại status active trong Sub2API |
| `license_expiry_required` | Quản trị viên phải đặt hạn cụ thể cho key |
| `sub2api_unavailable` | Kiểm tra mạng, TLS và trạng thái máy chủ |
| `sub2api_server_not_allowed` | Dùng đúng máy chủ đã ghim trong gói của nhà cung cấp |
| `port_owned_by_another_service` | Kiểm tra chương trình đang chiếm cổng, không dừng nhầm dịch vụ khác |
| `chatgpt_sign_in_required` | Đăng nhập ChatGPT trong Codex; API key Sub2API không thay token ChatGPT |

Phần mềm local có thể bị người có toàn quyền máy sửa đổi; cơ chế này kiểm soát bản client chuẩn, không phải bảo đảm chống crack tuyệt đối.


Tên gói npm được cấu hình bằng `--package-name @tungnv107/aihub`; lệnh `aihub` giữ nguyên. Xem `docs/NPM-REGISTRATION.md`. Bản 0.5.0 hỗ trợ xác thực thiết bị Ed25519 của AIHub SaaS. Biến CODEXUNLIMIT_HOME/SERVER/API_KEY cũ vẫn tương thích, dữ liệu local cũ được giữ.
