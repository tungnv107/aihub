export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api/v1/" + path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error?.code ?? "request_failed");
  return data as T;
}
export const money = (value: number, locale = "vi") =>
  new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
export const date = (value: string | Date | null | undefined, locale = "vi") =>
  value
    ? new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
export const jsonSafe = <T>(data: T) => JSON.parse(JSON.stringify(data));
const errors: Record<string, string> = {
  checkout_paused: "Mua gói đang tạm dừng. Vui lòng thử lại sau.",
  authentication_required: "Vui lòng đăng nhập.",
  account_unavailable: "Tài khoản chưa xác minh hoặc đã bị khóa.",
  invalid_input: "Kiểm tra lại thông tin đã nhập.",
  payment_not_configured: "Thanh toán chưa được cấu hình.",
  device_limit_reached: "Đã đạt giới hạn thiết bị.",
  device_change_cooldown: "Vui lòng chờ hết thời gian chuyển máy.",
  insufficient_permissions: "Bạn không có quyền thực hiện thao tác này.",
  service_unavailable: "Dịch vụ tạm thời chưa sẵn sàng. Vui lòng thử lại.",
  too_many_requests: "Bạn thao tác quá nhanh. Vui lòng thử lại sau.",
  email_not_configured: "Email chưa được cấu hình.",
  order_not_pending: "Đơn không còn chờ thanh toán.",
  amount_mismatch: "Số tiền không khớp với đơn hàng.",
  already_exists: "Dữ liệu này đã tồn tại.",
  refund_request_required: "Cần yêu cầu hoàn tiền từ khách trước khi xác nhận.",
  device_revoked: "Thiết bị đã bị thu hồi.",
};
export function errorMessage(error: unknown, locale = "vi") {
  const code = error instanceof Error ? error.message : "request_failed";
  return locale === "vi"
    ? (errors[code] ?? "Không thể hoàn tất thao tác. " + code)
    : code.replaceAll("_", " ");
}
