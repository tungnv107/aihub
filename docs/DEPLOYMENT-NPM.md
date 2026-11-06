# AIHub sau Nginx Proxy Manager

Domain: `aihub.tungnv.com`; Sub2API: `sub2api.tungnv.com`.

`deploy/aihub/compose.npm.yaml` sử dụng Sub2API đã có, không tạo database Sub2API khác. Docker network ngoài: `npm_proxy` và `sub2api-deploy_sub2api-network`. Database/Redis AIHub không publish port; web/worker không nhận bootstrap password. Chỉ service migration nhận mật khẩu bootstrap.

NPM Proxy Host cho AIHub: scheme `http`, hostname `aihub-ingress`, port **8080**, bật SSL/Force SSL theo domain. Host loopback để kiểm tra/SSH tunnel: `127.0.0.1:13000`. NPM chạy trong Docker phải dùng hostname nội bộ, không dùng `127.0.0.1` của container NPM. Sub2API giữ hostname `sub2api`, port **8080** trên `npm_proxy`; host loopback **18080**.

Ingress ghi đè `X-Real-IP`/`X-Forwarded-For` và giới hạn body 6 MB. Chỉ tin NPM tại `172.21.0.2`; nếu IP container thay đổi, cập nhật `set_real_ip_from` trong `nginx.npm.conf`. Không mở port 13000/18080 ra Internet. Database, Redis và worker không cần Proxy Host.

```sh
git pull --ff-only
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/src" -w /src node:24.22.1-bookworm node scripts/prepare-sub2api.mjs
docker compose --env-file deploy/aihub/.env -f deploy/aihub/compose.npm.yaml build web worker
docker compose --env-file deploy/aihub/.env -f deploy/aihub/compose.npm.yaml up -d
```

Nâng cấp instance Sub2API có sẵn bằng cách merge `deploy/sub2api/compose.upgrade.yaml` với compose hiện có sau khi backup DB/config/data. Build image `aihub-sub2api:production` từ `.reference/sub2api`, dùng `GOPROXY=https://proxy.golang.org,direct` và `GOSUMDB=sum.golang.org`. Giữ đúng secrets, JWT/TOTP, bind mounts và tên project cũ. Overlay bật chế độ license do quản trị cấp; người dùng không tự tạo/gia hạn key.

Lệnh nâng cấp instance hiện có trên server (file gateway env chỉ chứa shared secret, mode 0600):

```sh
cd /home/ubuntu/sub2api-deploy
docker compose --env-file .env --env-file aihub-gateway.env -f docker-compose.yml -f /home/ubuntu/aihub/deploy/sub2api/compose.upgrade.yaml up -d --no-deps --wait sub2api
```

Sau nâng cấp, dùng `scripts/connect-sub2api-production.mjs --connect-production` trên host để tạo authority user số dư 0 và scoped key `chrelay.licenses.write`, rồi recreate web/worker. Helper yêu cầu cam kết upstream đã được chủ hệ thống chấp nhận; không tự chấp nhận thay người vận hành. `scripts/verify-aihub-production.mjs --allow-test-grant` chạy kiểm chứng cấp/kích hoạt/thu hồi với grant 0 đồng, gói ẩn và giữ audit; không mô phỏng giao dịch ngân hàng.

Secret nằm trong env trên server, mode 0600; không commit. SMTP/SePay/OAuth phải có thông tin vận hành thực tế. Khi chưa có SMTP, tắt đăng ký; khi chưa có thông tin ngân hàng, giữ `PAYMENT_PROVIDER=disabled`. Cổng SMTP 587 dùng `SMTP_SECURE=false` và STARTTLS bắt buộc trong production; cổng 465 dùng `true`.

Backup định kỳ lưu cả hai DB và uploads tại `deploy/aihub/backups`, giữ 14 ngày. Lưu thêm bản mã hóa ngoài server và bộ secrets riêng. Nếu cần rollback Sub2API sau migration không tương thích, phục hồi bản dump vào DB tách biệt và dùng image rollback; không chạy binary cũ trực tiếp trên schema đã nâng cấp mà chưa xác minh.
