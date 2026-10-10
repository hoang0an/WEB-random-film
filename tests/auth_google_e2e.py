"""Optional Google button and OAuth redirect contract; no real Google account."""
import os
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
BASE = os.getenv('TEST_URL', 'http://127.0.0.1:3101')
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 375, 'height': 844})
    page = context.new_page()
    seen = []
    def oauth(route):
        parsed = urlparse(route.request.url)
        assert parsed.path == '/auth/v1/authorize'
        seen.append(parse_qs(parsed.query))
        route.fulfill(status=200, content_type='text/html', body='<p>Mock Google redirect received.</p>')
    context.route('http://127.0.0.1:54321/**', oauth)
    context.route('https://image.tmdb.org/**', lambda route: route.abort())
    page.goto(BASE + '/?invite=AbC123')
    expect(page.get_by_role('button', name='Tiếp tục với Google')).to_be_visible()
    page.get_by_role('button', name='Tiếp tục với Google').click()
    expect(page.get_by_text('Mock Google redirect received.')).to_be_visible()
    assert seen == [{'provider': ['google'], 'redirect_to': [BASE + '/auth/callback?invite=AbC123']}]
    browser.close()
print('PASS: optional Google button and fixed OAuth callback with invite. Mock redirect only.')
