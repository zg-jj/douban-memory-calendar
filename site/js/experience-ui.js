import {ExperienceEvent} from './domain.js';
import {escapeHtml as h,typeName} from './views.js';

export function installExperienceUI(app) {
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="experience-dialog" class="experience-dialog" aria-labelledby="experience-title">
      <button class="close-button" id="close-experience" aria-label="关闭体验详情">×</button>
      <p class="dialog-eyebrow">留住作品，也留住那时的自己</p>
      <h2 id="experience-title">添加一次体验</h2>
      <form id="experience-form">
        <label class="event-field">作品<select id="event-item" required></select></label>
        <div id="event-cover-line"></div>
        <div class="event-field-row">
          <label class="event-field">体验日期<input id="event-date" type="date" min="0001-01-01" max="9999-12-31"><small>记不清可以留空，归入“日期待补充”</small></label>
          <label class="event-field">这一次的评分<select id="event-rating"><option value="0">暂不评分</option><option value="1">★ 1 星</option><option value="2">★★ 2 星</option><option value="3">★★★ 3 星</option><option value="4">★★★★ 4 星</option><option value="5">★★★★★ 5 星</option></select><small>仅属于本次体验，收藏评分用于推荐</small></label>
        </div>
        <details class="event-date-source"><summary>原始记录日期与说明</summary><label class="event-field">原始记录日期<input id="event-original-date" type="date" min="0001-01-01" max="9999-12-31"><small>仅保留来源信息，不用于安排日历。</small></label><label class="event-field">日期说明<textarea id="event-date-note" maxlength="500" rows="2" placeholder="例如：日历展示顺延日期，非核实的实际观看日期"></textarea></label></details>
        <label class="event-field">这一次的短评<textarea id="event-comment" maxlength="500" rows="3" placeholder="关于作品的感受，最多500字"></textarea></label>
        <label class="event-field">那天的记忆<textarea id="event-memory" maxlength="140" rows="2" placeholder="愿意留下的心情、地点或一起度过时光的人"></textarea></label>
        <label class="event-field">豆瓣个人记录链接（选填）<input id="event-link" type="url" placeholder="https://…douban.com/…"><small>填写自己的收藏或评论页面链接；未填写时使用作品页</small></label>
        <div id="event-douban-link" class="external-link-line"></div>
        <p id="event-error" class="error" role="alert"></p>
        <div class="dialog-actions"><button type="button" id="remove-event" class="danger-text">删除这次体验</button><button type="submit" class="primary">保存这次体验</button></div>
      </form>
    </dialog>`);
  const $=selector=>document.querySelector(selector), dialog=$('#experience-dialog');
  let editingId=null;
  const renderWork=()=>{
    const item=app.items.find(item=>item.id===$('#event-item').value);
    $('#event-cover-line').innerHTML=item?`<div class="event-work"><img src="${h(item.cover)}" alt="${h(item.title)}封面"><div><strong>${h(item.title)}</strong><p>${typeName(item)}${item.creator?' · '+h(item.creator):''}</p></div></div>`:'';
    const personal=$('#event-link').value.trim(), url=personal||item?.doubanUrl||'';
    let safe='';try{const u=new URL(url);if(u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='douban.com'||u.hostname.endsWith('.douban.com')))safe=u.href;}catch{}
    $('#event-douban-link').innerHTML=safe?`<a href="${h(safe)}" target="_blank" rel="noopener noreferrer">${personal?'查看豆瓣记录':'查看豆瓣作品'} ↗</a>`:'<span>尚未填写豆瓣链接，可以先保存在本地。</span>';
  };
  app.openExperience=(id=null,itemId=null)=>{
    const event=id?app.store.getEvent(id):null;if(id&&!event)return;
    editingId=event?.id||null;
    $('#experience-title').textContent=event?'这一次的书影音时光':'添加一次体验';
    $('#event-item').innerHTML=app.items.map(item=>`<option value="${h(item.id)}">${h(item.title)} · ${typeName(item)}</option>`).join('');
    $('#event-item').value=event?.itemId||itemId||app.items[0]?.id||'';
    $('#event-item').disabled=Boolean(event);
    $('#event-date').value=event?.experiencedAt||'';
    $('#event-rating').value=String(event?.rating||0);
    $('#event-comment').value=event?.comment||'';
    $('#event-memory').value=event?.memory||'';
    $('#event-link').value=event?.doubanRecordUrl||'';
    $('#event-original-date').value=event?.originalExperiencedAt||'';
    $('#event-date-note').value=event?.dateNote||'';
    dialog.querySelector('.event-date-source').open=Boolean(event?.originalExperiencedAt||event?.dateNote);
    $('#event-error').textContent='';$('#remove-event').hidden=!event;
    renderWork();dialog.showModal();
  };
  $('#close-experience').addEventListener('click',()=>dialog.close());
  $('#event-item').addEventListener('change',renderWork);
  $('#event-link').addEventListener('input',renderWork);
  $('#experience-form').addEventListener('submit',event=>{
    event.preventDefault();
    try{
      const old=editingId?app.store.getEvent(editingId):null;
      app.store.saveEvent(new ExperienceEvent({...old,itemId:$('#event-item').value,
        experiencedAt:$('#event-date').value,rating:Number($('#event-rating').value),
        originalExperiencedAt:$('#event-original-date').value,dateNote:$('#event-date-note').value,
        comment:$('#event-comment').value,memory:$('#event-memory').value,
        doubanRecordUrl:$('#event-link').value.trim(),updatedAt:new Date().toISOString()}));
      app.history.length=0;app.render();dialog.close();
      app.toast(app.storageError?'体验已更新，但本地保存失败，请导出备份':'已保存这一次的时光');
    }catch(error){$('#event-error').textContent=error.message;}
  });
  $('#remove-event').addEventListener('click',()=>{
    if(!editingId||!confirm('删除这次体验？作品收藏和其他体验会保留。'))return;
    app.store.removeEvent(editingId);app.history.length=0;app.render();dialog.close();
    app.toast(app.storageError?'体验已删除，但本地保存失败':'已删除这次体验');
  });
  app.renderCollectionEvents=itemId=>{
    const events=app.store.allEvents().filter(event=>event.itemId===itemId);
    $('#collection-events').innerHTML=events.length?events.map(event=>`<button type="button" data-event-id="${h(event.id)}">${event.experiencedAt||'日期待补充'} <span>${event.rating?'★'.repeat(event.rating):'未评分'}</span></button>`).join(''):'<p>还没有体验记录。添加一次，让作品出现在日历中。</p>';
  };
  $('#collection-events').addEventListener('click',event=>{
    const button=event.target.closest('[data-event-id]');if(!button)return;
    $('#record-dialog').close();app.openExperience(button.dataset.eventId);
  });
  $('#add-collection-event').addEventListener('click',()=>{
    const id=app.currentItem?.id;if(!id)return;$('#record-dialog').close();app.openExperience(null,id);
  });
}
