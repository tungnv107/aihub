# AIHub — SaaS & local relay

## AIHub 0.5.0 + Sub2API

Bản tích hợp trong workspace bổ sung server Sub2API cấp API key có hạn và CLI `ch-relay` cài bằng npm. Key chỉ cấp quyền dùng relay; yêu cầu AI vẫn dùng tài khoản ChatGPT của khách. Xem [hướng dẫn dựng hệ thống](docs/SUB2API-SYSTEM.md) và [hướng dẫn cho khách](docs/CH-RELAY-NPM.md). Gói đã phát hành: [`@tungnv107/aihub@0.5.0`](https://www.npmjs.com/package/@tungnv107/aihub). Máy chủ dự kiến `https://aihub.tungnv.com` còn cần hoàn tất TLS và triển khai backend; chưa deploy VPS.

Bản **0.5.0** dùng thương hiệu và lệnh `aihub`. Package npm hỗ trợ tên `@tungnv107/aihub` thuộc tài khoản npm đã chọn; `aihub` không phải tên gói trống trên registry. Artifact đã phát hành: `dist/tungnv107-aihub-0.5.0.tgz`, ghim `https://aihub.tungnv.com`. Build staging `npm run build:npm:aihub` không ghim máy chủ; build mặc định vẫn tạo `aihub-local` cho kiểm thử nền. Khách cài bằng `npm i -g @tungnv107/aihub`, chạy `aihub`.

SaaS trong `web/`: Next.js, PostgreSQL/Prisma, Redis/BullMQ, email verification/reset, SePay webhook, cấp license Sub2API, giới hạn thiết bị, customer/admin portals, tài liệu và support. AI vẫn dùng tài khoản ChatGPT riêng của khách. Không mô phỏng quota trong dashboard thật.

- [Đăng ký và phát hành gói npm](docs/NPM-REGISTRATION.md)
- [Cài local / hướng dẫn VPS, backup và vận hành](docs/DEPLOYMENT_GUIDE.md)
- [Kiến trúc](docs/SYSTEM_ARCHITECTURE.md), [database](docs/DATABASE_DESIGN.md), [API](docs/API_SPECIFICATION.md), [design system](docs/DESIGN_SYSTEM.md)
- [Biến môi trường](docs/ENVIRONMENT_VARIABLES.md), [kiểm thử](docs/TEST_PLAN.md), [kế hoạch nghiệm thu](docs/IMPLEMENTATION_PLAN.md)
- [Kết quả kiểm chứng AIHub](docs/VERIFICATION-AIHUB.md)

Local hiện dùng website `http://127.0.0.1:3000`, Sub2API `http://127.0.0.1:18080`, Mailpit `http://127.0.0.1:18025`. Chạy website/worker trong hai terminal tại `web` bằng `npm run dev` và `npm run worker`. Secrets/admin bootstrap nằm trong `.env` được ignore; không commit hoặc chia sẻ.

Phần dưới là tài liệu bản TDH Relay gốc, dùng cơ chế license riêng.

Mã nguồn nội bộ của **TDH Relay 0.3.3**, gồm relay local cho Codex, relay OpenAI-compatible tích hợp Sub2API, server cấp phép và bộ cài Windows/macOS.

Bản 0.3.2 sửa lỗi local `413 compressed_request_rejected`: mặc định desktop nâng từ 2 MiB lên 64 MiB, kiểm tra kích thước sau giải nén và giữ nguyên lịch sử request. Khách chạy lại bộ cài để cập nhật; key và ngày kích hoạt không đổi. Xem [chẩn đoán 413](docs/TROUBLESHOOTING.md).

Bản 0.3.3 sửa lỗi cài lại sau khi người dùng đưa Codex về chế độ trực tiếp: lấy cấu hình hiện tại làm baseline mới, giữ key/đăng nhập, phục hồi định dạng tương đương và vẫn chặn xung đột provider thật. Xem [bản vá cấu hình](docs/PATCH-0.3.3.md).

Hotfix server ngày 30/10/2026 sửa stream bị treo bởi control frame trên `sub2api-test`; giữ timeout 120 giây và không yêu cầu khách cài lại desktop. Xem [báo cáo reconnect](docs/SUB2API-RECONNECT-2026-10-30.md).

**Giữ repository ở chế độ Private.** Source và policy trong repo dành cho chủ sản phẩm. Khách dùng bộ cài đã bundle, làm rối và ký manifest trên [codex.tudonghoa.me](https://codex.tudonghoa.me).

## Hai cách sử dụng

- **Codex desktop:** relay nghe ở 127.0.0.1:18455, nhận access token theo request từ Codex. Codex sở hữu phiên đăng nhập/refresh; relay không sửa auth.json.
- **Proxy/Sub2API:** relay quản lý pool tài khoản riêng và caller API key, chạy bằng Docker. Không dùng chung refresh token đang được Codex desktop gia hạn.

Key kích hoạt TDH Relay có hạn dùng, giới hạn số máy, gia hạn và thu hồi. Key sản phẩm tách biệt với ChatGPT login và API key của proxy. Xử lý relay diễn ra local; kích hoạt/gia hạn license cần server. Lease ký số có hiệu lực tối đa 10 phút.

## Cài và gỡ cho khách

Windows, PowerShell:

    # Cài — nhập key khi bộ cài hỏi
    irm "https://codex.tudonghoa.me/setup.ps1" | iex

    # Gỡ
    irm "https://codex.tudonghoa.me/setup.ps1?remove=1" | iex

macOS:

    # Cài — nhập key khi bộ cài hỏi
    curl -fsSL "https://codex.tudonghoa.me/setup.sh" | bash

    # Gỡ
    curl -fsSL "https://codex.tudonghoa.me/setup.sh?remove=1" | bash

Đóng/mở lại Codex và đăng nhập tài khoản ChatGPT của chính người dùng. macOS có bộ cài Intel/Apple Silicon nhưng **chưa kiểm thử trên máy Mac thật**.

## Tài liệu

- [Trang quản trị web: đăng nhập, cấp key, thiết bị và chẩn đoán](docs/ADMIN-WEB.md)

- [Cài đặt, cấu hình và gỡ desktop](docs/relay-product/README.md)
- [Tích hợp proxy/Sub2API](docs/relay-product/PROXY.md)
- [Cấp key, gia hạn, thu hồi và vận hành server license](docs/relay-product/LICENSE-ADMIN.md)
- [Kiến trúc, policy và giới hạn bảo vệ](docs/relay-product/TECHNICAL.md)
- [Phát triển và build bản phát hành](docs/DEVELOPMENT.md)
- [Chẩn đoán lỗi và khôi phục](docs/TROUBLESHOOTING.md)
- [Phạm vi kiểm thử đã hoàn thành](docs/relay-product/VERIFICATION.md)
- [Quản lý bí mật và nguồn gốc mã](docs/SECURITY-AND-PROVENANCE.md)

## Bắt đầu phát triển

Node.js **24.22.1**; Python **3.12+** cho công cụ build/deploy. Unit test dùng thư viện chuẩn Node, không cần key ChatGPT hoặc license thật:

    git clone https://github.com/datngo68/toolcodex.git
    cd toolcodex
    npm test

Cài dependency build đã ghim và tạo bundle chưa ký:

    npm ci --prefix test/relay-product-build-tools --ignore-scripts
    npm run bundle

Bundle chưa ký không phải bộ cài có thể chạy ngay. Xem [quy trình ký/phát hành](docs/DEVELOPMENT.md) để tạo release có manifest ký số bằng server riêng.

## Cấp key

Từ root repo, trên máy đã có quyền SSH tới VPS quản trị:

    .\relay_product\admin\Manage-Licenses.ps1 -Action issue -Label "Khach01" -Days 1 -MaxDevices 1

Lệnh lưu key vào file có ACL riêng trong %LOCALAPPDATA%\TDHRelayOwner\keys và chỉ in đường dẫn. Không commit hoặc gửi file này lên website. Hạn dùng tính từ lần kích hoạt thiết bị đầu tiên thành công.

Trên [trang quản trị](https://codex.tudonghoa.me/admin), có thể cấp 1–100 key/lần và tải CSV. Khách nhập key tại [trang khách hàng](https://codex.tudonghoa.me/portal) để xem thời hạn, thiết bị, thống kê từ báo cáo chủ động tải lên và hướng dẫn setup. Đăng nhập portal không bắt đầu tính ngày.

## Cấu trúc

    self_relay/                 Proxy core, protocol, SQLite, OAuth, policy engine
    relay_product/              Desktop client, license server/client, CLI
    relay_product/admin/        Admin web, portal khách hàng và công cụ SSH
    relay_product/install/      Template cài/gỡ Windows và macOS
    relay_product/deploy/       Dockerfile và Compose cho gói khách
    docs/                       Tài liệu vận hành, kiến trúc, chẩn đoán
    test/                       Test tự động và script build/deploy
    test/ch-relay-evidence/      Fixture và báo cáo chọn lọc, không có credential

Policy đã kiểm thử hoạt động trong các luồng ghi ở báo cáo. Chưa chứng minh tiết kiệm quota tương đương tuyệt đối relay tham chiếu. Chống crack ở mức hạn chế sao chép/sửa đổi; không cam kết không thể crack phần mềm chạy trên máy khách.
