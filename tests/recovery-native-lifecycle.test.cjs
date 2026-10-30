const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const base=path.join(__dirname,'..');
const sourceDir=path.join(base,'android/app/src/main/java/com/capacity/app');

test('actual native lifecycle methods invalidate stale callbacks before storage and permit retry',()=>{
 const plugin=fs.readFileSync(path.join(sourceDir,'RecoveryVaultPlugin.java'),'utf8');
 const owner=fs.readFileSync(path.join(sourceDir,'RecoveryUnlockSession.java'),'utf8');
 const begin=plugin.indexOf('    private void cancelDetached('),end=plugin.indexOf('    @PluginMethod public void cancelPending(',begin);
 assert.ok(begin>0&&end>begin);
 const hookStart=plugin.indexOf('    @Override protected void handleOnStop()'),hookEnd=plugin.indexOf('    @PluginMethod public void save',hookStart);
 assert.ok(hookStart>0&&hookEnd>hookStart);
 const methods=(plugin.slice(begin,end)+plugin.slice(hookStart,hookEnd)).replaceAll('android.os.CancellationSignal','Signal').replaceAll('@Override ','');
 const harness=`package com.capacity.app;
class NativeLifecycleHarness {
 static class PluginCall { int rejected,completed; void reject(String text){ rejected++; } }
 static class Signal { int cancelled; Runnable late; void cancel(){cancelled++; if(late!=null)late.run();} }
 private final RecoveryUnlockSession<PluginCall> unlockSession=new RecoveryUnlockSession<>();
 private Signal unlockCancellation;
 private RecoveryUnlockSession.Request<PluginCall> legacySuccess;
 private void completeUnlocked(PluginCall call){call.completed++;}
 ${methods}
 static void check(boolean value,String label){if(!value)throw new AssertionError(label);}
 static int cases;
 static void done(String name){cases++;System.out.println("PASS "+name);}
 public static void main(String[] args){
  {NativeLifecycleHarness h=new NativeLifecycleHarness();PluginCall c=new PluginCall();var r=h.unlockSession.begin(c,false);h.finishAuthentication(r);h.finishAuthentication(r);check(c.completed==1&&c.rejected==0,"one completion");done("normal success exactly once");}
  {NativeLifecycleHarness h=new NativeLifecycleHarness();PluginCall c=new PluginCall();var r=h.unlockSession.begin(c,false);Signal s=new Signal();h.unlockCancellation=s;s.late=()->h.finishAuthentication(r);h.handleOnStop();h.finishAuthentication(r);check(c.completed==0&&c.rejected==1&&s.cancelled==1,"stop invalidation before synchronous late success");done("stop revokes before cancellation callback");}
  {NativeLifecycleHarness h=new NativeLifecycleHarness();PluginCall a=new PluginCall(),b=new PluginCall();var old=h.unlockSession.begin(a,false);h.handleOnStop();h.handleOnResume();var fresh=h.unlockSession.begin(b,false);Signal signal=new Signal();h.unlockCancellation=signal;h.cancelRequest(old,"late error");h.finishAuthentication(old);check(h.unlockSession.isCurrent(fresh)&&h.unlockCancellation==signal,"old callback cannot clear new request");h.finishAuthentication(fresh);check(a.rejected==1&&a.completed==0&&b.completed==1,"retry");done("late old success and error cannot affect fresh retry");}
  {NativeLifecycleHarness h=new NativeLifecycleHarness();PluginCall c=new PluginCall();var r=h.unlockSession.begin(c,false);h.handleOnDestroy();h.finishAuthentication(r);h.handleOnResume();check(c.completed==0&&c.rejected==1&&h.unlockSession.begin(new PluginCall(),false)==null,"destroy remains terminal");done("destroy invalidates and stays terminal");}
  {NativeLifecycleHarness h=new NativeLifecycleHarness();h.handleOnStop();check(h.unlockSession.begin(new PluginCall(),false)==null,"no start inactive");h.handleOnResume();check(h.unlockSession.begin(new PluginCall(),false)!=null,"start resumed");done("inactive starts refused and resumed starts allowed");}
  {NativeLifecycleHarness h=new NativeLifecycleHarness();PluginCall c=new PluginCall();var r=h.unlockSession.begin(c,true);h.handleOnStop();h.finishAuthentication(r);check(c.completed==0&&c.rejected==0&&h.unlockSession.isCurrent(r),"legacy awaiting resume");h.handleOnResume();check(c.completed==1&&c.rejected==0,"legacy succeeds after resume");done("legacy credential handoff waits for resume");}
  {NativeLifecycleHarness h=new NativeLifecycleHarness();PluginCall c=new PluginCall();var r=h.unlockSession.begin(c,true);h.handleOnStop();h.finishAuthentication(r);h.cancelRequest(r,"page changed");h.handleOnResume();check(c.completed==0&&c.rejected==1,"cancel deferred legacy");done("explicit cancellation clears deferred legacy success");}
  {NativeLifecycleHarness h=new NativeLifecycleHarness();PluginCall c=new PluginCall();var r=h.unlockSession.begin(c,true);h.handleOnStop();h.handleOnDestroy();h.finishAuthentication(r);check(c.completed==0&&c.rejected==1,"legacy destroy");done("destroy also invalidates legacy request");}
  {NativeLifecycleHarness h=new NativeLifecycleHarness();PluginCall a=new PluginCall();var r=h.unlockSession.begin(a,false);check(h.unlockSession.begin(new PluginCall(),false)==null,"no overlapping unlock");h.cancelRequest(r,"cancel");h.cancelRequest(r,"duplicate");check(a.rejected==1,"one rejection");done("overlap refused and repeated cancellation settled once");}
  {NativeLifecycleHarness h=new NativeLifecycleHarness();PluginCall c=new PluginCall();var r=h.unlockSession.begin(c,false);h.cancelRequest(r,"account changed");h.finishAuthentication(r);check(c.completed==0&&c.rejected==1,"account revoke before storage");done("account cancellation prevents late storage operation");}
  System.out.println("Native lifecycle scenarios: "+cases);
 }
}`;
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hp-native-lifecycle-'));
 try{
  fs.writeFileSync(path.join(temp,'RecoveryUnlockSession.java'),owner);
  fs.writeFileSync(path.join(temp,'NativeLifecycleHarness.java'),harness);
  const java=process.env.JAVA_HOME&&fs.existsSync(path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'))?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
  cp.execFileSync(java,['-m','jdk.compiler/com.sun.tools.javac.Main','-d',temp,path.join(temp,'RecoveryUnlockSession.java'),path.join(temp,'NativeLifecycleHarness.java')],{stdio:'pipe'});
  const output=cp.execFileSync(java,['-cp',temp,'com.capacity.app.NativeLifecycleHarness'],{encoding:'utf8'});
  assert.match(output,/Native lifecycle scenarios: 10/);process.stdout.write(output);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('plugin wires request-owned callbacks and UI-thread cancel without changing encryption or removal',()=>{
 const source=fs.readFileSync(path.join(sourceDir,'RecoveryVaultPlugin.java'),'utf8');
 assert.match(source,/runOnUiThread\(\(\) -> beginUnlock\(call\)\)/);
 assert.match(source,/authenticate\(unlockCancellation,/);
 assert.match(source,/finishAuthentication\(current\)/);
 assert.match(source,/cancelRequest\(current,/);
 assert.match(source,/getCallbackId\(\)\.equals\(call.getCallbackId\(\)\)/);
 assert.match(source,/public void cancelPending\(PluginCall call\)/);
 assert.match(source,/private static final String ALIAS = "honorpole.recovery.v1"/);
 assert.match(source,/new File\(getContext\(\)\.getNoBackupFilesDir\(\), "honorpole-recovery-v1"\)/);
 assert.match(source,/new File\(base.getPath\(\) \+ "\.bak"\)\.exists\(\)/);
 assert.match(source,/new File\(base.getPath\(\) \+ "\.new"\)\.exists\(\)/);
 assert.doesNotMatch(source,/private volatile boolean unlocking/);
});
