import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.getenv('TEST_URL', 'http://localhost:3000')
OUT = Path('test-results')
OUT.mkdir(exist_ok=True)
KEY = 'tonight-cinema-demo-v1'
report = []

def passed(name):
    report.append(name)
    print('PASS:', name)

def state(page):
    return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)

def tab(page, text):
    page.get_by_role('navigation', name='Các mục trong nhóm').get_by_role('button', name=text).click()

def close(page):
    page.get_by_role('button', name='Đóng cửa sổ').click()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width':1440,'height':1050}, reduced_motion='reduce')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    expect(page.get_by_text('Bản dùng thử', exact=True)).to_be_visible()
    page.get_by_role('button', name='Khám phá bản dùng thử').click()
    expect(page.get_by_role('heading', name='Nhóm của tôi.', exact=True)).to_be_visible()
    page.get_by_role('button', name='Mở rạp của nhóm').click()
    page.wait_for_load_state('networkidle')
    passed('Vào bản dùng thử, xem nhóm mẫu và 6 phim')
    for width in [375, 768, 1024, 1440]:
        page.set_viewport_size({'width':width, 'height':900})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'overflow {width}'
        expect(page.get_by_role('button', name='Bốc phim ngay')).to_be_visible()
        if width == 375:
            assert page.get_by_role('navigation').bounding_box()['y'] >= 800
        page.screenshot(path=str(OUT / f'draw-{width}.png'), full_page=True)
    passed('Responsive 375/768/1024/1440px, không tràn ngang, mobile tabs ở cuối')
    page.set_viewport_size({'width':1440,'height':1050})
    tab(page, 'Danh sách')
    page.get_by_label('Thêm một bộ phim vào danh sách').fill('Barbie')
    row=page.locator('.search-results li').filter(has_text='Barbie')
    expect(row).to_be_visible()
    row.get_by_role('button', name='Thêm', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Đã thêm')
    assert len(state(page)['groups'][0]['movies']) == 7
    row.get_by_role('button', name='Đã có', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Phim này đã có trong danh sách')
    assert len(state(page)['groups'][0]['movies']) == 7
    passed('Tìm/thêm phim và báo trùng không thêm bản sao')
    page.get_by_label('Thêm một bộ phim vào danh sách').fill('Phim mẫu')
    row=page.locator('.search-results li').filter(has_text='Phim mẫu không có poster')
    expect(row).to_be_visible()
    row.get_by_role('button', name='Thêm', exact=True).click()
    expect(page.locator('.movie-card').filter(has_text='Phim mẫu không có poster')).to_be_visible()
    page.locator('.movie-card').filter(has_text='Phim mẫu không có poster').click()
    expect(page.get_by_role('dialog')).to_contain_text('Chưa có thời lượng')
    assert page.get_by_role('dialog').locator('img').get_attribute('src') == '/poster-placeholder.svg'
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    passed('Fallback poster/thời lượng, Escape đóng dialog')
    page.get_by_label('Thêm một bộ phim vào danh sách').fill('zzzzmissing')
    expect(page.get_by_text('Không tìm thấy phim. Thử tên tiếng Anh hoặc tên khác nhé.')).to_be_visible()
    page.get_by_label('Thêm một bộ phim vào danh sách').fill('')
    passed('Tìm kiếm không có kết quả')
    tab(page, 'Bốc phim')
    page.get_by_role('button', name='Bốc phim ngay').click()
    expect(page.locator('.result-copy h2')).to_be_visible()
    previous=page.locator('.result-copy h2').inner_text()
    page.get_by_role('button', name='Bốc lại', exact=True).click()
    expect(page.locator('.result-copy h2')).not_to_have_text(previous)
    selected=page.locator('.result-copy h2').inner_text()
    page.get_by_role('button', name='Chốt phim này').click()
    expect(page.locator('.tonight-banner')).to_contain_text(selected)
    current=state(page)['groups'][0]
    selected_id=current['tonightId']
    assert next(m for m in current['movies'] if m['entryId']==selected_id)['watchedAt'] is None
    passed('Bốc lại không lặp ngay; chốt ghim phim nhưng chưa chuyển Đã xem')
    page.get_by_role('button', name='Đã xem', exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible()
    page.get_by_label('Điểm của bạn').select_option('9.5')
    page.get_by_role('button', name='Lưu điểm', exact=True).click()
    expect(page.locator('.rating-summary')).to_contain_text('9.5')
    page.get_by_label('Điểm của bạn').select_option('8')
    page.get_by_role('button', name='Lưu điểm', exact=True).click()
    expect(page.locator('.rating-summary')).to_contain_text('8.0')
    assert len(state(page)['groups'][0]['ratings'])==1
    page.get_by_label('Bình luận của bạn').fill('Cả nhóm xem rất vui! <script>alert(1)</script>')
    page.get_by_role('button', name='Gửi bình luận').click()
    expect(page.locator('.comment p')).to_have_text('Cả nhóm xem rất vui! <script>alert(1)</script>')
    assert page.get_by_role('dialog').locator('script').count()==0
    passed('Đã xem, điểm 0.5, sửa điểm không nhân bản, trung bình và bình luận hiển thị an toàn')
    page.screenshot(path=str(OUT / 'ratings-desktop.png'), full_page=True)
    close(page)
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='Mở rạp của nhóm').click()
    tab(page, 'Đã xem')
    page.locator('.movie-card').filter(has_text=selected).click()
    expect(page.locator('.rating-summary')).to_contain_text('8.0')
    expect(page.locator('.comment p')).to_contain_text('Cả nhóm xem rất vui!')
    close(page)
    tab(page, 'Bốc phim')
    for _ in range(4):
        page.get_by_role('button', name='Bốc phim ngay' if page.locator('.result-copy h2').count()==0 else 'Bốc lại', exact=True).click()
        expect(page.locator('.result-copy h2')).not_to_have_text(selected)
    passed('Reload giữ dữ liệu, phim đã xem bị loại khỏi các lần bốc')
    page.locator('.member-button').click()
    expect(page.get_by_role('dialog')).to_contain_text('CINEMA2026')
    assert page.locator('.member-list li').count()==3
    close(page)
    page.get_by_role('button', name='Nhóm của tôi', exact=True).first.click()
    page.get_by_role('button', name='Vào nhóm bằng mã').click()
    page.get_by_label('Mã mời', exact=True).fill('BADCODE')
    page.get_by_role('dialog').get_by_role('button', name='Vào nhóm', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Mã mời không đúng')
    page.get_by_label('Mã mời', exact=True).fill('cinema2026')
    page.get_by_role('dialog').get_by_role('button', name='Vào nhóm', exact=True).click()
    expect(page.get_by_role('heading', name='Hội mê điện ảnh', exact=True)).to_be_visible()
    passed('Thành viên/mã mời, từ chối mã sai, tham gia bằng mã không phân biệt hoa thường')
    page.get_by_role('button', name='Tạo nhóm mới', exact=True).click()
    page.get_by_label('Tên nhóm', exact=True).fill('Nhóm gia đình')
    page.get_by_role('dialog').get_by_role('button', name='Tạo nhóm', exact=True).click()
    expect(page.get_by_role('heading', name='Nhóm gia đình', exact=True)).to_be_visible()
    expect(page.get_by_text('Chưa có phim chờ xem. Mở danh sách để thêm phim.')).to_be_visible()
    expect(page.get_by_role('button', name='Bốc phim ngay')).to_be_disabled()
    tab(page, 'Đã xem')
    expect(page.get_by_text('Buổi chiếu đầu tiên đang chờ')).to_be_visible()
    tab(page, 'Danh sách')
    page.get_by_label('Thêm một bộ phim vào danh sách').fill('Amélie')
    page.locator('.search-results li').get_by_role('button', name='Thêm', exact=True).click()
    expect(page.locator('.movie-card')).to_have_count(1)
    tab(page, 'Bốc phim')
    page.get_by_role('button', name='Bốc phim ngay').click()
    expect(page.locator('.result-copy h2')).to_have_text('Amélie')
    expect(page.get_by_role('button', name='Bốc lại', exact=True)).to_be_disabled()
    groups=state(page)['groups']
    assert len(groups)==2 and len(groups[0]['movies'])==8 and len(groups[1]['movies'])==1
    passed('Tạo nhóm, trạng thái rỗng, danh sách độc lập và không bốc lại khi chỉ có 1 phim')
    page.get_by_role('button', name='Chốt phim này').click()
    page.get_by_role('button', name='Đã xem', exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible()
    for width in [375,768,1024,1440]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.screenshot(path=str(OUT / f'detail-{width}.png'), full_page=True)
    page.get_by_label('Bình luận của bạn').fill('Kiểm tra bàn phím')
    page.get_by_role('button', name='Gửi bình luận').focus()
    page.keyboard.press('Tab')
    assert page.evaluate("document.activeElement.getAttribute('aria-label')")=='Đóng cửa sổ'
    page.keyboard.press('Shift+Tab')
    assert page.evaluate('document.activeElement.textContent').strip()=='Gửi bình luận'
    close(page)
    tab(page, 'Bốc phim')
    expect(page.get_by_role('button', name='Bốc phim ngay')).to_be_disabled()
    passed('Dialog responsive, keyboard/focus trap, danh sách hết phim')
    page.get_by_role('button', name='Đăng xuất').click()
    expect(page.get_by_role('button', name='Khám phá bản dùng thử')).to_be_visible()
    passed('Đăng xuất bản dùng thử')
    response=page.request.get(BASE+'/api/movies?q=Barbie')
    assert response.status==503 and 'TMDB' in response.json()['error']
    passed('API không có cấu hình trả 503 rõ ràng')
    assert not errors, errors
    passed('Không có JavaScript pageerror trong các luồng')
    (OUT/'e2e-report.json').write_text(json.dumps({'passed':report,'page_errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
    context.close()
    browser.close()
