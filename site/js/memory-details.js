import {RecordObserver} from './domain.js';
import {escapeHtml as h, statusName} from './views.js';

const headings = {movie:'我的观影票根',book:'我的阅读卡片',music:'我的聆听记录'};
const captions = {movie:'CINEMA / A MOMENT KEPT',book:'LIBRARY / BETWEEN THE PAGES',music:'RECORDS / LISTEN AGAIN'};
export function selectItemExperiences(snapshot,itemId){
  return snapshot.events.filter(event=>event.itemId===itemId);
}
export function latestExperience(events){
  return [...events].sort((a,b)=>Boolean(b.experiencedAt)-Boolean(a.experiencedAt)||b.experiencedAt.localeCompare(a.experiencedAt)||b.createdAt.localeCompare(a.createdAt))[0]||null;
}
const rating = value => value ? `${'★'.repeat(value)}${'☆'.repeat(5-value)} · ${value} 星` : '未评分';
const paragraph = (value,empty) => `<p${value?'':' class="memory-unfilled"'}>${h(value||empty)}</p>`;

export class MemoryDetails extends RecordObserver {
  constructor(app){
    super();this.app=app;this.snapshot=app.store.snapshot();this.preview=null;this.itemId=null;this.eventId=null;this.origin=null;this.editingReturn=null;
    document.body.insertAdjacentHTML('beforeend',`<dialog id="memory-dialog" class="memory-dialog" aria-labelledby="memory-title"><button type="button" class="memory-close" aria-label="关闭收藏卡片">×</button><div id="memory-detail-content"></div></dialog>`);
    this.dialog=document.querySelector('#memory-dialog');this.content=this.dialog.querySelector('#memory-detail-content');
    this.dialog.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if(button?.classList.contains('memory-close'))this.dialog.close();
      else if(button?.hasAttribute('data-memory-event')){this.eventId=button.dataset.memoryEvent;this.render();}
      else if(button?.hasAttribute('data-memory-edit'))this.edit(false);
      else if(button?.hasAttribute('data-memory-add'))this.edit(true);
      else if(button?.hasAttribute('data-memory-mark')){
        const itemId=this.itemId;this.dialog.close();this.app.openRecord(itemId);
      }else if(event.target===this.dialog){
        const rect=this.dialog.getBoundingClientRect();
        if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)this.dialog.close();
      }
    });
    this.dialog.addEventListener('close',()=>{
      if(this.editingReturn||document.querySelector('dialog[open]'))return;
      this.restoreFocus();
    });
    this.dialog.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement)event.target.remove();},true);
    document.querySelector('#experience-dialog').addEventListener('close',()=>{
      const returned=this.editingReturn;if(!returned)return;
      this.editingReturn=null;this.preview=null;this.snapshot=this.app.store.snapshot();
      if(returned.eventId&&this.snapshot.events.some(event=>event.id===returned.eventId))this.openEvent(returned.eventId,false);
      else if(this.snapshot.items.some(item=>item.id===returned.itemId))this.openItem(returned.itemId,null,false);
    });
  }
  update(snapshot){
    this.snapshot=snapshot;
    if(this.preview||!this.dialog.open)return;
    if(!snapshot.items.some(item=>item.id===this.itemId)||(this.eventId&&!snapshot.events.some(event=>event.id===this.eventId))){this.dialog.close();return;}
    this.render();
  }
  restoreFocus(){
    if(this.origin?.isConnected){this.origin.focus({preventScroll:true});return;}
    const candidates=document.querySelectorAll('[data-calendar-event],[data-calendar-day],[data-collection-select]');
    const event=this.snapshot.events.find(event=>event.id===this.eventId);
    const target=[...candidates].find(node=>(this.eventId&&node.dataset.calendarEvent===this.eventId)||(event?.experiencedAt&&node.dataset.calendarDay===event.experiencedAt)||(this.itemId&&node.dataset.collectionSelect===this.itemId));
    (target||document.querySelector('[data-room="calendar"]'))?.focus({preventScroll:true});
  }
  openEvent(eventId,rememberOrigin=true){
    this.preview=null;this.snapshot=this.app.store.snapshot();
    const event=this.snapshot.events.find(event=>event.id===eventId);if(!event)return;
    if(rememberOrigin)this.origin=document.activeElement;
    this.itemId=event.itemId;this.eventId=event.id;this.render();
    if(!this.dialog.open)this.dialog.showModal();
  }
  openItem(itemId,preview=null,rememberOrigin=true){
    if(rememberOrigin)this.origin=document.activeElement;
    this.preview=preview;this.snapshot=this.app.store.snapshot();this.itemId=itemId;
    this.eventId=latestExperience(selectItemExperiences(preview||this.snapshot,itemId))?.id||null;
    this.render();if(!this.dialog.open)this.dialog.showModal();
  }
  edit(add){
    if(this.preview)return;
    const itemId=this.itemId,eventId=add?null:this.eventId;
    this.editingReturn={itemId,eventId};this.dialog.close();this.app.openExperience(eventId,itemId);
  }
  render(){
    const snapshot=this.preview||this.snapshot,item=snapshot.items.find(item=>item.id===this.itemId);if(!item)return;
    const events=selectItemExperiences(snapshot,item.id),event=events.find(event=>event.id===this.eventId)||null;
    const record=snapshot.records.find(record=>record.itemId===item.id),isExhibit=this.preview?.label==='展示书架';
    const focusEvent=this.content.contains(document.activeElement)?document.activeElement?.dataset.memoryEvent:null;
    this.dialog.dataset.mediaType=item.type;
    const position=event?events.findIndex(value=>value.id===event.id)+1:0;
    const image=`<div class="memory-artwork"><span class="memory-artwork-fallback">${h(item.title)}<small>封面暂缺</small></span>${item.cover?`<img src="${h(item.cover)}" alt="${h(item.title)}完整封面">`:''}</div>`;
    const provenance=event&&(event.originalExperiencedAt||event.dateNote)?`<aside class="memory-date-note">${event.originalExperiencedAt?`<span>原始记录日期 <time>${h(event.originalExperiencedAt)}</time></span>`:''}${event.dateNote?`<p>${h(event.dateNote)}</p>`:''}</aside>`:'';
    this.content.innerHTML=`<header class="memory-header"><p>${captions[item.type]}</p><h2 id="memory-title">${headings[item.type]}</h2>${this.preview?`<span class="memory-preview-label">${isExhibit?'展示书架 · 日期仅用于展示':'示例预览 · 不写入个人记录'}</span>`:''}</header>
      <article class="memory-card"><div class="memory-cover-side">${image}<span class="memory-edition">${h(item.creator||'创作者待补充')}${item.year?` · ${item.year}`:''}</span></div><div class="memory-copy"><p class="memory-serial">${isExhibit?'你的展示书目':event?`第 ${String(position).padStart(2,'0')} 次体验 / 共 ${events.length} 次`:'收藏中的一次期待'}</p><h3>${h(item.title)}</h3><div class="memory-facts"><div><span>${isExhibit?'展示日期':event?'本次体验日期':'体验日期'}</span><strong>${event?.experiencedAt||'日期待补充'}</strong></div><div><span>本次体验评分</span><strong class="memory-rating">${event?rating(event.rating):'暂无体验'}</strong></div></div>${provenance}<section class="memory-notes"><h4>这一次的短评</h4>${paragraph(event?.comment,isExhibit?'尚未填写阅读短评。':event?'还没有留下短评。':'记录一次体验后，在这里留下感受。')}<h4>那天的记忆</h4>${paragraph(event?.memory,'记忆可以慢慢补上。')}</section></div><div class="memory-ticket-stub" aria-hidden="true"><span>KEEP THIS MOMENT</span><div class="memory-barcode"></div><small>${event?'ADMIT ONE':'TO BE CONTINUED'}</small></div></article>
      <section class="memory-history"><div class="memory-section-title"><h3>${isExhibit?'展示安排':'每一次相遇'}</h3><span>${events.length} ${isExhibit?'条展示':'次独立体验'}</span></div>${events.length?`<div class="memory-event-tabs">${events.map((value,index)=>`<button type="button" data-memory-event="${h(value.id)}" aria-pressed="${value.id===this.eventId}"><span>${String(index+1).padStart(2,'0')}</span>${value.experiencedAt||'日期待补充'}<small>${isExhibit?'展示':value.rating?value.rating+' 星':'未评分'}</small></button>`).join('')}</div>`:'<p class="memory-unfilled">已放进收藏，还没有记录体验。</p>'}</section>
      <section class="memory-collection-note"><span>${isExhibit?'展示书目 · 阅读评分未填写':`${record?statusName(record.status,item):'尚未收藏'} · 收藏评分：${rating(record?.rating||0)}`}</span>${record?.comment?`<p>收藏短评：${h(record.comment)}</p>`:''}<small>${isExhibit?'这本书尚未加入个人阅读记录。':'收藏标记与每次体验分别保存。'}</small></section>
      ${this.preview?`<p class="memory-preview-footnote">${isExhibit?'这是你指定的展示书目，日期用于书架排布。个人阅读记录保持原样。':'这是独立示例。退出预览后，你的收藏保持原样。'}</p>`:`<footer class="memory-actions"><button type="button" data-memory-mark>编辑收藏标记</button><div>${event?'<button type="button" data-memory-edit>编辑本次体验</button>':''}<button type="button" class="primary" data-memory-add>＋ 记录一次体验</button></div></footer>`}`;
    if(focusEvent)[...this.content.querySelectorAll('[data-memory-event]')].find(node=>node.dataset.memoryEvent===focusEvent)?.focus({preventScroll:true});
  }
}
