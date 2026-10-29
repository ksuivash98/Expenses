from playwright.sync_api import sync_playwright
import json,time
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(service_workers='block')
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 # Unconfigured setup must retain existing local workflow.
 page.goto('http://localhost:3000/',wait_until='networkidle');page.wait_for_selector('#account-button')
 page.locator('#account-button').click();assert 'не подключён' in page.locator('.account-dialog').inner_text();page.locator('.account-dialog button').last.click()
 page.evaluate("localStorage.setItem('original',localStorage.financeApp_v1)")
 configured="export const cloudConfig={url:'https://test.supabase.co',publicKey:'public-test-key'}"
 page.route('**/cloud-config.js',lambda route:route.fulfill(content_type='text/javascript',body=configured))
 docs={};sessions={};force_conflict=False
 def api(route):
  global force_conflict
  request=route.request;url=request.url
  headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'}
  if request.method=='OPTIONS':route.fulfill(status=204,headers=headers);return
  user=request.headers.get('authorization','Bearer A').split()[-1]
  if '/auth/v1/token' in url:
   data=request.post_data_json;uid='B' if data.get('email','').startswith('b@') else 'A'
   result={'access_token':uid,'refresh_token':'refresh','expires_at':int(time.time())+3600,'user':{'id':uid,'email':data.get('email')}}
  elif '/rpc/' in url:
   data=request.post_data_json;revision=docs.get(user,{}).get('revision',0)
   if data['expected_revision']!=revision:
    route.fulfill(status=409,headers=headers,json={'message':'SYNC_CONFLICT'});return
   docs[user]={'data':data['document'],'revision':revision+1};result=revision+1
  elif '/finance_documents' in url:result=[docs[user]] if user in docs else []
  else:result={}
  route.fulfill(headers=headers,json=result)
 page.route('https://test.supabase.co/**',api)
 def login(email):
  page.locator('#account-button').click();page.locator('input[name=email]').fill(email);page.locator('input[name=password]').fill('test-pass-123');page.locator('form button[type=submit]').first.click();page.wait_for_function("document.querySelector('#account-button')?.textContent.includes('Синхронизировано')")
 def logout():
  page.locator('#account-button').click();page.get_by_role('button',name='Выйти на этом устройстве',exact=True).click();page.wait_for_function("document.querySelector('#account-button')?.textContent.includes('Войти')")
 page.reload(wait_until='networkidle');login('a@example.com')
 assert page.evaluate("localStorage.financeApp_v1===localStorage.original")
 page.evaluate("async()=>{const {incomeService}=await import('/income.js');incomeService.add({title:'Account A',source:'Зарплата',amount:1000,date:'2026-10-29'})}")
 page.wait_for_function("document.querySelector('#account-button').textContent.includes('Синхронизировано')")
 assert docs['A']['data']['income'][0]['title']=='Account A'
 logout();login('b@example.com')
 assert page.evaluate("async()=>{const {storage}=await import('/storage.js');return storage.list('income').length}")==0
 logout();login('a@example.com')
 assert page.evaluate("async()=>{const {storage}=await import('/storage.js');return storage.list('income')[0].title}")=='Account A'
 docs['A']['revision']+=1
 page.evaluate("async()=>{const {storage}=await import('/storage.js');storage.updateSettings({currency:'USD'})}")
 page.wait_for_function("document.querySelector('#account-button').textContent.includes('Конфликт')")
 assert docs['A']['data']['settings']['currency']=='RUB'
 assert not errors,errors
 context.close()
 # Actual service worker: installation, offline reload and scoped assets.
 context=browser.new_context();page=context.new_page();page.goto('http://localhost:3000/',wait_until='networkidle')
 page.evaluate('navigator.serviceWorker.ready');page.reload(wait_until='networkidle');assert page.evaluate('!!navigator.serviceWorker.controller')
 context.set_offline(True);page.reload(wait_until='load');page.wait_for_selector('.dashboard-overview');assert page.locator('#account-button').count()==1
 context.close();browser.close()
 print('PASS: local mode, login, user isolation, synchronization, logout, conflict protection, service worker and offline reload')
