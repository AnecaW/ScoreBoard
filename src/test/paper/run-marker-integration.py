"""Isolated opt-in native Paper test. Requires previously authorized --accept-eula."""
import argparse,json,os,shutil,subprocess,tempfile,time,urllib.request,urllib.parse,zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--accept-eula',action='store_true',required=True);p.add_argument('--paper',type=Path,required=True);p.add_argument('--protocol-client',type=Path,required=True);o=p.parse_args()
repo=Path(__file__).resolve().parents[5];module=repo/'Modules/ScoreBoard';root=Path(tempfile.mkdtemp(prefix='scoreboard-marker-paper-'));plugins=root/'plugins';plugins.mkdir();core=plugins/'PlugModCore';(core/'modules').mkdir(parents=True)
shutil.copy(o.paper,root/'paper.jar');shutil.copy(repo/'PlugModCore/target/plugmodcore-1.0-SNAPSHOT.jar',plugins);shutil.copy(repo/'Modules/PlaceholderAPI/target/PlaceholderAPI.jar',core/'modules');shutil.copy(module/'target/ScoreBoard-1.0-SNAPSHOT.jar',core/'modules/ScoreBoard.jar')
(core/'module-data/PlaceholderAPI').mkdir(parents=True);(core/'module-data/PlaceholderAPI/config.yml').write_text('cloud_enabled: false\n')
token=os.urandom(32).hex();(core/'core-config.yml').write_text(f'modules:\n  auto-load-on-startup: true\n  allow-hot-reload: true\nweb:\n  enabled: true\n  host: 127.0.0.1\n  port: 18085\n  access-token: "{token}"\n')
(root/'eula.txt').write_text('eula=true\n');(root/'server.properties').write_text('server-ip=127.0.0.1\nserver-port=25585\nonline-mode=false\nenforce-secure-profile=false\nview-distance=2\nsimulation-distance=2\ngenerate-structures=false\n')
java=Path(os.environ['JAVA_HOME'])/'bin';classes=root/'classes';classes.mkdir();classpath=(repo/'Modules/CustomCommands/target/integration-classpath.txt').read_text().strip()
subprocess.run([str(java/'javac.exe'),'--release','21','-cp',classpath,'-d',str(classes),str(Path(__file__).with_name('MarkerProbe.java'))],check=True)
with zipfile.ZipFile(plugins/'MarkerProbe.jar','w') as jar:
 for file in classes.rglob('*.class'):jar.write(file,file.relative_to(classes))
 jar.writestr('plugin.yml','name: MarkerProbe\nversion: 1\nmain: org.wannes.integration.MarkerProbe\napi-version: "1.21"\n')
server=None;bot=None;logs=[];checks=[]
def launch():
 global server
 log=(root/f'server-{len(logs)}.log').open('w',encoding='utf-8');logs.append(log)
 server=subprocess.Popen([str(java/'java.exe'),'-Xms256M','-Xmx1024M','-XX:ActiveProcessorCount=2','-jar','paper.jar','--nogui'],cwd=root,stdin=subprocess.PIPE,stdout=log,stderr=subprocess.STDOUT,text=True,creationflags=subprocess.CREATE_NO_WINDOW)
 wait(lambda:'Done (' in Path(log.name).read_text(encoding='utf-8',errors='replace'))
def wait(fn,seconds=240):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  try:
   result=fn()
   if result:return result
  except (OSError,ValueError,KeyError):pass
  if server.poll() is not None:raise RuntimeError(f'Paper exited: {root}')
  time.sleep(.2)
 raise TimeoutError(str(root))
def http(path,values=None):
 data=urllib.parse.urlencode(values).encode() if values is not None else None
 req=urllib.request.Request('http://127.0.0.1:18085'+path,data=data,headers={'Authorization':'Bearer '+token,'Content-Type':'application/x-www-form-urlencoded'})
 with urllib.request.urlopen(req,timeout=20) as response:
  text=response.read().decode();return json.loads(text) if response.headers.get_content_type()=='application/json' else text
def join():
 global bot
 (root/'bot.cjs').write_text('const mc=require('+json.dumps(str(o.protocol_client.resolve()))+");const c=mc.createClient({host:'127.0.0.1',port:25585,username:'MarkerTest',auth:'offline',version:'1.21.11'});c.on('error',e=>console.error(e.message));c.on('end',()=>process.exit());")
 log=(root/f'bot-{len(logs)}.log').open('w');logs.append(log);bot=subprocess.Popen(['node',str(root/'bot.cjs')],stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
def status():return json.loads((plugins/'MarkerProbe/status.json').read_text(encoding='utf-8'))
def check(name,condition):
 assert condition,name
 checks.append(name);print('PASS '+name,flush=True)
try:
 launch();wait(lambda:http('/api/modules'));http('/modules/enable/ScoreBoard',{})
 lines='§aOnline: {right}§l12\nName: {right}%unknown_name%\nLegacy left'
 path='/api/modules/ScoreBoard/scoreboard/'
 http(path+'set',{'pageCount':'1','page.0.id':'page-1','page.0.title':'Marker test','page.0.lines':lines,'page.0.preserveBlankLines':'true'})
 check('marker persists in existing line strings',http(path+'get')['pages'][0]['lines']==lines.split('\n'))
 join();actual=wait(lambda:(s if (s:=status())[0]['left']=='§aOnline: ' else None))
 check('native right column uses FixedFormat without padding',actual[0]=={'left':'§aOnline: ','right':'§a§l12','fixed':True})
 check('independent second marker and unknown placeholder preserved',actual[1]=={'left':'Name: ','right':'%unknown_name%','fixed':True})
 check('legacy unmarked line retains native score behavior',actual[2]=={'left':'Legacy left','right':'','fixed':False})
 check('no marker is sent in native components','{right}' not in json.dumps(actual))
 edited=lines.replace('Online: ','Online players: ').replace('§l12','§l1234');http(path+'set',{'pageCount':'1','page.0.id':'page-1','page.0.title':'Marker test','page.0.lines':edited});wait(lambda:status()[0]['right']=='§a§l1234')
 check('editing either side retains marker and native column',status()[0]['left']=='§aOnline players: ')
 http('/modules/reload/ScoreBoard',{});wait(lambda:status()[0]['right']=='§a§l1234');check('module reload retains right column',True)
 bot.terminate();bot.wait(timeout=10);bot=None;server.stdin.write('stop\n');server.stdin.flush();server.wait(timeout=60);(plugins/'MarkerProbe/status.json').unlink();launch();http('/modules/enable/ScoreBoard',{});join();wait(lambda:status()[0]['right']=='§a§l1234')
 check('full server restart and rejoin restore both columns',http(path+'get')['pages'][0]['lines']==edited.split('\n'))
 (module/'target/marker-paper-results.json').write_text(json.dumps({'passed':checks,'testDirectory':str(root)},indent=2))
 print('Isolated logs: '+str(root))
finally:
 if bot and bot.poll() is None:bot.terminate();bot.wait(timeout=10)
 if server and server.poll() is None:server.stdin.write('stop\n');server.stdin.flush();server.wait(timeout=60)
 for log in logs:log.close()
