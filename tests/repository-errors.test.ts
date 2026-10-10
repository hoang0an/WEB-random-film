import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readableError} from '../lib/repository-errors.ts';

test('group RPC errors explain the corrective action without raw database details',()=>{
  const cases=[
    ['owner_cannot_leave','Bạn đang là chủ nhóm. Chưa thể rời nhóm trong phiên bản này.'],
    ['movie_watched','Không thể xóa phim đã có lịch sử xem hoặc đánh giá.'],
    ['movie_has_activity','Không thể xóa phim đã có lịch sử xem hoặc đánh giá.'],
    ['forbidden','Bạn không có quyền sửa hoặc xóa nội dung này.'],
    ['invalid_comment','Bình luận cần từ 1 đến 1000 ký tự.'],
    ['invalid_group_name','Tên nhóm cần từ 1 đến 80 ký tự.'],
    ['rating_missing','Điểm đã được xóa. Danh sách sẽ được cập nhật.'],
    ['not_member','Bạn không có quyền thực hiện thao tác trong nhóm này.'],
  ];
  for(const [code,message] of cases) {
    assert.equal(readableError(new Error(code)),message);
    assert.equal(readableError({message:`${code}: internal database context`}),message);
  }
});
