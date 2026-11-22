import {RecordObserver} from './domain.js';
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const typeName=item=>item.type==='book'?'书籍':item.type==='music'?'音乐':({series:'剧集',documentary:'纪录片',animation:'动画'}[item.subtype]||'电影');
export const statusName=(status,item)=>({wish:item.type==='book'?'想读':item.type==='music'?'想听':'想看',doing:item.type==='book'?'在读':item.type==='music'?'在听':'在看',done:item.type==='book'?'读过':item.type==='music'?'听过':'看过'}[status]);
export class StatsView extends RecordObserver {
  constructor(element,typeElement,items){super();Object.assign(this,{element,typeElement,items});}
  update(snapshot){const records=snapshot.records;this.items=snapshot.items;const count=status=>records.filter(record=>record.status===status).length;this.element.innerHTML=[['wish','想体验'],['doing','进行中'],['done','已体验']].map(([status,label])=>`<div><strong>${count(status)}</strong><span>${label}</span></div>`).join('');this.typeElement.textContent=['movie','book','music'].map(type=>`${{movie:'影视',book:'书籍',music:'音乐'}[type]} ${records.filter(record=>this.items.find(item=>item.id===record.itemId)?.type===type&&record.status==='done').length}`).join(' · ')+` · 体验 ${snapshot.events.length} 次`;}
}
export class TimelineView extends RecordObserver {
  constructor(element,items,onEdit){super();Object.assign(this,{element,items,onEdit,records:[],query:'',type:'all',status:'all'});this.element.addEventListener('click',event=>{const button=event.target.closest('[data-edit]');if(button)this.onEdit(button.dataset.edit);});}
  update(snapshot){this.records=snapshot.records;this.items=snapshot.items;this.render();}
  render(){const query=this.query.trim().toLowerCase();const records=this.records.filter(record=>{const item=this.items.find(item=>item.id===record.itemId);return item&&(this.type==='all'||item.type===this.type)&&(this.status==='all'||record.status===this.status)&&`${item.title} ${item.original} ${item.creator} ${item.tags.join(' ')}`.toLowerCase().includes(query);}).sort((a,b)=>Boolean(b.experiencedAt)-Boolean(a.experiencedAt)||b.experiencedAt.localeCompare(a.experiencedAt)||b.updatedAt.localeCompare(a.updatedAt));let group='';this.element.innerHTML=records.map(record=>{const item=this.items.find(item=>item.id===record.itemId);const label=record.experiencedAt?record.experiencedAt.slice(0,7).replace('-',' 年 ')+' 月':'日期未知';const heading=label!==group?`<h2 class="date-group">${label}</h2>`:'';group=label;return `${heading}<article class="timeline-item" data-item="${escapeHtml(item.id)}"><img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}封面"><div><button class="timeline-edit" data-edit="${escapeHtml(item.id)}">编辑</button><h3>${escapeHtml(item.title)}</h3><div class="timeline-meta">${typeName(item)} · ${statusName(record.status,item)} · ${record.experiencedAt||'体验日期未知'} ${record.rating?`<span class="record-stars">${'★'.repeat(record.rating)}</span>`:'· 未评分'}</div>${record.comment?`<p>${escapeHtml(record.comment)}</p>`:''}${record.memory?`<p class="memory-note">${escapeHtml(record.memory)}</p>`:''}</div></article>`;}).join('')||'<div class="empty"><h2>时光簿还是空白的</h2><p>期待下一次值得留下的相遇。</p></div>';return records.length;}
}
export class PersistenceObserver extends RecordObserver {
  constructor(repository, onError = () => {}) {
    super();
    Object.assign(this, {repository, onError});
  }
  update(snapshot) {
    try {
      this.repository.save(snapshot);
      this.onError(null);
    } catch (error) {
      this.onError(error);
    }
  }
}
