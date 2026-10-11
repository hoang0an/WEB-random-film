"""Production UI against intercepted service responses, not real Supabase/TMDB."""
import base64
import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE=os.getenv('TEST_URL','http://127.0.0.1:3101')
OUT=Path('test-results/live-failures')
OUT.mkdir(parents=True,exist_ok=True)
CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}
USER='00000000-0000-0000-0000-000000000001'
GROUP='00000000-0000-0000-0000-000000000002'
def encode(value): return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token=f'{encode({"alg":"HS256","typ":"JWT"})}.{encode({"sub":USER,"exp":int(time.time())+3600,"role":"authenticated"})}.qa-only-signature'
user={'id':USER,'aud':'authenticated','role':'authenticated','email':'qa@example.invalid','app_metadata':{},'user_metadata':{'name':'QA'},'created_at':'2026-10-09T00:00:00Z'}
session={'access_token':token,'refresh_token':'qa-only-refresh-token','expires_in':3600,'expires_at':int(time.time())+3600,'token_type':'bearer','user':user}
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width in [1440,375]:
        state={'fail_load':True,'fail_pin':True,'fail_search':True,'pin_calls':0}
        movie={'id':'00000000-0000-0000-0000-000000000003','group_id':GROUP,'tmdb_id':27205,'title':'Phim kiểm thử dịch vụ','year':'2026','runtime':148,'overview':'Dữ liệu kiểm thử giả lập.','poster':None,'genres':['Khoa học viễn tưởng'],'added_by':USER,'watched_at':None}
        group={'id':GROUP,'name':'Nhóm kiểm thử dịch vụ','invite_code':'QA2026','tonight_id':None,'members':[{'user_id':USER,'profiles':{'id':USER,'name':'QA'}}],'group_movies':[movie],'ratings':[],'comments':[]}
        context=browser.new_context(viewport={'width':width,'height':900 if width>680 else 844},has_touch=width<=680,is_mobile=width<=680)
        page=context.new_page()
        page.set_default_timeout(7000)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        context.add_init_script('localStorage.setItem("sb-127-auth-token",'+json.dumps(json.dumps(session))+');')
        def service(route):
            url=route.request.url
            if route.request.method=='OPTIONS':
                route.fulfill(status=204,headers=CORS)
                return
            if '/auth/v1/' in url:
                route.fulfill(status=200,headers=CORS,json=user)
            elif urlparse(url).path == '/rest/v1/rpc/get_my_account':
                route.fulfill(status=200,headers=CORS,json={'id':user['id'],'name':user['user_metadata']['name'],'avatar_path':None,'cover_path':None,'revision':0})
            elif '/rest/v1/groups' in url:
                if state['fail_load']: route.fulfill(status=500,headers=CORS,json={'message':'network failure','code':'QA_NETWORK'})
                else: route.fulfill(status=200,headers=CORS,json=[group])
            elif '/rest/v1/rpc/select_movie' in url:
                state['pin_calls']+=1
                if state['fail_pin']: route.fulfill(status=500,headers=CORS,json={'message':'network failure','code':'QA_NETWORK'})
                else:
                    assert route.request.post_data_json['mid']==movie['id']
                    group['tonight_id']=movie['id']
                    route.fulfill(status=200,headers=CORS,json=None)
            else: raise AssertionError('Unexpected mock service route: '+url)
        context.route('http://127.0.0.1:54321/**',service)
        def search(route):
            assert route.request.headers.get('authorization')=='Bearer '+token
            if state['fail_search']: route.fulfill(status=502,json={'error':'Kết nối TMDB chậm. Hãy thử lại.'})
            else: route.fulfill(status=200,headers=CORS,json={'movies':[]})
        context.route('**/api/movies?*',search)
        page.goto(BASE)
        page.wait_for_load_state('networkidle')
        expect(page.locator('.error-banner')).to_contain_text('Không thể kết nối')
        state['fail_load']=False
        page.get_by_role('button',name='Thử lại',exact=True).click()
        expect(page.locator('.error-banner')).to_have_count(0)
        page.get_by_role('button',name='Mở rạp của nhóm').click()
        page.get_by_label('Thể loại',exact=True).select_option('Khoa học viễn tưởng')
        page.get_by_label('Thời lượng',exact=True).select_option('medium')
        page.get_by_role('button',name='Bốc phim ngay',exact=True).click()
        expect(page.locator('.movie-wheel')).to_have_attribute('data-phase','complete')
        expect(page.locator('.result-copy h2')).to_have_text(movie['title'])
        expect(page.locator('.wheel-card[data-selected=true] img')).to_have_attribute('src','/poster-placeholder.svg')
        page.get_by_role('button',name='Chốt phim này',exact=True).evaluate('(b)=>{for(let i=0;i<20;i++)b.click()}')
        expect(page.locator('.toast')).to_contain_text('Không thể kết nối')
        expect(page.get_by_role('button',name='Chốt phim này',exact=True)).to_be_enabled()
        expect(page.locator('.result-copy h2')).to_have_text(movie['title'])
        assert state['pin_calls']==1 and group['tonight_id'] is None
        page.screenshot(path=str(OUT/f'pin-error-{width}.png'),full_page=True)
        state['fail_pin']=False
        page.get_by_role('button',name='Chốt phim này',exact=True).click()
        expect(page.locator('.tonight-banner')).to_contain_text(movie['title'])
        assert state['pin_calls']==2
        # Background loading error preserves cached data; explicit retry recovers.
        state['fail_load']=True
        page.evaluate('window.dispatchEvent(new Event("focus"))')
        expect(page.locator('.error-banner')).to_contain_text('Không thể kết nối')
        expect(page.locator('.tonight-banner')).to_contain_text(movie['title'])
        state['fail_load']=False
        page.get_by_role('button',name='Thử lại',exact=True).click()
        expect(page.locator('.error-banner')).to_have_count(0)
        page.get_by_role('button',name='Xem danh sách').click()
        page.get_by_label('Thêm một bộ phim vào danh sách').fill('Movie')
        expect(page.locator('.search-panel [role=alert]')).to_contain_text('Kết nối TMDB chậm')
        page.get_by_label('Thêm một bộ phim vào danh sách').fill('Movie retry')
        state['fail_search']=False
        expect(page.get_by_text('Không tìm thấy phim. Thử tên tiếng Anh hoặc tên khác nhé.')).to_be_visible()
        assert not errors,errors
        results.append({'width':width,'checks':['initial-load-error-retry','filtered-animation-poster','failed-pin-retains-result','rapid-pin-single-request','pin-retry-success','background-load-retains-data','TMDB-error-recovery'],'page_errors':errors})
        print('PASS:',width,'production UI service failure/recovery scenarios (mock services)',flush=True)
        context.close()
    browser.close()
(OUT/'report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
