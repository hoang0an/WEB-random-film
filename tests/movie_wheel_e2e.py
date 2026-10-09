import json
import math
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.getenv('TEST_URL', 'http://localhost:3000')
OUT = Path('test-results/wheel')
OUT.mkdir(parents=True, exist_ok=True)
KEY = 'tonight-cinema-demo-v1'
report = []

def passed(name, **details):
    report.append({'check': name, **details})
    print('PASS:', name, details or '')

def open_group(page):
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    if page.get_by_role('button', name='Khám phá bản dùng thử').count():
        page.get_by_role('button', name='Khám phá bản dùng thử').click()
    page.get_by_role('button', name='Mở rạp của nhóm').click()
    page.wait_for_load_state('networkidle')

def store(page):
    return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)

def save(page, data):
    page.evaluate('([key,data]) => localStorage.setItem(key,JSON.stringify(data))', [KEY,data])
    open_group(page)

def record(page, run_id, track_id):
    page.evaluate('''([runId, trackId]) => {
      window.wheelSamples = []; window.revealNode = null;
      function sample(t) {
        const stage = document.querySelector('.movie-wheel');
        if (stage && Number(stage.dataset.runId) === runId) {
          const card = [...stage.querySelectorAll('.wheel-card')].find(c => c.dataset.entryId === trackId);
          const selected = stage.querySelector('.wheel-card[data-selected="true"]');
          if(stage.dataset.phase === 'revealing' && !window.revealNode) window.revealNode = selected;
          const m = card ? new DOMMatrix(getComputedStyle(card).transform) : null;
          window.wheelSamples.push({t, phase:stage.dataset.phase, x:m?.m41, y:m?.m42, z:m?.m43,
            scale:m ? Math.hypot(m.m11,m.m12,m.m13) : null,
            selectedId:selected?.dataset.entryId,
            sameNode: selected === window.revealNode,
            result:document.querySelector('.result-copy h2')?.textContent});
          if(stage.dataset.phase === 'complete') return;
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }''', [run_id,track_id])

def assert_winner(page, expected):
    expect(page.locator('.movie-wheel')).to_have_attribute('data-phase','complete',timeout=7000)
    expect(page.locator('.result-copy h2')).to_have_text(expected['title'])
    card=page.locator('.wheel-card[data-selected="true"]')
    expect(card).to_have_count(1)
    expect(card).to_have_attribute('data-entry-id',expected['entryId'])
    assert card.locator('img').get_attribute('src').endswith(expected['poster'] or '/poster-placeholder.svg')
    expect(page.get_by_role('button',name='Chốt phim này')).to_be_enabled()
    pose=card.evaluate('''c => {const m=new DOMMatrix(getComputedStyle(c).transform);return {x:m.m41,y:m.m42,z:m.m43,scale:Math.hypot(m.m11,m.m12,m.m13),opacity:getComputedStyle(c).opacity}}''')
    assert abs(pose['x']) < 0.1 and abs(pose['y']) < 0.1
    assert pose['z'] > 100 and pose['scale'] > 1.6 and float(pose['opacity'])==1
    assert page.locator('.wheel-card').evaluate_all('(cards) => cards.filter(c => Number(getComputedStyle(c).opacity) > .99).length')==1
    return pose

def velocity(samples):
    spinning=[s for s in samples if s['phase'] in ['spinning','slowing'] and s['x'] is not None]
    xmax=max(abs(s['x']) for s in spinning)
    zmax=max(abs(s['z']) for s in spinning)
    unwrap=[]
    for s in spinning:
        angle=math.atan2(s['x']/xmax,s['z']/zmax)
        if unwrap:
            prev=unwrap[-1][1]
            while angle < prev-math.pi: angle+=2*math.pi
            while angle > prev+math.pi: angle-=2*math.pi
        unwrap.append((s['t']-spinning[0]['t'],angle))
    def speed(start,end):
        points=[s for s in unwrap if start<=s[0]<=end]
        assert len(points)>=3
        return (points[-1][1]-points[0][1])/((points[-1][0]-points[0][0])/1000)
    return speed(150,600),speed(1500,2100)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='no-preference')
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    open_group(page)
    print('DOM:', page.get_by_role('navigation').all_text_contents(), page.locator('.movie-wheel').get_attribute('data-phase'))
    data=store(page)
    data['groups'][0]['movies'][1]['watchedAt']='2026-10-09T00:00:00Z'
    save(page,data)
    pool=[m for m in data['groups'][0]['movies'] if not m['watchedAt']]
    assert page.locator('.wheel-card').count()==len(pool)
    assert data['groups'][0]['movies'][1]['entryId'] not in page.locator('.wheel-card').evaluate_all('(cs)=>cs.map(c=>c.dataset.entryId)')
    for width in [375,768,1024,1440]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/f'idle-{width}.png'),full_page=True)
    passed('Vòng poster chỉ gồm phim chưa xem, bố cục 375/768/1024/1440 không tràn ngang')
    page.set_viewport_size({'width':1440,'height':1000})
    page.evaluate('Math.random = () => 0.999999')
    record(page,1,pool[0]['entryId'])
    page.get_by_role('button',name='Bốc phim ngay').click()
    expect(page.get_by_role('button',name='Đang quay phim…')).to_be_disabled()
    expect(page.get_by_role('navigation').get_by_role('button',name='Danh sách')).to_be_disabled()
    expect(page.locator('.result-copy')).to_have_count(0)
    expect(page.locator('.movie-wheel')).to_have_attribute('data-phase','slowing')
    page.screenshot(path=str(OUT/'slowing-desktop.png'))
    page.wait_for_function("document.querySelector('.movie-wheel')?.dataset.phase==='revealing'")
    page.screenshot(path=str(OUT/'revealing-desktop.png'))
    pose=assert_winner(page,pool[-1])
    page.wait_for_function("window.wheelSamples?.at(-1)?.phase==='complete'")
    samples=page.evaluate('window.wheelSamples')
    phases={s['phase'] for s in samples}
    assert {'spinning','slowing','revealing','complete'} <= phases
    early,late=velocity(samples)
    assert early>late*3 and late>0, (early,late)
    assert samples[-1]['sameNode']
    assert all(not s['result'] for s in samples if s['phase']!='complete')
    page.screenshot(path=str(OUT/'winner-desktop.png'))
    passed('Quay nhanh rồi giảm tốc, thẻ tiến về tâm/phóng lớn, cùng DOM poster đến kết quả', early_rad_per_s=round(early,2),late_rad_per_s=round(late,2),frames=len(samples),winner=pool[-1]['title'],pose=pose)
    (OUT/'motion-samples.json').write_text(json.dumps(samples,indent=2),encoding='utf-8')
    page.evaluate('Math.random = () => 0')
    record(page,2,pool[0]['entryId'])
    page.get_by_role('button',name='Bốc lại',exact=True).click()
    page.locator('.draw-button').evaluate('(b)=>{b.click();b.click();b.click()}')
    expect(page.locator('.movie-wheel')).to_have_attribute('data-run-id','2')
    assert pool[-1]['entryId'] not in page.locator('.wheel-card').evaluate_all('(cs)=>cs.map(c=>c.dataset.entryId)')
    expect(page.locator('.movie-wheel')).to_have_attribute('data-phase','slowing')
    page.set_viewport_size({'width':375,'height':844})
    assert_winner(page,pool[0])
    expect(page.locator('.movie-wheel')).to_have_attribute('data-run-id','2')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    stage=page.locator('.movie-wheel').bounding_box(); card=page.locator('.wheel-card[data-selected="true"]').bounding_box()
    assert card['x']>=stage['x']-2 and card['x']+card['width']<=stage['x']+stage['width']+2
    assert card['y']>=stage['y']-2 and card['y']+card['height']<=stage['y']+stage['height']+2
    page.screenshot(path=str(OUT/'winner-mobile.png'),full_page=True)
    passed('Bốc lại không trùng, bấm liên tục không tạo lượt mới, resize khi quay không đổi kết quả, poster mobile không cắt')
    page.evaluate('Math.random = () => 0.999999')
    page.get_by_role('button',name='Bốc lại',exact=True).click()
    expect(page.locator('.movie-wheel')).to_have_attribute('data-phase','spinning')
    page.emulate_media(reduced_motion='reduce')
    assert_winner(page,pool[-1])
    passed('Bật giảm chuyển động giữa lượt kết thúc ngay đúng phim và mở khóa nút')
    page.emulate_media(reduced_motion='no-preference')
    data=store(page)
    base=pool[0]
    for i in range(40):
        data['groups'][0]['movies'].append({**base,'id':900000+i,'entryId':f'large-{i}','title':f'Phim trong danh sách dài {i}'})
    save(page,data)
    page.evaluate('Math.random = () => 0.999999')
    page.get_by_role('button',name='Bốc phim ngay').click()
    expect(page.locator('.wheel-card')).to_have_count(10)
    assert_winner(page,data['groups'][0]['movies'][-1])
    passed('Danh sách dài vẫn chọn từ tất cả phim, tối đa 10 thẻ hiển thị luôn bao gồm winner ở cuối danh sách')
    page.emulate_media(reduced_motion='reduce')
    data=store(page)
    only={**base,'poster':None}
    data['groups'][0]['movies']=[only]
    save(page,data)
    page.get_by_role('button',name='Bốc phim ngay').click()
    assert_winner(page,only)
    expect(page.get_by_role('button',name='Bốc lại',exact=True)).to_be_disabled()
    passed('Giảm chuyển động, một phim, thiếu poster vẫn hiển thị đúng fallback và không cho bốc lại')
    page.get_by_role('button',name='Chốt phim này').click()
    expect(page.locator('.movie-wheel')).to_have_attribute('data-phase','idle')
    expect(page.locator('.tonight-banner')).to_contain_text(only['title'])
    page.get_by_role('button',name='Đã xem',exact=True).click()
    page.get_by_role('button',name='Đóng cửa sổ').click()
    page.get_by_role('navigation').get_by_role('button',name='Bốc phim').click()
    expect(page.locator('.wheel-card')).to_have_count(0)
    expect(page.get_by_role('button',name='Bốc phim ngay')).to_be_disabled()
    passed('Chốt/đã xem vẫn hoạt động, hết phim không chạy vòng quay')
    assert not errors,errors
    passed('Không có lỗi JavaScript')
    (OUT/'report.json').write_text(json.dumps({'passed':report,'page_errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
    context.close();browser.close()
