const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
function part(start, end) { return source.slice(source.indexOf(start), source.indexOf(end)); }
function setup() {
  let time = 0;
  const notifications = [];
  const settings = { intervals: [{id:'a', minutes:1, type:'work'}, {id:'b', minutes:1, type:'break'}], repeatCount: 1 };
  const timer = { status:'idle', setIndex:0, intervalIndex:0, remainingMs:60000, endAt:null };
  const ctx = {settings, timer, Date:{now:()=>time}, notifications, ensureAudio(){}, requestNotificationPermission(){}, startTicking(){}, stopTicking(){}, renderAll(){}, renderTimer(){}, selectInterval(){}, notifyIntervalFinished(...args){ notifications.push(args); }, durationFor(index=timer.intervalIndex){return settings.intervals[index].minutes * 60000;}, currentRemainingMs(){return timer.status === 'running' ? Math.max(0,timer.endAt-time):timer.remainingMs;}};
  vm.createContext(ctx);
  vm.runInContext(part('  function beginFromIdle()', '  function toggleTimer()'), ctx);
  return {ctx, timer, notifications, setTime(value){time=value;}};
}
test('区間終了前には通知せず、終了時に休憩へ移る',()=>{
  const t=setup();t.ctx.beginFromIdle();t.setTime(59999);t.ctx.tick();assert.equal(t.notifications.length,0);assert.equal(t.timer.intervalIndex,0);t.setTime(60000);t.ctx.tick();assert.equal(t.notifications.length,1);assert.equal(t.notifications[0][3],'break');assert.equal(t.timer.endAt,120000);t.ctx.tick();assert.equal(t.notifications.length,1);
});
test('一時停止中は期限を延ばし再開時に残り時間を守る',()=>{
  const t=setup();t.ctx.beginFromIdle();t.setTime(20000);t.ctx.pauseTimer();assert.equal(t.timer.remainingMs,40000);t.setTime(90000);t.ctx.tick();assert.equal(t.notifications.length,0);t.ctx.resumeTimer();assert.equal(t.timer.endAt,130000);t.setTime(129999);t.ctx.tick();assert.equal(t.notifications.length,0);t.setTime(130000);t.ctx.tick();assert.equal(t.notifications.length,1);
});
test('長い停止後の追いつきでは最後の状態だけを通知する',()=>{
  const t=setup();t.ctx.settings.repeatCount=99;t.ctx.beginFromIdle();t.setTime(5000000);t.ctx.tick();assert.equal(t.notifications.length,1);assert.equal(t.timer.status,'running');assert(t.timer.endAt>5000000);
  t.setTime(11900000);t.ctx.tick();assert.equal(t.notifications.length,2);assert.equal(t.timer.status,'complete');assert.equal(t.notifications[1][2],null);
});
test('停止中の音声コンテキストでは通知音を予約しない',()=>{
  let created=0;const ctx={audioContext:{state:'suspended',createGain(){created++}},settings:{volume:0.6}};vm.createContext(ctx);vm.runInContext(part('  function playNotificationTone(', '  function browserNotificationStatus()'),ctx);ctx.playNotificationTone('break');assert.equal(created,0);
});
test('削除の取消・確定・保存エラーでデータを正しく扱う',()=>{
 let approved=false,fail=false;const data={};const ctx={presets:[{id:'a',name:'対象'},{id:'b',name:'別'}],elements:{presetSelect:{value:'a'}},window:{confirm:()=>approved},localStorage:{setItem(k,v){if(fail)throw Error('storage');data[k]=v}},STORAGE_KEYS:{presets:'p'},renderPresets(){},showFeedback(){}};vm.createContext(ctx);vm.runInContext(part('  function deletePreset()', '  function loadPreset()'),ctx);ctx.deletePreset();assert.equal(ctx.presets.length,2);approved=true;fail=true;ctx.deletePreset();assert.equal(ctx.presets.length,2);fail=false;ctx.deletePreset();assert.deepEqual(JSON.parse(data.p).map(x=>x.id),['b']);assert.equal(ctx.presets.length,1);
});

test('区間終了後に処理が遅れている間に停止した場合、次の区間を停止する',()=>{
  const t=setup();t.ctx.beginFromIdle();t.setTime(65000);t.ctx.pauseTimer();assert.equal(t.timer.status,'paused');assert.equal(t.timer.intervalIndex,1);assert.equal(t.timer.remainingMs,55000);assert.equal(t.notifications.length,1);t.setTime(90000);t.ctx.resumeTimer();assert.equal(t.timer.endAt,145000);t.setTime(144999);t.ctx.tick();assert.equal(t.notifications.length,1);
});

test('休憩と作業で異なる通知音をその時点から再生する',()=>{
 const frequencies=[], starts=[];const ctx={settings:{volume:0.6},audioContext:{state:'running',currentTime:10,destination:{},createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}},createOscillator(){const o={type:'',frequency:{value:0},connect(){},start(t){starts.push(t);frequencies.push(o.frequency.value)},stop(){}};return o}}};vm.createContext(ctx);vm.runInContext(part('  function playNotificationTone(', '  function browserNotificationStatus()'),ctx);ctx.playNotificationTone('break');assert.deepEqual(frequencies,[660,880]);assert.deepEqual(starts,[10,10.3]);frequencies.length=0;starts.length=0;ctx.playNotificationTone('work');assert.deepEqual(frequencies,[880,880,880]);assert.deepEqual(starts,[10,10.3,10.6]);
});
