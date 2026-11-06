# Phát hành @tungnv107/aihub

Tài khoản npm đã chọn: `tungnv107`. Tên gói: **`@tungnv107/aihub`**. Lệnh chạy: **`aihub`**. Tên không có scope `aihub` thuộc nhà phát hành khác. Đã phát hành công khai bản **0.5.0** ngày 06/11/2026 và cài thử thành công từ registry. Domain đã ghim là `https://aihub.tungnv.com`; domain còn lỗi TLS tại lần kiểm tra sau publish.

## Đăng nhập an toàn

Trên npmjs, xác minh email và bật 2FA. Nếu đã gửi token qua chat, thu hồi token đó tại ảnh đại diện → Access Tokens → chọn token → Delete. Không gửi token mới, mật khẩu hoặc OTP trong chat. Có thể đăng nhập qua trình duyệt bằng:

```powershell
npm login
npm whoami
```

Kết quả `npm whoami` phải là `tungnv107`. Không lưu token vào source, `.env` của SaaS hoặc artifact npm.

## Bản kiểm thử local

Chạy từ thư mục gốc dự án:

```powershell
npm run build:npm:aihub
npm i -g ./dist/tungnv107-aihub-0.5.0.tgz
aihub
```

Bản này có `private: true`, chưa ghim máy chủ, sẽ hỏi URL rồi key. Stack local dùng `http://127.0.0.1:3000`. Đây không phải bản đã phát hành trên registry. Build mặc định `npm run build:npm` vẫn tạo `aihub-local` cho bộ kiểm thử nền.

## Build và phát hành bản tiếp theo

Domain đã chọn: `https://aihub.tungnv.com`. Phát hành npm và triển khai máy chủ là hai bước riêng; máy chủ cần TLS hợp lệ để khách kích hoạt.

```powershell
npm run build:npm:aihub -- --server https://aihub.tungnv.com --publish-ready
Set-Location dist/npm
npm pack --dry-run
npm publish --access public
```

`--publish-ready` chỉ tạo artifact, không gọi publish. Lệnh `npm publish` là thao tác phát hành thật và có thể yêu cầu xác thực 2FA. Bản 0.5.0 đã được phát hành theo ủy quyền rõ ràng của chủ tài khoản; không chạy lại để ghi đè version đó. Gói được tạo trong lần publish đầu tiên; không có bước đăng ký package trống riêng trên website.

Sau khi phát hành thành công:

```powershell
npm view @tungnv107/aihub version bin
npm i -g @tungnv107/aihub
aihub
```

Khách chỉ nhập key khi máy chủ đã ghim trong bản build. Không đặt key vào dòng lệnh shell. Mỗi bản phát hành mới phải tăng version, không ghi đè version đã tồn tại.

Để mở hướng dẫn cài trên website, chạy từ thư mục `web` sau khi registry có bản thật:

```powershell
node scripts/verify-release.mjs @tungnv107/aihub 0.5.0
```

Restart web sau khi xác minh. Production Compose dùng các biến `AIHUB_NPM_PACKAGE_NAME`, `AIHUB_NPM_PACKAGE_VERSION`, `AIHUB_NPM_RELEASE_VERIFIED` tương ứng; không bật cờ verified trước khi registry xác thực thành công.

Nguồn: [gói công khai có scope](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/), [thu hồi token](https://docs.npmjs.com/revoking-access-tokens/).
