export function readableError(error: unknown) {
  const msg = error instanceof Error ? error.message : String((error as { message?: string })?.message || error);
  if (/owner_cannot_leave/i.test(msg)) return 'Bạn đang là chủ nhóm. Chưa thể rời nhóm trong phiên bản này.';
  if (/movie_watched|movie_has_activity/i.test(msg)) return 'Không thể xóa phim đã có lịch sử xem hoặc đánh giá.';
  if (/forbidden/i.test(msg)) return 'Bạn không có quyền sửa hoặc xóa nội dung này.';
  if (/invalid_comment/i.test(msg)) return 'Bình luận cần từ 1 đến 1000 ký tự.';
  if (/invalid_group_name/i.test(msg)) return 'Tên nhóm cần từ 1 đến 80 ký tự.';
  if (/rating_missing/i.test(msg)) return 'Điểm đã được xóa. Danh sách sẽ được cập nhật.';
  if (/duplicate|unique|already_exists/i.test(msg)) return 'Phim này đã có trong danh sách.';
  if (/invalid_invite/i.test(msg)) return 'Mã mời không đúng. Hãy kiểm tra lại với nhóm bạn.';
  if (/not_member|permission|row-level/i.test(msg)) return 'Bạn không có quyền thực hiện thao tác trong nhóm này.';
  if (/not_watched/i.test(msg)) return 'Hãy đánh dấu phim đã xem trước khi chấm điểm hoặc bình luận.';
  if (/invalid_movie|already_watched/i.test(msg)) return 'Phim không còn chờ xem. Danh sách sẽ được cập nhật.';
  if (/not_tonight/i.test(msg)) return 'Phim đang xem đã thay đổi. Hãy tải lại nhóm.';
  if (/Invalid login credentials/i.test(msg)) return 'Email hoặc mật khẩu chưa đúng.';
  if (/Email not confirmed/i.test(msg)) return 'Hãy xác nhận email trước khi đăng nhập.';
  if (/fetch|network/i.test(msg)) return 'Không thể kết nối. Hãy kiểm tra mạng rồi thử lại.';
  if (/rate limit/i.test(msg)) return 'Bạn thao tác quá nhanh. Hãy đợi một chút rồi thử lại.';
  return msg;
}
