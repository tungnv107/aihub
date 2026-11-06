# Bí mật, phát hành và nguồn gốc

Repo chứa source/policy nội bộ. Giữ Private; không phát ZIP owner qua GitHub Pages hoặc release công khai.

Không lưu key kích hoạt đã cấp, signing/SSH private key, access/refresh token, .env thật, auth.json, SQLite live, DPAPI blob hay log hội thoại. .gitignore hỗ trợ nhưng vẫn phải xem staged diff trước commit.

license-config.mjs chỉ chứa public verification key. Fixture test dùng giá trị tổng hợp hoặc tạo khóa ngẫu nhiên tại runtime. Báo cáo chọn lọc giữ kết quả/metadata; stdout/stderr của bài test Codex đã được bỏ khỏi bản Git.

License dùng Ed25519, challenge một lần, ràng buộc thiết bị, giới hạn slot bằng transaction và lease ngắn hạn. Windows dùng DPAPI; macOS/Linux dùng quyền file và mã máy. Đây không phải hardware attestation hay bảo đảm không thể crack.

Engine policy-engine.generated.mjs và policy reference là kết quả phân tích artifact tham chiếu trong quá trình trước. Hash/revision và các điều chỉnh runtime nằm trong [TECHNICAL.md](relay-product/TECHNICAL.md). Không tự nhận toàn bộ engine là tác phẩm nguyên bản.

Chưa gán giấy phép nguồn mở cho toàn repo. Repo Private không tự xác lập quyền phân phối mã/asset bên thứ ba; cần xác minh quyền tương ứng trước khi phát hành source hoặc cấp lại quyền sử dụng.

Build dependencies esbuild 0.25.12 và javascript-obfuscator 4.1.1 được ghim trong lockfile. Node runtime tải riêng từ nguồn chính thức và kiểm tra checksum. Chưa có Authenticode/Apple notarization.
