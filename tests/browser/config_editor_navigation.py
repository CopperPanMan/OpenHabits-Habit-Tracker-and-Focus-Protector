"""Browser regression checks for the editor (optional development dependency).

Install Playwright and Chromium, then run:
    python tests/browser/config_editor_navigation.py
Uses system Chromium when available, otherwise Playwright's installed browser.
"""
import copy
import functools
import json
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

REPO = Path(__file__).resolve().parents[2]
CONFIG = {
    'metricSettings': [
        {'metricID': 'plan', 'displayName': 'Day Plan', 'dataType': 'timestamp',
         'points': {'value': 2, 'pointsID': 'plan_points'}, 'streaks': {'streaksID': 'plan_streak'}},
        {'metricID': 'focus', 'displayName': 'Focused Work', 'dataType': 'duration'}
    ],
    'lockouts': {'presets': ['workday', 'weekend'], 'blocks': [
        {'id': 'morning', 'name': 'Morning Routine', 'type': 'task_block', 'presets': ['workday'],
         'times': {'beg': '09:00', 'end': '12:00'}, 'typeSpecific': {'task_block_IDs': ['plan']}},
        {'id': 'limit', 'name': 'Daily Limit', 'type': 'duration_block', 'presets': ['weekend'],
         'typeSpecific': {'duration': {'screenTimeID': 'focus'}}}
    ]}
}

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def check_editor(page):
    def load(config):
        page.locator('.import-fallback').evaluate('(element) => element.open = true')
        page.locator('#importText').fill(json.dumps(config))
        page.locator('#parseBtn').click()
        expect(page.locator('#importStatus')).to_have_text('Config loaded successfully.')

    def metric(name):
        return page.locator(f'.metric-card:has(> summary h3:text-is("{name}"))')

    def block(name):
        return page.locator(f'.block-card:has(> summary h3:text-is("{name}"))')

    def header(card):
        return card.locator(':scope > summary')

    def opened(card, value=True):
        expect(card).to_have_js_property('open', value)

    def tab(name):
        page.get_by_role('tab', name=name, exact=True).click()

    load(CONFIG)
    expect(page.locator('.editor-card[open]')).to_have_count(0)
    tab('Metrics')
    expect(header(metric('Day Plan'))).to_contain_text('Timestamp · Points on · Streaks on')
    expect(metric('Day Plan').get_by_label('Display Name', exact=True)).to_be_hidden()
    header(metric('Day Plan')).click()
    opened(metric('Day Plan'))
    expect(metric('Day Plan').locator('details[open]')).to_have_count(0)
    metric('Day Plan').get_by_label('What are you tracking?', exact=True).select_option('number')
    opened(metric('Day Plan'))
    opened(metric('Focused Work'), False)
    metric('Day Plan').get_by_label('Display Name', exact=True).fill('Daily Plan')
    expect(header(metric('Daily Plan'))).to_contain_text('Number')
    header(metric('Daily Plan')).get_by_role('button', name='↓', exact=True).click()
    opened(metric('Daily Plan'))
    opened(metric('Focused Work'), False)
    expect(page.locator('.metric-card').nth(1)).to_contain_text('Daily Plan')
    page.get_by_role('button', name='Undo', exact=True).click()
    opened(metric('Daily Plan'))
    expect(page.locator('.metric-card').first).to_contain_text('Daily Plan')
    page.get_by_role('button', name='Redo', exact=True).click()
    opened(metric('Daily Plan'))

    # Collapsed action buttons must not disclose their source card.
    header(metric('Daily Plan')).click()
    opened(metric('Daily Plan'), False)
    header(metric('Daily Plan')).get_by_role('button', name='Duplicate', exact=True).click()
    opened(metric('Daily Plan'), False)
    opened(metric('Daily Plan Copy'))
    header(metric('Daily Plan Copy')).get_by_role('button', name='Delete', exact=True).click()
    expect(metric('Daily Plan Copy')).to_have_count(0)
    opened(metric('Daily Plan'), False)
    tab('Blocks')
    duplicate = header(block('Morning Routine')).get_by_role('button', name='Duplicate', exact=True)
    duplicate.focus()
    page.keyboard.press('Enter')
    opened(block('Morning Routine'), False)
    opened(block('Morning Routine Copy'))
    header(block('Morning Routine Copy')).get_by_role('button', name='Delete', exact=True).click()

    # Search includes referenced metric names, and survives an edit that rerenders.
    expect(header(block('Daily Limit'))).to_contain_text('All day · Presets: weekend')
    for query, match in [('workday', 'Morning Routine'), ('focus', 'Daily Limit'), ('Focused Work', 'Daily Limit')]:
        page.get_by_role('searchbox', name='Search blocks', exact=True).fill(query)
        expect(block(match)).to_be_visible()
        expect(page.locator('.block-card:visible')).to_have_count(1)
    header(block('Daily Limit')).click()
    block('Daily Limit').get_by_label('Rule Type', exact=True).select_option('duration_block')
    expect(page.get_by_role('searchbox', name='Search blocks', exact=True)).to_have_value('Focused Work')
    opened(block('Daily Limit'))
    page.get_by_role('searchbox', name='Search blocks', exact=True).fill('nothing matches')
    expect(page.locator('#tab-blocks .search-empty')).to_be_visible()
    page.get_by_role('searchbox', name='Search blocks', exact=True).fill('')
    page.locator('#tab-blocks').get_by_role('button', name='Expand All', exact=True).click()
    expect(page.locator('.block-card[open]')).to_have_count(2)
    page.locator('#tab-blocks').get_by_role('button', name='Collapse All', exact=True).click()
    expect(page.locator('.block-card[open]')).to_have_count(0)
    page.get_by_role('button', name='Add Block', exact=True).click()
    opened(block('Block 3'))
    opened(block('Daily Limit'), False)

    tab('Metrics')
    page.locator('.add-metric select').select_option('completion')
    page.get_by_role('button', name='Add metric', exact=True).click()
    opened(metric('Completion'))
    expect(metric('Completion').locator('details[open]')).to_have_count(0)
    page.locator('#tab-metrics').get_by_role('button', name='Expand All', exact=True).click()
    expect(page.locator('.metric-card[open]')).to_have_count(3)
    page.locator('#tab-metrics').get_by_role('button', name='Collapse All', exact=True).click()
    expect(page.locator('.metric-card[open]')).to_have_count(0)
    # Navigator also opens the destination card.
    page.locator('.metric-navigator a').filter(has_text='Daily Plan').click()
    opened(metric('Daily Plan'))

    invalid = copy.deepcopy(CONFIG)
    invalid['metricSettings'][0]['points']['pointsID'] = 'plan'
    invalid['metricSettings'][0]['timestampSettings'] = {'writeMode': 'due_by'}
    invalid['metricSettings'][0]['dates'] = [['Tuesday', '09:00'], ['Friday', '']]
    invalid['lockouts']['blocks'][0]['typeSpecific']['task_block_IDs'] = ['plan', 'missing']
    invalid['lockouts']['globals'] = {'cacheTimezoneMode': 'invalid'}
    load(invalid)
    expect(page.locator('.editor-card[open]')).to_have_count(0)
    tab('Blocks')
    page.get_by_role('searchbox', name='Search blocks', exact=True).fill('nothing matches')
    page.locator('#exportBtn').click()
    expect(page.locator('#validationErrors button')).to_have_count(4)
    expect(metric('Day Plan').get_by_label('Points ID', exact=True)).to_be_focused()
    metric('Day Plan').get_by_label('Points ID', exact=True).fill('plan_points')
    expect(page.locator('#validationErrors button')).to_have_count(3)
    page.get_by_role('searchbox', name='Search metrics', exact=True).fill('nothing matches')
    page.locator('#validationErrors button').filter(has_text='date 2').click()
    expect(page.get_by_role('searchbox', name='Search metrics', exact=True)).to_have_value('')
    due = metric('Day Plan').get_by_label('Due By (HH:MM)', exact=True)
    expect(due.nth(1)).to_be_focused()
    due.nth(1).fill('22:00')
    page.locator('#validationErrors button').filter(has_text='"missing"').click()
    expect(page.get_by_role('searchbox', name='Search blocks', exact=True)).to_have_value('')
    refs = block('Morning Routine').get_by_label('Required Metric ID', exact=True)
    expect(refs.nth(1)).to_be_focused()
    refs.nth(1).select_option('focus')
    page.locator('#validationErrors button').filter(has_text='cacheTimezoneMode').click()
    expect(page.get_by_label('Cache Timezone Mode', exact=True)).to_be_focused()
    page.get_by_label('Cache Timezone Mode', exact=True).select_option('client')
    expect(page.locator('#validationErrors')).to_be_hidden()
    page.locator('#exportBtn').click()
    expect(page.locator('#exportStatus')).to_contain_text('Configuration copied.')
    exported = page.evaluate('JSON.parse(window.copiedConfig)')
    assert exported['lockouts']['blocks'][0]['typeSpecific']['task_block_IDs'] == ['plan', 'focus']
    assert 'itemKey' not in json.dumps(exported)

    page.set_viewport_size({'width': 390, 'height': 844})
    load(CONFIG)
    tab('Metrics')
    header(metric('Day Plan')).focus()
    page.keyboard.press('Enter')
    opened(metric('Day Plan'))
    # Help and field labels retain the icon-only behavior from the previous PR.
    metric('Day Plan').locator('label').filter(has_text='Display Name').click()
    expect(metric('Day Plan').get_by_label('Display Name', exact=True)).to_be_focused()
    icon = metric('Day Plan').get_by_role('button', name='Help for Display Name', exact=True)
    assert icon.evaluate("e => getComputedStyle(e, '::after').content") in ['none', 'normal']
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), page.evaluate("[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().height).map(e => ({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,60),width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,20)")
    tab('Blocks')
    header(block('Morning Routine')).click()
    opened(block('Morning Routine'))
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), page.evaluate("[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().height).map(e => ({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,60),width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,20)")
    page.reload(wait_until='domcontentloaded')
    page.locator('.import-fallback').evaluate('(element) => element.open = true')
    page.locator('#restoreDraftBtn').click()
    expect(page.locator('.editor-card[open]')).to_have_count(0)
    expect(page.locator('#metricsSearch')).to_have_value('')
    expect(page.locator('#blocksSearch')).to_have_value('')


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(REPO / 'docs')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            chromium = shutil.which('chromium')
            options = {'headless': True, 'args': ['--no-sandbox']}
            if chromium:
                options['executable_path'] = chromium
            browser = playwright.chromium.launch(**options)
            page = browser.new_page(viewport={'width': 1280, 'height': 900})
            page.set_default_timeout(5000)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('dialog', lambda dialog: dialog.accept())
            page.route('https://cdnjs.cloudflare.com/**', lambda route: route.abort())
            page.add_init_script("Object.defineProperty(navigator, 'clipboard', {value: {writeText: async text => { window.copiedConfig = text; }}})")
            page.goto(f'http://127.0.0.1:{server.server_port}/', wait_until='domcontentloaded')
            check_editor(page)
            assert not errors, errors
            browser.close()
            print('Browser checks passed: collapsed imports, stable expansion, action buttons, summaries, search, validation navigation, export, mobile layout and draft recovery.')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
