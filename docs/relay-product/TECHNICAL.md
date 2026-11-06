# Kiến thức đóng gói và phạm vi xác minh — tài liệu nội bộ

## Cấu trúc sản phẩm

- `self_relay/`: relay proxy, SQLite, auth, request shaping, accounting và policy engine.
- `relay_product/desktop.mjs`: listener loopback nhận token theo request, chuyển tiếp tới các endpoint Codex cố định.
- `relay_product/state.mjs`: cấu hình desktop và policy trong SQLite.
- `relay_product/config.mjs`: sao lưu và sửa có đánh dấu cấu hình Codex; gỡ không ghi đè thay đổi ngoài vùng quản lý.
- `relay_product/cli.mjs`: init, activate, license, start, stop, serve, sync, unsync, health, status.
- `license-server.mjs`, `license-admin.mjs`: cấp/thu hồi key, giới hạn máy; chỉ giữ trên máy quản trị/VPS.
- `license-client.mjs`, `device.ps1`: proof sở hữu khóa thiết bị, lease ký số, DPAPI trên Windows.
- `release-integrity.mjs`: xác minh chữ ký manifest và SHA-256 file trong bản phát hành.
- `relay_product/proxy-init.mjs`, `proxy-admin.mjs`: khởi tạo và quản lý tích hợp proxy.
- `relay_product/install/`: template bộ cài Windows/macOS.
- `relay_product/deploy/`: Dockerfile và Compose cho proxy.

Chế độ desktop nhận credential từ request; không đọc `auth.json`, không tự refresh token. HTTP 401 upstream được giữ để Codex xử lý đăng nhập. Chỉ cho phép loopback, kiểm tra Host, từ chối Origin từ trình duyệt và dùng token điều khiển riêng cho lệnh dừng.

Request gzip, deflate, Brotli và zstd được giải nén có giới hạn kích thước. WebSocket được trả 426 để client chuyển sang HTTP/SSE; không giả lập hỗ trợ WebSocket.

## Policy đã được đóng gói

Policy v7: 25 giới hạn, 33 template; 215 mẫu chuỗi mã hóa đã được khôi phục trong quá trình phân tích trước đó.

Revision thực thi:

`4287bfe46f9e4a0c8e40c0a61e7986d1bb46a4639788a79db163674d1affe79a`

Engine đã kiểm thử:

`e33bef7634f0d01b92eb9691d49f9eee140da6dea5c44cd89b1a93182013ec46`

Luồng xử lý: chụp policy revision tại đầu request → chuẩn bị prompt/schema/tool → gửi upstream → xử lý stream/continuation → loại bỏ padding → trả lại output cho client.

Engine chuyển sang Node có hai điều chỉnh runtime: hủy reader đang chờ ngay khi client ngắt và cung cấp `process.argv` rỗng cho nhánh retry. Mã do model trả về không được thực thi trong relay.

Những khác biệt có chủ đích:

- Chỉ chuẩn hóa metadata đã nhận diện; giữ UUID trong nội dung người dùng và tool result.
- Chỉ ghi usage thật quan sát từ upstream. Thiếu terminal usage thì `unknown`.
- Compaction đi qua riêng; adapter ngoài Codex không áp dụng engine này.
- Chỉ revision đã kiểm tra mới được bật `enforce`.

Không đóng gói private policy snapshot, khóa giải mã, watermark riêng, database tài khoản hay credential của môi trường thử nghiệm.

## Kết quả trước khi đóng gói sản phẩm

Relay proxy: 283/283 kiểm thử local; 20 kiểm thử trên Linux ARM64; kiểm tra lỗi/hủy/continuation; 5 luồng inference thật và 1 lần xác nhận sau bản sửa Node đều đạt. Đây là bằng chứng hoạt động, không phải bằng chứng tương đương quota.

Gói desktop bổ sung các kiểm thử listener, cấu hình cài/gỡ, credential forwarding và client Codex thật với upstream giả lập. Tách rõ:

- Client thật + upstream giả lập: kiểm tra giao thức client, không đo khả năng đăng nhập Plus thực.
- Upstream thật: kiểm tra request bằng tài khoản đã được chủ tài khoản cho phép.
- Windows cài/gỡ: thử trong thư mục và `CODEX_HOME` riêng.
- macOS: bộ cài có Intel/Apple Silicon; cần phân biệt kiểm tra cú pháp với kiểm tra LaunchAgent và GUI trên Mac thật.

Kết quả phát hành cụ thể nằm trong `manifest.json` và báo cáo kiểm thử của bản phát hành.

## Build và phát hành

Trong workspace phát triển:

```bash
node --test test/test_relay_product_20261030.mjs
node test/check_codex_product_client_20261030.mjs
python test/build_relay_product_20261030.py
```

Build bundle/minify bằng esbuild 0.25.12, làm rối bằng javascript-obfuscator 4.1.1; không có source map, source gốc hoặc công cụ phát hành key trong gói khách. Bốn entrypoint customer được đóng gói riêng; bỏ main tự chạy của module server dùng chung để tránh mở listener ngoài lớp license. Manifest được ký Ed25519 trên VPS qua SSH; private key không được tải về workspace. Node runtime ghim 24.22.1; checksum lấy từ SHASUMS256 của nodejs.org. Bộ cài trỏ tới release cố định và so SHA-256 trước khi thực thi.

Đổi version trước khi phát hành nội dung ứng dụng mới. Release có version là immutable; các URL `setup.ps1`, `setup.sh`, `manifest.json` là điểm cập nhật.

Domain cung cấp bộ cài/tài liệu và API cấp phép `/api/licenses/*`. Inference của desktop đi trực tiếp từ máy người dùng tới OpenAI; không đi qua domain phân phối.

Key sản phẩm là 192 bit ngẫu nhiên, server chỉ lưu SHA-256 trong database cấp phép; bản key xuất cho chủ sản phẩm được lưu file riêng có quyền hạn chế. Mỗi thiết bị tạo cặp Ed25519 riêng, dùng challenge ngẫu nhiên một lần, TTL 60 giây. Lease có chữ ký, gắn license/activation/device/public-key, TTL tối đa 10 phút và không vượt hạn hợp đồng. Hạn mức thiết bị được kiểm tra trong transaction SQLite. Thu hồi chặn lần gia hạn tiếp theo; lease đang cấp có hiệu lực tối đa đến hết TTL. Có kiểm tra lùi đồng hồ; không dựa vào việc giấu thuật toán chữ ký.

Chống crack là giảm khả năng sửa đổi và sao chép, không phải bảo đảm tuyệt đối. Người có toàn quyền máy có thể sửa client hoặc giả mã thiết bị; obfuscation và kiểm tra toàn vẹn tự kiểm tra vẫn có thể bị patch. Bản này không có native hardware attestation, Authenticode/Apple notarization hay policy hoàn toàn chạy trên server. Không dùng lời quảng cáo “không thể crack”. Bản thử 0.2.0 từng được phân phối ngắn hạn trước khi người dùng chọn thương mại; URL cũ bị rút, nhưng không thể thu hồi bản đã được ai đó tải trước đó.

## Nguồn chính thức đã đối chiếu ngày 30/10/2026

- https://developers.openai.com/codex/config-advanced — `openai_base_url` cho built-in OpenAI provider.
- https://developers.openai.com/codex/auth — Codex giữ và gia hạn phiên ChatGPT.
- https://nodejs.org/dist/v24.22.1/SHASUMS256.txt — checksum runtime.

Giới hạn còn lại: chưa có A/B dài hạn về quota/chất lượng; chưa bảo đảm mọi phiên bản Codex desktop trong tương lai giữ cùng giao thức; entitlement model do OpenAI và tài khoản quyết định.
