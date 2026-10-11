"""Account UI with local route mocks. Requires root-managed CINEMA_QA_BUILD server.

No hosted reads/writes. Run with TEST_URL=http://localhost:3116.
"""
import base64
import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.getenv('TEST_URL', 'http://localhost:3116')
OUT = Path('test-results/account-live')
OUT.mkdir(parents=True, exist_ok=True)
CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'}
A = {'id': '00000000-0000-0000-0000-000000000001', 'aud': 'authenticated', 'role': 'authenticated', 'email': 'a@example.invalid', 'app_metadata': {}, 'user_metadata': {'name': 'An'}, 'created_at': '2026-10-11T00:00:00Z'}
B = {**A, 'id': '00000000-0000-0000-0000-000000000002', 'email': 'b@example.invalid', 'user_metadata': {'name': 'Bình'}}


def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')


def session(user=A):
    expiry = int(time.time()) + 3600
    token = f'{encode({"alg":"HS256","typ":"JWT"})}.{encode({"sub":user["id"],"exp":expiry,"role":"authenticated"})}.qa-only-signature'
    return {'access_token': token, 'refresh_token': 'qa-refresh', 'expires_in': 3600, 'expires_at': expiry, 'token_type': 'bearer', 'user': user}


def profile(user):
    return {'id': user['id'], 'name': user['user_metadata']['name'], 'revision': 0, 'avatar_path': user['id'] + '/avatar/qa.webp', 'cover_path': None}


reports = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [1440, 375]:
        context = browser.new_context(viewport={'width': width, 'height': 900 if width > 680 else 850}, is_mobile=width <= 680, has_touch=width <= 680)
        context.add_init_script('if (!sessionStorage.getItem("qa-account-seeded")) {localStorage.setItem("sb-127-auth-token",' + json.dumps(json.dumps(session())) + ');sessionStorage.setItem("qa-account-seeded","1");}')
        state = {'user': A, 'profiles': {A['id']: profile(A), B['id']: profile(B)}, 'fail_profile': False, 'fail_ratings': True, 'write_mode': 'normal', 'writes': 0, 'uploads': 0, 'hold_reads': False, 'held': []}
        errors = []
        page = context.new_page()
        page.set_default_timeout(10000)
        page.on('pageerror', lambda error: errors.append(str(error)))

        def service(route):
            request = route.request
            path = urlparse(request.url).path
            if request.method == 'OPTIONS':
                route.fulfill(status=204, headers=CORS)
                return
            if path == '/auth/v1/user':
                route.fulfill(status=200, headers=CORS, json=state['user'])
            elif path == '/auth/v1/logout':
                route.fulfill(status=204, headers=CORS)
            elif path == '/auth/v1/token':
                state['user'] = B if request.post_data_json['email'] == B['email'] else A
                route.fulfill(status=200, headers=CORS, json=session(state['user']))
            elif path == '/rest/v1/groups':
                route.fulfill(status=200, headers=CORS, json=[])
            elif path == '/rest/v1/rpc/get_my_account':
                value = dict(state['profiles'][state['user']['id']])
                if state['hold_reads'] and request.frame.page == page:
                    state['held'].append((route, value))
                elif state['fail_profile']:
                    route.fulfill(status=500, headers=CORS, json={'message': 'network failure'})
                else:
                    route.fulfill(status=200, headers=CORS, json=value)
            elif path == '/rest/v1/rpc/list_my_ratings':
                if state['fail_ratings']:
                    route.fulfill(status=500, headers=CORS, json={'message': 'network failure'})
                else:
                    route.fulfill(status=200, headers=CORS, json={'items': [{'id': 'rating-' + state['user']['id'], 'tmdb_id': 1, 'title': 'Điểm riêng ' + state['user']['user_metadata']['name'], 'year': '2026', 'poster': None, 'score': 8.5, 'is_current_member': False}], 'next_cursor': None})
            elif path == '/rest/v1/rpc/update_my_account':
                state['writes'] += 1
                args = request.post_data_json
                current = state['profiles'][state['user']['id']]
                assert args['p_expected_revision'] == current['revision']
                current['name'] = args['p_name'] or current['name']
                current['revision'] += 1
                if state['write_mode'] == 'lost':
                    # Server committed, response lost, and reconciliation read fails.
                    state['fail_profile'] = True
                    route.abort('failed')
                elif state['write_mode'] == 'hold':
                    state['held'].append((route, dict(current)))
                else:
                    route.fulfill(status=200, headers=CORS, json=current)
            elif path.startswith('/storage/v1/object/'):
                route.fulfill(status=404, headers=CORS, json={'message': 'missing image'})
            else:
                raise AssertionError('Unexpected local mock route: ' + path)

        context.route('http://127.0.0.1:54321/**', service)
        context.route('https://image.tmdb.org/**', lambda route: route.abort())

        def upload(route):
            state['uploads'] += 1
            route.fulfill(status=503, json={'error': 'Dịch vụ ảnh chưa sẵn sàng. Hãy thử lại sau.'})

        context.route('**/api/account/images?*', upload)
        page.goto(BASE)
        account = page.get_by_role('button', name='Tài khoản', exact=True)
        expect(account).to_be_visible()
        state['fail_profile'] = True
        account.click()
        panel = page.get_by_role('dialog', name='Tài khoản của bạn')
        expect(panel.get_by_role('button', name='Tải lại hồ sơ')).to_be_visible()
        expect(panel.get_by_role('button', name='Lưu tên')).to_be_disabled()
        state['fail_profile'] = False
        panel.get_by_role('button', name='Tải lại hồ sơ').click()
        expect(panel.get_by_label('Tên hiển thị')).to_have_value('An')
        # Failed authenticated private downloads use initials and preserve the profile.
        expect(panel.locator('.account-image-avatar')).to_have_text('A')
        expect(panel.get_by_role('button', name='Thử tải điểm lại')).to_be_visible()
        state['fail_ratings'] = False
        panel.get_by_role('button', name='Thử tải điểm lại').click()
        expect(panel.get_by_role('heading', name='Điểm riêng An')).to_be_visible()
        expect(panel.get_by_text('Nhóm đã rời', exact=True)).to_be_visible()
        # Upload failure leaves local preview, never starts the profile mutation.
        png = base64.b64decode(page.evaluate("""() => {const c=document.createElement('canvas');c.width=32;c.height=24;return c.toDataURL('image/png').split(',')[1];}"""))
        panel.get_by_label('Chọn ảnh đại diện').set_input_files({'name': 'qa.png', 'mimeType': 'image/png', 'buffer': png})
        expect(panel.get_by_alt_text('Xem trước ảnh đại diện')).to_be_visible()
        panel.get_by_role('button', name='Lưu ảnh đại diện', exact=True).click()
        expect(panel.get_by_role('alert')).to_contain_text('Dịch vụ ảnh chưa sẵn sàng')
        expect(panel.get_by_alt_text('Xem trước ảnh đại diện')).to_be_visible()
        assert state['uploads'] == 1 and state['writes'] == 0
        panel.get_by_role('button', name='Hủy ảnh đã chọn').click()
        state['write_mode'] = 'lost'
        panel.get_by_label('Tên hiển thị').fill('Tên đã commit')
        panel.get_by_role('button', name='Lưu tên').evaluate('(button) => {for(let i=0;i<12;i++) button.click()}')
        expect(panel.get_by_role('button', name='Tải lại hồ sơ')).to_be_visible()
        expect(panel.get_by_role('alert')).to_contain_text('Chưa xác nhận')
        expect(panel.get_by_role('button', name='Lưu tên')).to_be_disabled()
        assert state['writes'] == 1, 'Uncertain mutation was replayed'
        expect(page.locator('.user-name')).to_have_text('An')
        state['fail_profile'] = False
        panel.get_by_role('button', name='Tải lại hồ sơ').click()
        expect(panel.get_by_label('Tên hiển thị')).to_have_value('Tên đã commit')
        expect(page.locator('.user-name')).to_have_text('Tên đã commit')
        expect(panel.get_by_role('status')).not_to_contain_text('Đã lưu tên')
        assert state['writes'] == 1
        # An unmounted panel cannot publish a late save callback.
        state['write_mode'] = 'hold'
        panel.get_by_label('Tên hiển thị').fill('Tên response muộn')
        with page.expect_request('**/rest/v1/rpc/update_my_account'):
            panel.get_by_role('button', name='Lưu tên').click()
        page.keyboard.press('Escape')
        expect(panel).to_have_count(0)
        for route, value in state['held']:
            route.fulfill(status=200, headers=CORS, json=value)
        state['held'].clear()
        page.wait_for_load_state('networkidle')
        expect(page.locator('.user-name')).to_have_text('Tên đã commit')
        account.click()
        expect(panel.get_by_label('Tên hiển thị')).to_have_value('Tên response muộn')
        expect(page.locator('.user-name')).to_have_text('Tên response muộn')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.keyboard.press('Escape')
        expect(account).to_be_focused()
        # Cross-tab switch while A's read is held must not restore A into B.
        other = context.new_page()
        other.goto(BASE)
        expect(other.get_by_role('button', name='Đăng xuất', exact=True)).to_be_visible()
        state['hold_reads'] = True
        with page.expect_request('**/rest/v1/rpc/get_my_account'):
            account.click()
        other.get_by_role('button', name='Đăng xuất', exact=True).click()
        expect(page.get_by_role('heading', name='Chào bạn trở lại')).to_be_visible()
        state['hold_reads'] = False
        page.get_by_label('Email', exact=True).fill(B['email'])
        page.get_by_label('Mật khẩu', exact=True).fill('qa-secret123')
        page.get_by_role('button', name='Đăng nhập', exact=True).click()
        expect(account).to_be_visible()
        account.click()
        expect(panel.get_by_label('Tên hiển thị')).to_have_value('Bình')
        for route, value in state['held']:
            route.fulfill(status=200, headers=CORS, json=value)
        state['held'].clear()
        page.wait_for_load_state('networkidle')
        expect(panel.get_by_label('Tên hiển thị')).to_have_value('Bình')
        expect(panel.get_by_role('heading', name='Điểm riêng An')).to_have_count(0)
        expect(panel.get_by_role('heading', name='Điểm riêng Bình')).to_be_visible()
        expect(panel.get_by_label('Email', exact=True)).to_have_value(B['email'])
        assert state['writes'] == 2
        assert not errors, errors
        page.screenshot(path=str(OUT / f'account-{width}.png'), full_page=True)
        reports.append({'width': width, 'checks': ['read-retry', 'ratings-retry', 'private-url-fallback', 'upload-failure-preview', 'lost-committed-response-no-replay', 'reload-canonical-profile', 'unmounted-late-write', 'cross-tab-account-switch-late-read', 'mobile-keyboard'], 'writes': state['writes'], 'page_errors': errors})
        context.close()
        print('PASS account local mock faults:', width, flush=True)
    browser.close()
(OUT / 'report.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
