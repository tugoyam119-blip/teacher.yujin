"""PHASE2-9 real navigation preflight. Reports BLOCKED separately from code FAIL.
Does not bypass corporate browser policies or claim native IndexedDB on failure.
"""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright
import json,platform,subprocess
root=Path(__file__).resolve().parents[2]
file=(root/'dist/phase2-9-one-region-smoke.html').resolve()
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(file.parent),**kw)
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
info={'dateKST':'2026-10-16','os':platform.platform(),'browser':subprocess.run(['/usr/bin/chromium','--version'],capture_output=True,text=True).stdout.strip(),
      'headless':True,'engine':'Chromium','testPurpose':'real file:// and localhost navigation preflight','schemes':{},'nativeIndexedDbExecuted':False,
      'environmentPolicyBypassAttempted':False,'officialGatePASS':False}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for label,url in [('file',file.as_uri()),('localhost',f'http://127.0.0.1:{server.server_address[1]}/{file.name}')]:
  page=browser.new_page()
  try:
   page.goto(url,wait_until='domcontentloaded',timeout=8000)
   info['schemes'][label]={'navigation':'LOADED','nativeIndexedDbTest':'NOT_RUN'}
  except Exception as error:
   message=str(error)
   status='BLOCKED_ADMIN_POLICY' if 'ERR_BLOCKED_BY_ADMINISTRATOR' in message else 'NAVIGATION_ERROR'
   info['schemes'][label]={'navigation':status,'error':message.splitlines()[0][:230], 'nativeIndexedDbTest':'NOT_EXECUTED'}
  finally:page.close()
 browser.close()
server.shutdown()
info['result']='BLOCKED' if all(x['navigation']=='BLOCKED_ADMIN_POLICY' for x in info['schemes'].values()) else 'INCOMPLETE_REVIEW_REQUIRED'
info['notes']='A blocked navigation is not evidence that native IndexedDB itself is defective. Windows Chrome/Edge actual offline tests are still required.'
output=root/'test-logs/phase2-step2-9-native-preflight.json'
output.write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(info,ensure_ascii=False,indent=2))
