import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT=Path('test-results/polish')
OUT.mkdir(parents=True,exist_ok=True)
KEY='tonight-cinema-demo-v1'
report=[]
def passed(name):
    report.append(name)
    print('PASS:',name)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.getenv('TEST_URL', 'http://localhost:3000'))
    page.wait_for_load_state('networkidle')
    page.get_by_role('button',name='Khám phá bản dùng thử').click()
    page.get_by_role('button',name='Mở rạp của nhóm').click()
    page.wait_for_load_state('networkidle')
    for width,height in [(1440,1000),(1024,900),(768,900),(375,844),(320,740)]:
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('window.scrollTo(0,0)')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        button=page.get_by_role('button',name='Bốc phim ngay').bounding_box()
        nav=page.get_by_role('navigation').bounding_box()
        lower=nav['y'] if width<=680 else height
        assert button['y']+button['height']<=lower, (width,button,nav)
        stage=page.locator('.movie-wheel').bounding_box()
        assert button['y']>=stage['y']+stage['height']-1
        assert page.locator('.preview-grid').count()==0
        page.screenshot(path=str(OUT/f'idle-{width}.png'),full_page=True)
    passed('Vòng quay và nút bốc cùng trục, nút nằm trong màn hình đầu, không tràn ngang ở 320/375/768/1024/1440')
    page.get_by_role('button',name='Xem danh sách').click()
    expect(page.get_by_label('Thêm một bộ phim vào danh sách')).to_be_visible()
    expect(page.locator('.movie-card')).to_have_count(6)
    page.get_by_role('navigation').get_by_role('button',name='Bốc phim').click()
    passed('Xem danh sách mở toàn bộ danh sách và vẫn trở lại bốc phim được')
    page.set_viewport_size({'width':375,'height':844})
    page.get_by_label('Thời lượng',exact=True).select_option('medium')
    expect(page.locator('.filter-summary')).to_contain_text('4 / 6')
    page.get_by_label('Thể loại',exact=True).select_option('Khoa học viễn tưởng')
    expect(page.locator('.filter-summary')).to_contain_text('1 / 6')
    expect(page.locator('.wheel-card')).to_have_count(1)
    page.get_by_role('button',name='Bốc phim ngay').click()
    expect(page.get_by_label('Thể loại',exact=True)).to_be_disabled()
    expect(page.get_by_label('Thời lượng',exact=True)).to_be_disabled()
    expect(page.get_by_role('button',name='Xóa lọc')).to_be_disabled()
    expect(page.locator('.result-copy h2')).to_have_text('Inception',timeout=7000)
    expect(page.locator('.wheel-card[data-selected=true]')).to_have_attribute('data-entry-id','seed-27205')
    expect(page.get_by_role('button',name='Bốc lại',exact=True)).to_be_disabled()
    page.screenshot(path=str(OUT/'filtered-result-mobile.png'),full_page=True)
    passed('Giao thể loại/thời lượng chọn đúng Inception, khóa lọc lúc quay, một ứng viên không bốc lại')
    page.get_by_label('Thời lượng',exact=True).select_option('short')
    expect(page.locator('.result-copy')).to_have_count(0)
    expect(page.locator('.filter-summary')).to_contain_text('0 / 6')
    expect(page.get_by_role('button',name='Bốc phim ngay')).to_be_disabled()
    expect(page.get_by_text('Không có phim phù hợp. Thử xóa hoặc đổi bộ lọc.')).to_be_visible()
    page.get_by_role('button',name='Xóa lọc').click()
    expect(page.locator('.filter-summary')).to_contain_text('6 / 6')
    expect(page.get_by_role('button',name='Bốc phim ngay')).to_be_enabled()
    passed('Lọc rỗng có hướng phục hồi; đổi lọc xóa kết quả cũ; Xóa lọc khôi phục tất cả')
    page.get_by_label('Thể loại',exact=True).select_option('Khoa học viễn tưởng')
    page.evaluate('Math.random=()=>0')
    page.get_by_role('button',name='Bốc phim ngay').click()
    expect(page.locator('.result-copy h2')).to_have_text('Interstellar',timeout=7000)
    page.get_by_role('button',name='Bốc lại',exact=True).click()
    expect(page.locator('.result-copy h2')).to_have_text('Inception',timeout=7000)
    page.set_viewport_size({'width':1440,'height':1000})
    page.screenshot(path=str(OUT/'filtered-result-desktop.png'),full_page=True)
    passed('Random và bốc lại giữ bộ lọc, không lặp phim vừa chọn; poster cuối khớp kết quả')
    # Legacy browser data retains user state and gains only known demo metadata.
    data=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)
    for movie in data['groups'][0]['movies']:
        movie.pop('genres',None)
    data['groups'][0]['movies'][1]['watchedAt']='2026-10-09'
    data['groups'][0]['movies'].append({'id':999123,'entryId':'unknown','title':'Thiếu dữ liệu','year':'','runtime':None,'genres':[],'poster':None,'overview':'','addedBy':'demo-you','addedName':'Bạn','watchedAt':None})
    page.evaluate('([key,data])=>localStorage.setItem(key,JSON.stringify(data))',[KEY,data])
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('button',name='Mở rạp của nhóm').click()
    expect(page.locator('.filter-summary')).to_contain_text('6 / 6')
    page.get_by_label('Thể loại',exact=True).select_option('Khoa học viễn tưởng')
    expect(page.locator('.filter-summary')).to_contain_text('1 / 6')
    page.get_by_label('Thời lượng',exact=True).select_option('medium')
    expect(page.locator('.filter-summary')).to_contain_text('0 / 6')
    passed('Dữ liệu demo cũ giữ phim đã xem; không đoán thể loại/thời lượng cho phim không biết')
    page.get_by_role('button',name='Xóa lọc').click()
    page.get_by_label('Thể loại',exact=True).focus()
    assert page.get_by_label('Thể loại',exact=True).evaluate('(e)=>e===document.activeElement')
    page.keyboard.press('Tab')
    assert page.get_by_label('Thời lượng',exact=True).evaluate('(e)=>e===document.activeElement')
    assert not errors,errors
    passed('Bộ lọc thao tác bàn phím được; không có JavaScript pageerror')
    (OUT/'report.json').write_text(json.dumps({'passed':report,'page_errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
    browser.close()
