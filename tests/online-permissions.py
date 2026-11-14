import json,re,urllib.request,urllib.error,time,secrets
from pathlib import Path
cfg=open(Path(__file__).resolve().parents[1]/'js/firebase-config.js').read();cfg=json.loads(cfg[cfg.index('{'):cfg.rindex('}')+1]);base=cfg['databaseURL']
def req(u,data=None,method='GET'):
 try:
  r=urllib.request.urlopen(urllib.request.Request(u,data=None if data is None else json.dumps(data).encode(),method=method,headers={'Content-Type':'application/json'}),timeout=15);return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
def auth():
 s,d=req('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+cfg['apiKey'],{'returnSecureToken':True},'POST');assert s==200,(s,d);return d['idToken'],d['localId']
h,hu=auth();g,gu=auth();x,xu=auth();code='QA'+''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for i in range(4));url=base+'/rooms/'+code
room={'host':hu,'hostHero':'david','createdAt':int(time.time()*1000)}
try:
 assert req(base+'/rooms.json')[0]==401;print('PASS unauthenticated root read denied')
 assert req(url+'.json?auth='+h,room,'PUT')[0]==200;print('PASS owner creates room')
 assert req(url+'/guest.json?auth='+g,gu,'PUT')[0]==200;print('PASS first guest claims slot')
 assert req(url+'/guest.json?auth='+x,xu,'PUT')[0] in (401,403);print('PASS third user cannot replace guest')
 assert req(url+'/offer.json?auth='+x,{'type':'offer','sdp':'fake'},'PUT')[0] in (401,403);print('PASS outsider cannot alter host signaling')
 assert req(url+'/answer.json?auth='+x,{'type':'answer','sdp':'fake'},'PUT')[0] in (401,403);print('PASS outsider cannot alter guest signaling')
 assert req(url+'/host.json?auth='+g,gu,'PUT')[0] in (401,403);print('PASS guest cannot take ownership')
 assert req(url+'.json?auth='+x,None,'DELETE')[0] in (401,403);print('PASS outsider cannot delete room')
finally:
 req(url+'.json?auth='+h,None,'DELETE')
 for t in [h,g,x]:req('https://identitytoolkit.googleapis.com/v1/accounts:delete?key='+cfg['apiKey'],{'idToken':t},'POST')
print('PASS QA room and anonymous accounts cleaned')
