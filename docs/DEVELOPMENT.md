# Phát triển và phát hành

## Môi trường và test

Cần Node.js 24.22.1; Python 3.12+ cho build/deploy; Docker Compose cho gói proxy. SSH tới VPS chỉ cần khi ký hoặc triển khai bản thật.

    npm test
    npm run test:desktop
    npm run test:license

Unit/integration test dùng dữ liệu tổng hợp và transport giả lập. Fixture tạo trong test/ được gitignore. Không tự chạy script vps_*, Windows installer smoke hoặc live probe như unit test: chúng có thể thay đổi VPS, tiêu thụ quota hoặc cần key riêng.

Báo cáo ngày 30/10/2026 trong test/ch-relay-evidence/product-20261030 giữ nguyên ý nghĩa lịch sử. Đường dẫn máy build trong báo cáo không phải cấu hình cho máy mới. Kết quả kiểm thử repo độc lập nằm trong [GIT-IMPORT-VERIFICATION.md](GIT-IMPORT-VERIFICATION.md).

## Bundle chưa ký

    npm ci --prefix test/relay-product-build-tools --ignore-scripts
    npm run bundle

Đầu ra dist/customer/ gồm bốn entrypoint đã bundle/làm rối và helper thiết bị. Không có source map hoặc công cụ phát hành key.

Dockerfile trong relay_product/deploy/ dùng **gói khách đã ký**, không dùng trực tiếp root source checkout. Nếu chỉ clone repo rồi build Dockerfile này sẽ thiếu release.signed.json.

## Build bản khách đã ký

1. Chạy test phù hợp; cập nhật version trong package.json, relay_product/state.mjs, script build và giới hạn version của script ký/publish. Không ghi đè nội dung một version đã phát hành.
2. Cài build dependencies. Kiểm tra license-config.mjs ghim public key đúng server. Không sao chép private signing key về repo.
3. Đối chiếu checksum runtime trong test/ch-relay-evidence/product-20261030/node-SHASUMS256.txt.
4. Đưa script ký đã kiểm tra lên /tmp/vps_sign_relay_release_20261030.py trên VPS. Script hiện giới hạn version 0.3.3; phải sửa giới hạn khi phát hành version mới.
5. Chạy:

    python test/build_relay_product_20261030.py --node-path node --ssh-target ubuntu@134.185.93.244

--node-path có thể là đường dẫn tuyệt đối nếu Node không ở PATH. --ssh-target là máy chủ được phép quản trị. Đây là flag build; runtime settings vẫn nằm trong SQLite.

`--report-dir` mặc định hiện là `artifacts/product-0.3.3`, không ghi đè báo cáo lịch sử. Với bản vá này, dùng `test/vps_publish_patch_033.py --phase stage`, kiểm tra gói ký và nâng cấp Windows từ 0.3.2 sau khi reset cấu hình về direct, rồi `--phase publish --verification <report>` mới đổi bộ cài/manifest. Bản cũ và các service đang chạy được giữ nguyên. Script publish của 0.3.2 giữ lại để tham chiếu lịch sử, không chạy lại cho release mới. Test bundle dùng key thử riêng và upstream tổng hợp trên loopback, không gửi hội thoại thử đến mô hình thật.

Build gửi manifest hash file qua SSH để VPS ký và nhận chữ ký; private key không rời VPS. Kết quả nằm trong test/relay-product-build-&lt;timestamp&gt;/. build.json ghi đường dẫn và SHA-256 archive.

## Triển khai

Các script vps_deploy_relay_license_20261030.py và vps_publish_licensed_relay_20261030.py chứa điều kiện tiên quyết, đường dẫn/domain của triển khai hiện tại. Đọc và điều chỉnh trước khi dùng trên server khác.

Script tạo license service lần đầu từ chối khi thư mục đích đã tồn tại. Không xóa database/key để ép chạy lại. Khi cập nhật server, sao lưu SQLite nhất quán và giữ signing key.

Sau publish, kiểm tra HTTPS, checksum, key sai/hết hạn, kích hoạt hợp lệ, inference, thu hồi key, cài/gỡ. Công bố trạng thái theo kết quả thực tế. Không đưa ZIP owner/source vào public.

## Cập nhật admin/portal 1.1.0

Không rebuild archive khách 0.3.1 để thay giao diện web. Chạy `python test/package_admin_20261030.py`, chuyển archive và `test/vps_update_portal_20261030.py` lên VPS. Chạy script với `--archive <file> --sha256 <hash> --check`, sau đó `--apply` thay cho `--check`. Đây là migration một lần từ schema 1.0.0; chạy lại trên DB đã có `duration_ms` sẽ bị từ chối. Xem [quy trình khôi phục](ADMIN-WEB.md).

Kiểm thử thêm: `node test/check_portal_browser_20261030.mjs` dùng database local tổng hợp. `node test/check_portal_live_20261030.mjs` cần quyền SSH quản trị VPS, tạo key smoke riêng 1 ngày, kiểm tra HTTPS/kích hoạt/báo cáo, rồi thu hồi và xóa file key. Không đọc mật khẩu owner hoặc key khách. Kết quả không in key, chỉ ghi chỉ số kiểm thử vào artifacts.

## Công cụ live của máy kiểm thử gốc

check_codex_product_client_20261030.mjs cần Codex CLI trên Windows. check_product_install_windows_20261030.ps1 dùng CODEX_HOME fixture và key test riêng. Một số đường dẫn trong script lịch sử còn trỏ tới máy gốc; đọc và chỉnh trước khi chạy nơi khác. npm test và npm run bundle không phụ thuộc các script live này.
