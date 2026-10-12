# Sửa khoảng trống ảnh trong panel sau lưu — 12/10/2026

Người dùng thử iQOO Z10 Turbo Pro/Android Chrome trên Preview f4d681f: sau đổi avatar/cover không thấy ảnh ngay; refresh rồi chờ khoảng4–5s ảnh mới hiện. Đây là quan sát người dùng, chưa có đo timing/network trên máy thật. Không ghi Android full PASS.

Đọc source: save CAS thành công clearDraft/revoke preview trước canonical GET hoàn tất. Cả panel/header đọc ngay khi pointer đổi, không bắt buộc đợi45s; nếu lần đọc đầu lỗi/fallback thì vòng poll45s mới thử lại. resolveImage còn có hai kiểm actor quaAuth phía client bên ngoài proxy, nên4–5s có thể là độ trễ mạng/xử lý. Bản sửa này xử lý khoảng trống trong panel, chưa giảm số roundtrip hoặc bảo đảm thời gian hiển thị header/reload.

## Thay đổi local

- File do owner vừa chọn giữ như preview chuyển tiếp sau khi CAS xác nhận path, nhãn “Đã lưu. Đang tải ảnh đã lưu…”. Không còn nút lưu/hủy cho ảnh đã commit; không dùng preview này làm ảnh của peer hay quyền đọc cache.
- Khi canonical GET thành công, null/deny hoặc lỗi, preview chuyển tiếp được thu hồi. Deadline15s loại bỏ preview và báo tải chậm nếu còn chờ. Đóng panel/đổi identity/bỏ ảnh/chọn ảnh mới đều hủy timer/revokeURL.
- Response cũ chỉ xóa preview khớp committedPath; không xóa lựa chọn mới hơn. Canonical cũ được xóa ngay khi image commit để tránh hiện lại ảnh cũ.
- Server GET, double authorization, 10sdeadline, no-store và các kiểm actor client giữ nguyên. Chưa sửa Auth/proxy caching hoặc network semantics.

## Kiểm chứng

TDD RED: E2E commit thành công rồi giữ GET ảnh mới; source f4d681f không có ảnh chuyển tiếp (preview bị revoke). GREEN sau sửa: account live mock 1440/375 PASS avatar và cover, canonical GET bị giữ, lựa chọn mới trong lúc GET cũ đang chờ, 404/502 bỏ preview. Các ca uploadfail/unknowncommit/accountswitch/latewrite trước đó giữ PASS.

Unit67/67, typecheck, QA build và production build PASS; whitespace sạch. Reviewer độc lập không blocker và xác nhận giới hạn scope panel. Deadline15s callback được review source; chưa có test time-travel riêng cho callback này. Không claim hosted/Android lại PASS cho bản local chưa phát hành.

## Gate2: đúng3file

```text
components/account-panel.tsx
tests/account-live_e2e.py
docs/account-image-display-fix-2026-10-12.md
```

Message đề xuất: `fix: retain account image preview while saved image loads`.
Không lấy edits maintenance, PLAN hoặc các báo cáo nghiệm thu trước còn local vào commit này. Người dùng duyệt Gate2 commit/push đúng3file ngày12/10/2026. Push nhánh feature tạo Preview mới rồi user thử Android lại; Production vẫn chưa phát hành.

Stress/cleanup là phần agent kiểm nhiều request đồng thời, CAS/reservecap và việc dọn assetpending/retired saugrace/retry. User không phải tự chạy trên điện thoại. Bước duyệt cuối là xem báo cáo và quyết định nghiệm thu Preview; migration/merge/promote Production là duyệt riêng với backup/rollback và maintenanceplan.
