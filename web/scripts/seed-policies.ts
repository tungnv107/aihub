import "dotenv/config";
import { db } from "../src/server/db";
for (const locale of ["vi", "en"]) {
  const vi = locale === "vi";
  const documents = [
    {
      slug: "privacy",
      title: vi ? "Quyền riêng tư" : "Privacy",
      description: vi
        ? "Dữ liệu cần thiết để cung cấp và hỗ trợ AIHub."
        : "Data needed to provide and support AIHub.",
      body: vi
        ? "## Dữ liệu tài khoản\nAIHub lưu tên, email, mật khẩu đã băm, phiên đăng nhập và tùy chọn thông báo để xác thực và hỗ trợ tài khoản.\n\n## Đơn hàng và license\nHệ thống lưu gói đã mua, giá, thời hạn, mã giao dịch và thông tin đối soát. License được mã hóa khi lưu trữ. Thông tin thiết bị gồm tên bạn đặt, hệ điều hành, định danh ngẫu nhiên và khóa công khai; không cần quét phần cứng.\n\n## Tài khoản AI\nAIHub SaaS không thu thập mật khẩu hoặc token ChatGPT của bạn. Công cụ local tiếp tục dùng phiên đăng nhập AI trên thiết bị.\n\n## Email và hỗ trợ\nEmail xác minh, đặt lại mật khẩu và thông báo được gửi qua nhà cung cấp SMTP do đơn vị vận hành cấu hình. Nội dung và tệp ticket chỉ được cung cấp cho chủ tài khoản và nhân viên được phân quyền. Bạn có thể tắt thông báo tùy chọn trong cài đặt.\n\n## Lưu trữ và yêu cầu\nDữ liệu tài khoản và lịch sử giao dịch được giữ để cung cấp dịch vụ, bảo mật và đối soát. Gửi ticket để yêu cầu kiểm tra, sửa, xuất hoặc xóa dữ liệu; một số hồ sơ giao dịch có thể cần được giữ để hoàn tất nghĩa vụ đang tồn tại. Không gửi mật khẩu hoặc key trong ticket."
        : "## Account data\nAIHub stores your name, email, hashed password, sessions and notification preferences to authenticate and support your account.\n\n## Orders and licenses\nWe store purchased plans, prices, validity, transaction references and reconciliation records. License keys are encrypted at rest. Device records contain your chosen name, operating system, random identifier and public key; hardware scanning is not required.\n\n## AI accounts\nAIHub SaaS does not collect ChatGPT passwords or tokens. The local tool continues to use the AI session on your device.\n\n## Email and support\nVerification, password reset and notifications use the operator-configured SMTP provider. Ticket content and files are available only to the owner and authorized staff. Optional notifications can be disabled in settings.\n\n## Retention and requests\nAccount and transaction history is retained for service operation, security and reconciliation. Open a ticket to request access, correction, export or deletion; some transaction records may need to remain to fulfill outstanding obligations. Never send passwords or license keys in tickets.",
    },
    {
      slug: "terms",
      title: vi ? "Điều khoản sử dụng" : "Terms of use",
      description: vi
        ? "Phạm vi dịch vụ, quyền truy cập và hỗ trợ."
        : "Service scope, access and support.",
      body: vi
        ? "## Phạm vi dịch vụ\nAIHub cung cấp quyền sử dụng công cụ relay local, quản lý license và thiết bị. Giá, thời hạn và số thiết bị hiển thị khi đặt hàng được lưu vào đơn. Dịch vụ không bao gồm thuê bao ChatGPT và không cam kết thay đổi quota hoặc quyền truy cập model của nhà cung cấp AI.\n\n## Kích hoạt và thời hạn\nKey được cấp khi thanh toán đã được xác thực. Thời hạn bắt đầu khi Sub2API cấp key. Công cụ cần kết nối mạng để kiểm tra quyền; khi hết hạn hoặc bị thu hồi, các yêu cầu qua relay bị chặn. Bạn vẫn có thể dừng và khôi phục cấu hình local.\n\n## Thiết bị và bảo mật\nGiữ key riêng tư, sử dụng trong giới hạn của gói. Thiết bị đã thu hồi không tự kích hoạt lại; cần chờ một giờ trước khi thêm máy mới. Không chia sẻ tài khoản hoặc key với người không được phép.\n\n## Thanh toán và hoàn tiền\nChỉ thanh toán theo thông tin và mã đơn hiển thị. Nếu giao dịch chưa được ghi nhận, gửi ticket kèm mã giao dịch. Yêu cầu hoàn tiền được gửi từ đơn đã thanh toán và xem xét theo tình trạng cung cấp dịch vụ. Sau khi hoàn tiền được xác nhận, license liên quan bị thu hồi.\n\n## Hỗ trợ\nSử dụng trung tâm hỗ trợ của AIHub để báo lỗi, yêu cầu đối soát hoặc điều chỉnh tài khoản. Không gửi thông tin đăng nhập AI, mật khẩu ngân hàng hoặc license key trong nội dung hỗ trợ."
        : "## Service scope\nAIHub provides access to a local relay tool, license management and device management. The price, validity and device limit shown at checkout are recorded in your order. Service does not include a ChatGPT subscription or promise changes to AI provider quotas or model access.\n\n## Activation and validity\nKeys are issued after verified payment. Validity begins when Sub2API issues a key. Online access checks are required; expired or revoked access blocks relay requests. You may still stop the tool and restore local configuration.\n\n## Devices and security\nKeep your key private and stay within the plan device limit. Revoked devices cannot reactivate automatically; a one-hour cooldown applies before adding a new device. Do not share accounts or keys with unauthorized people.\n\n## Payments and refunds\nPay only using the displayed order information and reference. If payment is not recorded, open a ticket with your transaction reference. Refund requests are submitted from paid orders and reviewed against service delivery. Confirmed refunds revoke the related license.\n\n## Support\nUse the AIHub support center for errors, reconciliation and account requests. Never send AI credentials, bank passwords or license keys in support messages.",
    },
  ];
  for (const [sortOrder, document] of documents.entries())
    await db.document.upsert({
      where: {
        slug_locale_kind: { slug: document.slug, locale, kind: "legal" },
      },
      create: {
        ...document,
        locale,
        kind: "legal",
        published: true,
        sortOrder,
      },
      update: {},
    });
}
await db.$disconnect();
console.log(
  "Service policy pages created without replacing existing content. Operator contact details remain configurable in Admin settings.",
);
