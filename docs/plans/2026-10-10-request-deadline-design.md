# Thời hạn request và kết quả chưa chắc chắn

Trước sửa, RPC không trả phản hồi giữ UI bận hơn 36 giây, chưa có đường mở khóa hữu hạn. Bao toàn bộ RPC/TMDB (kể cả chờ Auth/header và JSON) trong deadline 15 giây; tải nhóm 10 giây. Hủy transport nếu có thể, không tự retry mutation. Không coi timeout là rollback: máy chủ có thể đã commit.

Action đọc lại state để đối chiếu; nếu lần đọc cũng treo, deadline thứ hai kết thúc và finally mở khóa. Tổng hai bước khoảng 25 giây ở tab foreground, không bảo đảm timer nền Chromium/thiết bị ngủ theo đồng hồ tuyệt đối. Thông báo lỗi đặt sau đối chiếu để không hết thời gian hiển thị trước lúc người dùng được thao tác lại. Giữ draft khi lỗi, bỏ kết quả promise muộn, guard nhóm hiện tại giữ nguyên.

Đã thêm 4 unit tests cho timeout/abort, chờ trước fetch, late success và lỗi đồng bộ/bất đồng bộ. Fixture UI kiểm tra chưa commit, đã commit và read cũng treo; đếm đúng một RPC, bảo toàn draft, chuyển nhóm trước release và không hồi sinh editor cũ. Không thay SQL/permissions, không retry tự động.
