"""Account demo acceptance; run against the root-managed demo server.

TEST_URL defaults to localhost:3000. This suite never accesses hosted accounts.
"""
import os
import base64
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 375, 'height': 850})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.getenv('TEST_URL', 'http://localhost:3000'))
    try:
        expect(page.get_by_role('button', name='Khám phá bản dùng thử')).to_be_visible(timeout=10000)
    except AssertionError:
        print('BOOTSTRAP BODY:', page.locator('body').inner_text())
        print('BOOTSTRAP ERRORS:', errors)
        raise
    page.get_by_role('button', name='Khám phá bản dùng thử').click()
    page.get_by_role('button', name='Tài khoản', exact=True).click()
    panel = page.get_by_role('dialog', name='Tài khoản của bạn')
    expect(panel).to_be_visible()
    expect(panel.get_by_role('button', name='Đóng tài khoản')).to_be_focused()
    page.keyboard.press('Shift+Tab')
    expect(panel.get_by_role('button', name='Đóng tài khoản')).not_to_be_focused()
    page.keyboard.press('Tab')
    expect(panel.get_by_role('button', name='Đóng tài khoản')).to_be_focused()
    expect(panel.get_by_label('Email', exact=True)).to_have_attribute('readonly', '')
    panel.get_by_label('Tên hiển thị').fill('Người xem 🎬')
    panel.get_by_role('button', name='Lưu tên').click()
    expect(panel.get_by_role('status')).to_contain_text('Đã lưu tên')
    expect(panel.get_by_role('heading', name='Điểm của tôi')).to_be_visible()
    expect(panel.get_by_label('Chọn ảnh đại diện')).to_have_attribute('accept', 'image/jpeg,image/png,image/webp')
    expect(panel.get_by_label('Chọn ảnh bìa')).to_be_visible()
    image = base64.b64decode(page.evaluate("""() => {const c=document.createElement('canvas');c.width=64;c.height=32;const x=c.getContext('2d');x.fillStyle='#235';x.fillRect(0,0,64,32);return c.toDataURL('image/png').split(',')[1];}"""))
    for kind, label in [('avatar', 'ảnh đại diện'), ('cover', 'ảnh bìa')]:
        panel.get_by_label('Chọn ' + label).set_input_files({'name': 'sample.png', 'mimeType': 'image/png', 'buffer': image})
        expect(panel.get_by_alt_text('Xem trước ' + label)).to_be_visible()
        panel.get_by_role('button', name='Lưu ' + label, exact=True).click()
        expect(panel.get_by_role('status')).to_contain_text('Đã lưu ' + label)
        expect(panel.get_by_alt_text('Đã lưu ' + label)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), '375px horizontal overflow'
    page.keyboard.press('Escape')
    expect(panel).to_have_count(0)
    page.reload()
    page.get_by_role('button', name='Tài khoản', exact=True).click()
    expect(page.get_by_label('Tên hiển thị')).to_have_value('Người xem 🎬')
    panel = page.get_by_role('dialog', name='Tài khoản của bạn')
    for label in ['ảnh đại diện', 'ảnh bìa']:
        expect(panel.get_by_alt_text('Đã lưu ' + label)).to_be_visible()
    panel.get_by_label('Chọn ảnh đại diện').set_input_files({'name': 'too-large.png', 'mimeType': 'image/png', 'buffer': b'x' * (3 * 1024 * 1024 + 1)})
    expect(panel.get_by_role('alert')).to_contain_text('3 MiB')
    expect(panel.get_by_alt_text('Đã lưu ảnh đại diện')).to_be_visible()
    panel.get_by_label('Chọn ảnh đại diện').set_input_files({'name': 'unsupported.svg', 'mimeType': 'image/svg+xml', 'buffer': b'<svg/>'})
    expect(panel.get_by_role('alert')).to_contain_text('JPEG, PNG hoặc WebP')
    panel.get_by_label('Chọn ảnh đại diện').set_input_files({'name': 'invalid.png', 'mimeType': 'image/png', 'buffer': b'not a png'})
    expect(panel.get_by_role('alert')).to_contain_text('Không thể lưu ảnh này')
    expect(panel.get_by_alt_text('Xem trước ảnh đại diện')).to_have_count(0)
    huge = base64.b64decode(page.evaluate("""() => {const c=document.createElement('canvas');c.width=5000;c.height=4801;return c.toDataURL('image/png').split(',')[1];}"""))
    panel.get_by_label('Chọn ảnh đại diện').set_input_files({'name': 'too-many-pixels.png', 'mimeType': 'image/png', 'buffer': huge})
    expect(panel.get_by_role('alert')).to_contain_text('24 triệu điểm ảnh')
    expect(panel.get_by_alt_text('Xem trước ảnh đại diện')).to_have_count(0)
    expect(panel.get_by_alt_text('Đã lưu ảnh đại diện')).to_be_visible()
    for label in ['ảnh đại diện', 'ảnh bìa']:
        panel.get_by_role('button', name='Bỏ ' + label, exact=True).click()
        expect(panel.get_by_role('status')).to_contain_text('Đã bỏ ' + label)
        expect(panel.get_by_alt_text('Đã lưu ' + label)).to_have_count(0)
    page.keyboard.press('Escape')
    # A preserved group without membership must still expose only our ratings,
    # keep duplicate film entries separate and paginate by their stable entry IDs.
    page.evaluate("""() => {
      const key='tonight-cinema-demo-v1', store=JSON.parse(localStorage.getItem(key));
      const template=store.groups[0], movie=template.movies[0];
      template.movies=Array.from({length:21},(_,i)=>({...movie,entryId:'account-'+String(i).padStart(2,'0'),title:'Phim '+String(i).padStart(2,'0'),poster:null}));
      template.ratings=template.movies.map(m=>({entryId:m.entryId,userId:'demo-you',name:'Người xem 🎬',score:8.5}));
      store.groups.push({...template,id:'account-left',name:'Tên nhóm kín không được lộ',ownerId:'demo-minh',members:[{id:'demo-minh',name:'Minh'}],movies:[{...movie,entryId:'account-left-entry',title:'Phim 00',poster:null}],ratings:[{entryId:'account-left-entry',userId:'demo-you',name:'Người xem 🎬',score:7},{entryId:'account-left-entry',userId:'demo-minh',name:'Minh',score:1}]});
      localStorage.setItem(key,JSON.stringify(store));
    }""")
    page.reload()
    page.get_by_role('button', name='Tài khoản', exact=True).click()
    panel = page.get_by_role('dialog', name='Tài khoản của bạn')
    expect(panel.locator('.account-rating-list li')).to_have_count(20)
    expect(panel.get_by_text('Tên nhóm kín không được lộ')).to_have_count(0)
    expect(panel.get_by_text('Nhóm đã rời', exact=True)).to_have_count(1)
    expect(panel.get_by_role('heading', name='Phim 00', exact=True)).to_have_count(2)
    panel.get_by_role('button', name='Tải thêm điểm').click()
    expect(panel.locator('.account-rating-list li')).to_have_count(22)
    expect(panel.get_by_role('button', name='Tải thêm điểm')).to_have_count(0)
    expect(panel.locator('.account-rating-list button,.account-rating-list a')).to_have_count(0)
    assert not errors, errors
    browser.close()
    print('PASS: account demo name/images persistence, validation/removal, own ratings after leave/pagination/duplicate entries, keyboard and mobile')
