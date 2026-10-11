"""Account forms against intercepted Supabase responses, not real email accounts."""
import base64
import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

BASE = os.getenv('TEST_URL', 'http://127.0.0.1:3101')
OUT = Path('test-results/auth')
OUT.mkdir(parents=True, exist_ok=True)
CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version'}
USER = {'id': '00000000-0000-0000-0000-000000000001', 'aud': 'authenticated', 'role': 'authenticated', 'email': 'an@example.com', 'app_metadata': {}, 'user_metadata': {'name': 'An'}, 'created_at': '2026-10-10T00:00:00Z'}
def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
def session():
    token = f'{encode({"alg":"HS256","typ":"JWT"})}.{encode({"sub":USER["id"],"exp":int(time.time())+3600,"role":"authenticated"})}.qa-only-signature'
    return {'access_token': token, 'refresh_token': 'qa-refresh-token', 'expires_in': 3600, 'expires_at': int(time.time())+3600, 'token_type': 'bearer', 'user': USER}

reports = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [1440, 375]:
        context = browser.new_context(viewport={'width': width, 'height': 900 if width > 680 else 844}, is_mobile=width <= 680, has_touch=width <= 680)
        page = context.new_page()
        page.set_default_timeout(7000)
        errors, calls = [], []
        state = {'login_error': 'invalid_credentials', 'signup_session': False, 'resend_error': False, 'recover_error': False}
        page.on('pageerror', lambda e: errors.append(str(e)))
        def service(route):
            request = route.request
            if request.method == 'OPTIONS':
                route.fulfill(status=204, headers=CORS)
                return
            url = urlparse(request.url)
            payload = request.post_data_json if request.post_data else None
            calls.append({'path': url.path, 'query': parse_qs(url.query), 'body': payload})
            if url.path == '/auth/v1/signup':
                route.fulfill(status=200, headers=CORS, json=session() if state['signup_session'] else USER)
            elif url.path == '/auth/v1/token':
                if state['login_error']:
                    route.fulfill(status=400, headers=CORS, json={'code': state['login_error'], 'msg': 'Invalid login credentials'})
                else:
                    route.fulfill(status=200, headers=CORS, json=session())
            elif url.path == '/auth/v1/resend':
                route.fulfill(status=429 if state['resend_error'] else 200, headers=CORS, json={'code': 'over_email_send_rate_limit', 'msg': 'rate limit'} if state['resend_error'] else {})
            elif url.path == '/auth/v1/recover':
                route.fulfill(status=429 if state['recover_error'] else 200, headers=CORS, json={'code': 'over_email_send_rate_limit', 'msg': 'rate limit'} if state['recover_error'] else {})
            elif url.path == '/auth/v1/logout':
                route.fulfill(status=204, headers=CORS)
            elif url.path == '/auth/v1/user':
                route.fulfill(status=200, headers=CORS, json=USER)
            elif url.path == '/rest/v1/groups':
                route.fulfill(status=200, headers=CORS, json=[])
            elif url.path == '/rest/v1/rpc/get_my_account':
                route.fulfill(status=200, headers=CORS, json={'id': USER['id'], 'name': USER['user_metadata']['name'], 'avatar_path': None, 'cover_path': None, 'revision': 0})
            else:
                raise AssertionError('Unexpected mock route: ' + url.path)
        context.route('http://127.0.0.1:54321/**', service)
        context.route('https://image.tmdb.org/**', lambda route: route.abort())
        page.goto(BASE + '/?invite=AbC123')
        expect(page.get_by_role('heading', name='Chào bạn trở lại')).to_be_visible()
        expect(page.get_by_role('button', name='Tiếp tục với Google')).to_have_count(0)
        page.get_by_role('button', name='Chưa có tài khoản? Đăng ký').click()
        page.get_by_label('Tên của bạn', exact=True).fill('   ')
        page.get_by_label('Email', exact=True).fill('an@example.com')
        page.get_by_label('Mật khẩu', exact=True).fill('secret123')
        page.get_by_label('Nhập lại mật khẩu', exact=True).fill('secret123')
        page.get_by_role('button', name='Tạo tài khoản', exact=True).click()
        expect(page.locator('.auth-card').get_by_role('alert')).to_contain_text('Tên cần từ 1 đến 80 ký tự')
        assert not any(c['path'].endswith('/signup') for c in calls)
        page.get_by_label('Tên của bạn', exact=True).fill(' An ')
        page.get_by_label('Nhập lại mật khẩu', exact=True).fill('wrong123')
        page.get_by_role('button', name='Tạo tài khoản', exact=True).click()
        expect(page.locator('.auth-card').get_by_role('alert')).to_contain_text('Hai mật khẩu chưa khớp')
        page.get_by_label('Nhập lại mật khẩu', exact=True).fill('secret123')
        page.get_by_role('button', name='Hiện mật khẩu', exact=True).click()
        expect(page.get_by_label('Mật khẩu', exact=True)).to_have_attribute('type', 'text')
        page.get_by_role('button', name='Ẩn mật khẩu', exact=True).click()
        page.get_by_role('button', name='Tạo tài khoản', exact=True).evaluate('(button) => { button.click(); button.click(); }')
        expect(page.get_by_role('heading', name='Kiểm tra email của bạn')).to_be_visible()
        assert len([c for c in calls if c['path'].endswith('/signup')]) == 1
        signup = next(c for c in calls if c['path'].endswith('/signup'))
        assert signup['body']['email'] == 'an@example.com'
        assert signup['body']['data']['name'] == 'An'
        assert signup['query']['redirect_to'] == [BASE + '/auth/callback?invite=AbC123']
        resend = page.get_by_role('button', name='Gửi lại email xác nhận', exact=True)
        state['resend_error'] = True
        resend.click()
        expect(page.locator('.auth-card').get_by_role('alert')).to_contain_text('Bạn thao tác quá nhanh')
        state['resend_error'] = False
        resend.click()
        expect(page.locator('.auth-card').get_by_role('status')).to_contain_text('Đã yêu cầu gửi lại')
        expect(page.get_by_role('button', name='Gửi lại sau')).to_be_disabled()
        assert len([c for c in calls if c['path'].endswith('/resend')]) == 2
        page.get_by_role('button', name='Quay lại đăng nhập', exact=True).click()
        expect(page.get_by_label('Mật khẩu', exact=True)).to_have_value('')
        page.get_by_label('Mật khẩu', exact=True).fill('bad')
        page.get_by_role('button', name='Đăng nhập', exact=True).click()
        expect(page.locator('.auth-card').get_by_role('alert')).to_contain_text('Email hoặc mật khẩu chưa đúng')
        state['login_error'] = 'email_not_confirmed'
        page.get_by_role('button', name='Đăng nhập', exact=True).click()
        expect(page.locator('.auth-card').get_by_role('alert')).to_contain_text('Hãy xác nhận email')
        expect(page.get_by_role('button', name='Gửi lại sau')).to_be_disabled()
        page.get_by_role('button', name='Quên mật khẩu?', exact=True).click()
        state['recover_error'] = True
        page.get_by_role('button', name='Gửi liên kết đặt lại', exact=True).click()
        expect(page.locator('.auth-card').get_by_role('alert')).to_contain_text('Bạn thao tác quá nhanh')
        state['recover_error'] = False
        page.get_by_role('button', name='Gửi liên kết đặt lại', exact=True).click()
        expect(page.locator('.auth-card').get_by_role('status')).to_contain_text('Nếu email này có tài khoản')
        recover = [c for c in calls if c['path'].endswith('/recover')][-1]
        assert recover['query']['redirect_to'] == [BASE + '/auth/reset-password?invite=AbC123']
        page.get_by_role('button', name='Quay lại đăng nhập', exact=True).click()
        state['login_error'] = None
        page.get_by_label('Mật khẩu', exact=True).fill('secret123')
        page.get_by_role('button', name='Đăng nhập', exact=True).click()
        expect(page.get_by_role('heading', name='Vào nhóm bằng mã')).to_be_visible()
        expect(page.get_by_label('Mã mời', exact=True)).to_have_value('AbC123')
        page.get_by_role('button', name='Đóng cửa sổ', exact=True).click()
        page.reload()
        expect(page.get_by_role('heading', name='Nhóm của tôi')).to_be_visible()
        page.get_by_role('button', name='Đăng xuất', exact=True).click()
        expect(page.get_by_role('heading', name='Chào bạn trở lại')).to_be_visible()
        assert [c for c in calls if c['path'].endswith('/logout')][-1]['query']['scope'] == ['local']
        state['signup_session'] = True
        page.get_by_role('button', name='Chưa có tài khoản? Đăng ký').click()
        page.get_by_label('Tên của bạn', exact=True).fill('An')
        page.get_by_label('Email', exact=True).fill('an@example.com')
        page.get_by_label('Mật khẩu', exact=True).fill('secret123')
        page.get_by_label('Nhập lại mật khẩu', exact=True).fill('secret123')
        page.get_by_role('button', name='Tạo tài khoản', exact=True).click()
        expect(page.get_by_role('heading', name='Nhóm của tôi')).to_be_visible()
        page.get_by_role('button', name='Đăng xuất', exact=True).click()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        assert errors == [], errors
        page.screenshot(path=str(OUT / f'forms-{width}.png'), full_page=True)
        reports.append({'width': width, 'passed': True, 'requests': len(calls)})
        context.close()
    browser.close()
(OUT / 'report.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
print('PASS: account validation, confirmation/resend, errors, recovery request, login/session/local logout, signup with session, invite, mobile. Mock Supabase only.')
