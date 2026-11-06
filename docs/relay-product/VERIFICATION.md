# Bàn giao TDH Relay 0.3.1 — ngày 30/10/2026

## Đã xác minh

- 15/15 kiểm thử desktop: cấu hình cài/gỡ, giữ credential, kiểm tra Host/Origin, zstd/gzip giới hạn, SSE thiếu Content-Type và phản hồi policy.
- 11/11 kiểm thử license: giới hạn máy, key hết hạn, chữ ký giả, phát lại challenge, copy activation, thu hồi, reset thiết bị, hết lease khi offline, lùi đồng hồ và DPAPI Windows.
- Gói customer đã bundle/làm rối: chưa kích hoạt không start; sửa file bị kiểm tra toàn vẹn từ chối. Bài thử integrity chạy trên 0.3.0; 0.3.1 giữ cùng cơ chế và có cài đặt/chạy thật thành công.
- Windows PowerShell 5.1: tải Node mới từ nguồn chính thức, xác minh checksum, tải app từ domain, nhập key qua stdin, tự khởi động bằng Startup VBS, cài lại và gỡ; khôi phục config byte-for-byte, giữ auth.json, không sửa cấu hình Codex thật của người dùng.
- Codex CLI 0.154.0 Windows thực, upstream giả lập: WebSocket 426 chuyển HTTP, request zstd, nhận câu trả lời đã bỏ padding. Các kết nối auth/MCP nền của client với token giả bị 401 như dự kiến; không phải kiểm tra đăng nhập Plus thật.
- Desktop inference tới upstream thật: nhận `TDH_DESKTOP_LIVE_OK`, policy enforce đúng revision.
- Gói proxy customer 0.3.1 trên Linux ARM64: chưa kích hoạt bị chặn; kích hoạt từ server thật; GET models và POST responses thật nhận `TDH_LICENSED_PROXY_OK`; thu hồi key, gia hạn bị từ chối, GET models tiếp theo trả 403.
- Probe proxy chỉ mượn access token từ bên đang sở hữu phiên, không sao chép refresh token. DB probe ở tmpfs đã được bỏ cùng container thử.
- Bốn key tạo để kiểm thử đã thu hồi. Các container Sub2API production và test không bị restart/thay cấu hình.

## Phạm vi chưa được chứng minh

- macOS: có script Intel/Apple Silicon, đã kiểm tra cú pháp; chưa kiểm tra cài/gỡ và LaunchAgent trên Mac thật.
- Chưa chạy giao diện Codex desktop thật bằng tài khoản người dùng sau cài. Đã kiểm tra client CLI thật, Windows installer thật và upstream thật theo các bài tách biệt.
- Chưa có A/B dài hạn để kết luận quota hoặc chất lượng tương đương tuyệt đối relay gốc.
- Chống sửa đổi không tuyệt đối: client và policy local vẫn có thể bị người kiểm soát máy phân tích/patch. Không có Authenticode, notarization hoặc hardware attestation.
- License cần server khi kích hoạt/gia hạn; inference desktop vẫn đi từ máy khách tới OpenAI. Khi không liên lạc server, chỉ dùng đến hết lease đã ký, tối đa 10 phút.

## Bằng chứng

Trong workspace: `test/ch-relay-evidence/product-20261030/`.
Các file chính: `windows-install.json`, `licensed-bundle.json`, `licensed-proxy-live.json`, `desktop-live.json`, `codex-client.json`, `public-release.json`, `final.json`.
`manifest.json` trên domain công bố trạng thái kiểm thử và checksum gói khách. ZIP owner gồm source/tài liệu và bằng chứng chọn lọc, không gồm signing private key, key kích hoạt hoặc credential ChatGPT.
