# Kế hoạch website "Tối nay xem gì?"

Ngày chốt kế hoạch: 08/10/2026. Trạng thái: đã chốt, chưa bắt đầu xây dựng.

## 1. Mục tiêu

Website giúp nhóm bạn hay cãi nhau vì không biết xem gì chọn nhanh một bộ phim cho tối nay. Mỗi nhóm có một danh sách phim chung do chính các thành viên thêm vào. Khi cần xem phim, cả nhóm bốc ngẫu nhiên một phim trong danh sách các phim chưa xem.

## 2. Người dùng và cách dùng

- Người dùng chính: nhóm bạn cần chọn phim chung.
- Mỗi người có tài khoản, có thể tạo hoặc tham gia nhiều nhóm (ví dụ nhóm bạn đại học, nhóm gia đình).
- Mỗi nhóm có danh sách phim riêng; web hiển thị ai là người thêm phim nào.
- Giao diện tiếng Việt, dùng tốt trên điện thoại và máy tính.

## 3. Hướng xây dựng đã chọn

Hướng A: web thật với dịch vụ có sẵn.

- **Supabase**: đăng nhập (Google hoặc email) và cơ sở dữ liệu.
- **Vercel**: đăng web lên mạng.
- **TMDB**: nguồn dữ liệu phim (poster, năm, thời lượng, mô tả tiếng Việt).
- Người xây dựng gần như chưa biết code, nên toàn bộ code do Claude viết và có hướng dẫn cài đặt từng bước. Cần tạo khoảng 3 tài khoản miễn phí (GitHub, Supabase, Vercel) và 1 khóa TMDB.

Các hướng đã cân nhắc nhưng không chọn: bản chạy nhanh trong khung chat (chưa chắc đáp ứng đăng nhập và nhiều nhóm), và làm hai giai đoạn (một thiết bị trước rồi nâng cấp).

## 4. Cấu trúc trang

1. **Đăng nhập / Đăng ký**: Google hoặc email.
2. **Nhóm của tôi** (trang chủ sau đăng nhập): danh sách nhóm, nút "Tạo nhóm" và "Vào nhóm bằng mã".
3. **Trang nhóm** gồm ba tab:
   - **Bốc phim**: nút bốc lớn ở giữa, hiện số phim đang chờ xem.
   - **Danh sách**: phim chưa xem, ô tìm phim để thêm, hiển thị người thêm.
   - **Đã xem**: phim đã xem kèm điểm trung bình của nhóm.
4. **Chi tiết phim**: poster, tên, năm, thời lượng, mô tả, điểm của từng người, bình luận, chỗ để chấm điểm.
5. **Thành viên nhóm** (trong trang nhóm): danh sách thành viên và mã mời (hoặc link) để rủ thêm bạn.

## 5. Luồng sử dụng chính

**Thêm phim**

1. Vào tab Danh sách, gõ tên phim vào ô tìm kiếm.
2. Web hiện các kết quả có poster nhỏ, tên và năm; chọn đúng phim.
3. Bấm Thêm. Phim vào danh sách kèm tên người thêm. Nếu phim đã có, báo "phim này đã có trong danh sách".

**Bốc phim tối nay**

1. Mở tab Bốc phim và bấm nút Bốc phim.
2. Web chọn ngẫu nhiên một phim chưa xem và hiện thẻ kết quả: poster, tên, năm, thời lượng, mô tả ngắn, người đã thêm.
3. Chọn **Chốt phim này** (phim được ghim là "Đang xem tối nay") hoặc **Bốc lại** (không lặp lại phim vừa bỏ qua).
4. Xem xong, bấm **Đã xem**; phim chuyển sang tab Đã xem.
5. Mỗi người chấm điểm 1-10 và viết bình luận nếu muốn; điểm trung bình của nhóm tự cập nhật.

"Chốt" và "Đã xem" là hai bước riêng.

## 6. Tính năng phiên bản đầu

- Đăng nhập bằng Google hoặc email.
- Tạo nhóm, tham gia bằng mã mời, xem thành viên.
- Tìm phim theo tên (TMDB) và thêm vào danh sách nhóm, có ghi người thêm.
- Bốc ngẫu nhiên một phim chưa xem; Chốt, Bốc lại.
- Đánh dấu Đã xem.
- Chấm điểm 1-10, bình luận, điểm trung bình của nhóm.
- Giao diện tiếng Việt, dùng tốt trên điện thoại và máy tính.
- Ghi nguồn TMDB ở chân trang.

**Không làm ở bản đầu**

- Bộ lọc thể loại, tâm trạng, thời lượng (đã quyết định bỏ; cân nhắc lại nếu danh sách quá dài).
- Thông báo, bỏ phiếu, gợi ý phim, thống kê.
- Xóa phim khỏi danh sách và xóa nhóm: Claude đề xuất vẫn làm bản đơn giản của "xóa phim"; cần xác nhận lại trước khi xây dựng.

## 7. Nguồn dữ liệu phim và tránh kết quả không phù hợp

Nguồn dữ liệu là TMDB. Theo hiểu biết hiện tại, dùng miễn phí cho dự án phi thương mại và phải ghi nguồn TMDB trên web; cần đọc lại điều khoản khi đăng ký khóa. Khóa TMDB nên được giữ phía máy chủ, không để lộ ra trình duyệt.

Vì phim do nhóm tự thêm nên kết quả bốc gần như luôn phù hợp. Các rủi ro còn lại và cách xử lý:

- Chọn nhầm phim cùng tên: hiện poster và năm để xác nhận trước khi thêm.
- Nội dung người lớn: tắt cờ nội dung người lớn trong tìm kiếm.
- Thiếu mô tả tiếng Việt, poster hoặc thời lượng: dùng mô tả tiếng Anh và ảnh mặc định thay thế.
- Thêm trùng phim: báo phim đã có trong danh sách.
- Bốc lại trúng phim vừa bỏ qua: không lặp lại ngay phim trước.
- Phim đã xem: tự động loại khỏi lượt bốc.

## 8. Phong cách giao diện

- Tông tối kiểu rạp chiếu phim (nền xám than hoặc xanh đen, chữ sáng), phù hợp dùng buổi tối.
- Một màu nhấn duy nhất (ví dụ vàng hổ phách hoặc đỏ cam ấm) cho nút Bốc phim và các hành động chính.
- Nút Bốc phim thật to, có hiệu ứng ngắn (poster xáo trộn rồi dừng) để tạo cảm giác hồi hộp mà không phải chờ lâu.
- Ưu tiên điện thoại: thanh điều hướng ba tab ở cuối màn hình, nút bấm đủ lớn cho ngón cái. Trên máy tính, nội dung căn giữa, danh sách hiện dạng lưới poster.
- Một phông chữ hỗ trợ tốt tiếng Việt có dấu.

## 9. Các bước tiếp theo (chưa bắt đầu)

1. Xác nhận các điểm còn mở: có làm "xóa phim" ở bản đầu hay không.
2. Trình bày phần kỹ thuật: cấu trúc dữ liệu, phân quyền trong nhóm, xử lý lỗi, kiểm thử.
3. Hướng dẫn cài đặt từng bước (GitHub, Supabase, Vercel, khóa TMDB).
4. Viết code và đưa web lên mạng.
