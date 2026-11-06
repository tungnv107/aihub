"use client";
import { Button } from "@/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="error-page">
      <p className="eyebrow">AIHUB</p>
      <h1>Dịch vụ tạm thời chưa sẵn sàng</h1>
      <p>Không thể tải dữ liệu lúc này. Vui lòng thử lại.</p>
      <Button onClick={reset}>Thử lại</Button>
    </main>
  );
}
