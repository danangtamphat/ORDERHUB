# OrderHub

Nền tảng nội bộ quản lý đơn hàng cho Công ty Công nghệ Tâm Phát Việt Nam. Bản khởi đầu gồm React + TypeScript, Express API và PostgreSQL, chạy thử trên Windows.

## Cách dễ nhất để dùng thử

Không cần cài Node.js, PostgreSQL hay chạy lệnh: mở [OrderHub-ban-dung-thu.html](outputs/OrderHub-ban-dung-thu.html) bằng Chrome/Edge và tạo tài khoản Admin ở lần đầu. Hướng dẫn ngắn nằm tại [Huong-dan-OrderHub-ban-dung-thu.txt](outputs/Huong-dan-OrderHub-ban-dung-thu.txt). Bản HTML này lưu dữ liệu trong trình duyệt trên một máy; nó chỉ dành cho thử nghiệm, không thay thế backend tập trung bên dưới.

## Bắt đầu trên Windows

Yêu cầu: Node.js LTS, PostgreSQL 16+, Git (tuỳ chọn) và VS Code. Mở PowerShell tại thư mục dự án; chạy `Copy-Item server/.env.example server/.env`, tạo database `orderhub` trong PostgreSQL, rồi điền kết nối database và mật khẩu khởi tạo Admin mạnh vào `server/.env`. Không dùng mật khẩu mẫu cho môi trường thật.

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Mở `http://localhost:5173`. API ở `http://localhost:4000/api/health`. Tài khoản Admin lấy từ `BOOTSTRAP_ADMIN_USERNAME` và `BOOTSTRAP_ADMIN_PASSWORD` trong `server/.env`; không có mật khẩu mặc định trong mã nguồn. Có thể thiết lập `BOOTSTRAP_ADMIN_NAME`.

## Dùng thử trong mạng nội bộ công ty

Máy chủ và các máy nhân viên cần cùng mạng Wi-Fi/LAN. Trên máy chủ, cài và khởi động PostgreSQL, cấu hình `server/.env`, chạy migration/seed một lần, rồi mở `start-orderhub.bat`. Nếu Windows hỏi quyền mạng, chỉ cho phép Node.js trên mạng **Riêng tư (Private)**. Lấy địa chỉ IPv4 của máy chủ bằng `ipconfig` (ví dụ `192.168.1.20`). Trên các máy khác, mở `http://192.168.1.20:5173` bằng cách thay địa chỉ ví dụ bằng IPv4 thật của máy chủ. Không mở/chuyển tiếp cổng trên router ra Internet.

Nếu máy khác không vào được, kiểm tra các máy cùng Wi-Fi/LAN, mạng Windows của máy chủ đang đặt là Riêng tư, và Windows Firewall cho phép cổng TCP `5173` trên mạng Riêng tư. Có thể dùng địa chỉ IP cố định hoặc đặt DHCP reservation trên router để địa chỉ máy chủ không đổi. Đóng hai cửa sổ máy chủ API/Web để tắt OrderHub.

Đây là chế độ chạy thử trong mạng tin cậy, chưa có HTTPS. Bản HTML trong `outputs` vẫn lưu dữ liệu riêng trên từng trình duyệt; để dùng chung, mở ứng dụng React/API ở trên. Các chức năng đã chuyển sang React/API gồm hồ sơ, giao việc, nhắc việc, lịch ca, điểm danh, bảng lương, pet và đối soát đơn. Các bản ghi được lưu chung trong PostgreSQL.

## Phạm vi hiện tại

- Đăng nhập, phiên cookie HttpOnly, bcrypt, đổi mật khẩu, OTP đặt lại mật khẩu qua Resend, phân quyền Admin/Manager/Staff ở API.
- Danh sách, tạo, sửa, xoá đơn; lọc nhân viên/trạng thái/hóa đơn; kiểm tra trùng; đối soát trạng thái hàng loạt bằng Excel.
- Chia doanh thu theo người nhận, mỗi người có bản ghi riêng trong cùng giao dịch. Nếu số tiền không chia hết đến từng đồng, người đầu tiên nhận phần dư để tổng phân bổ bằng giá trị gốc.
- Hồ sơ nhân viên tự khai báo, bậc lương, phân quyền, xóa tài khoản có xác nhận mật khẩu Admin; CCCD được mã hóa trong cơ sở dữ liệu.
- Giao việc theo tháng, hoàn thành có xác nhận, quá hạn bị khóa, nhập Excel; nhắc việc Admin tạo và popup nhân viên lúc 09:00/14:00.
- Lịch nhiều người mỗi ca, mỗi người tối đa một ca/ngày, mẫu Excel, sao chép tuần trước, xóa lịch tuần; đăng nhập ngày có lịch sẽ ghi nhận một ca.
- Bảng lương tính theo ca và bậc giờ, thưởng 1,5% doanh thu giao thành công, phụ cấp theo số ca; Admin điều chỉnh và xuất Excel/PDF. Nhân viên chỉ xem lương của mình; Manager chỉ xem lịch.
- Pet riêng theo tài khoản; thức ăn từ điểm danh và hoàn tất việc, cho ăn một lần mỗi ngày.
- Bảng điều khiển, biểu đồ, báo cáo có lọc ngày/trạng thái/nhân viên và xuất Excel/PDF.

## Quy tắc đã chốt từ đặc tả mâu thuẫn

- Giá trị hợp lệ từ 10.000 đến 50.000.000 VNĐ; cảnh báo từ 20.000.000 VNĐ. Quy tắc này theo mục kiểm soát giá trị cụ thể; ví dụ 52 triệu và giới hạn 100 triệu bị coi là mâu thuẫn nên không cho lưu.
- Chia doanh thu đều giữa chủ đơn và các Staff được chọn; Admin không nhận phần chia. Manager có thể là chủ đơn, nhưng không phải đối tượng nhận chia theo quy tắc bảo thủ này.
- Trạng thái hoá đơn là trường độc lập (chưa xuất/đã xuất), không tự suy ra từ trạng thái giao hàng.
- Mã vận đơn duy nhất không phân biệt hoa thường trong phạm vi từng nhân viên nhận doanh thu. Đây là cách hỗ trợ chia đơn mà không cho cùng nhân viên ghi nhận mã hai lần.
- “Điểm phạt” được nhập bằng VNĐ do đặc tả chưa quy đổi điểm sang tiền. Chưa có module quản lý tồn kho trong yêu cầu giao diện hiện tại.

## Kiểm thử

Chạy `npm run build` để kiểm tra biên dịch. Khởi động PostgreSQL trước khi chạy migration/seed và `npm run dev`. Dữ liệu mẫu chỉ được thêm nếu đặt `SEED_DEMO=true`; mặc định không tự sinh đơn hàng giả. Để gửi OTP thật, cấu hình `RESEND_API_KEY` và `RESEND_FROM_EMAIL` bằng domain đã xác minh trong Resend. Không đưa khóa gửi thư hoặc khóa mã hóa thật vào Git.

## An toàn

Đặt `NODE_ENV=production`, `SESSION_SECRET` dài ngẫu nhiên, mật khẩu DB mạnh và chỉ truy cập qua HTTPS khi triển khai. API mặc định chỉ cho phép frontend `http://localhost:5173`. CORS, cookie và bootstrap credentials cần được cấu hình lại khi chuyển môi trường.
