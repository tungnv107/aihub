# MASTER PROMPT – XÂY DỰNG WEBSITE AI CODING SAAS PLATFORM

**Website tham chiếu:** https://codexunlimit.tudonghoa.me/  
**Tên sản phẩm tạm thời:** AIFlow Hub (có thể cấu hình thay đổi)  
**Định vị:** Premium AI Coding Workspace & Subscription Management Platform

## I. VAI TRÒ VÀ MỤC TIÊU

Bạn là một Senior Full-Stack Architect, UI/UX Designer, SaaS Product Engineer và DevOps Engineer, có kinh nghiệm xây dựng nền tảng SaaS thương mại, hệ thống quản lý license, AI Developer Tools và các ứng dụng Next.js production-grade.

**Nhiệm vụ:** Phân tích, thiết kế và triển khai một website hoàn chỉnh, lấy cảm hứng về mô hình sản phẩm và tính năng từ:

**Website tham chiếu:** https://codexunlimit.tudonghoa.me/

Website mới phải có trải nghiệm tương tự về mô hình cung cấp dịch vụ, nhưng được thiết kế lại với giao diện hiện đại, chuyên nghiệp, có bản sắc riêng, đạt chất lượng thương mại thực tế.

### Mục tiêu chính

1. Xây dựng landing page chất lượng cao, có khả năng chuyển đổi khách truy cập thành khách hàng.
2. Cung cấp hệ thống đăng ký, đăng nhập và quản lý tài khoản.
3. Cung cấp hệ thống gói dịch vụ, đặt hàng và thanh toán.
4. Quản lý license key, thời hạn và số lượng thiết bị.
5. Cho phép khách hàng tự quản lý dịch vụ và lịch sử sử dụng.
6. Cung cấp tài liệu hướng dẫn, FAQ và trung tâm hỗ trợ.
7. Xây dựng Admin Dashboard quản lý toàn bộ hoạt động.
8. Thiết kế responsive hoàn chỉnh cho desktop, tablet và mobile.
9. Hỗ trợ Dark Mode và Light Mode, ưu tiên Dark Mode.
10. Có kiến trúc phù hợp để phát triển hệ sinh thái AI Coding trong tương lai.

**Nguyên tắc:** Không sao chép trái phép logo, thương hiệu, tài nguyên đồ họa hay mã nguồn của website tham chiếu. Không tuyên bố xóa bỏ hạn mức của nhà cung cấp AI hoặc giảm quota bằng những cơ chế chưa được xác minh. Mọi tính năng tích hợp AI phải sử dụng phương thức được nhà cung cấp cho phép.

---

## II. CÔNG NGHỆ SỬ DỤNG

### Frontend

- Next.js App Router, phiên bản stable tương thích.
- React và TypeScript strict mode.
- Tailwind CSS v4.
- shadcn/ui và Radix UI.
- Motion for React cho animation.
- Lucide Icons.
- TanStack Table.
- Recharts cho biểu đồ.
- React Hook Form kết hợp Zod.
- next-themes cho Dark/Light Mode.
- next-intl cho đa ngôn ngữ.
- Zustand nếu thật sự cần global client state.

### Backend

- Next.js Route Handlers và Server Actions khi phù hợp.
- PostgreSQL.
- Prisma ORM.
- Redis cho cache và rate limiting.
- BullMQ cho background job.
- Auth.js hoặc hệ thống authentication tương đương được bảo trì tốt.
- SMTP/Resend-compatible email service.
- REST API với tài liệu OpenAPI.
- Pino cho structured logging.

### DevOps

- Docker và Docker Compose.
- Docker multi-stage build.
- Nginx reverse proxy hoặc cấu hình tương đương.
- HTTPS cho môi trường production.
- GitHub Actions CI/CD.
- Environment variables.
- Database migrations.
- Automated backups.
- Health check endpoints.

Không thêm các dependency không cần thiết. Ưu tiên kiến trúc module hóa, dễ bảo trì và có thể mở rộng.

---

## III. THIẾT KẾ UI/UX – PREMIUM AI SAAS

### 1. Định hướng thiết kế

Website phải tạo cảm giác của một nền tảng AI Developer Tools cao cấp, tương tự mức độ hoàn thiện của các sản phẩm Linear, Vercel, Raycast và các SaaS dashboard hiện đại.

Phong cách:

- Premium SaaS.
- Modern Developer Platform.
- Elegant Dark UI.
- Clean Dashboard.
- Minimal but Sophisticated.
- Bento Grid.
- Glassmorphism có kiểm soát.
- Subtle Gradient.
- Micro-interactions.
- Smooth Motion.
- Data-rich Dashboard.

Không xây dựng giao diện theo kiểu template Bootstrap thông thường.

Không sử dụng quá nhiều card giống nhau, hiệu ứng glow chói mắt hoặc khoảng trắng thiếu chủ đích.

### 2. Design System

**Dark Mode – mặc định**

| Thành phần | Màu |
|---|---|
| Background chính | `#080B14` |
| Surface | `#101625` |
| Surface elevated | `#171F31` |
| Primary | `#6366F1` |
| Secondary | `#22D3EE` |
| Accent | `#8B5CF6` |
| Text primary | `#F8FAFC` |
| Text secondary | `#94A3B8` |
| Border | `#263247` |
| Success | `#10B981` |
| Warning | `#F59E0B` |
| Danger | `#EF4444` |

**Light Mode**

- Background: `#F8FAFC`
- Surface: `#FFFFFF`
- Primary text: `#0F172A`
- Muted text: `#64748B`
- Border: `#E2E8F0`
- Giữ màu nhận diện Indigo/Cyan nhưng điều chỉnh tương phản.

Hỗ trợ CSS design tokens để dễ dàng thay đổi branding toàn hệ thống.

### 3. Typography

Sử dụng:

- Be Vietnam Pro hoặc Inter cho giao diện.
- JetBrains Mono cho code, lệnh terminal, license key và dữ liệu kỹ thuật.

Thiết lập font scale thống nhất, line-height dễ đọc và responsive typography.

### 4. Component Style

- Border radius khoảng 12–20px.
- Shadow nhẹ, có chiều sâu.
- Button có hover, focus, loading và disabled states.
- Gradient border chỉ sử dụng cho các thành phần nổi bật.
- Badge trạng thái rõ ràng.
- Tooltip, dropdown, modal, drawer chuyên nghiệp.
- Skeleton loading thay vì spinner toàn trang.
- Empty states có nội dung hướng dẫn.
- Toast notifications thống nhất.
- Bảo đảm độ tương phản và khả năng truy cập bàn phím.

### 5. Responsive

**Desktop từ 1280px:**
- Full navigation.
- Dashboard sidebar có thể thu gọn.
- Bố cục đa cột.
- Tận dụng không gian dữ liệu hiệu quả.

**Tablet:**
- Sidebar collapsible.
- Grid tự điều chỉnh.
- Table hỗ trợ cuộn ngang khi cần.

**Mobile:**
- Navigation chuyển thành menu drawer.
- Không để menu trải ngang màn hình.
- Card được tối ưu chiều rộng.
- Form và button dễ thao tác bằng cảm ứng.
- Dashboard có bố cục riêng phù hợp màn hình nhỏ.
- Biểu đồ và bảng hiển thị dữ liệu dễ đọc.
- Không xuất hiện horizontal overflow ngoài các vùng cuộn có chủ đích.

---

## IV. LANDING PAGE

**Route:** `/`

Thiết kế landing page hoàn chỉnh, gồm các khu vực sau.

### 1. Header / Navigation

Logo bên trái.

Menu:
- Trang chủ
- Tính năng
- Bảng giá
- Hướng dẫn
- Trung tâm hỗ trợ
- Liên hệ

Bên phải:
- Chuyển Dark/Light Mode
- Chọn ngôn ngữ VI/EN
- Đăng nhập
- Bắt đầu ngay

Header sticky, có hiệu ứng nền khi cuộn nhưng không che nội dung.

### 2. Hero Section

Hero phải gây ấn tượng ngay trong màn hình đầu tiên.

Bố cục desktop hai cột:
- Bên trái: headline, description, CTA.
- Bên phải: dashboard preview có chiều sâu, có thể dùng layered mockup.

Headline tham khảo:

**Your AI Coding Workspace. Beautifully Organized.**

Subheading:

> Quản lý dịch vụ, theo dõi mức sử dụng và tối ưu quy trình phát triển phần mềm trong một không gian làm việc thống nhất.

CTA:
- Khám phá nền tảng
- Xem bảng giá

Bổ sung:
- Subtle animated grid.
- Gradient ambient glow.
- Terminal preview.
- Dashboard usage chart.
- Floating interface elements.

Animation phải tinh tế, không gây chậm website.

### 3. Product Preview

Hiển thị giao diện dashboard thực tế của hệ thống.

Các thành phần:
- Account overview.
- License status.
- Subscription.
- Usage metrics.
- Device management.
- Recent activity.
- Usage history chart.

Preview phải sử dụng component của chính sản phẩm, tránh minh họa không liên quan.

### 4. Features Section

Sử dụng Bento Grid với sáu nhóm tính năng:

1. Quản lý license và thiết bị.
2. Theo dõi hạn mức và mức sử dụng AI.
3. Không gian quản lý tập trung.
4. Báo cáo, phân tích hoạt động.
5. Cài đặt, hướng dẫn và hỗ trợ.
6. Bảo mật và quyền kiểm soát tài khoản.

Mỗi tính năng có:
- Icon.
- Tiêu đề.
- Mô tả.
- Minh họa UI nhỏ.
- Hover animation.

### 5. How It Works

Quy trình ba bước:

**01 – Chọn gói dịch vụ**

Xem thông tin, thời hạn và số lượng thiết bị.

**02 – Kích hoạt dịch vụ**

Thanh toán, nhận license key và kích hoạt trên phần mềm được hỗ trợ.

**03 – Quản lý và sử dụng**

Theo dõi trạng thái, thiết bị, thời hạn và dữ liệu mức sử dụng có sẵn.

Thiết kế stepper hoặc timeline đẹp, dễ hiểu.

### 6. Pricing Preview

Hiển thị các gói được quản lý từ cơ sở dữ liệu.

Không hardcode giá, thời hạn hoặc giới hạn thiết bị.

Các card thể hiện:
- Tên gói.
- Giá.
- Thời hạn.
- Số lượng thiết bị.
- Tính năng được hỗ trợ.
- Trạng thái đang bán.
- CTA đăng ký.

Có tùy chọn đánh dấu gói nổi bật.

### 7. Product Demo

Khu vực demo dashboard tương tác, có thể:
- Chuyển giữa các tab.
- Xem sample usage chart.
- Xem trạng thái thiết bị.
- Thử Dark/Light Mode.

Dữ liệu demo phải được gắn nhãn là dữ liệu minh họa.

### 8. Testimonials

Thiết kế card đánh giá khách hàng.

Không tạo đánh giá hoặc danh tính giả rồi trình bày như khách hàng thật.

Nếu chưa có đánh giá thật, hiển thị placeholder trong môi trường development và ẩn section ở production.

### 9. FAQ

Accordion với các câu hỏi:
- Dịch vụ hoạt động thế nào?
- Có cần tài khoản AI riêng không?
- Khi nào thời hạn bắt đầu?
- License có thể dùng trên bao nhiêu thiết bị?
- Làm thế nào để chuyển thiết bị?
- Có thể gia hạn dịch vụ không?
- Xử lý lỗi kích hoạt như thế nào?
- Có chính sách hỗ trợ và hoàn tiền không?

### 10. Footer

Footer nhiều cột:
- Sản phẩm.
- Tài liệu.
- Hỗ trợ.
- Pháp lý.
- Liên hệ.

Có bản quyền, chính sách quyền riêng tư và điều khoản sử dụng.

---

## V. HỆ THỐNG BẢNG GIÁ VÀ THANH TOÁN

Routes:
- `/pricing`
- `/checkout`
- `/orders/[id]`
- `/payment/success`
- `/payment/failed`

### Quản lý gói

Mỗi gói chứa:
- ID.
- Tên.
- Slug.
- Mô tả.
- Giá hiện tại.
- Giá gốc nếu có.
- Thời hạn theo ngày.
- Giới hạn thiết bị.
- Danh sách quyền lợi.
- Trạng thái.
- Thứ tự hiển thị.
- Recommended flag.

### Checkout

Khách hàng có thể:
1. Chọn gói.
2. Nhập thông tin.
3. Xác nhận đơn hàng.
4. Nhận mã đơn.
5. Thanh toán.
6. Kiểm tra trạng thái.
7. Nhận license key khi thanh toán được xác thực.

Tích hợp thanh toán theo kiến trúc provider adapter, ưu tiên VietQR và nhà cung cấp webhook như SePay hoặc API thanh toán hợp lệ khác.

Yêu cầu kỹ thuật:
- Không xác nhận thanh toán chỉ từ việc khách truy cập trang thành công.
- Chỉ xử lý thông báo thanh toán đã được xác thực.
- Webhook idempotent.
- Chống cấp license trùng.
- Đối soát đúng số tiền và mã đơn.
- Có trạng thái pending, paid, expired, cancelled, failed, refunded.
- Có cơ chế đối soát thủ công và audit log.
- Không lưu mật khẩu ngân hàng hoặc bí mật thanh toán phía client.

Thời hạn license chỉ bắt đầu khi có sự kiện kích hoạt thành công từ thành phần phần mềm được ủy quyền, nếu áp dụng chính sách kích hoạt lần đầu.

---

## VI. CUSTOMER PORTAL

**Base route:** `/dashboard`

### 1. Dashboard Overview

Hiển thị:
- Tổng số license.
- License đang hoạt động.
- Số thiết bị đã kích hoạt.
- Gói hiện tại.
- Thời hạn còn lại.
- Hoạt động gần đây.
- Thống kê mức sử dụng khi có dữ liệu thực.
- Các thông báo quan trọng.

Giao diện sử dụng KPI Cards, charts và recent activity.

### 2. License Management

**Route:** `/dashboard/licenses`

Tính năng:
- Xem danh sách license.
- Trạng thái active, pending, expired, revoked.
- Ngày kích hoạt.
- Ngày hết hạn.
- Số thiết bị tối đa.
- Số thiết bị đã kích hoạt.
- Gia hạn theo đơn hàng.
- Sao chép key sau khi xác thực quyền truy cập.
- Xem lịch sử kích hoạt.

Không lưu license key nguyên văn trong log.

### 3. Device Management

**Route:** `/dashboard/devices`

Hiển thị:
- Tên thiết bị.
- Hệ điều hành.
- Device ID dạng rút gọn.
- Thời gian kích hoạt.
- Last seen.
- Trạng thái.

Cho phép:
- Đặt tên thiết bị.
- Thu hồi thiết bị theo chính sách.
- Xác nhận lại khi thực hiện hành động nhạy cảm.

Chống thu hồi và kích hoạt liên tục nhằm vượt giới hạn thiết bị.

### 4. Usage Analytics

**Route:** `/dashboard/usage`

Dữ liệu:
- Tổng request.
- Request thành công/thất bại.
- Thống kê theo ngày.
- Thống kê theo dịch vụ/model nếu API hợp lệ cung cấp.
- Quota sử dụng và thời điểm reset khi có nguồn dữ liệu xác thực.
- Lịch sử cập nhật dữ liệu.

Biểu đồ:
- Line chart.
- Bar chart.
- Usage progress.
- Time range selector.

Không suy đoán hoặc tự tạo số liệu quota.

Nếu không có API hợp lệ để đọc quota, hiển thị trạng thái "Chưa có dữ liệu" và hướng dẫn kết nối nguồn dữ liệu được hỗ trợ.

### 5. Billing

**Route:** `/dashboard/billing`

- Lịch sử đơn hàng.
- Trạng thái thanh toán.
- Chi tiết hóa đơn.
- Gia hạn.
- Tải chứng từ khi có dữ liệu thực.
- Theo dõi yêu cầu hoàn tiền.

### 6. Profile & Security

**Route:** `/dashboard/settings`

- Thông tin tài khoản.
- Đổi mật khẩu.
- Email verification.
- Quản lý phiên đăng nhập.
- Đăng xuất khỏi thiết bị.
- 2FA nếu được triển khai.
- Theme settings.
- Language settings.
- Notification preferences.

---

## VII. TRUNG TÂM HƯỚNG DẪN

Routes:
- `/docs`
- `/docs/[slug]`
- `/help`
- `/help/[slug]`

Thiết kế tương tự Developer Documentation cao cấp.

### Giao diện

Desktop:
- Sidebar navigation bên trái.
- Nội dung chính.
- Table of Contents bên phải.

Mobile:
- Drawer danh mục.
- Tìm kiếm.
- Nội dung full-width.

### Chức năng

- Tìm kiếm tài liệu.
- Phân loại theo nhóm.
- Hướng dẫn cài đặt Windows/macOS.
- Hướng dẫn kích hoạt.
- Hướng dẫn quản lý thiết bị.
- Cách xử lý lỗi.
- FAQ.
- Sao chép code block.
- Tab chọn hệ điều hành.
- Callout thông tin/cảnh báo.
- Anchor link cho từng heading.
- Đánh giá tài liệu hữu ích hay không.

Admin có thể quản lý nội dung hướng dẫn bằng Markdown hoặc MDX an toàn.

Lệnh cài đặt chỉ được hiển thị khi có phần mềm thực tế đã được phát hành và xác thực. Không tự bịa lệnh npm hoặc đường dẫn tải.

---

## VIII. SUPPORT CENTER

Routes:
- `/support`
- `/support/new`
- `/support/tickets/[id]`

Chức năng:
- Tạo ticket.
- Chọn loại vấn đề.
- Nhập mô tả.
- Đính kèm ảnh/file với kiểm soát định dạng, dung lượng và quyền truy cập.
- Theo dõi trạng thái.
- Trao đổi với nhân viên hỗ trợ.
- Gửi thông báo email.
- Đóng và mở lại ticket theo chính sách.

Trạng thái:
- Open.
- In Progress.
- Waiting for Customer.
- Resolved.
- Closed.

Thiết kế giao diện hỗ trợ theo dạng inbox chuyên nghiệp.

---

## IX. ADMIN DASHBOARD

**Base route:** `/admin`

Chỉ tài khoản được phân quyền mới truy cập.

### 1. Admin Overview

Hiển thị:
- Tổng khách hàng.
- Doanh thu.
- Đơn hàng.
- License active.
- License expired.
- Ticket chưa xử lý.
- Doanh thu theo thời gian.
- Phân bố gói dịch vụ.

Bổ sung:
- Revenue chart.
- Order status chart.
- Recent customers.
- Recent transactions.
- System alerts.

### 2. User Management

- Danh sách khách hàng.
- Tìm kiếm, lọc và phân trang.
- Chi tiết tài khoản.
- Khóa/mở khóa.
- Phân quyền.
- Xem đơn hàng và license thuộc quyền quản trị.
- Lịch sử thao tác.

### 3. Product & Pricing

- CRUD gói dịch vụ.
- Thay đổi giá.
- Thời hạn.
- Số thiết bị.
- Trạng thái bán.
- Đánh dấu nổi bật.
- Sắp xếp.
- Lịch sử thay đổi giá.

### 4. Order Management

- Danh sách đơn hàng.
- Chi tiết đơn.
- Trạng thái.
- Thông tin đối soát.
- Thanh toán thủ công có kiểm tra quyền.
- Hủy đơn.
- Hoàn tiền theo quy trình phê duyệt.
- Xuất CSV.

### 5. License Management

- Tạo và cấp license.
- Kiểm tra trạng thái.
- Thu hồi.
- Gia hạn.
- Quản lý thiết bị.
- Lịch sử kích hoạt.
- Audit log.
- Chặn sử dụng vượt quá chính sách.

### 6. Support Management

- Danh sách ticket.
- Phân công.
- Trả lời.
- Thay đổi trạng thái.
- Bộ lọc ưu tiên.
- Thống kê thời gian phản hồi.

### 7. Content Management

- Landing page content.
- FAQ.
- Documentation.
- Announcements.
- Testimonials đã được xác minh.
- SEO metadata.

### 8. System Settings

- Logo và favicon.
- Website name.
- Domain.
- Email configuration.
- Payment provider configuration.
- Notification settings.
- Feature flags.
- Maintenance mode.
- Audit logs.

Không hiển thị secrets nguyên văn trong giao diện admin.

---

## X. LICENSE ACTIVATION API

Thiết kế API cho một ứng dụng client được phát triển riêng và có quyền tích hợp hợp lệ.

Ví dụ:

- `POST /api/v1/licenses/activate`
- `POST /api/v1/licenses/validate`
- `POST /api/v1/licenses/deactivate`
- `GET /api/v1/licenses/status`
- `POST /api/v1/devices/heartbeat`

Yêu cầu:
- Key được tạo bằng CSPRNG.
- Lưu hash/HMAC thích hợp cho việc xác thực key.
- Không ghi key nguyên văn trong log.
- Giới hạn số thiết bị bằng transaction an toàn.
- Chống race condition.
- Rate limiting.
- Chống replay.
- Device ID dạng pseudonymous.
- Giới hạn quyền truy cập.
- Có khả năng thu hồi key.
- Ghi nhật ký an toàn.
- Trả mã lỗi nhất quán.

Định nghĩa rõ hợp đồng API, trạng thái kích hoạt và cơ chế xử lý trường hợp mất mạng.

Website không tự ý truy cập thông tin đăng nhập ChatGPT hoặc đọc token trên máy người dùng.

Không triển khai các cơ chế nhằm né tránh quota, vượt rate limit, can thiệp trái phép vào phiên xác thực hoặc phá vỡ hạn chế của nhà cung cấp.

Nếu phát triển ứng dụng kết nối AI riêng, phải dựa trên API/SDK chính thức hoặc cơ chế tích hợp có quyền sử dụng và tài liệu xác thực.

---

## XI. DATABASE DESIGN

Thiết kế PostgreSQL schema chuẩn hóa với Prisma migrations.

Các nhóm bảng tối thiểu:

**Identity**
- users
- accounts
- sessions
- verification_tokens
- roles
- user_roles

**Commerce**
- plans
- plan_features
- orders
- order_items
- payments
- payment_events
- subscriptions

**License**
- licenses
- license_activations
- devices
- license_events

**Analytics**
- usage_events
- usage_aggregates
- quota_snapshots

**Support**
- support_tickets
- support_messages
- support_attachments

**Content**
- documentation_categories
- documentation_articles
- faqs
- announcements
- testimonials

**System**
- system_settings
- audit_logs
- notifications
- background_jobs

Yêu cầu:
- Primary key và foreign key đầy đủ.
- Unique constraints đúng nghiệp vụ.
- Index cho các truy vấn thường xuyên.
- CreatedAt/UpdatedAt thích hợp.
- Pagination.
- Transaction cho các nghiệp vụ quan trọng.
- Không sử dụng cascade delete gây mất dữ liệu thanh toán.
- Có quy định retention và xóa dữ liệu cá nhân.

---

## XII. AUTHENTICATION VÀ SECURITY

### Authentication

- Email/password.
- Google OAuth khi đã cấu hình.
- Email verification.
- Password reset.
- Secure session management.
- Role-based Access Control.
- Tùy chọn 2FA.

### Security

- Password hashing bằng Argon2id hoặc thuật toán phù hợp.
- HttpOnly cookies.
- Secure cookies trên HTTPS.
- SameSite protection.
- CSRF protection khi phù hợp.
- Input validation.
- Output encoding.
- XSS prevention.
- SQL injection prevention.
- Rate limiting.
- Webhook signature verification.
- Security headers.
- Secret management.
- Audit log.
- Authorization kiểm tra trên server.
- Không lộ dữ liệu khách hàng giữa các tài khoản.
- Không chứa secret trong frontend bundle.

Tuân thủ các nguyên tắc OWASP ASVS phù hợp với ứng dụng.

---

## XIII. CHẤT LƯỢNG GIAO DIỆN

### Animation

Sử dụng animation có mục đích:
- Page transition.
- Card reveal.
- Hover interactions.
- Button feedback.
- Accordion.
- Modal transitions.
- Chart transitions.

Tôn trọng `prefers-reduced-motion`.

Không lạm dụng particle effects hoặc animation tốn tài nguyên.

### Accessibility

- WCAG 2.2 AA làm mục tiêu.
- Keyboard navigation.
- Focus visible.
- Semantic HTML.
- Accessible labels.
- Color contrast.
- Error messages rõ ràng.

### SEO

- SEO metadata riêng cho từng trang.
- Open Graph.
- Twitter cards.
- sitemap.xml.
- robots.txt.
- Canonical URLs.
- Structured data phù hợp.
- Server-side rendering cho trang marketing.

### Performance

Mục tiêu với trang public trong điều kiện kiểm thử phù hợp:
- Lighthouse Performance ≥ 90.
- Accessibility ≥ 90.
- Best Practices ≥ 90.
- SEO ≥ 90.
- LCP ≤ 2.5 giây tại percentile 75.
- CLS ≤ 0.1.
- INP ≤ 200ms.

Sử dụng code splitting, lazy loading, image optimization và cache hợp lý.

---

## XIV. CẤU TRÚC PROJECT

Tổ chức dự án theo các module rõ ràng, ví dụ:

```text
src/
  app/
    (marketing)/
    (auth)/
    (customer)/
    (admin)/
    api/
  components/
    ui/
    layout/
    marketing/
    dashboard/
    charts/
    forms/
  features/
    auth/
    billing/
    licensing/
    devices/
    analytics/
    support/
    documentation/
  lib/
    auth/
    db/
    security/
    payments/
    email/
    cache/
    validations/
  server/
    services/
    repositories/
  hooks/
  styles/
  types/
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
  unit/
  integration/
  e2e/
docs/
docker/
```

Giữ business logic tách biệt khỏi React components.

API và services phải có quy tắc validate, xử lý lỗi và authorization tập trung.

---

## XV. PHƯƠNG PHÁP TRIỂN KHAI

Thực hiện dự án thành các giai đoạn.

### Phase 1 – Research & Architecture

- Phân tích website tham chiếu.
- Xác định phạm vi website và các thành phần phần mềm bên ngoài.
- Xây dựng requirement specification.
- Thiết kế sitemap.
- Thiết kế database.
- Lập kiến trúc backend/frontend.
- Thiết kế design system.

### Phase 2 – UI/UX Foundation

- Typography.
- Color system.
- Theme engine.
- Global navigation.
- Shared components.
- Responsive layout.
- Landing page.
- Pricing page.

### Phase 3 – Authentication

- Database.
- Authentication.
- Registration.
- Login.
- Verification.
- Forgot password.
- RBAC.

### Phase 4 – Commerce

- Plans.
- Checkout.
- Orders.
- Payments.
- Webhook.
- Email.
- License provisioning.

### Phase 5 – Customer Portal

- Dashboard.
- Licenses.
- Devices.
- Billing.
- Usage.
- Settings.

### Phase 6 – Documentation & Support

- Docs.
- Search.
- FAQ.
- Ticket system.
- Admin responses.

### Phase 7 – Admin

- Dashboard.
- Users.
- Plans.
- Orders.
- Licenses.
- Support.
- CMS.
- System settings.

### Phase 8 – Integration & Security

- License API.
- Integrations.
- Rate limiting.
- Audit logs.
- Security hardening.

### Phase 9 – QA & Deployment

- Unit tests.
- Integration tests.
- End-to-end tests.
- Responsive tests.
- Accessibility testing.
- Performance testing.
- Dockerization.
- CI/CD.
- Production deployment instructions.

---

## XVI. QUY ĐỊNH BẮT BUỘC KHI CODING

1. Không chỉ tạo giao diện mẫu. Phải xây dựng các luồng nghiệp vụ thực tế.
2. Không dùng dữ liệu giả trong production dashboard.
3. Không hardcode bảng giá, tài khoản admin hoặc license.
4. Không tạo nút bấm không có chức năng.
5. Không bỏ qua validation hoặc authorization.
6. Không tự tuyên bố đã kiểm thử nếu chưa chạy test.
7. Không làm hỏng module đã hoàn thành khi triển khai module mới.
8. Mọi migration phải có thể chạy trên database sạch.
9. Mọi chức năng quan trọng phải có error handling.
10. Mọi secret phải được cấu hình qua environment variables hoặc secret manager.
11. Các tích hợp bên ngoài chưa có credentials phải dùng provider interface rõ ràng, có sandbox/mock chỉ dành cho development.
12. Không giả mạo trạng thái thanh toán hoặc kích hoạt ở production.
13. Không triển khai cơ chế thay đổi, vượt hoặc che giấu hạn mức của dịch vụ AI bên thứ ba.
14. Không copy nguyên bản thương hiệu và nội dung độc quyền từ website tham chiếu.
15. Không đánh dấu hoàn thành task trước khi triển khai và kiểm thử thành công.

---

## XVII. TÀI LIỆU PHẢI TẠO

Trong thư mục `/docs`, tạo:

- `PRODUCT_REQUIREMENTS.md`
- `SYSTEM_ARCHITECTURE.md`
- `DATABASE_DESIGN.md`
- `API_SPECIFICATION.md`
- `DESIGN_SYSTEM.md`
- `IMPLEMENTATION_PLAN.md`
- `TEST_PLAN.md`
- `SECURITY_CHECKLIST.md`
- `DEPLOYMENT_GUIDE.md`
- `ENVIRONMENT_VARIABLES.md`

Trong `IMPLEMENTATION_PLAN.md`, mỗi task phải có:
- ID.
- Mô tả.
- Mức ưu tiên.
- Phụ thuộc.
- Tiêu chí nghiệm thu.
- Trạng thái checkbox.
- Bằng chứng kiểm thử.

Sử dụng:

- `[ ]` Chưa thực hiện.
- `[x]` Đã triển khai, kiểm thử và đạt tiêu chí nghiệm thu.

---

## XVIII. YÊU CẦU KIỂM THỬ

Tối thiểu kiểm thử:

**Authentication**
- Đăng ký thành công.
- Email trùng.
- Sai mật khẩu.
- Password reset.
- Hết hạn phiên.
- Truy cập trái quyền.

**Checkout**
- Tạo đơn hợp lệ.
- Thông tin thiếu.
- Webhook hợp lệ.
- Webhook trùng.
- Sai số tiền.
- Sai chữ ký.
- Payment timeout.

**License**
- Kích hoạt thành công.
- Key không tồn tại.
- Key hết hạn.
- Key bị thu hồi.
- Vượt số thiết bị.
- Hai request kích hoạt đồng thời.
- Thu hồi thiết bị.
- Gia hạn.

**Admin**
- RBAC.
- CRUD.
- Pagination.
- Search.
- Audit log.

**UI**
- Desktop.
- Tablet.
- Mobile.
- Dark Mode.
- Light Mode.
- Keyboard navigation.
- Loading/empty/error states.

Phải chạy lint, typecheck, build và automated tests sau mỗi giai đoạn liên quan.

---

## XIX. DEPLOYMENT

Cung cấp:

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- Health check.
- Database migration command.
- Seed command.
- Production build command.
- Backup/restore instructions.
- Reverse proxy example.
- SSL/HTTPS deployment guide.

Có thể triển khai trên Ubuntu VPS hoặc OCI/EC2 với Docker Compose.

Không đưa mật khẩu hoặc API key thật vào source control.

---

## XX. KẾT QUẢ CUỐI CÙNG

Sản phẩm phải đạt các tiêu chí:

- Landing page cao cấp, hiện đại, khác biệt.
- Giao diện thống nhất.
- Responsive hoàn chỉnh.
- Dark/Light Mode.
- Authentication hoạt động.
- Customer Portal hoạt động.
- Admin Dashboard hoạt động.
- Quản lý đơn hàng và license thực tế.
- Thanh toán an toàn khi có provider được cấu hình.
- Documentation và Support Center hoạt động.
- Database migrations đầy đủ.
- API có validation và authorization.
- Docker deployment sẵn sàng.
- Test suite hoạt động.
- Không có lỗi TypeScript hoặc build.
- Có tài liệu hướng dẫn sử dụng và triển khai.

### CHỈ ĐẠO TRIỂN KHAI

Bắt đầu bằng việc khảo sát website tham chiếu, đánh giá những tính năng có thể xác minh và xác định các tính năng chỉ là đề xuất mở rộng.

Sau đó:

1. Tạo kiến trúc và đặc tả.
2. Lập Implementation Plan chi tiết.
3. Triển khai lần lượt từng giai đoạn.
4. Kiểm thử từng chức năng.
5. Cập nhật checkbox sau khi task đạt nghiệm thu.
6. Tiếp tục các task còn lại theo thứ tự phụ thuộc.
7. Sau mỗi giai đoạn, báo cáo phần hoàn thành, kết quả test và vấn đề tồn tại.

**Không dừng ở việc tạo mockup, landing page hoặc bộ tài liệu. Mục tiêu là một hệ thống SaaS hoàn chỉnh, có thể chạy thực tế.**

Ưu tiên chất lượng UI/UX, tính đúng đắn của nghiệp vụ, bảo mật, hiệu năng và khả năng mở rộng lâu dài.
