from pathlib import Path
from playwright.sync_api import sync_playwright

Path('test-results').mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1050})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    print('Initial buttons:', page.get_by_role('button').all_text_contents())
    page.get_by_role('button', name='Khám phá bản dùng thử').click()
    page.get_by_role('button', name='Mở rạp của nhóm', exact=False).click()
    page.wait_for_load_state('networkidle')
    print('Group buttons:', page.get_by_role('button').all_text_contents())
    print('Headings:', page.get_by_role('heading').all_text_contents())
    page.screenshot(path='test-results/desktop-initial.png', full_page=True)
    print('Errors:', errors)
    browser.close()
