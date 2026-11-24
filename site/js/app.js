import {CalendarController} from './calendar.js';
import {installExperienceUI} from './experience-ui.js';
import {installCsvUI} from './import-ui.js';
import {createDemoSnapshot} from './demo.js';
import {enrichMissingArtwork} from './artwork.js';
import {MemoryDetails} from './memory-details.js';
import {CollectionRoom} from './collections.js';
import {MediaItem,MediaRecord,ExperienceEvent,RecordStore} from './domain.js';
import {LocalRecordRepository} from './repository.js';
import {RecommendationService,TagRecommendationStrategy,DiverseRecommendationStrategy} from './strategies.js';
import {StatsView,TimelineView,PersistenceObserver,escapeHtml as h,typeName,statusName} from './views.js';
const $=selector=>document.querySelector(selector);

export class AppController {
  constructor(items,artworkCatalog=[],collectionPalette={},bookshelfExhibit=null){
    this.artworkCatalog=artworkCatalog;
    this.items=items;this.view='calendar';this.type='all';this.query='';this.skipped=new Set();this.history=[];this.rating=0;this.currentItem=null;this.toastTimer=null;
    this.repository=new LocalRecordRepository(localStorage,items);
    let snapshot={items,records:[],events:[]};try{snapshot=this.repository.load();}catch(error){this.toast(`本地记录读取失败：${error.message}。原始数据仍保留，可导入有效备份。`);}
    const artwork=enrichMissingArtwork(snapshot,this.artworkCatalog);
    this.store=new RecordStore(items,artwork.snapshot);this.items=this.store.items;
    this.recommendations=new RecommendationService(new TagRecommendationStrategy());
    this.stats=new StatsView($('#stats'),$('#type-stats'),items);
    this.timeline=new TimelineView($('#timeline-list'),this.items,id=>this.openRecord(id));
    this.persistence=new PersistenceObserver(this.repository,error=>{this.storageError=error;$('#storage-warning').hidden=!error;});
    installExperienceUI(this);installCsvUI(this);
    this.memoryDetails=new MemoryDetails(this);
    this.openMemory=id=>this.memoryDetails.openEvent(id);
    this.openCollectionCard=(itemId,preview=null)=>this.memoryDetails.openItem(itemId,preview);
    this.calendar=new CalendarController($('#calendar-root'),{onOpenEvent:id=>this.openMemory(id),onAddEvent:()=>this.openExperience(),onImport:()=>this.openCsvImport()});
    this.room=new CollectionRoom($('#collection-room'),{palette:collectionPalette,seedItems:items,exhibitSnapshot:bookshelfExhibit,onOpenItem:(id,preview,eventId)=>{if(!preview&&eventId)this.openMemory(eventId);else this.openCollectionCard(id,preview);},onDiscover:type=>{this.type=type;this.query='';$('#search').value='';this.setView('discover');},onExport:()=>this.exportBackup(),onImport:()=>$('#import-file').click()});
    this.store.subscribe(this.stats);this.store.subscribe(this.timeline);this.store.subscribe(this.persistence);
    this.store.subscribe(this.calendar.calendarView);this.store.subscribe(this.calendar.timelineView);this.store.subscribe(this);
    this.store.subscribe(this.room);this.store.subscribe(this.memoryDetails);
    snapshot=this.store.snapshot();this.stats.update(snapshot);this.timeline.update(snapshot);this.calendar.refresh(snapshot);this.room.update(snapshot);this.calendar.activate();
    this.bind();this.update(snapshot);this.bindGestures();window.lucide.createIcons();
    if(artwork.updatedItems)this.persistence.update(this.store.snapshot());
    document.addEventListener('error',event=>{
      const img=event.target;if(!(img instanceof HTMLImageElement)||img.dataset.failed||img.closest('.calendar-cover,.memory-artwork,.collection-artwork'))return;
      img.dataset.failed='true';const fallback=document.createElement('span');fallback.className='cover-fallback';
      fallback.textContent=img.alt||'封面暂缺';img.hidden=true;img.insertAdjacentElement('afterend',fallback);
    },true);
  }
  bind(){
    document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>this.setView(button.dataset.view)));
    document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>this.setView(button.dataset.go)));
    document.querySelectorAll('[data-type]').forEach(button=>button.addEventListener('click',()=>{this.type=button.dataset.type;this.resetQueue();this.render();}));
    document.querySelectorAll('[data-status]').forEach(button=>button.addEventListener('click',()=>{this.timeline.status=button.dataset.status;this.render();}));
    $('#search-form').addEventListener('submit',event=>event.preventDefault());
    $('#search').addEventListener('input',event=>{this.query=event.target.value;this.resetQueue();this.render();});
    $('#strategy').addEventListener('change',event=>{this.recommendations.setStrategy(event.target.value==='tag'?new TagRecommendationStrategy():new DiverseRecommendationStrategy());this.render();});
    $('#clear-filters').addEventListener('click',()=>{this.type='all';this.query='';$('#search').value='';this.render();});
    $('#media-grid').addEventListener('click',event=>{const button=event.target.closest('[data-open]');if(button)this.openRecord(button.dataset.open);});
    $('#swipe-content').addEventListener('click',event=>{const button=event.target.closest('[data-open]');if(button)this.openRecord(button.dataset.open);});
    $('#mark-done').addEventListener('click',()=>this.swipe('done'));
    $('#skip').addEventListener('click',()=>this.swipe('skip'));
    $('#undo').addEventListener('click',()=>{if(this.undoSwipe()){this.render();this.toast('已撤销上一次补标');}});
    $('#restart-queue').addEventListener('click',()=>{this.resetQueue();this.render();});
    $('#close-dialog').addEventListener('click',()=>$('#record-dialog').close());
    $('#record-dialog').addEventListener('click',event=>{if(event.target===$('#record-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
    $('#record-form').addEventListener('submit',event=>{event.preventDefault();this.saveRecord();});
    document.querySelectorAll('[data-rating]').forEach(button=>button.addEventListener('click',()=>{this.rating=Number(button.dataset.rating);$('input[name="status"][value="done"]').checked=true;this.renderRating();}));
    document.querySelectorAll('input[name="status"]').forEach(input=>input.addEventListener('change',()=>{if(input.value!=='done'){this.rating=0;this.renderRating();}}));
    $('#clear-rating').addEventListener('click',()=>{this.rating=0;this.renderRating();});
    ['comment'].forEach(id=>$('#'+id).addEventListener('input',()=>this.renderCounters()));
    $('#remove-record').addEventListener('click',()=>{try{this.store.remove(this.currentItem.id);this.history.length=0;$('#record-dialog').close();this.render();this.toast('已删除这条标记');}catch(error){$('#form-error').textContent=error.message;}});
    $('#export').addEventListener('click',()=>this.exportBackup());
    $('#export-unsaved').addEventListener('click',()=>this.exportBackup());
    $('#import').addEventListener('click',()=>$('#import-file').click());
    $('#import-file').addEventListener('change',event=>this.importBackup(event.target.files[0]));
    $('#open-csv').addEventListener('click',()=>this.openCsvImport());
    $('#load-demo').addEventListener('click',()=>this.loadDemo());
    $('#clear-records').addEventListener('click',()=>{if((this.store.all().length||this.store.allEvents().length)&&confirm('清空当前浏览器中的全部收藏和体验？建议先导出备份。')){this.resetQueue();this.store.replace({items:this.items,records:[],events:[]});this.toast(this.storageError?'记录已清空，但本地保存失败':'记录已清空');}});
  }
  update(snapshot){
    this.items=this.store.items;const records=snapshot.records;
    $('#total-count').textContent=records.length;
    $('#demo-banner').hidden=!snapshot.events.some(event=>event.memory.startsWith('示例｜'));
    const latest=[...snapshot.events].filter(record=>record.memory).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
    $('#memory-quote').textContent=latest?`“${latest.memory}”`:'“书籍让我们在任何时候，都有地方驻留。”';
    const item=latest&&this.items.find(item=>item.id===latest.itemId);
    $('#memory-byline').textContent=item?`${item.title} · ${latest.experiencedAt||'日期未知'}`:'把感动留下，把日子记住。';
    this.render();
  }
  setView(view){this.view=view;if(view==='calendar')this.calendar.activate();this.render();}
  resetQueue(){this.skipped.clear();this.history.length=0;}
  filteredItems(){const query=this.query.trim().toLowerCase();return this.items.filter(item=>(this.type==='all'||item.type===this.type)&&`${item.title} ${item.original} ${item.creator} ${item.tags.join(' ')}`.toLowerCase().includes(query));}
  render(){
    document.body.dataset.view=this.view;
    document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('active',button.dataset.view===this.view);button.setAttribute('aria-current',button.dataset.view===this.view?'page':'false');});
    document.querySelectorAll('[data-type]').forEach(button=>{button.classList.toggle('active',button.dataset.type===this.type);button.setAttribute('aria-pressed',String(button.dataset.type===this.type));});
    const titles={discover:['为你推荐','一次相遇，一段属于自己的时光。'],swipe:['回忆补标','想起那些已经走进生命里的作品。'],timeline:['我的时光','作品会结束，相遇的时光会留下。'],calendar:['书影音日历','每一页生活，都有作品相伴。']};
    $('#page-title').textContent=titles[this.view][0];$('#page-subtitle').textContent=titles[this.view][1];
    ['discover','swipe','timeline','calendar'].forEach(view=>$('#'+view+'-panel').hidden=view!==this.view);
    $('#strategy-control').hidden=this.view!=='discover';
    this.calendar.setQuery(this.query);this.renderDiscover();this.renderSwipe();
    this.room.setQuery(this.query);
    this.timeline.query=this.query;this.timeline.type=this.type;
    $('#timeline-count').textContent=`${this.timeline.render()} 条标记`;
    document.querySelectorAll('[data-status]').forEach(button=>button.classList.toggle('active',button.dataset.status===this.timeline.status));
  }
  renderDiscover(){
    const ids=new Set(this.filteredItems().map(item=>item.id));
    const results=this.recommendations.recommend(this.items,this.store.all()).filter(result=>ids.has(result.item.id));
    const liked=this.store.all().some(record=>record.status==='done'&&record.rating>=4);
    $('#recommendation-note').textContent=$('#strategy').value==='diverse'?'书 · 影 · 音，多一种相遇':liked?'从你喜欢过的作品出发':'初次相遇 · 从固定偏好标签出发';
    $('#result-count').textContent=`${results.length} 部 / 本 / 张作品`;
    $('#discover-empty').hidden=results.length>0;
    $('#media-grid').innerHTML=results.map(({item,reasons})=>{const record=this.store.get(item.id);return `<article class="media-card" data-item="${h(item.id)}"><button class="cover-button" data-open="${h(item.id)}" aria-label="打开${h(item.title)}"><img src="${h(item.cover)}" alt="${h(item.title)}封面"><span class="cover-badge">${typeName(item)}</span></button><button class="card-title" data-open="${h(item.id)}">${h(item.title)}</button><div class="card-meta">${item.year||''} · ${h(item.creator)}</div><p class="card-reason">${h(reasons[1])}</p><div class="card-bottom"><button class="mark-button" data-open="${h(item.id)}">${record?statusName(record.status,item):'＋ 标记'}</button></div></article>`;}).join('');
  }
  queue(){return this.filteredItems().filter(item=>this.store.get(item.id)?.status!=='done'&&!this.skipped.has(item.id));}
  renderSwipe(){
    const queue=this.queue(),item=queue[0];
    $('#swipe-progress').textContent=`待回忆 ${queue.length} 件作品`;
    $('#undo').disabled=this.history.length===0;
    $('#swipe-card').hidden=!item;$('#swipe-actions').hidden=!item;$('#swipe-empty').hidden=Boolean(item);
    if(item){$('#swipe-content').innerHTML=`<div class="swipe-inner"><img src="${h(item.cover)}" alt="${h(item.title)}封面"><div><p class="eyebrow">${typeName(item)}</p><h2>${h(item.title)}</h2><div class="swipe-meta">${item.year||''}<br>${h(item.creator)}</div><div class="tags">${h(item.tags.join(' · '))}</div></div><p class="swipe-description">${h(item.description)}</p><button class="text-button" data-open="${h(item.id)}">留下评分与那时的记忆 →</button></div>`;$('#done-label').textContent=statusName('done',item);}
  }
  swipe(action){
    const item=this.queue()[0];if(!item)return;
    const previous=this.store.get(item.id);
    if(action==='done')this.store.save(new MediaRecord({...previous,itemId:item.id,status:'done',updatedAt:new Date().toISOString()}));
    this.skipped.add(item.id);
    this.history.push({itemId:item.id,previous,changed:action==='done'});
    this.render();this.toast(action==='done'?(this.storageError?'已标记，本地保存失败，请导出备份':`已标记「${item.title}」${statusName('done',item)} · 未评分`):'已跳过，未写入任何体验记录');
  }
  undoSwipe(){
    const last=this.history.at(-1);if(!last)return false;
    if(last.changed){if(last.previous)this.store.save(last.previous);else this.store.remove(last.itemId);}
    this.skipped.delete(last.itemId);
    this.history.pop();
    return true;
  }
  bindGestures(){
    const card=$('#swipe-card');let start=null;
    const reset=()=>{start=null;card.style.transform='';card.classList.remove('drag-up','drag-down');};
    card.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button,input,textarea,select,a'))return;start={x:event.clientX,y:event.clientY,id:event.pointerId};card.setPointerCapture(event.pointerId);});
    card.addEventListener('pointermove',event=>{if(!start||event.pointerId!==start.id)return;const delta=event.clientY-start.y;if(Math.abs(event.clientX-start.x)>70){reset();return;}card.style.transform=`translateY(${Math.max(-100,Math.min(100,delta))*.35}px)`;card.classList.toggle('drag-up',delta<-35);card.classList.toggle('drag-down',delta>35);card.querySelector('.gesture-feedback').textContent=delta<0?'↑ 已体验':'↓ 暂未体验';});
    card.addEventListener('pointerup',event=>{if(!start)return;const dy=event.clientY-start.y,dx=event.clientX-start.x;reset();if(Math.abs(dy)>=80&&Math.abs(dy)>Math.abs(dx)*1.3)this.swipe(dy<0?'done':'skip');});
    card.addEventListener('pointercancel',reset);card.addEventListener('lostpointercapture',reset);
  }
  openRecord(id){
    const item=this.items.find(item=>item.id===id);if(!item)return;this.currentItem=item;const record=this.store.get(id);this.rating=record?.rating||0;
    $('#detail').innerHTML=`<div class="detail-layout"><img src="${h(item.cover)}" alt="${h(item.title)}封面"><div><h2>${h(item.title)}</h2><div class="original">${h(item.original)}</div><div class="detail-meta">${typeName(item)} · ${item.year||''} · ${h(item.creator)}</div><p>${h(item.description)}</p></div></div>`;
    $(`input[name="status"][value="${record?.status||'done'}"]`).checked=true;
    $('#comment').value=record?.comment||'';this.renderCollectionEvents(id);$('#form-error').textContent='';$('#remove-record').hidden=!record;
    this.renderRating();this.renderCounters();$('#record-dialog').showModal();
  }
  renderRating(){document.querySelectorAll('[data-rating]').forEach(button=>{button.classList.toggle('chosen',Number(button.dataset.rating)<=this.rating);button.setAttribute('aria-pressed',String(Number(button.dataset.rating)===this.rating));});$('#rating-value').textContent=this.rating?this.rating+' 星':'未评分';}
  renderCounters(){$('#comment-count').textContent=`${$('#comment').value.length} / 500`;}
  saveRecord(){
    try{const record=new MediaRecord({...this.store.get(this.currentItem.id),itemId:this.currentItem.id,status:$('input[name="status"]:checked').value,rating:this.rating,comment:$('#comment').value,updatedAt:new Date().toISOString()});this.history.length=0;this.store.save(record);$('#record-dialog').close();this.render();this.toast(this.storageError?'记录已更新，但本地保存失败，请导出备份':'已留下这段时光');}catch(error){$('#form-error').textContent=error.message;}
  }
  exportBackup(){const blob=new Blob([this.repository.serialize(this.store.snapshot())],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='豆瓣书影音时光簿_备份.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.toast('已导出当前记录');}
  async importBackup(file){if(!file)return;try{if(file.size>5*1024*1024)throw new Error('备份不得超过 5 MB');const parsed=this.repository.parse(await file.text());const {snapshot}=enrichMissingArtwork(parsed,this.artworkCatalog);this.store.replace(snapshot);this.resetQueue();this.render();this.toast(this.storageError?'已导入，但本地保存失败，请导出备份':`已导入 ${snapshot.records.length} 条收藏与 ${snapshot.events.length} 次体验`);}catch(error){this.toast(`导入失败：${error.message}`);}finally{$('#import-file').value='';}}
  loadDemo(){
    if((this.store.all().length||this.store.allEvents().length)&&!confirm('示例记录将替换当前收藏和体验。请先导出需要保留的记录。继续载入？'))return;
    this.resetQueue();this.store.replace(createDemoSnapshot(this.items));this.calendar.activate();
    this.calendar.setMonth(2026,11);this.render();this.toast('已载入2026年11月示例，每条经历均明确标注为演示');
  }
  toast(message){clearTimeout(this.toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;this.toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
}

try{
  const response=await fetch('assets/media.json');if(!response.ok)throw new Error('作品资料读取失败');const data=await response.json();const entries=Array.isArray(data)?data:data.items;
  let artworkCatalog=[];
  try{const response=await fetch('assets/artwork-catalog.json');if(response.ok){const data=await response.json();if(Array.isArray(data))artworkCatalog=data;}}catch{}
  let collectionPalette={};
  try{const response=await fetch('assets/collection-palette.json');if(response.ok)collectionPalette=await response.json();}catch{}
  let bookshelfExhibit=null;
  try{const response=await fetch('assets/bookshelf-exhibit.json');if(response.ok){const data=await response.json();if(data.schemaVersion!==1||data.label!=='展示书架')throw new Error('展示书架格式无效');bookshelfExhibit=Object.freeze({...new RecordStore(data.items,data).snapshot(),label:'展示书架'});}}catch(error){console.warn('展示书架暂时不可用',error.message);}
  const app=new AppController(entries.map(value=>new MediaItem(value)),artworkCatalog,collectionPalette,bookshelfExhibit);window.app=app;
}catch(error){document.querySelector('main').innerHTML=`<div class="load-error"><h1>暂时无法打开时光簿</h1><p>${h(error.message)}</p><p>请通过项目启动脚本打开，并确认 assets/media.json 完整。</p></div>`;console.error(error);}
