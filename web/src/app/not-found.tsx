import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="error-page">
      <p className="eyebrow">404 · AIHUB</p>
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn có thể đã thay đổi hoặc nội dung chưa được xuất bản.</p>
      <Link className="button primary" href="/">
        Về trang chủ
      </Link>
    </main>
  );
}
