# TDH Relay 0.3.3

Relay do bạn tự quản lý, dùng chung policy v7 cho hai cách triển khai:

1. **Codex cá nhân:** relay trên máy Windows/macOS; Codex dùng tài khoản ChatGPT của chính người dùng.
2. **Proxy:** relay OpenAI-compatible cho Sub2API hoặc một gateway do bạn vận hành.

Trang phân phối: https://codex.tudonghoa.me

## Cài lại sau khi đã đưa Codex về dùng trực tiếp

Bản 0.3.3 sửa lỗi `managed_configuration_changed_review_required` khi trạng thái cũ của relay còn đánh dấu đã đồng bộ, nhưng bạn đã trả Codex về cấu hình trực tiếp. Bộ cài sao lưu cấu hình hiện tại trước khi nối lại relay; khi gỡ, khôi phục cấu hình này. Thay đổi thứ tự/định dạng tương đương được xử lý bằng backup đã kiểm tra hash. Nếu có provider hoặc endpoint khác thực sự, bộ cài giữ nguyên và báo cần kiểm tra.

Đóng Codex, chạy lại lệnh cài bên dưới, rồi mở lại. Không xóa thư mục dữ liệu, key hoặc auth.json; không cần gỡ bản cũ trước. Key và ngày hết hạn đã kích hoạt được giữ nguyên.

## Sửa lỗi 413 trên bản desktop

Bản 0.3.2 nâng giới hạn request mặc định của desktop từ 2 MiB lên **64 MiB**, tính cả dữ liệu sau giải nén. Bản 0.3.1 có thể trả `413 compressed_request_rejected` khi Codex gửi hội thoại dài hoặc ảnh. Bản mới giữ nguyên nội dung request, không tự cắt lịch sử, và vẫn từ chối dữ liệu vượt giới hạn hoặc nén hỏng.

Máy đã cài: chạy lại lệnh cài bên dưới, sau đó đóng/mở lại Codex và gửi lại yêu cầu. Không cần gỡ trước. Key, mốc kích hoạt và phiên ChatGPT được giữ nguyên. Cấu hình giới hạn riêng do quản trị viên đã đặt được giữ nguyên; mặc định proxy/Sub2API không thay đổi. Kiểm tra `/healthz` thấy version `0.3.3` và `limits.requestBodyBytes: 67108864` nếu đang dùng mặc định desktop.

## Trang khách hàng

Mở https://codex.tudonghoa.me/portal, nhập key TDH do quản trị viên cấp. Trang này có thông tin key, ngày kích hoạt/hết hạn, thiết bị, thống kê từ báo cáo bạn tải lên và hướng dẫn cài Windows/macOS/Sub2API. Chọn **Đăng xuất / đổi key** để xem key khác.

Đăng nhập website không bắt đầu tính ngày và không chiếm slot thiết bị. Thời hạn chỉ bắt đầu khi relay trên thiết bị kích hoạt thành công lần đầu. Các thiết bị dùng chung ngày hết hạn; reset máy hoặc cài lại không tính lại từ đầu. Hạn của các key đã kích hoạt trước bản cập nhật được giữ nguyên.

## Cài cho Codex trên Windows

Lệnh bên dưới cài **TDH Relay**, runtime đi kèm và cấu hình kết nối trên máy cá nhân. Nó **không cài ứng dụng Codex và không cài Sub2API**. Cài ứng dụng Codex chính thức trước nếu máy chưa có; sử dụng tài khoản ChatGPT riêng của bạn.

Mở PowerShell bằng tài khoản người dùng thông thường:

```powershell
irm "https://codex.tudonghoa.me/setup.ps1" | iex
```

Bộ cài hỏi **key kích hoạt do quản trị viên cấp**, nhập ở ô ẩn. Key không nằm trong lệnh cài hoặc URL. Sau khi cài, đóng và mở lại Codex; đăng nhập bằng **Sign in with ChatGPT**. Model sử dụng phụ thuộc tài khoản và model Codex cung cấp. Bộ cài không cấp thêm quyền model hoặc quota.

Nếu Codex đã đăng nhập thì giữ phiên hiện có, không cần đăng nhập lại chỉ vì cài relay. Cách triển khai trên server/Sub2API nằm trong tài liệu PROXY.md.

### Xuất báo cáo khi cần hỗ trợ

    irm "https://codex.tudonghoa.me/diagnose.ps1" | iex

Công cụ tạo JSON trên Desktop gồm phiên bản, số request, số lỗi, mã trạng thái, lượt thử và thời gian xử lý. Không đọc token/prompt, không tự gửi dữ liệu. Bạn kiểm tra file rồi tải lên mục **Thống kê** tại trang khách hàng hoặc gửi riêng cho quản trị viên. Báo cáo đã tải lên hiển thị cho bạn và quản trị viên. Đây là số liệu các bản ghi còn lưu tại máy, không phải báo cáo quota toàn tài khoản; các lần tải lên không cộng dồn vì có thể trùng dữ liệu.

Gỡ:

```powershell
irm "https://codex.tudonghoa.me/setup.ps1?remove=1" | iex
```

## Cài trên macOS

```bash
curl -fsSL "https://codex.tudonghoa.me/setup.sh" | bash
```

Gỡ:

```bash
curl -fsSL "https://codex.tudonghoa.me/setup.sh?remove=1" | bash
```

Hỗ trợ bộ cài Intel và Apple Silicon. Kiểm thử hệ điều hành thực tế được ghi riêng trong `manifest.json`; không coi kiểm tra cú pháp shell là kiểm thử trên máy Mac.

## Bộ cài làm gì?

- Tải bản ứng dụng có phiên bản cố định và Node.js 24.22.1 từ nguồn chính thức; kiểm tra SHA-256 trước khi chạy.
- Cài vào `%LOCALAPPDATA%\TDHRelay` trên Windows hoặc `~/Library/Application Support/TDHRelay` trên macOS.
- Khởi chạy relay trên `127.0.0.1:18455`, tự khởi chạy khi đăng nhập hệ điều hành.
- Sao lưu `config.toml`, đặt `openai_base_url` về relay và chọn provider `openai`.
- Tạm vô hiệu hóa các giá trị root `openai_base_url`, `model_provider`, `model_catalog_json` cũ bằng dòng lưu có đánh dấu.
- Khi gỡ, khôi phục những dòng đã quản lý và giữ chỉnh sửa khác. Nếu người dùng sửa vùng quản lý, lệnh gỡ dừng để tránh ghi đè.
- Giữ thư mục `data` và `backups` sau khi gỡ để có thể đối chiếu.

Không sửa `auth.json`, không nhập refresh token của Codex vào relay, không gửi token ChatGPT về domain phân phối. Token theo từng request chỉ đi từ Codex qua relay trên máy tới OpenAI. Codex tiếp tục sở hữu việc gia hạn đăng nhập.

Mỗi key có hạn dùng và số thiết bị tối đa. Máy nhận giấy phép có chữ ký Ed25519, tối đa 10 phút; khi đang dùng, relay gia hạn khi còn dưới 5 phút. Nếu server trả thông báo thu hồi, relay chặn yêu cầu tiếp theo. Nếu mất mạng, chỉ dùng đến hạn của giấy phép đã cấp. Không có chế độ hoạt động offline vô thời hạn.

Server cấp phép nhận mã thiết bị đã băm và khóa công khai thiết bị; không nhận token ChatGPT, email ChatGPT, prompt hoặc output. Windows bảo vệ khóa thiết bị bằng DPAPI theo tài khoản Windows; macOS/Linux dùng quyền file riêng của người dùng và ràng buộc mã máy.

Cài lại giữ dữ liệu kích hoạt. Khi đổi máy, xóa dữ liệu ứng dụng hoặc cài lại hệ điều hành, liên hệ quản trị viên để thu hồi/reset thiết bị cũ. API key của gói proxy là khái niệm riêng; không phải key kích hoạt và không phải token ChatGPT.

## Kiểm tra trạng thái

Windows:

```powershell
& "$env:LOCALAPPDATA\TDHRelay\runtime\node.exe" "$env:LOCALAPPDATA\TDHRelay\app\relay_product\cli.mjs" status
```

macOS:

```bash
"$HOME/Library/Application Support/TDHRelay/runtime/bin/node" \
  "$HOME/Library/Application Support/TDHRelay/app/relay_product/cli.mjs" status
```

`health` phải có `service: "tdh-relay"`, `mode: "desktop"` và policy `enforced: true`. Nhật ký chỉ ghi sự kiện vận hành; thống kê có trong SQLite, không lưu prompt hoặc token đăng nhập.

Cài lại bằng cùng lệnh để cập nhật phiên bản. Nếu Codex dùng profile tùy chỉnh hoặc cấu hình root nhiều dòng, bộ cài sẽ yêu cầu xử lý cấu hình rõ ràng thay vì đoán. Cấu hình thủ công:

```toml
openai_base_url = "http://127.0.0.1:18455/v1"
model_provider = "openai"
```

Đây là cấu hình user trong thư mục `CODEX_HOME`, không phải cấu hình project.

## Tài liệu

- [Tích hợp proxy/Sub2API](PROXY.md)
- [Kiến trúc, policy và quy trình phát hành](TECHNICAL.md)

Policy đang chạy được trong các ca đã kiểm thử. Chưa có phép đo A/B đủ để kết luận tiết kiệm quota hoặc chất lượng hội thoại dài tương đương hoàn toàn một relay khác. Thiếu usage upstream thì báo `unknown`, không suy diễn thành miễn phí.
