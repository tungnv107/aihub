import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
for (const name of ["CUSTOMER", "SUPPORT", "ADMIN"])
  await db.role.upsert({
    where: { id: name },
    create: { id: name, name },
    update: {},
  });
const email = process.env.BOOTSTRAP_ADMIN_EMAIL,
  password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (email && password) {
  if (password.length < 16)
    throw Error("Bootstrap password must have at least 16 characters");
  if (!(await db.user.findUnique({ where: { email } }))) {
    const id = randomUUID();
    await db.user.create({
      data: {
        id,
        email,
        name: "AIHub Admin",
        emailVerified: true,
        roles: { create: { roleId: "ADMIN" } },
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: "credential",
            password: await hashPassword(password),
          },
        },
      },
    });
    console.log(
      "Bootstrap administrator created; credentials remain in local .env.",
    );
  }
}
if (process.env.NODE_ENV !== "production") {
  const plans = [
    {
      slug: "starter",
      name: "Starter",
      description: "Không gian cá nhân, sẵn sàng cho dự án tiếp theo.",
      price: 99000,
      durationDays: 30,
      maxDevices: 1,
      sortOrder: 0,
      recommended: false,
    },
    {
      slug: "pro",
      name: "Professional",
      description: "Linh hoạt giữa máy làm việc và máy cá nhân.",
      price: 249000,
      durationDays: 90,
      maxDevices: 2,
      sortOrder: 1,
      recommended: true,
    },
    {
      slug: "annual",
      name: "Annual",
      description: "Một năm tập trung phát triển sản phẩm.",
      price: 799000,
      durationDays: 365,
      maxDevices: 3,
      sortOrder: 2,
      recommended: false,
    },
  ];
  for (const plan of plans)
    await db.plan.upsert({
      where: { slug: plan.slug },
      create: {
        ...plan,
        active: true,
        features: {
          create: [
            "License AIHub theo thời hạn",
            "Dùng tài khoản ChatGPT của bạn",
            "Quản lý thiết bị trực tuyến",
            "Hỗ trợ qua ticket",
          ].map((label, sortOrder) => ({ label, sortOrder })),
        },
      },
      update: {},
    });
  await db.setting.upsert({
    where: { key: "developmentCatalog" },
    create: { key: "developmentCatalog", value: true },
    update: {},
  });
}
for (const locale of ["vi", "en"]) {
  const vi = locale === "vi";
  const articles = [
    {
      slug: "getting-started",
      title: vi ? "Bắt đầu với AIHub" : "Getting started",
      description: vi
        ? "Từ tài khoản đến không gian lập trình của bạn."
        : "From your account to your coding workspace.",
      body: vi
        ? "## Chuẩn bị\nBạn cần tài khoản ChatGPT riêng và Node.js từ 24.18.0. AIHub cấp quyền dùng relay local; hạn mức AI do nhà cung cấp quyết định.\n\n## Cài đặt\nBản npm công khai chưa phát hành. Khi được xác thực, lệnh cài chính xác sẽ xuất hiện ở khung cài đặt trên trang này.\n\n## Kích hoạt\nChạy AIHub, nhập địa chỉ máy chủ và key trong lời nhắc ẩn. Xác nhận để sao lưu và cập nhật cấu hình Codex.\n\n## Sử dụng\nChạy lại lệnh `aihub` để khởi động dịch vụ. Key được kiểm tra online trước yêu cầu và trong phiên đang chạy."
        : "## Before you start\nUse your own ChatGPT account and Node.js 24.18.0 or newer. AIHub licenses the local relay; AI quotas remain controlled by the provider.\n\n## Install\nThe public npm release is not available yet. A verified installation command will appear here after release.\n\n## Activate\nRun AIHub and enter your server URL and key at the hidden prompt. Confirm configuration backup and setup.\n\n## Use\nRun `aihub` again to start. Authorization is checked online before requests and during active sessions.",
    },
    {
      slug: "devices",
      title: vi ? "Thiết bị và chuyển máy" : "Devices and transfers",
      description: vi
        ? "Quản lý thiết bị và bảo vệ quyền truy cập."
        : "Manage devices and protect access.",
      body: vi
        ? "## Giới hạn thiết bị\nGiới hạn được ghi trong gói tại thời điểm mua. Mỗi thiết bị tạo một định danh ngẫu nhiên và cặp khóa Ed25519.\n\n## Chuyển máy\nThu hồi thiết bị cũ trong Dashboard → Thiết bị. Chờ 1 giờ trước khi kích hoạt máy mới. Thiết bị đã thu hồi không tự kích hoạt lại.\n\n## Mất thiết bị\nThu hồi thiết bị và mở ticket nếu nghi ngờ key bị lộ. Không gửi key hoặc tài khoản ChatGPT trong ticket."
        : "## Device limits\nYour order records the device limit at purchase. Each device creates a random identity and an Ed25519 key pair.\n\n## Transfer\nRevoke the old device under Dashboard → Devices. A one-hour cooldown applies before adding a new device. Revoked devices cannot reactivate automatically.\n\n## Lost device\nRevoke it and contact support if your license key may be exposed. Never send keys or ChatGPT credentials in tickets.",
    },
    {
      slug: "troubleshooting",
      title: vi ? "Xử lý lỗi kích hoạt" : "Activation troubleshooting",
      description: vi
        ? "Kiểm tra kết nối, thời hạn và thiết bị."
        : "Check connectivity, expiration and devices.",
      body: vi
        ? "## Key hết hạn\nMở Dashboard → License và chọn Gia hạn. Quyền được cập nhật sau khi thanh toán xác nhận.\n\n## Không kết nối được\nKiểm tra kết nối mạng và địa chỉ HTTPS. AIHub không cấp quyền offline khi không xác thực được.\n\n## Khôi phục cấu hình\nChạy `aihub stop` rồi `aihub unsync`. Không cần key còn hạn để dừng hoặc khôi phục cấu hình."
        : "## Expired key\nOpen Dashboard → Licenses and renew. Access updates after confirmed payment.\n\n## Connection errors\nCheck your connection and HTTPS server URL. AIHub does not authorize offline when verification fails.\n\n## Restore configuration\nRun `aihub stop`, then `aihub unsync`. Stopping and restoring do not require a valid license.",
    },
  ];
  for (const [sortOrder, article] of articles.entries())
    await db.document.upsert({
      where: { slug_locale_kind: { slug: article.slug, locale, kind: "docs" } },
      create: { ...article, locale, kind: "docs", sortOrder, published: true },
      update: {},
    });
  const faq = vi
    ? [
        [
          "Có cần tài khoản AI riêng không?",
          "Có. AIHub chỉ cấp quyền dùng công cụ local; bạn đăng nhập bằng tài khoản ChatGPT của mình.",
        ],
        [
          "Thời hạn bắt đầu khi nào?",
          "Thời hạn bắt đầu khi Sub2API cấp key sau khi thanh toán đã được xác nhận.",
        ],
        [
          "Tôi có thể gia hạn không?",
          "Có. Chọn Gia hạn tại trang License. Thời gian mới được cộng sau hạn hiện tại hoặc sau thời điểm gia hạn nếu đã hết hạn.",
        ],
        [
          "Có bao nhiêu thiết bị được dùng?",
          "Số thiết bị được ghi rõ trong gói và lưu vào đơn hàng của bạn.",
        ],
        [
          "Chuyển thiết bị như thế nào?",
          "Thu hồi máy cũ trong dashboard, chờ thời gian chuyển máy 1 giờ, sau đó kích hoạt máy mới.",
        ],
        [
          "AIHub có xóa hạn mức AI không?",
          "Không. Hạn mức và khả năng truy cập model do nhà cung cấp AI quy định.",
        ],
        [
          "Thanh toán chưa cập nhật thì làm gì?",
          "Giữ mã giao dịch và mở ticket hỗ trợ. Không chuyển lại nhiều lần khi đang chờ đối soát.",
        ],
        [
          "Hỗ trợ và hoàn tiền thế nào?",
          "Bạn có thể gửi yêu cầu hoàn tiền từ đơn đã thanh toán. Quản trị viên xem xét, thực hiện hoàn tiền và ghi nhận chứng từ đối soát.",
        ],
      ]
    : [
        [
          "Do I need my own AI account?",
          "Yes. AIHub licenses the local tool; you use your own ChatGPT account.",
        ],
        [
          "When does validity start?",
          "Validity begins when Sub2API issues the key after verified payment.",
        ],
        [
          "Can I renew?",
          "Yes. Renew from Licenses; days are added after the current expiry or renewal time if already expired.",
        ],
        [
          "How many devices can I use?",
          "The plan and your order record the device limit.",
        ],
        [
          "How do I transfer devices?",
          "Revoke the old device, wait one hour, then activate a new one.",
        ],
        [
          "Does AIHub remove AI quotas?",
          "No. AI quotas and model availability remain controlled by the provider.",
        ],
        [
          "Payment not updated?",
          "Keep your payment reference and open a support ticket. Avoid duplicate transfers.",
        ],
        [
          "What about refunds?",
          "Request a refund from a paid order. An administrator reviews it, performs the transfer and records reconciliation.",
        ],
      ];
  for (const [sortOrder, [question, answer]] of faq.entries()) {
    const id = `faq-${locale}-${sortOrder}`;
    await db.fAQ.upsert({
      where: { id },
      create: { id, question, answer, locale, published: true, sortOrder },
      update: {},
    });
  }
}
console.log(
  "Seed completed. Development plans are sample catalog data; production does not receive sample prices.",
);
await db.$disconnect();
