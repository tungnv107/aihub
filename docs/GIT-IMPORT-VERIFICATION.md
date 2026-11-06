# Kiểm tra khi tách repository

Ngày 30/10/2026, source TDH Relay được tách sang repository riêng datngo68/toolcodex. Không mang lịch sử hoặc source của ứng dụng signup đi kèm. Repository đích được kiểm tra là Private trước khi push.

Phạm vi gồm core relay, lớp desktop/license, installer, công cụ quản trị, script build/deploy, tài liệu, unit test và fixture/báo cáo chọn lọc. Không chứa key kích hoạt, signing private key, credential ChatGPT, database live, node_modules hay archive build.

Thay đổi để repo hoạt động độc lập: README và hướng dẫn phát triển/chẩn đoán; runner unit test; gitignore; fixture còn thiếu; build CLI nhận --node-path và --ssh-target thay vì buộc đường dẫn Node trên máy gốc.

Core relay và engine policy giữ nguyên từ bản đã kiểm thử. SHA-256 engine:

    e33bef7634f0d01b92eb9691d49f9eee140da6dea5c44cd89b1a93182013ec46

Kết quả kiểm tra trong repository độc lập ngày 30/10/2026:

- Bộ test tự động: **299/299 đạt**, không bài lỗi, bị hủy hoặc bỏ qua.
- Cài dependency build bằng npm ci với lockfile: thành công; npm audit tại thời điểm chạy báo 0 lỗ hổng.
- Tạo bundle chưa ký: thành công, gồm 4 entrypoint JavaScript và helper thiết bị; không tạo source map hoặc đóng gói công cụ phát hành key.
- Node kiểm tra cú pháp cả 4 entrypoint đã bundle: đạt.
- Scanner phạm vi Git: không phát hiện mẫu secret độ tin cậy cao, file bị cấm hoặc link Markdown nội bộ hỏng; Python parse thành công và hash engine không đổi. Đây là kiểm tra bổ sung, không phải chứng nhận bảo mật toàn bộ sản phẩm.
- CLI build nhận --help thành công trên checkout mới.

Lần kiểm tra này không ký release, thay đổi VPS hoặc tạo key khách. Các kết quả inference/cài-gỡ thực tế từ lần trước nằm trong [VERIFICATION.md](relay-product/VERIFICATION.md); không coi unit test hoặc bundle chưa ký là lần kiểm thử live mới.
