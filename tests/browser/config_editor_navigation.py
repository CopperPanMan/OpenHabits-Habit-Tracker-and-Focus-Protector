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
    expect(page.get_by_role('tab', name='Global', exact=True)).to_have_count(0)
    expect(page.locator('details[data-section-key="metric-settings"]')).to_have_js_property('open', False)
    expect(page.get_by_label('Spreadsheet ID Property Name', exact=True)).to_be_hidden()
    page.locator('details[data-section-key="metric-settings"] > summary').click()
    expect(page.get_by_label('Metric ID Column', exact=True)).to_be_visible()
    expect(page.get_by_label('Spreadsheet ID Property Name', exact=True)).to_be_hidden()
    page.locator('details[data-section-key="metric-standalone"] > summary').click()
    expect(page.get_by_label('Spreadsheet ID Property Name', exact=True)).to_be_visible()
    expect(page.get_by_label('Time Opened Metric ID', exact=True)).to_have_count(0)
    expect(page.get_by_label('Cumulative Screentime Metric ID', exact=True)).to_have_count(0)
    expect(header(metric('Day Plan'))).to_contain_text('Timestamp · Points on · Streaks on')
    expect(metric('Day Plan').get_by_label('Display Name', exact=True)).to_be_hidden()
    page.locator('details[data-section-key="metric-settings"] > summary').click()
    metric('Day Plan').scroll_into_view_if_needed()
    handle = metric('Day Plan').locator('.drag-handle')
    source = handle.bounding_box()
    target = header(metric('Focused Work')).bounding_box()
    page.mouse.move(source['x'] + source['width']/2, source['y'] + source['height']/2)
    page.mouse.down()
    page.mouse.move(target['x'] + target['width']/2, target['y'] + target['height'] - 2, steps=8)
    page.mouse.up()
    expect(page.locator('.metric-card').nth(1)).to_contain_text('Day Plan')
    opened(metric('Day Plan'), False)
    page.locator('#exportBtn').click()
    assert [m['metricID'] for m in page.evaluate('JSON.parse(window.copiedConfig).metricSettings')] == ['focus', 'plan']
    page.get_by_role('button', name='Undo', exact=True).click()
    expect(page.locator('.metric-card').first).to_contain_text('Day Plan')
    # Escape cancels a pending move without changing order or opening the card.
    source = metric('Day Plan').locator('.drag-handle').bounding_box()
    target = header(metric('Focused Work')).bounding_box()
    page.mouse.move(source['x'] + 10, source['y'] + 10)
    page.mouse.down()
    page.mouse.move(target['x'] + 10, target['y'] + target['height'] - 2)
    page.keyboard.press('Escape')
    page.mouse.up()
    expect(page.locator('.metric-card').first).to_contain_text('Day Plan')
    expect(page.locator('.drop-before, .drop-after, .drag-source')).to_have_count(0)
    header(metric('Day Plan')).click()
    opened(metric('Day Plan'))
    expect(metric('Day Plan').locator('details[open]')).to_have_count(0)
    metric('Day Plan').get_by_label('What are you tracking?', exact=True).select_option('number')
    opened(metric('Day Plan'))
    opened(metric('Focused Work'), False)
    metric('Day Plan').get_by_label('Display Name', exact=True).fill('Daily Plan')
    expect(header(metric('Daily Plan'))).to_contain_text('Number')
    expect(metric('Daily Plan').get_by_role('button', name='Drag to reorder Daily Plan', exact=True)).to_be_visible()
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
    completion = metric('Completion')
    completion.locator(':scope > details').first.evaluate('(element) => element.open = true')
    completion.locator('details:has(> summary > span:text-is("Points Properties"))').evaluate('(element) => element.open = true')
    completion.get_by_label('Enable Points', exact=True).check()
    expect(completion.get_by_label('Maximum Streak Multiplier', exact=True)).to_have_value('1.2')
    expect(completion.get_by_label('Days Until Maximum Multiplier', exact=True)).to_have_value('5')
    assert completion.evaluate("e => !!(e.querySelector('[data-field=\"Maximum Streak Multiplier\"]').compareDocumentPosition(e.querySelector('[data-field=\"Days Until Maximum Multiplier\"]')) & Node.DOCUMENT_POSITION_FOLLOWING)")
    assert '20%' in completion.get_by_role('button', name='Help for Maximum Streak Multiplier', exact=True).get_attribute('data-help')
    completion.get_by_label('Maximum Streak Multiplier', exact=True).fill('1.5')
    completion.get_by_label('Enable Points', exact=True).uncheck()
    completion.get_by_label('Enable Points', exact=True).check()
    expect(completion.get_by_label('Maximum Streak Multiplier', exact=True)).to_have_value('1.5')
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
    page.locator('details[data-section-key="blocks-presets"]').evaluate('(e) => e.open = false')
    block('Morning Routine').scroll_into_view_if_needed()
    session = page.context.new_cdp_session(page)
    session.send('Emulation.setTouchEmulationEnabled', {'enabled': True})
    source = block('Morning Routine').locator('.drag-handle').bounding_box()
    target = header(block('Daily Limit')).bounding_box()
    session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': source['x'] + 10, 'y': source['y'] + 10}]})
    session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': target['x'] + 10, 'y': target['y'] + target['height'] - 2}]})
    session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    expect(page.locator('.block-card').nth(1)).to_contain_text('Morning Routine')
    opened(block('Morning Routine'), False)
    page.get_by_role('button', name='Undo', exact=True).click()
    expect(page.locator('.block-card').first).to_contain_text('Morning Routine')
    session.detach()
    page.locator('details[data-section-key="blocks-presets"]').evaluate('(e) => e.open = true')
    header(block('Morning Routine')).click()
    opened(block('Morning Routine'))
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), page.evaluate("[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().height).map(e => ({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,60),width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,20)")
    preset_section = page.locator('details:has(> summary > span:text-is("Preset Modes"))')
    learn_more = page.locator('details[data-section-key="blocks-presets-learn-more"]')
    expect(learn_more).to_have_js_property('open', False)
    expect(page.locator('#presetCalendarGuide')).to_be_hidden()
    expect(page.locator('#presetCalendarSummary')).to_be_visible()
    expect(preset_section.get_by_role('button', name='Add preset', exact=True)).to_be_visible()
    expect(preset_section.get_by_placeholder('New preset name')).to_be_visible()
    # Native disclosure works with the keyboard; editing presets preserves it.
    learn_more.locator(':scope > summary').focus()
    page.keyboard.press('Enter')
    expect(page.locator('#presetCalendarGuide')).to_be_visible()
    expect(learn_more).to_contain_text('Google Calendar')
    expect(learn_more).to_contain_text('two minutes from the first detected absence')
    preset_section.get_by_placeholder('New preset name').fill('holiday')
    preset_section.get_by_role('button', name='Add preset', exact=True).click()
    expect(learn_more).to_have_js_property('open', True)
    learn_more.locator(':scope > summary').focus()
    page.keyboard.press('Space')
    expect(learn_more).to_have_js_property('open', False)
    expect(preset_section).to_contain_text('one all-day event per day')
    expect(preset_section).to_contain_text('App Lockout Settings')
    expect(preset_section).to_contain_text('Google Calendar')
    expect(preset_section).to_contain_text('two minutes from the first detected absence')
    expect(preset_section).to_contain_text('Chrome currently applies all blocks when no preset is found')
    page.locator('details[data-section-key="block-settings"] > summary').click()
    page.get_by_label('Preset Calendar Name', exact=True).fill('My Modes')
    tab('Blocks')
    expect(page.locator('#presetCalendarGuide')).to_contain_text('Create a calendar named "My Modes"')
    expect(page.locator('#presetCalendarSummary')).to_contain_text('on "My Modes"')
    expect(learn_more).to_have_js_property('open', False)
    page.reload(wait_until='domcontentloaded')
    page.locator('.import-fallback').evaluate('(element) => element.open = true')
    page.locator('#restoreDraftBtn').click()
    expect(page.locator('.editor-card[open]')).to_have_count(0)
    expect(page.locator('details[data-section-key="blocks-presets-learn-more"]')).to_have_js_property('open', False)
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
            print('Browser checks passed: collapsed imports, stable expansion, mouse/touch reordering and cancellation, settings placement, action buttons, summaries, search, validation navigation, export, mobile layout and draft recovery.')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
