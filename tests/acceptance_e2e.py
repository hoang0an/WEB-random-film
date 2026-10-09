"""Real animation acceptance tests. Uses isolated browser data, never user storage."""
import copy
import json
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE=os.getenv('TEST_URL','http://localhost:3000')
OUT=Path(os.getenv('QA_OUTPUT','test-results/acceptance'))
OUT.mkdir(parents=True,exist_ok=True)
KEY='tonight-cinema-demo-v1'
report={'base':BASE,'passed':[],'failed':[],'page_errors':[]}

def group_page(browser,width):
    context=browser.new_context(viewport={'width':width,'height':900 if width>680 else 844},has_touch=width<=680,is_mobile=width<=680,reduced_motion='no-preference')
    page=context.new_page()
    page.set_default_timeout(7000)
    page.on('pageerror',lambda e:report['page_errors'].append(str(e)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.get_by_role('button',name='Khám phá bản dùng thử').click()
    page.get_by_role('button',name='Mở rạp của nhóm').click()
    page.wait_for_load_state('networkidle')
    return context,page

def saved(page):
    return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)

def seed(page,movies):
    data=saved(page)
    data['groups'][0]['movies']=movies
    data['groups'][0]['tonightId']=None
    page.evaluate('([key,data])=>localStorage.setItem(key,JSON.stringify(data))',[KEY,data])
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('button',name='Mở rạp của nhóm').click()

def update(page,change):
    data=saved(page)
    change(data['groups'][0]['movies'])
    page.evaluate('([key,data])=>{const value=JSON.stringify(data);localStorage.setItem(key,value);window.dispatchEvent(new StorageEvent("storage",{key,newValue:value}));}',[KEY,data])

def winner(page,movie,fallback=False):
    expect(page.locator('.movie-wheel')).to_have_attribute('data-phase','complete',timeout=7000)
    expect(page.locator('.result-copy h2')).to_have_text(movie['title'])
    card=page.locator('.wheel-card[data-selected=true]')
    expect(card).to_have_attribute('data-entry-id',movie['entryId'])
    image=card.locator('img')
    suffix='/poster-placeholder.svg' if fallback or not movie['poster'] else movie['poster']
    assert image.get_attribute('src').endswith(suffix)
    assert image.evaluate('(i)=>i.complete && i.naturalWidth>0')
    pose=card.evaluate('(c)=>{const m=new DOMMatrix(getComputedStyle(c).transform);return [m.m41,m.m42,m.m43,Number(getComputedStyle(c).opacity)]}')
    assert abs(pose[0])<.1 and abs(pose[1])<.1 and pose[2]>100 and pose[3]==1
    assert page.locator('.wheel-card').evaluate_all('(cs)=>cs.filter(c=>Number(getComputedStyle(c).opacity)>.99).length')==1

def tap(page,name):
    button=page.get_by_role('button',name=name,exact=True)
    if page.viewport_size['width']<=680: button.tap()
    else: button.click()

def flow(page):
    movies=saved(page)['groups'][0]['movies']
    eligible=[m for m in movies if 'Khoa học viễn tưởng' in m['genres'] and m['runtime']>120]
    page.get_by_label('Thể loại',exact=True).select_option('Khoa học viễn tưởng')
    page.evaluate('Math.random=()=>0')
    # Repeated DOM clicks exercise the handler guard even before React disables controls.
    page.get_by_role('button',name='Bốc phim ngay',exact=True).evaluate('(b)=>{for(let i=0;i<20;i++)b.click()}')
    expect(page.locator('.movie-wheel')).to_have_attribute('data-run-id','1')
    expect(page.get_by_label('Thể loại',exact=True)).to_be_disabled()
    expect(page.locator('.result-copy')).to_have_count(0)
    winner(page,eligible[0])
    tap(page,'Bốc lại')
    winner(page,eligible[1])
    assert eligible[1]['entryId']!=eligible[0]['entryId']
    page.get_by_role('button',name='Chốt phim này',exact=True).evaluate('(b)=>{for(let i=0;i<20;i++)b.click()}')
    expect(page.locator('.tonight-banner')).to_contain_text(eligible[1]['title'])
    data=saved(page)['groups'][0]
    assert data['tonightId']==eligible[1]['entryId']
    assert next(m for m in data['movies'] if m['entryId']==data['tonightId'])['watchedAt'] is None
    page.screenshot(path=str(OUT/f'flow-{page.viewport_size["width"]}.png'),full_page=True)

def duration_flow(page):
    page.get_by_label('Thể loại',exact=True).select_option('Khoa học viễn tưởng')
    page.get_by_label('Thời lượng',exact=True).select_option('medium')
    expect(page.locator('.filter-summary')).to_contain_text('1 / 6')
    tap(page,'Bốc phim ngay')
    selected=next(m for m in saved(page)['groups'][0]['movies'] if m['title']=='Inception')
    winner(page,selected)
    assert 120<selected['runtime']<=150 and 'Khoa học viễn tưởng' in selected['genres']
    expect(page.get_by_role('button',name='Bốc lại',exact=True)).to_be_disabled()
    tap(page,'Chốt phim này')
    expect(page.locator('.tonight-banner')).to_contain_text('Inception')

def empty(page):
    seed(page,[])
    expect(page.get_by_role('button',name='Bốc phim ngay',exact=True)).to_be_disabled()
    expect(page.locator('.wheel-card')).to_have_count(0)
    tap(page,'Xem danh sách 0')
    expect(page.get_by_label('Thêm một bộ phim vào danh sách')).to_be_visible()

def only(page):
    movie=saved(page)['groups'][0]['movies'][0]
    seed(page,[movie])
    tap(page,'Bốc phim ngay')
    winner(page,movie)
    expect(page.get_by_role('button',name='Bốc lại',exact=True)).to_be_disabled()

def no_match(page):
    page.get_by_label('Thể loại',exact=True).select_option('Khoa học viễn tưởng')
    page.get_by_label('Thời lượng',exact=True).select_option('short')
    expect(page.locator('.filter-summary')).to_contain_text('0 / 6')
    expect(page.get_by_role('button',name='Bốc phim ngay',exact=True)).to_be_disabled()
    expect(page.locator('.wheel-card')).to_have_count(0)
    tap(page,'Xóa lọc')
    expect(page.get_by_role('button',name='Bốc phim ngay',exact=True)).to_be_enabled()

def no_poster(page):
    movie=saved(page)['groups'][0]['movies'][0]
    movie['poster']=None
    seed(page,[movie])
    tap(page,'Bốc phim ngay')
    winner(page,movie,True)

def broken_poster(page):
    movie=saved(page)['groups'][0]['movies'][0]
    page.route('https://image.tmdb.org/**',lambda route:route.abort())
    seed(page,[movie])
    tap(page,'Bốc phim ngay')
    winner(page,movie,True)

def return_result(page):
    page.evaluate('Math.random=()=>0')
    tap(page,'Bốc phim ngay')
    selected=saved(page)['groups'][0]['movies'][0]
    winner(page,selected)
    page.get_by_role('button',name='Xem danh sách').click()
    page.get_by_role('navigation').get_by_role('button',name='Bốc phim',exact=True).click()
    expect(page.locator('.movie-wheel')).to_have_attribute('data-phase','complete',timeout=500)
    winner(page,selected)

def changed_during_spin(page):
    page.get_by_label('Thể loại',exact=True).select_option('Khoa học viễn tưởng')
    page.get_by_label('Thời lượng',exact=True).select_option('medium')
    tap(page,'Bốc phim ngay')
    expect(page.locator('.movie-wheel')).to_have_attribute('data-phase','spinning')
    update(page,lambda movies: next(m for m in movies if m['title']=='Inception').update({'runtime':90}))
    expect(page.locator('.movie-wheel')).to_have_attribute('data-phase','idle',timeout=7000)
    expect(page.locator('.result-copy')).to_have_count(0)
    expect(page.get_by_role('button',name='Bốc phim ngay',exact=True)).to_be_disabled()

def changed_after_result(page):
    page.get_by_label('Thể loại',exact=True).select_option('Khoa học viễn tưởng')
    tap(page,'Bốc phim ngay')
    selected=next(m for m in saved(page)['groups'][0]['movies'] if m['entryId']==page.locator('.movie-wheel').get_attribute('data-winner-id'))
    winner(page,selected)
    update(page,lambda movies: next(m for m in movies if m['entryId']==selected['entryId']).update({'genres':['Hài']}))
    expect(page.locator('.result-copy')).to_have_count(0)
    expect(page.locator('.movie-wheel')).to_have_attribute('data-phase','idle')

def write_error(page):
    page.evaluate('Math.random=()=>0')
    tap(page,'Bốc phim ngay')
    selected=saved(page)['groups'][0]['movies'][0]
    winner(page,selected)
    page.evaluate('() => {window.originalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value){if(key==="tonight-cinema-demo-v1")throw new DOMException("blocked","QuotaExceededError");return window.originalSetItem.call(this,key,value)};}')
    tap(page,'Chốt phim này')
    expect(page.locator('.toast')).to_contain_text('không cho lưu dữ liệu')
    expect(page.get_by_role('button',name='Chốt phim này',exact=True)).to_be_enabled()
    assert saved(page)['groups'][0]['tonightId'] is None
    winner(page,selected)
    page.evaluate('() => {Storage.prototype.setItem=window.originalSetItem;}')
    tap(page,'Chốt phim này')
    expect(page.locator('.tonight-banner')).to_contain_text(selected['title'])

def corrupted_read(page):
    page.evaluate('(key)=>localStorage.setItem(key,"{invalid")',KEY)
    page.reload()
    page.wait_for_load_state('networkidle')
    expect(page.locator('.toast')).to_contain_text('không đọc được')
    page.get_by_role('button',name='Khám phá bản dùng thử').click()
    page.get_by_role('button',name='Mở rạp của nhóm').click()
    expect(page.locator('.filter-summary')).to_contain_text('6 / 6')

SCENARIOS=[('filtered-flow-spam-pin',flow),('genre-duration-single',duration_flow),('empty-list',empty),('one-movie',only),('no-match-reset',no_match),('missing-poster',no_poster),('failed-poster-request',broken_poster),('return-to-result',return_result),('data-changes-during-spin',changed_during_spin),('data-changes-after-result',changed_after_result),('storage-write-error-retry',write_error),('corrupt-data-read-recovery',corrupted_read)]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width in [1440,375]:
        for name,scenario in SCENARIOS:
            context,page=group_page(browser,width)
            case=f'{width}px/{name}'
            try:
                scenario(page)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                report['passed'].append(case)
                print('PASS:',case,flush=True)
            except Exception as e:
                report['failed'].append({'case':case,'error':str(e)})
                page.screenshot(path=str(OUT/f'FAILED-{width}-{name}.png'),full_page=True)
                print('FAIL:',case,str(e).splitlines()[0],flush=True)
            finally:
                context.close()
    browser.close()
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
sys.exit(bool(report['failed'] or report['page_errors']))
