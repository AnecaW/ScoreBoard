const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../../main/resources/web/scoreboard.js'),'utf8');
function text(value){return {nodeType:3,nodeValue:value};}
class Element{
 constructor(){this.nodeType=1;this.childNodes=[];this.dataset={};this.style={};this.classList={contains:()=>false};}
 append(...children){for(const child of children){child.parentElement=this;this.childNodes.push(child);}}
 hasAttribute(name){return name==='data-right-marker'&&this.dataset.rightMarker==='true';}
 getAttribute(){return null;}
 contains(node){return node===this||this.childNodes.some(c=>c===node||(c.contains&&c.contains(node)));}
 focus(){}
}
function environment(value,start,end=start){
 const editor=new Element();editor.append(text(value));const toolbar=new Element();const row={querySelector:()=>toolbar};let range={startContainer:editor.childNodes[0],endContainer:editor.childNodes[0],startOffset:start,endOffset:end,
  cloneRange(){return {...this};},collapse(toStart){assert.equal(toStart,true);this.endOffset=this.startOffset;},
  insertNode(marker){const original=editor.childNodes[0].nodeValue;editor.childNodes=[];editor.append(text(original.slice(0,this.startOffset)),marker,text(original.slice(this.startOffset)));},setStartAfter(){this.startContainer=editor;this.endContainer=editor;}};
 const selection={rangeCount:1,getRangeAt:()=>range,removeAllRanges(){},addRange(r){range=r;}};
 const status={};const context={console,Node:{TEXT_NODE:3,ELEMENT_NODE:1},URLSearchParams,setTimeout,clearTimeout,window:{getSelection:()=>selection,getComputedStyle:()=>({color:'',fontWeight:'400',fontStyle:'normal'})},document:{createElement:()=>new Element(),getElementById:()=>status,addEventListener(){}}};vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname,'../../../../../PlugModCore/src/main/resources/web/minecraft-text-editor.js'),'utf8'),context);context.MinecraftTextEditor=context.window.MinecraftTextEditor;vm.runInContext(source,context);vm.runInContext('updatePreview=()=>{};scheduleAutoSave=()=>{};',context);context.row=row;context.editor=editor;vm.runInContext('installRightAlignButton(row,editor)',context);
 return {editor,button:toolbar.childNodes[0],context,status,serialize:()=>vm.runInContext('serializeEditor(editor)',context)};
}
test('inserts at the real mid-line cursor and serializes marker instead of visible badge',()=>{const e=environment('Online: 12',8);e.button.onclick();assert.equal(e.serialize(),'Online: {right}12');assert.equal(e.button.textContent,'Right align');});
test('selection inserts at its start without deleting selected content',()=>{const e=environment('Online: 123',8,11);e.button.onclick();assert.equal(e.serialize(),'Online: {right}123');});
test('empty line, start and end cursor positions work',()=>{for(const [value,offset,expected]of [['',0,'{right}'],['12',0,'{right}12'],['Online',6,'Online{right}']]){const e=environment(value,offset);e.button.onclick();assert.equal(e.serialize(),expected);}});
test('duplicate marker is refused and different lines are independent',()=>{const a=environment('A1',1),b=environment('B2',1);a.button.onclick();b.button.onclick();a.button.onclick();assert.equal(a.serialize(),'A{right}1');assert.equal(b.serialize(),'B{right}2');assert.match(a.status.textContent,/already/);});
test('saved marker reopens as a noneditable token while following formatting survives',()=>{const e=environment('');assert.match(vm.runInContext("mcToHtml('§aBefore {right}§l12')",e.context),/data-right-marker="true" contenteditable="false"/);assert.match(vm.runInContext("mcToHtml('§aBefore {right}§l12')",e.context),/font-weight:700/);});
test('old segment and width controls are absent from production editor',()=>{assert.doesNotMatch(source,/installAlignmentControls|lineLayouts|alignmentWidth|ScoreboardAlignment/);});
