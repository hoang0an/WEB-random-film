import assert from 'node:assert/strict';

// Run through the connected CUA browser runtime, never by reading stored sessions.
// app must be localhost:4320 QA build; controller must be loopback :4318.
export async function runGroupFaultChecks(app,controller, {deferMembershipCheck=false}={}) {
  assert.equal(new URL(await app.url()).origin,'http://localhost:4320');
  assert.equal(new URL(await controller.url()).origin,'http://127.0.0.1:4318');
  const results=[];
  const button=(tab,name)=>tab.playwright.getByRole('button',{name,exact:true});
  const observe=tab=>tab.playwright.domSnapshot();
  async function control(name) {await button(controller,name).click();await observe(controller);}
  async function reset() {await control('reset');await app.reload();await button(app,/^QA quản lý nhóm /).waitFor({state:'visible'});await button(app,/^QA quản lý nhóm /).click();await observe(app);}
  async function removal() {
    await button(app,'Danh sách 1').click();await observe(app);
    await button(app,/^Poster QA phim chờ /).click();await observe(app);
    await button(app,'Xóa khỏi danh sách').click();await observe(app);
  }
  async function stats() {await controller.reload();await observe(controller);return JSON.parse(await controller.playwright.locator('pre').innerText());}
  await reset();await removal();await button(app,'Hủy').click();await observe(app);
  assert.ok(await button(app,'Xóa khỏi danh sách').isVisible());
  results.push({test:'Cancel deletion preserves detail and record',pass:true});
  await button(app,'Xóa khỏi danh sách').click();await observe(app);await control('drop-before');
  await button(app,'Xác nhận xóa').click();await observe(app);
  await app.playwright.locator('.toast').filter({hasText:'Không thể kết nối'}).waitFor({state:'visible'});
  await button(app,'Xác nhận xóa').waitFor({state:'visible'});
  assert.ok(await button(app,'Xác nhận xóa').isEnabled());
  assert.equal((await stats()).groups[0].pending,1);
  assert.equal((await stats()).counts.delete_movie,1);
  results.push({test:'Lost connection before commit preserves record, unlocks retry, no automatic duplicate mutation',pass:true});
  await control('normal');await button(app,'Xác nhận xóa').click();await observe(app);
  await button(app,'Danh sách 0').waitFor({state:'visible'});
  assert.equal((await stats()).counts.delete_movie,2);
  results.push({test:'Retry after restoring network succeeds once',pass:true});
  await reset();await removal();await control('drop-after');
  await button(app,'Xác nhận xóa').click();await observe(app);
  await button(app,'Danh sách 0').waitFor({state:'visible'});
  assert.equal((await stats()).counts.delete_movie,1);
  assert.equal((await stats()).groups[0].pending,0);
  assert.equal(await app.playwright.getByRole('dialog').count(),0);
  results.push({test:'Lost acknowledgement after commit reconciles from server and closes obsolete detail without duplicate delete',pass:true});
  await reset();await button(app,'Cài đặt nhóm').click();await observe(app);
  await app.playwright.locator('#rename-group').fill('QA đổi tên chậm');await control('hold');
  await button(app,'Lưu tên nhóm').click();await observe(app);
  assert.equal(await button(app,'Lưu tên nhóm').isEnabled(),false);
  assert.equal(await button(app,'Tối nay xem gì?').isEnabled(),false);
  await app.playwright.locator('#rename-group').press('Enter');await observe(app);
  assert.equal((await stats()).counts.rename_group,1);
  results.push({test:'Held request prevents duplicate submit and group navigation while pending',pass:true});
  await control('hide-first');
  await app.pressKey(null,'Tab');await observe(app);
  if(deferMembershipCheck) return results;
  return results.concat(await finishMembershipCheck(app,controller));
}

export async function finishMembershipCheck(app,controller) {
  const results=[];
  const button=(tab,name)=>tab.playwright.getByRole('button',{name,exact:true});
  const observe=tab=>tab.playwright.domSnapshot();
  async function control(name) {await button(controller,name).click();await observe(controller);}
  // Call after the browser has observed its background polling update.
  await button(app,/^QA nhóm thứ hai /).waitFor({state:'visible',timeoutMs:55000});
  assert.equal(await app.playwright.getByRole('dialog').count(),0);
  await control('release');
  await button(app,/^QA nhóm thứ hai /).waitFor({state:'visible'});
  for(let i=0;i<8;i++) {if(await button(app,/^QA nhóm thứ hai /).isEnabled())break;await observe(app);}
  await button(app,/^QA nhóm thứ hai /).click();await observe(app);
  assert.equal(await app.playwright.getByRole('dialog').count(),0);
  assert.equal(await app.playwright.locator('#rename-group').count(),0);
  assert.equal(await app.playwright.getByRole('heading',{name:'QA quản lý nhóm',exact:true}).count(),0);
  results.push({test:'Membership disappearance during held request clears editor; stale denial cannot reopen old group after navigation',pass:true});
  return results;
}

export async function runGroupKeyboardChecks(app) {
  const results=[];
  const button=name=>app.playwright.getByRole('button',{name,exact:true});
  const active=()=>app.playwright.evaluate(()=>({name:document.activeElement?.getAttribute('aria-label'),tag:document.activeElement?.tagName,id:document.activeElement?.id,text:document.activeElement?.textContent?.trim(),inside:!!document.activeElement?.closest('[role=dialog]')}));
  await button('Cài đặt nhóm').click();await app.getAXState({emit:false});
  assert.equal((await active()).name,'Đóng cửa sổ');
  await app.pressKey(null,'Shift+Tab');await app.getAXState({emit:false});
  assert.ok((await active()).inside);
  const last=(await active()).text;
  await app.pressKey(null,'Tab');await app.getAXState({emit:false});
  assert.equal((await active()).name,'Đóng cửa sổ');
  await app.pressKey(null,'Escape');await app.getAXState({emit:false});
  assert.equal(await app.playwright.getByRole('dialog').count(),0);
  assert.equal((await active()).text,'Cài đặt nhóm');
  results.push({test:'Settings initial focus, Shift-Tab/Tab trap and Escape restores trigger',last,pass:true});
  return results;
}

export async function runCommentRecoveryChecks(app,controller) {
  const button=(tab,name)=>tab.playwright.getByRole('button',{name,exact:true});
  async function control(name) {await button(controller,name).click();await controller.playwright.domSnapshot();}
  await control('reset');await app.reload();
  await button(app,/^QA quản lý nhóm /).click();await app.playwright.domSnapshot();
  await button(app,'Đã xem 1').click();await app.playwright.domSnapshot();
  await button(app,/^Poster QA phim đã xem /).click();await app.playwright.domSnapshot();
  await button(app,'Sửa bình luận').click();await app.playwright.domSnapshot();
  const draft=app.playwright.getByRole('textbox',{name:'Sửa bình luận của bạn',exact:true});
  await draft.fill('QA bản nháp phục hồi');await control('drop-before');
  await button(app,'Lưu bình luận').click();await app.playwright.domSnapshot();
  await app.playwright.locator('.toast').filter({hasText:'Không thể kết nối'}).waitFor({state:'visible'});
  assert.equal(await draft.getAttribute('maxlength'),'1000');
  assert.equal(await draft.evaluate(e=>e.value),'QA bản nháp phục hồi');
  assert.ok(await button(app,'Lưu bình luận').isEnabled());
  await controller.reload();let stats=JSON.parse(await controller.playwright.locator('pre').innerText());
  assert.equal(stats.groups[0].comments[0],'QA bình luận gốc');assert.equal(stats.counts.edit_comment,1);
  await control('normal');await button(app,'Lưu bình luận').click();await app.playwright.domSnapshot();
  await app.playwright.getByText('QA bản nháp phục hồi',{exact:true}).waitFor({state:'visible'});
  assert.equal(await draft.count(),0);
  await controller.reload();stats=JSON.parse(await controller.playwright.locator('pre').innerText());
  assert.equal(stats.counts.edit_comment,2);assert.equal(stats.groups[0].comments[0],'QA bản nháp phục hồi');
  return [{test:'Comment draft survives lost connection, original preserved; explicit retry saves once and closes editor',pass:true}];
}

export async function runOfflineLoadCheck(app,controller) {
  const button=(tab,name)=>tab.playwright.getByRole('button',{name,exact:true});
  await button(controller,'offline').click();await controller.playwright.domSnapshot();
  await app.reload();await app.playwright.domSnapshot();
  await button(app,'Thử lại').waitFor({state:'visible'});
  assert.ok((await app.playwright.getByRole('alert').allTextContents()).some(t=>t.includes('Không thể kết nối')));
  await button(controller,'normal').click();await controller.playwright.domSnapshot();
  await button(app,'Thử lại').click();await app.playwright.domSnapshot();
  await button(app,/^QA quản lý nhóm /).waitFor({state:'visible'});
  assert.equal(await button(app,'Thử lại').count(),0);
  return [{test:'Offline initial group load shows retry; restoring network and retry loads groups without logout',pass:true}];
}

// One checkpoint per request lets CUA wait on observable state rather than sleep.
export async function startDeadlineCheck(app,controller,mode='hold') {
  const button=(tab,name)=>tab.playwright.getByRole('button',{name,exact:true});
  await button(controller,'release').click();await controller.playwright.domSnapshot();
  await button(controller,'reset').click();await controller.playwright.domSnapshot();
  await app.reload();await button(app,/^QA quản lý nhóm /).click();await app.playwright.domSnapshot();
  await button(app,'Đã xem 1').click();await app.playwright.domSnapshot();
  await button(app,/^Poster QA phim đã xem /).click();await app.playwright.domSnapshot();
  await button(app,'Sửa bình luận').click();await app.playwright.domSnapshot();
  await app.playwright.getByRole('textbox',{name:'Sửa bình luận của bạn',exact:true}).fill('QA bản nháp timeout');
  await button(controller,mode).click();await controller.playwright.domSnapshot();
  const started=Date.now();await button(app,'Lưu bình luận').click();await app.playwright.domSnapshot();
  assert.equal(await button(app,'Lưu bình luận').isEnabled(),false);
  assert.equal(await button(app,'Tối nay xem gì?').isEnabled(),false);
  return {mode,started};
}
export async function finishDeadlineCheck(app,controller,checkpoint) {
  const button=(tab,name)=>tab.playwright.getByRole('button',{name,exact:true});
  const save=button(app,'Lưu bình luận');
  const end=Date.now()+35000;
  while(!await save.isEnabled() && Date.now()<end) await app.playwright.domSnapshot();
  assert.ok((await app.playwright.domSnapshot()).includes('Máy chủ chưa phản hồi'));
  assert.ok(await save.isEnabled());assert.ok(await button(app,'Tối nay xem gì?').isEnabled());
  assert.equal(await app.playwright.getByRole('textbox',{name:'Sửa bình luận của bạn',exact:true}).evaluate(e=>e.value),'QA bản nháp timeout');
  await controller.reload();let state=JSON.parse(await controller.playwright.locator('pre').innerText());
  assert.equal(state.counts.edit_comment,1);
  assert.equal(state.groups[0].comments[0],checkpoint.mode==='hold-after'?'QA bản nháp timeout':'QA bình luận gốc');
  const observedMs=Date.now()-checkpoint.started;
  // Switch group before delivering a late success; old result must stay ignored.
  await button(app,'Hủy sửa').click();await app.playwright.domSnapshot();
  await button(app,'Đóng cửa sổ').click();await app.playwright.domSnapshot();
  await button(app,'Tối nay xem gì?').click();await app.playwright.domSnapshot();
  await button(app,/^QA nhóm thứ hai /).click();await app.playwright.domSnapshot();
  await button(controller,'release').click();await controller.playwright.domSnapshot();
  await app.playwright.domSnapshot();
  assert.equal(await app.playwright.getByRole('dialog').count(),0);
  assert.equal(await app.playwright.getByRole('heading',{name:'QA nhóm thứ hai',exact:true}).count(),1);
  await controller.reload();state=JSON.parse(await controller.playwright.locator('pre').innerText());
  assert.equal(state.counts.edit_comment,1);
  return {test:`${checkpoint.mode}: deadline unlocks UI, preserves draft, no replay; late response cannot reopen old group`,pass:true,observedMs};
}
