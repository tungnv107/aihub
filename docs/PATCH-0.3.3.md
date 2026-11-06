# TDH Relay 0.3.3 — cài lại sau khi chuyển về Codex trực tiếp

Ngày 30/10/2026, người dùng xác nhận đã đưa cấu hình về dùng bình thường, sau đó cài lại 0.3.2 gặp `managed_configuration_changed_review_required`. Đây là lỗi trạng thái đồng bộ cấu hình, khác với lỗi giới hạn request 413.

## Nguyên nhân

SQLite vẫn lưu `codex_sync` từ lần cài trước. Khi chạy lại `sync`, code cũ gọi `restoreConfig` như bước xác thực và yêu cầu khối relay nguyên văn ở đầu file. Cấu hình trực tiếp đã bỏ khối này bị từ chối. Thay đổi thứ tự/định dạng tương đương cũng có thể bị từ chối. Nhánh rollback lại gọi `unsync` rồi `sync` với cùng trạng thái, làm thông báo lặp nhiều lần.

## Cách xử lý

- Nếu root đang là cấu hình trực tiếp (không có base URL/catalog/profile riêng; provider vắng mặt hoặc `openai`), lấy cấu hình hiện tại làm baseline mới, sao lưu rồi áp dụng relay. Gỡ sau đó trả về baseline này, không phục hồi provider cũ từ lần cài trước.
- Nếu còn comment của relay sau khi bỏ route, chỉ dọn metadata đã đối chiếu backup; giữ bản sao đầy đủ trước khi dọn. Không khôi phục provider cũ đã bị người dùng chủ động bỏ.
- Nếu route vẫn đúng relay nhưng vị trí, dấu nháy, khoảng trắng hoặc comment thay đổi, nhận biết giá trị tương đương và chuẩn hóa lại khối quản lý. Khi comment đã bị trình ghi TOML xóa, lấy các root line ban đầu từ backup kiểm tra SHA-256.
- Provider/endpoint khác, key lặp, profile hoạt động, marker ngoài root, backup sai hoặc đổi `CODEX_HOME` không được tự ghi đè.
- Đồng bộ config trước khi start. Rollback luôn thử stop độc lập, chỉ `unsync` nếu lần cài này đã sync thành công, và không lặp lại bước sync đã thất bại.

Không thay policy, license/device identity, ngày hết hạn, auth.json hay giới hạn desktop 64 MiB.

## Cập nhật

Đóng Codex, chạy lại lệnh này trong PowerShell rồi mở lại Codex:

```powershell
irm "https://codex.tudonghoa.me/setup.ps1" | iex
```

Không gỡ hoặc xóa dữ liệu cũ trước. Bộ cài phải hiện `Downloading TDH Relay 0.3.3...`. Nếu trạng thái vẫn xung đột thật, kiểm tra backup/config cục bộ; không xóa kiểm tra an toàn để ép nâng cấp.

## Kiểm chứng phát hành

Kết quả bản này được lưu riêng trong `artifacts/product-0.3.3/`; không thay báo cáo 0.3.1 hoặc 0.3.2. Kiểm thử hồi quy sử dụng cấu hình và credential tổng hợp. Kiểm thử Windows dùng CODEX_HOME fixture và key riêng, kiểm tra reset về direct, xung đột cần rollback, nâng cấp, cài lại và gỡ; đồng thời đối chiếu ngày hết hạn/activation, auth fixture và hash config Codex thật. macOS chỉ được kiểm tra cú pháp script; chưa có kiểm thử trên máy Mac thật.

- **341/341** test tự động qua, gồm 13 test phục hồi cấu hình mới. Lượt đầu có một lỗi fixture `fetch: bad port` do cổng loopback ngẫu nhiên; lượt toàn bộ sau thay đổi cuối cùng qua hết. Log cả hai lượt được giữ trong artifacts.
- Gói đã ký: reset về direct, sync lại, sync lần hai không sửa thêm, unsync trả đúng byte của config mới, giữ activation/ngày hết hạn và auth fixture. File helper bị sửa vẫn bị kiểm tra toàn vẹn từ chối. Bài này không gọi model.
- Windows PowerShell **7.6.5**: cài 0.3.2 → tạo xung đột provider để kiểm tra rollback về đúng binary/process cũ → đặt cấu hình direct → nâng 0.3.3 → cài lại → gỡ. Tất cả qua; không hỏi lại key; giữ hash config Codex thật. Dùng runtime có sẵn; không kiểm tra lại tải Node hoặc autostart trong hotfix này.
