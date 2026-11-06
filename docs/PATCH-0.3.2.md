# TDH Relay 0.3.2 — sửa lỗi request nén bị 413

Ngày 30/10/2026, khách báo local endpoint `127.0.0.1:18455/v1/responses` trả `413 Payload Too Large: compressed_request_rejected`.

## Nguyên nhân đã tái hiện

Desktop dùng chung mặc định `relay.max_body_bytes=2097152` (2 MiB) của proxy. `readBody` truyền giới hạn đó vào `maxOutputLength` của bộ giải nén. Request zstd nhỏ trên đường truyền có thể chứa lịch sử/ảnh lớn hơn 2 MiB sau giải nén; Node trả `ERR_BUFFER_TOO_LARGE`, code cũ ánh xạ thành 413 `compressed_request_rejected`.

Test hồi quy dùng JSON hơn 8 MiB nén zstd dưới 2 MiB đã thất bại trên code 0.3.1 với đúng mã lỗi khách báo. Không cần nội dung hội thoại thật để tái hiện. Không có bằng chứng lỗi này là do key, quota hoặc upstream; nhánh lỗi xảy ra trước lời gọi mô hình.

## Thay đổi

- Desktop mặc định **64 MiB** cho cả dữ liệu nhận và sau giải nén. SQLite cũ chưa có cấu hình riêng tự nhận mặc định khi mở bằng bản mới; giữ nguyên giá trị đã chủ động đặt.
- Proxy core vẫn giữ mặc định cũ. Triển khai `sub2api-test` được nâng runtime lên 64 MiB trong [hotfix cấu hình riêng](SUB2API-413-2026-10-30.md) sau đó. Không thay policy hoặc cắt input/history trong bản vá này.
- Vượt giới hạn sau giải nén: 413 `decompressed_request_too_large`, kèm `max_body_bytes`. Dữ liệu nén hỏng: 400 `compressed_request_rejected`. Encoding không hỗ trợ: 415.
- Health endpoint công bố `limits.requestBodyBytes`. Request bị chặn trước khi đọc model được ghi số liệu trạng thái/thời gian, không ghi body/token.
- Không thay lease, key, ngày kích hoạt, tài khoản ChatGPT hoặc luồng đi trực tiếp từ máy tới upstream.

## Kiểm chứng

- **328/328** test tự động qua; 19 test desktop.
- Test mới: nâng DB cũ và giữ cấu hình riêng; lịch sử zstd lớn; compaction có ảnh/tool output/Unicode; byte boundary cho identity, gzip, Brotli, deflate và zstd; phân biệt dữ liệu nén hỏng.
- Gói bundle đã ký xử lý nguyên vẹn request **9.020.049 byte** và trả `LARGE_BODY_OK`, dùng upstream tổng hợp trên loopback và license thật dành riêng cho kiểm thử. Kiểm tra toàn vẹn vẫn từ chối file bị sửa.
- Windows PowerShell 7.6.5: cài 0.3.1 rồi nâng lên 0.3.2, cài lại 0.3.2 và gỡ đều qua. Giữ activation ID/ngày hết hạn, không hỏi lại key; khôi phục config byte-for-byte, không đổi auth.json hoặc cấu hình Codex thật. Runtime có sẵn và autostart không được chạy lại trong bài hotfix này.
- Các kết quả build/bundle/Windows mới lưu tại `artifacts/product-0.3.2/`, không ghi đè bằng chứng lịch sử của 0.3.1. Key thử phải được thu hồi sau khi kiểm tra.

## Khách cập nhật

Trên chính máy đang lỗi, chạy lại bộ cài rồi đóng/mở lại Codex và gửi lại yêu cầu. Không cần gỡ trước:

    irm "https://codex.tudonghoa.me/setup.ps1" | iex

Kiểm tra:

    irm "http://127.0.0.1:18455/healthz" | ConvertTo-Json -Depth 6

Kết quả mặc định: `version=0.3.2`, `limits.requestBodyBytes=67108864`. Cập nhật server hoặc portal không tự thay gói đã cài trên máy khách. Giới hạn 64 MiB vẫn hữu hạn; request lớn hơn mức đó cần giảm kích thước, không được giải nén vô hạn.
