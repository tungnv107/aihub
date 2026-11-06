# Tích hợp TDH Relay với Sub2API

## Phân biệt hai chế độ

Gói desktop nhận access token của từng request từ Codex; không quản lý refresh token. Gói proxy quản lý một pool tài khoản riêng, mã hóa credential trong SQLite và cấp API key cho gateway.

Policy v7 được áp dụng cho adapter **codex**. Adapter **plan** và **api**, cùng luồng compaction, không đi qua engine thay đổi stream này.

## Khởi tạo một máy chủ mới

Tải và giải nén bản `tdh-relay.tar.gz` từ trang phân phối vào một thư mục riêng. Cần Docker Compose.

Từ thư mục vừa giải nén:

```bash
mkdir -p proxy-data
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD:/app" -w /app node:24.22.1-bookworm-slim \
  node relay_product/proxy-init.mjs --home proxy-data

# Nhập key ở terminal; không viết key trực tiếp vào lệnh hoặc lịch sử shell.
read -r -s -p "Key kich hoat TDH Relay: " tdh_key
printf '\n'
printf '%s\n' "$tdh_key" | docker run --rm -i --user "$(id -u):$(id -g)" \
  -v "$PWD:/app" -v /etc/machine-id:/run/tdh-machine-id:ro \
  -w /app node:24.22.1-bookworm-slim \
  node relay_product/cli.mjs activate --home proxy-data
unset tdh_key

TDH_UID="$(id -u)" TDH_GID="$(id -g)" \
  docker compose -f relay_product/deploy/compose.yaml up -d --build
```

SQLite là nguồn cấu hình runtime duy nhất. `proxy-data/secrets.env` chỉ chứa master key và hai khóa bootstrap; giữ file này cùng database khi sao lưu.

Máy Linux phải có `/etc/machine-id` ổn định. Cùng file này được mount vào container để kích hoạt và chạy; không dùng ID ngẫu nhiên của container. Không dùng lệnh `start` của desktop để chạy proxy. Compose chạy entrypoint `proxy-server.mjs`, kiểm tra giấy phép trước các request model/inference.

Địa chỉ host: `http://127.0.0.1:18320/v1`. Trong Docker network `tdh-relay`: `http://self-relay:8320/v1`.

## Đưa tài khoản riêng vào pool

Dùng một phiên đăng nhập Codex riêng cho máy chủ. Sau khi chuyển phiên này cho relay, dừng client đã tạo phiên đó để relay là bên duy nhất gia hạn refresh token.

Có thể tạo phiên riêng bằng Codex CLI với `CODEX_HOME` riêng:

```bash
CODEX_HOME="$PWD/proxy-login" codex login
```

Chọn đăng nhập ChatGPT. File đăng nhập phải được giữ ở máy bạn quản lý; không tải lên domain phân phối. Nếu dùng credential store hệ điều hành, tạo phiên riêng với cấu hình file trước khi đăng nhập.

Với Node.js 24.22.1 trên host:

```bash
node relay_product/proxy-admin.mjs import-codex \
  --home proxy-data --file proxy-login/auth.json \
  --label "Tai khoan proxy rieng" --exclusive-refresh-owner
```

Hoặc dùng container tạm trên cùng network:

```bash
docker run --rm --network tdh-relay --user "$(id -u):$(id -g)" \
  -v "$PWD:/app" -w /app node:24.22.1-bookworm-slim \
  node relay_product/proxy-admin.mjs import-codex \
  --home proxy-data --base-url http://self-relay:8320 \
  --file proxy-login/auth.json --exclusive-refresh-owner
```

Không dùng cách nhập refresh token này cho phiên Codex desktop bạn vẫn đang sử dụng. Gói desktop đã có chế độ chuyển tiếp token để tránh hai bên tranh quyền gia hạn.

## Cấu hình Sub2API

1. Kết nối container Sub2API vào network `tdh-relay` của máy chủ.
2. Tạo account/channel OpenAI kiểu **API Key**.
3. Base URL: `http://self-relay:8320/v1`.
4. Lấy caller key trên máy chủ bằng lệnh sau và nhập vào channel:

```bash
node relay_product/proxy-admin.mjs key --home proxy-data
```

Lệnh `key` chủ động in caller key để quản trị viên sao chép. Không đưa key vào tài liệu, URL hoặc lịch sử chia sẻ.

Nếu gateway yêu cầu HTTPS, đặt relay sau reverse proxy có TLS và chỉ expose các route inference cần thiết. Không publish `/admin/*` ra Internet.

Gateway phải cho phép địa chỉ nội bộ của relay trong cấu hình allowlist. Không tắt allowlist của các dịch vụ khác chỉ để tích hợp channel này.

### Giới hạn kích thước request

Đặt cùng một giới hạn ở gateway và relay để lịch sử hội thoại dài không bị chặn ở tầng kế tiếp. Cấu hình đang dùng trên `sub2api-test` là **64 MiB = 67108864 byte**:

```yaml
# Trong environment của service Sub2API
GATEWAY_MAX_BODY_SIZE: "67108864"
GATEWAY_TEXT_MAX_BODY_SIZE: "67108864"
```

Nếu đã đặt `SERVER_MAX_REQUEST_BODY_SIZE`, giá trị đó cũng phải ít nhất 67108864. Reverse proxy bên ngoài không được đặt giới hạn thấp hơn. Chỉ recreate service Sub2API tương ứng sau khi sửa environment; restart container không tự nạp environment mới từ Compose.

Ở relay, gửi `POST /admin/settings` qua địa chỉ nội bộ với **admin key của relay**, body:

```json
{"key":"relay.max_body_bytes","value":67108864}
```

Setting được lưu trong SQLite và có hiệu lực ngay. Đọc lại bằng `GET /admin/settings` để xác nhận. Không ghi admin key vào URL, lệnh chia sẻ hoặc log. API key dùng để gọi model không có quyền đổi setting.

Mặc định chung của proxy core vẫn là 2 MiB; bộ cài desktop 0.3.2 không tự đổi cấu hình proxy đã triển khai. Khi dựng proxy mới hoặc chuyển sang VPS khác, cấu hình cả hai tầng theo mục này. Không sửa file trong gói đã ký để thay runtime setting.

Giới hạn HTTP tính theo byte, không phải số token model. Nâng giới hạn không đảm bảo một hội thoại vượt context window sẽ được model chấp nhận. Xem [báo cáo sửa lỗi Sub2API 413](../SUB2API-413-2026-10-30.md) để tái kiểm tra và khôi phục cấu hình triển khai test.

## API và chẩn đoán

- `GET /v1/models`
- `POST /v1/responses`
- `POST /v1/responses/compact`
- `POST /v1/chat/completions`
- `GET /healthz`

Các route `/admin/*` dùng admin key riêng.

```bash
node relay_product/proxy-admin.mjs status --home proxy-data
```

Kiểm tra account là `codex`, trạng thái `ready`, policy `enforce`. Sau một request, đối chiếu usage row có `policy_mode`, `policy_revision`, `outcome` và số lần gọi upstream.

## Cập nhật và khôi phục

Sao lưu SQLite bằng cơ chế SQLite backup hoặc dừng container trước khi sao chép cả database/WAL; giữ `secrets.env` cùng bản sao. Thay ứng dụng bằng release có checksum và chữ ký đã xác minh, build và chạy lại. Không khôi phục database cũ sau khi refresh token đã xoay vòng mà chưa kiểm tra quyền sở hữu phiên.

Bản đang chạy ở `sub2api-test.tudonghoa.me` là triển khai riêng đã được cấu hình; không cần dựng lại chỉ để dùng bộ tài liệu này.
