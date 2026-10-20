"""Chromium DOM+behavior probe in about:blank with in-memory fake-IDB only.
NOT an actual IndexedDB/file:// browser test and NOT a release gate.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[2]
html=(ROOT/'dist/phase2-9-one-region-smoke.html').read_text(encoding='utf8')
js=(ROOT/'tests/browser/mock-idb-browser.js').read_text(encoding='utf8')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':720})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.evaluate(js)
    page.set_content(html,wait_until='domcontentloaded',timeout=20000)
    page.wait_for_function('window.__MP_TEST_READY__',timeout=20000)
    print('READY',page.evaluate('window.__MP_TEST_READY__'), 'FAKE',page.evaluate('window.__MP_FAKE_BROWSER_DB__'))
    print('STATE',page.locator('#message').text_content())
    page.locator('#team-count').select_option('2')
    page.locator('#new-expedition').click()
    page.wait_for_function('document.querySelector("#slot-active").textContent.includes("revision")',timeout=20000)
    print('CREATE',page.locator('#slot-active').text_content(),page.locator('#message').text_content())
    def revision():
        return int(page.locator('#slot-active').text_content().split('revision ')[1])
    def done_click(locator):
        before=revision()
        locator.click()
        page.wait_for_function('(old)=> {const m=document.querySelector("#slot-active").textContent.match(/revision (\\d+)/);return m&&Number(m[1])>old}',arg=before,timeout=12000)
    def fill():
        pane=page.locator('#question-pane')
        page.wait_for_function('!document.getElementById("question-pane").hidden',timeout=10000)
        if pane.locator('input[name=q-answer]').count():
            pane.locator('input[name=q-answer]').first.check()
        elif pane.locator('select.q-part').count():
            for sel in pane.locator('select.q-part').all():
                sel.select_option(index=1)
        elif pane.locator('#free-response').count():
            pane.locator('#free-response').fill('학생이 교과서 학습 개념을 구체적 근거와 함께 설명함')
        else:raise AssertionError('No answer UI')
    def run_question(decision):
        done_click(page.locator('#draw-question'))
        done_click(page.locator('#timer-start'))
        fill()
        if decision=='CORRECT' and revision()<10:
            page.screenshot(path=str(ROOT/'test-logs/phase2-step2-9-dialog-preview.png'))
        done_click(page.locator('#submit-answer'))
        done_click(page.locator('#judge-'+('right' if decision=='CORRECT' else 'wrong')))
        page.wait_for_function('document.querySelector("#question-pane").hidden',timeout=8000)
    run_question('CORRECT')
    print('Q1',page.locator('#turn-status').text_content())
    page.locator('#team-select').select_option('TEAM_02')
    run_question('INCORRECT')
    print('Q2',page.locator('#turn-status').text_content())
    done_click(page.locator('#intercept-open'))
    done_click(page.locator('#timer-start'))
    fill()
    done_click(page.locator('#submit-answer'))
    done_click(page.locator('#judge-right'))
    print('INTERCEPT',page.locator('#turn-status').text_content())
    done_click(page.locator('#complete-region'))
    print('RESULT',page.locator('#results').inner_text())
    done_click(page.locator('#next-region'))
    done_click(page.locator('#recovery-call'))
    done_click(page.locator('#timer-start'))
    fill()
    done_click(page.locator('#submit-answer'))
    done_click(page.locator('#judge-right'))
    print('RECOVERY',page.locator('#turn-status').text_content())
    print('STATUS',page.locator('#status-data').inner_text())
    metrics={item.locator('span').inner_text():item.locator('strong').inner_text() for item in page.locator('#status-data .status-row').all()}
    assert metrics['별빛']=='3', metrics
    assert metrics['열쇠']=='1', metrics
    assert metrics['회수 대기']=='0', metrics
    assert page.locator('#region-title').text_content().startswith('푸른 폭포길')
    print('JS errors',errors)
    assert not errors,errors
    assert '열쇠' in page.locator('#status-data').inner_text()
    assert '3' in page.locator('#status-data').inner_text()
    page.screenshot(path=str(ROOT/'test-logs/phase2-step2-9-browser-dom-mock.png'))
    browser.close()
