"""SDK callback, recovery and session isolation with mock Supabase; no real accounts."""
import base64
import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode
from playwright.sync_api import sync_playwright, expect

BASE = os.getenv('TEST_URL', 'http://127.0.0.1:3101')
OUT = Path('test-results/auth-sessions')
OUT.mkdir(parents=True, exist_ok=True)
CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version'}
A = {'id': '00000000-0000-0000-0000-000000000001', 'aud': 'authenticated', 'role': 'authenticated', 'email': 'a@example.com', 'app_metadata': {}, 'user_metadata': {'name': 'An'}, 'created_at': '2026-10-10T00:00:00Z'}
B = {**A, 'id': '00000000-0000-0000-0000-000000000002', 'email': 'b@example.com', 'user_metadata': {'name': 'Bình'}}
def encode(value): return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
def session(user=A, expired=False):
    expiry = int(time.time()) + (-60 if expired else 3600)
    token = f'{encode({"alg":"HS256","typ":"JWT"})}.{encode({"sub":user["id"],"exp":expiry,"role":"authenticated"})}.qa-only-signature'
    return {'access_token': token, 'refresh_token': 'qa-refresh', 'expires_in': 3600, 'expires_at': expiry, 'token_type': 'bearer', 'user': user}
def link(kind):
    s = session()
    return '#' + urlencode({key: s[key] for key in ['access_token', 'refresh_token', 'expires_in', 'token_type']}) + '&type=' + kind

reports = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [1440, 375]:
        errors, calls = [], []
        def context_for(stored=None):
            context = browser.new_context(viewport={'width': width, 'height': 900 if width > 680 else 844}, is_mobile=width <= 680, has_touch=width <= 680)
            state = {'user': A, 'user_error': None, 'logout_error': False, 'update_error': False, 'refresh_error': False, 'search_error': 503, 'defer_groups': False, 'held': []}
            if stored:
                context.add_init_script('if (!sessionStorage.getItem("qa-seeded")) {localStorage.setItem("sb-127-auth-token", ' + json.dumps(json.dumps(stored)) + '); sessionStorage.setItem("qa-seeded","1");}')
            def service(route):
                request = route.request
                if request.method == 'OPTIONS':
                    route.fulfill(status=204, headers=CORS); return
                url = urlparse(request.url)
                payload = request.post_data_json if request.post_data else None
                calls.append((url.path, request.method, payload))
                def fail(code, status=400): route.fulfill(status=status, headers=CORS, json={'code': code, 'msg': code})
                if url.path == '/auth/v1/user':
                    if state['user_error'] == 'network': route.abort(); return
                    if state['user_error']: fail('bad_jwt', 401); return
                    if request.method == 'PUT' and state['update_error']: fail('weak_password'); return
                    route.fulfill(status=200, headers=CORS, json=state['user'])
                elif url.path == '/auth/v1/logout':
                    if state['logout_error']: fail('mock_server_error', 500)
                    else: route.fulfill(status=204, headers=CORS)
                elif url.path == '/auth/v1/token':
                    if parse_qs(url.query).get('grant_type') == ['refresh_token']:
                        if state['refresh_error']: fail('refresh_token_not_found'); return
                    else: state['user'] = B if payload['email'] == B['email'] else A
                    route.fulfill(status=200, headers=CORS, json=session(state['user']))
                elif url.path == '/rest/v1/rpc/get_my_account':
                    current_user = state['user']
                    route.fulfill(status=200, headers=CORS, json={'id': current_user['id'], 'name': current_user['user_metadata']['name'], 'avatar_path': None, 'cover_path': None, 'revision': 0})
                elif url.path == '/rest/v1/groups':
                    group = {'id': '00000000-0000-0000-0000-000000000003', 'name': 'Nhóm riêng của An', 'invite_code': 'GROUPA', 'tonight_id': None, 'members': [{'user_id': A['id'], 'profiles': {'id': A['id'], 'name': 'An'}}], 'group_movies': [], 'ratings': [], 'comments': []}
                    if state['defer_groups'] and request.frame.page == page:
                        state['held'].append((route, group)); return
                    route.fulfill(status=200, headers=CORS, json=[group] if state['user']['id'] == A['id'] else [])
                else: raise AssertionError('Unexpected mock endpoint ' + url.path)
            context.route('http://127.0.0.1:54321/**', service)
            context.route('https://image.tmdb.org/**', lambda route: route.abort())
            def search(route):
                route.fulfill(status=state['search_error'], json={'error': 'Phiên đăng nhập hết hạn.' if state['search_error'] == 401 else 'Không thể kết nối.'})
            context.route('**/api/movies?*', search)
            page = context.new_page()
            page.set_default_timeout(8000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            return context, page, state

        # A confirmation link in a fresh tab really goes through SDK URL handling.
        context, page, state = context_for()
        page.goto(BASE + '/auth/callback?invite=AbC123' + link('signup'))
        expect(page.get_by_role('heading', name='Vào nhóm bằng mã mời')).to_be_visible()
        expect(page.get_by_label('Mã mời', exact=True)).to_have_value('AbC123')
        assert '#' not in page.url
        page.get_by_role('button', name='Đóng cửa sổ').click()
        context.close()

        context, page, state = context_for(session())
        page.goto(BASE + '/auth/callback#error=access_denied&error_code=otp_expired&error_description=expired')
        expect(page.locator('.auth-card').get_by_role('alert')).to_contain_text('Liên kết đã hết hạn')
        expect(page.get_by_role('heading', name='Nhóm của tôi')).to_have_count(0)
        context.close()

        context, page, state = context_for()
        page.goto(BASE + '/auth/reset-password?type=recovery')
        expect(page.get_by_role('link', name='Yêu cầu liên kết mới')).to_be_visible()
        expect(page.get_by_label('Mật khẩu mới')).to_have_count(0)
        assert not any(path == '/auth/v1/user' and method == 'PUT' for path, method, body in calls)
        context.close()

        context, page, state = context_for()
        page.goto(BASE + '/auth/reset-password?invite=AbC123' + link('recovery'))
        expect(page.get_by_label('Mật khẩu mới')).to_be_visible()
        page.reload()
        expect(page.get_by_label('Mật khẩu mới')).to_be_visible()
        page.get_by_label('Mật khẩu mới').fill('next1234')
        page.get_by_label('Nhập lại mật khẩu').fill('wrong123')
        page.get_by_role('button', name='Lưu mật khẩu mới').click()
        expect(page.locator('.auth-card').get_by_role('alert')).to_contain_text('Hai mật khẩu chưa khớp')
        page.get_by_label('Nhập lại mật khẩu').fill('next1234')
        state['update_error'] = True
        page.get_by_role('button', name='Lưu mật khẩu mới').click()
        expect(page.locator('.auth-card').get_by_role('alert')).to_contain_text('Mật khẩu chưa đáp ứng')
        state['update_error'] = False
        state['logout_error'] = True
        page.get_by_role('button', name='Lưu mật khẩu mới').click()
        expect(page.locator('.auth-card').get_by_role('status')).to_contain_text('Mật khẩu đã đổi')
        expect(page.locator('.auth-card').get_by_role('alert')).to_contain_text('Chưa thể đăng xuất')
        state['logout_error'] = False
        page.get_by_role('button', name='Đăng xuất và về đăng nhập').click()
        expect(page.get_by_role('heading', name='Chào bạn trở lại')).to_be_visible()
        expect(page.locator('.auth-card').get_by_role('status')).to_contain_text('Mật khẩu đã đổi')
        assert 'invite=AbC123' in page.url
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.screenshot(path=str(OUT / f'recovery-{width}.png'), full_page=True)
        context.close()

        context, page, state = context_for(session())
        state['user_error'] = 'network'
        page.goto(BASE + '/auth/reset-password')
        expect(page.get_by_role('button', name='Thử lại kết nối')).to_be_visible()
        expect(page.get_by_label('Mật khẩu mới')).to_have_count(0)
        state['user_error'] = None
        page.get_by_role('button', name='Thử lại kết nối').click()
        expect(page.get_by_label('Mật khẩu mới')).to_be_visible()
        context.close()

        # SDK PASSWORD_RECOVERY at the root must also show the recovery form.
        context, page, state = context_for()
        page.goto(BASE + '/' + link('recovery'))
        expect(page.get_by_label('Mật khẩu mới')).to_be_visible()
        expect(page.get_by_role('heading', name='Nhóm của tôi')).to_have_count(0)
        context.close()

        # Cross-tab signout removes A's view, then B never sees A's group.
        context, page, state = context_for(session())
        page.goto(BASE)
        expect(page.locator('.group-card').filter(has_text='Nhóm riêng của An')).to_be_visible()
        other = context.new_page()
        other.goto(BASE)
        expect(other.get_by_role('button', name='Đăng xuất', exact=True)).to_be_visible()
        state['defer_groups'] = True
        with page.expect_request('**/rest/v1/groups?*'):
            page.evaluate('window.dispatchEvent(new Event("focus"))')
        other.get_by_role('button', name='Đăng xuất', exact=True).click()
        expect(page.get_by_role('heading', name='Chào bạn trở lại')).to_be_visible()
        state['user'] = B
        state['defer_groups'] = False
        page.get_by_label('Email', exact=True).fill(B['email'])
        page.get_by_label('Mật khẩu', exact=True).fill('secret123')
        page.get_by_role('button', name='Đăng nhập', exact=True).click()
        expect(page.get_by_text('Bạn chưa tham gia nhóm nào.', exact=False)).to_be_visible()
        for route, group in state['held']:
            route.fulfill(status=200, headers=CORS, json=[group])
        page.wait_for_load_state('networkidle')
        expect(page.locator('.group-card').filter(has_text='Nhóm riêng của An')).to_have_count(0)
        other.close()
        context.close()

        # A network failure preserves a valid session, but verified 401 invalidates it.
        context, page, state = context_for(session())
        state['user_error'] = 'network'
        page.goto(BASE)
        expect(page.locator('.group-card').filter(has_text='Nhóm riêng của An')).to_be_visible()
        expect(page.locator('.error-banner')).to_contain_text('Không thể kết nối')
        state['user_error'] = None
        page.get_by_role('button', name='Thử lại', exact=True).click()
        expect(page.locator('.error-banner')).to_have_count(0)
        page.locator('.group-card').filter(has_text='Nhóm riêng của An').click()
        page.locator('.tabs').get_by_role('button', name='Danh sách').click()
        search = page.locator('.search-input input')
        search.fill('Movie')
        expect(page.locator('.search-panel')).to_contain_text('Không thể kết nối')
        expect(page.get_by_role('button', name='Đăng xuất')).to_be_visible()
        state['search_error'] = 401
        state['user_error'] = 'invalid'
        search.fill('Movie expired')
        expect(page.get_by_role('heading', name='Chào bạn trở lại')).to_be_visible()
        expect(page.locator('.group-card').filter(has_text='Nhóm riêng của An')).to_have_count(0)
        context.close()

        for refresh_error in [False, True]:
            context, page, state = context_for(session(expired=True))
            state['refresh_error'] = refresh_error
            page.goto(BASE)
            expect(page.get_by_role('heading', name='Chào bạn trở lại') if refresh_error else page.locator('.group-card').filter(has_text='Nhóm riêng của An')).to_be_visible()
            context.close()
        assert errors == [], errors
        reports.append({'width': width, 'passed': True})
    browser.close()
(OUT / 'report.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
print('PASS: SDK confirmation/recovery, invalid link, verified reset/reload, update vs logout errors, invite, cross-tab account isolation, network/401 and refresh outcomes. Mock services only.')
