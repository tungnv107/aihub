# AIHub design system

Giao diện dùng Be Vietnam Pro (400–700) và JetBrains Mono được lưu cùng ứng dụng. Dark mặc định, Light và VI/EN chọn tại thanh điều hướng; theme lưu bằng next-themes, locale bằng cookie SameSite Lax.

CSS nguồn: `web/src/app/globals.css`.

| Token | Dark | Light |
|---|---|---|
| Background | #080B14 | #F8FAFC |
| Surface | #101625 | #FFFFFF |
| Elevated | #171F31 | #F0F3FA |
| Text | #F8FAFC | #0F172A |
| Muted | #98A7BD | #52627B |
| Border | #263247 | #DFE5F0 |
| Primary | #6366F1 | #5559DF |
| Secondary | #22D3EE | #0E7490 |

Nút primary dùng nền #5559DB và chữ trắng; hover #4F52D5. Các điều chỉnh này đã được kiểm tra contrast bằng Axe ở cả hai theme.

Spacing 4/8/12/16/24/32/48; radius control 7–9px, panel 12–16px; headline responsive 35–54px; body 12–14px. Containers giới hạn 1248px, dashboard 1600px. Sidebar desktop 238px, thu gọn 78px, mobile dùng Radix Dialog focus trap và Escape. Table có vùng cuộn riêng.

Button có focus-visible, disabled, loading; modal xác nhận thao tác nhạy cảm; empty states hướng dẫn hành động; toast dùng Sonner. Biểu đồ Recharts dùng chung cho preview và dữ liệu thật. Motion tôn trọng prefers-reduced-motion. Preview luôn gắn nhãn minh họa; testimonial chỉ hiển thị bản có verified+published.

Thành phần nền theo mô hình shadcn (source-owned components) trong `components/ui.tsx`, xây trên Radix: Dialog, AlertDialog, Tooltip, Accordion, Tabs. Forms dùng RHF+Zod khi phù hợp; API xác thực lại toàn bộ input. Table dùng TanStack, không memo hóa bằng React Compiler vì API của thư viện có state riêng.
