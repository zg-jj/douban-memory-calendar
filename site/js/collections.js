import {RecordObserver} from './domain.js';
import {createDemoSnapshot} from './demo.js';
import {escapeHtml as h, statusName} from './views.js';
import {latestExperience} from './memory-details.js';

const SECTIONS = ['calendar', 'books', 'music'];
const TYPE = {books:'book', music:'music'};
const FALLBACKS = ['#768575','#8f765e','#8c7c89','#a68c61','#69828a','#9b7165'];

/** Saved collection order is stable; repeated experiences remain separate. */
export function selectCollectionEntries(snapshot, type, {query = '', status = 'all', month = ''} = {}) {
  const items = new Map(snapshot.items.map(item => [item.id,item]));
  const term = query.trim().toLocaleLowerCase();
  return snapshot.records.flatMap(record => {
    const item = items.get(record.itemId);
    if (!item || item.type !== type || (status !== 'all' && record.status !== status)) return [];
    if (term && !`${item.title} ${item.original || ''} ${item.creator} ${(item.tags || []).join(' ')}`.toLocaleLowerCase().includes(term)) return [];
    const events = snapshot.events.filter(event => event.itemId === item.id && (!month || event.experiencedAt?.slice(0,7) === month));
    if (month && !events.length) return [];
    return [{item, record, events, latestEvent:latestExperience(events)}];
  });
}

export function collectionMonths(snapshot,type = 'book') {
  const ids = new Set(snapshot.items.filter(item => item.type === type).map(item => item.id));
  const saved = new Set(snapshot.records.map(record => record.itemId));
  return [...new Set(snapshot.events.filter(event => ids.has(event.itemId) && saved.has(event.itemId) && event.experiencedAt).map(event => event.experiencedAt.slice(0,7)))].sort();
}

/** All-month exhibits place each book once, using its latest display date. */
export function groupBookshelfMonths(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const month = entry.latestEvent?.experiencedAt?.slice(0,7) || '';
    if (!groups.has(month)) groups.set(month,[]);
    groups.get(month).push(entry);
  }
  return [...groups].sort(([a],[b]) => Boolean(b)-Boolean(a) || a.localeCompare(b));
}

const monthLabel = value => value ? `${Number(value.slice(0,4))} 年 ${Number(value.slice(5))} 月` : '日期待补充';

export function collectionColor(item, palette = {}) {
  const supplied = palette[item.cover]?.background || palette[item.id]?.background;
  let hash = 0;
  for (const char of item.title) hash = (Math.imul(hash,31) + char.codePointAt(0)) >>> 0;
  const background = /^#[\da-f]{6}$/i.test(supplied || '') ? supplied : FALLBACKS[hash % FALLBACKS.length];
  const channels = [1,3,5].map(index => parseInt(background.slice(index,index+2),16)/255);
  const luminance = channels.map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4).reduce((sum,c,index) => sum+c*[.2126,.7152,.0722][index],0);
  return {background, foreground:luminance > .179 ? '#000000' : '#ffffff'};
}

const artwork = item => `<span class="collection-artwork"><span class="collection-artwork-fallback">${h(item.title)}<small>${item.type === 'book' ? '书页之间' : '让旋律留下'}</small></span>${item.cover ? `<img src="${h(item.cover)}" alt="${h(item.title)}完整封面" loading="lazy">` : ''}</span>`;
const score = rating => rating ? `<span class="collection-stars" aria-label="${rating}星">${'★'.repeat(rating)}${'☆'.repeat(5-rating)}</span>` : '<span class="collection-unrated">未评分</span>';

export class CollectionRoom extends RecordObserver {
  constructor(element, {onOpenItem = () => {}, onDiscover = () => {}, onExport = () => {}, onImport = () => {}, palette = {}, seedItems = [], exhibitSnapshot = null} = {}) {
    super();
    Object.assign(this,{element,onOpenItem,onDiscover,onExport,onImport,palette,seedItems,exhibitSnapshot,section:'calendar',query:'',snapshot:{items:[],records:[],events:[]}});
    this.status = {books:'all',music:'all'};
    this.selected = {books:null,music:null};
    this.preview = {books:false,music:false};
    this.month = {books:'',music:''};
    this.bookSourceChosen = false;
    this.demo = null;
    const calendar = element.querySelector('#calendar-root');
    if (!calendar) throw new Error('收藏室需要已有日历');
    const fragment = document.createElement('div');
    fragment.className = 'room-shell';
    fragment.innerHTML = `<header class="room-heading"><div><p class="room-eyebrow">A ROOM OF MY OWN</p><p class="room-intro">我的书影音收藏室 <span>把喜欢的，留在身边。</span></p></div><div class="room-tools"><button type="button" data-room-export>导出备份</button><button type="button" data-room-import>导入备份</button></div></header><div class="room-tabs" role="tablist" aria-label="我的收藏室"><button type="button" id="room-tab-calendar" role="tab" data-room="calendar" aria-controls="room-calendar" aria-selected="true" tabindex="0"><span>01</span> 观影日历</button><button type="button" id="room-tab-books" role="tab" data-room="books" aria-controls="room-books" aria-selected="false" tabindex="-1"><span>02</span> 私人书架</button><button type="button" id="room-tab-music" role="tab" data-room="music" aria-controls="room-music" aria-selected="false" tabindex="-1"><span>03</span> 唱片墙</button></div><section id="room-calendar" role="tabpanel" aria-labelledby="room-tab-calendar"></section><section id="room-books" class="collection-panel" role="tabpanel" aria-labelledby="room-tab-books" hidden></section><section id="room-music" class="collection-panel" role="tabpanel" aria-labelledby="room-tab-music" hidden></section>`;
    fragment.querySelector('#room-calendar').append(calendar);
    element.append(fragment);
    element.classList.add('collection-room');
    this.bind();
  }
  update(snapshot) {
    this.snapshot = snapshot;
    if (!this.bookSourceChosen) {
      this.preview.books = Boolean(this.exhibitSnapshot && !selectCollectionEntries(snapshot,'book').length);
      this.bookSourceChosen = true;
    }
    for (const section of ['books','music']) {
      if (!this.preview[section] && this.selected[section] && !selectCollectionEntries(snapshot,TYPE[section]).some(({item}) => item.id === this.selected[section])) this.selected[section] = null;
      this.renderCollection(section);
    }
  }
  setQuery(query) {
    if (this.query === query) return;
    this.query = query;
    this.renderCollection('books');this.renderCollection('music');
  }
  show(section = 'calendar') {
    if (!SECTIONS.includes(section)) return;
    const previousPanel = this.element.querySelector(`#room-${this.section}`);
    const movingFocus = previousPanel.contains(document.activeElement) && this.section !== section;
    this.section = section;
    for (const button of this.element.querySelectorAll('[data-room]')) {
      const active = button.dataset.room === section;
      button.setAttribute('aria-selected',String(active));button.tabIndex = active ? 0 : -1;
    }
    for (const name of SECTIONS) this.element.querySelector(`#room-${name}`).hidden = name !== section;
    if (section !== 'calendar') this.renderCollection(section);
    if (movingFocus) this.element.querySelector(`[data-room="${section}"]`).focus({preventScroll:true});
  }
  isExhibit(section) { return section === 'books' && this.preview.books && Boolean(this.exhibitSnapshot); }
  displayedSnapshot(section) { return this.isExhibit(section) ? this.exhibitSnapshot : this.preview[section] ? this.demo : this.snapshot; }
  startPreview(section) {
    if (section !== 'books' || !this.exhibitSnapshot) {
      const all = new Map([...this.seedItems,...this.snapshot.items].map(item => [item.id,item]));
      this.demo = createDemoSnapshot([...all.values()]);
    }
    if (section === 'books') this.bookSourceChosen = true;
    this.month[section] = '';
    this.preview[section] = true;this.selected[section] = null;this.status[section] = 'all';
    this.renderCollection(section);
    this.element.querySelector(`#room-${section} .collection-preview-banner button`)?.focus();
  }
  bind() {
    this.element.addEventListener('click',event => {
      const button = event.target.closest('button');if (!button) return;
      if (button.dataset.room) this.show(button.dataset.room);
      else if (button.hasAttribute('data-room-export')) this.onExport();
      else if (button.hasAttribute('data-room-import')) this.onImport();
      else if (button.dataset.collectionDiscover) this.onDiscover(button.dataset.collectionDiscover);
      else if (button.dataset.collectionPreview) this.startPreview(button.dataset.collectionPreview);
      else if (button.dataset.collectionLeave) {
        const section = button.dataset.collectionLeave;
        if (section === 'books') this.bookSourceChosen = true;
        this.month[section] = '';
        this.preview[section] = false;this.selected[section] = null;this.status[section] = 'all';
        this.renderCollection(section);
        this.element.querySelector(`#room-${section} [data-collection-preview]`)?.focus();
      } else if (button.dataset.collectionStatus) {
        const section = button.closest('[data-collection-section]').dataset.collectionSection;
        this.status[section] = button.dataset.collectionStatus;this.renderCollection(section);
      } else if (button.dataset.collectionSelect) {
        const section = button.closest('[data-collection-section]').dataset.collectionSection;
        this.selected[section] = this.selected[section] === button.dataset.collectionSelect ? null : button.dataset.collectionSelect;
        this.applySelection(section);
      } else if (button.dataset.collectionOpen) {
        const section = button.closest('[data-collection-section]').dataset.collectionSection;
        const entry = selectCollectionEntries(this.displayedSnapshot(section),TYPE[section],{month:this.month[section]}).find(({item}) => item.id === button.dataset.collectionOpen);
        this.onOpenItem(button.dataset.collectionOpen,this.preview[section] ? this.displayedSnapshot(section) : null,this.month[section] ? entry?.latestEvent?.id || null : null);
      }
    });
    this.element.addEventListener('change',event => {
      const select = event.target.closest('[data-collection-month]');if (!select) return;
      const section = select.dataset.collectionMonth;
      this.month[section] = select.value;this.renderCollection(section);
    });
    this.element.querySelector('.room-tabs').addEventListener('keydown',event => {
      const tab = event.target.closest('[data-room]');if (!tab) return;
      const index = SECTIONS.indexOf(tab.dataset.room);
      const next = event.key === 'ArrowRight' ? (index+1)%3 : event.key === 'ArrowLeft' ? (index+2)%3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
      if (next === null) return;
      event.preventDefault();this.show(SECTIONS[next]);this.element.querySelector(`[data-room="${SECTIONS[next]}"]`).focus();
    });
    this.element.addEventListener('error',event => {
      if (event.target instanceof HTMLImageElement && event.target.closest('.collection-artwork')) {
        event.target.closest('.collection-artwork').classList.add('has-image-error');event.target.remove();
      }
    },true);
  }
  renderCollection(section) {
    const panel = this.element.querySelector(`#room-${section}`);
    const focus = panel.contains(document.activeElement) ? document.activeElement : null;
    const focusAttribute = focus ? ['collectionSelect','collectionOpen','collectionStatus','collectionLeave','collectionPreview','collectionDiscover','collectionMonth'].find(key => key in focus.dataset) : null;
    const focusValue = focusAttribute ? focus.dataset[focusAttribute] : null;
    const snapshot = this.displayedSnapshot(section);
    const type = TYPE[section], isBook = section === 'books', exhibit = this.isExhibit(section);
    const months = isBook ? collectionMonths(snapshot,type) : [];
    if (this.month[section] && !months.includes(this.month[section])) this.month[section] = '';
    const all = selectCollectionEntries(snapshot,type,{month:this.month[section]});
    const total = selectCollectionEntries(snapshot,type);
    const entries = selectCollectionEntries(snapshot,type,{query:this.query,status:this.status[section],month:this.month[section]});
    const count = all.reduce((sum,entry) => sum+entry.events.length,0);
    const previewBanner = exhibit
      ? `<div class="collection-preview-banner collection-exhibit-banner" role="status"><span><strong>展示书架 · 你选的书</strong>月份和日期仅用于展示排布，不代表实际阅读经历。</span><button type="button" data-collection-leave="books">我的藏书 →</button></div>`
      : this.preview[section] ? `<div class="collection-preview-banner" role="status"><span><strong>独立示例预览</strong> 日期、评分和记忆均为演示，不会写入你的收藏。</span><button type="button" data-collection-leave="${section}">回到我的收藏 ×</button></div>` : '';
    const sourceSwitch = isBook && this.exhibitSnapshot && !this.preview.books
      ? '<div class="collection-source-switch"><span>我的藏书 · 真实收藏</span><button type="button" data-collection-preview="books">查看展示书架 →</button></div>' : '';
    const monthControl = isBook && months.length
      ? `<label class="collection-month-picker">${exhibit ? '展示月份' : '阅读月份'}<select data-collection-month="books" aria-label="书架月份"><option value="">全部月份</option>${months.map(month => `<option value="${month}"${this.month.books === month ? ' selected' : ''}>${monthLabel(month)}</option>`).join('')}</select></label>` : '';
    const filters = total.length ? `<div class="collection-filter-row">${exhibit ? '<p class="collection-exhibit-caption">按月摆放，每一格都留给喜欢的书</p>' : `<div role="group" aria-label="${isBook ? '阅读' : '聆听'}状态">${[['all','全部'],['wish',isBook?'想读':'想听'],['doing',isBook?'在读':'在听'],['done',isBook?'读过':'听过']].map(([value,label]) => `<button type="button" data-collection-status="${value}" aria-pressed="${this.status[section] === value}">${label}</button>`).join('')}</div>`}${monthControl || `<p>${isBook ? '点击书脊，取下这一本' : '点击封套，取出这张唱片'}</p>`}</div>` : '';
    let objects = '';
    if (entries.length) {
      if (exhibit && !this.month.books) {
        objects = `<div class="bookshelf-month-groups">${groupBookshelfMonths(entries).map(([month,group]) => `<section class="bookshelf-month-group" data-bookshelf-month="${month}" aria-label="${monthLabel(month)}展示书架"><header><h3>${monthLabel(month)}</h3><span>${group.length} 本书 · 展示排布</span></header><div class="private-bookshelf" aria-label="${monthLabel(month)}的书">${group.map(entry => this.renderItem(entry,entries.indexOf(entry),section)).join('')}</div></section>`).join('')}</div>`;
      } else {
        objects = `<div class="${isBook ? 'private-bookshelf' : 'record-wall'}" aria-label="${isBook ? '我的书籍收藏' : '我的专辑收藏'}">${entries.map((entry,index) => this.renderItem(entry,index,section)).join('')}</div>`;
      }
      objects += '<div class="collection-selection" data-selection-panel></div>';
    } else {
      objects = `<div class="collection-empty"><span class="collection-empty-art" aria-hidden="true">${isBook ? '<i></i><i></i><i></i><i></i>' : '<i></i><b></b>'}</span><h3>${total.length ? '这一格，暂时留白' : isBook ? '书架，等着第一本喜欢的书' : '唱片墙，等着第一张珍藏'}</h3><p>${total.length ? '没有符合当前月份、状态或搜索词的收藏。' : isBook ? '把想读、正在读或读过的书标记下来，书架就会慢慢丰盈。' : '记录想听、正在听或听过的专辑，留住自己的声音收藏。'}</p>${!total.length && !this.preview[section] ? `<div class="collection-empty-actions"><button type="button" class="collection-primary" data-collection-discover="${type}">去记录${isBook ? '一本书' : '一张专辑'} →</button>${!(isBook && this.exhibitSnapshot) ? `<button type="button" data-collection-preview="${section}">先看看示例${isBook ? '书架' : '唱片墙'}</button>` : ''}</div><small>${isBook && this.exhibitSnapshot ? '展示书架独立保留，随时可以切换查看。' : '示例独立预览，不替换、不保存到你的记录。'}</small>` : ''}</div>`;
    }
    panel.dataset.collectionSection = section;
    panel.dataset.exhibit = String(exhibit);
    panel.innerHTML = `<header class="collection-masthead"><div><p class="collection-eyebrow">${isBook ? 'THE PRIVATE LIBRARY' : 'SOUNDTRACKS OF MY DAYS'}</p><h2>${isBook ? '私人书架' : '唱片收藏墙'} <span>${isBook ? 'My bookshelf' : 'My record collection'}</span></h2><p>${isBook ? '书脊朝外，故事向内。抽出一本，回到书页之间。' : '从封套里拿出一张唱片，让那天的旋律再次浮现。'}</p></div><span class="collection-count">${all.length} ${isBook ? exhibit ? '本展示书籍' : '本藏书' : '张专辑'}<small>${exhibit ? `${this.month.books ? monthLabel(this.month.books) : `${months.length} 个月份`} · 展示排布` : `${count} 次${isBook ? '阅读' : '聆听'}`}</small></span></header>${previewBanner}${sourceSwitch}${filters}${objects}`;
    this.applySelection(section);
    if (focusAttribute) {
      const replacement = [...panel.querySelectorAll('button,select')].find(control => control.dataset[focusAttribute] === focusValue);
      (replacement || this.element.querySelector(`[data-room="${section}"]`)).focus({preventScroll:true});
    }
  }
  renderItem({item,record,events}, index, section) {
    const isBook = section === 'books', selected = this.selected[section] === item.id;
    const colors = collectionColor(item,this.palette), serial = String(index+1).padStart(2,'0');
    const spineTitle = [...item.title].length > 28 ? [...item.title].slice(0,27).join('')+'…' : item.title;
    return `<article class="collection-object ${isBook ? 'shelf-book' : 'wall-album'}${selected ? ' is-open' : ''}" data-collection-item="${h(item.id)}" style="--spine-color:${colors.background};--spine-ink:${colors.foreground}"><button type="button" class="collection-object-button" data-collection-select="${h(item.id)}" aria-expanded="${selected}" aria-controls="${isBook ? 'book' : 'album'}-selection" aria-label="${selected ? '收起' : isBook ? '抽出' : '取出'}《${h(item.title)}》，${this.isExhibit(section) ? '展示藏书' : statusName(record.status,item)}，${events.length}${this.isExhibit(section) ? '个展示日期' : '次体验'}">${isBook ? `<span class="book-stage"><span class="book-spine"><span class="book-spine-number">${serial}</span><strong class="${[...spineTitle].length > 12 ? 'is-long-title' : ''}" title="${h(item.title)}" aria-hidden="true">${h(spineTitle)}</strong><small>${h(item.creator || '私人藏书')}</small><i></i></span><span class="book-front">${artwork(item)}</span></span>` : `<span class="record-stage"><span class="vinyl-disc" aria-hidden="true"><span>${h(item.title.slice(0,10))}</span></span><span class="album-sleeve">${artwork(item)}</span></span>`}<span class="collection-object-label"><strong>${h(item.title)}</strong><small>${this.isExhibit(section) ? `展示藏书 · ${events[0]?.experiencedAt || '日期待补充'}` : `${statusName(record.status,item)} · ${events.length} 次${isBook ? '阅读' : '聆听'}`}</small></span></button></article>`;
  }
  applySelection(section) {
    const panel = this.element.querySelector(`#room-${section}`), selected = this.selected[section];
    for (const article of panel.querySelectorAll('[data-collection-item]')) {
      const open = article.dataset.collectionItem === selected;
      article.classList.toggle('is-open',open);
      const button = article.querySelector('[data-collection-select]');
      button.setAttribute('aria-expanded',String(open));
      button.setAttribute('aria-label',button.getAttribute('aria-label').replace(/^(收起|抽出|取出)/,open ? '收起' : section === 'books' ? '抽出' : '取出'));
    }
    const detail = panel.querySelector('[data-selection-panel]');if (!detail) return;
    const entry = selectCollectionEntries(this.displayedSnapshot(section),TYPE[section],{query:this.query,status:this.status[section],month:this.month[section]}).find(({item}) => item.id === selected);
    if (this.isExhibit(section) && !this.month.books) {
      const group = [...panel.querySelectorAll('[data-collection-item]')].find(article => article.dataset.collectionItem === selected)?.closest('.bookshelf-month-group');
      if (entry && group) group.after(detail);
      else panel.querySelector('.bookshelf-month-groups')?.after(detail);
    }
    detail.hidden = !entry;
    detail.id = section === 'books' ? 'book-selection' : 'album-selection';
    if (!entry) { detail.innerHTML = '';return; }
    const {item,record,events,latestEvent:latest} = entry, isBook = section === 'books';
    detail.innerHTML = `<div class="collection-selected-cover">${artwork(item)}</div><div class="collection-selected-copy"><p class="collection-eyebrow">${this.isExhibit(section) ? '展示书架 · 日期仅作排布' : this.preview[section] ? '示例收藏 · 只读预览' : 'FROM MY COLLECTION'}</p><h3>${h(item.title)}</h3><p class="collection-selected-author">${h(item.creator || '创作者待补充')}${item.year ? ` · ${item.year}` : ''}</p><p class="collection-selected-meta">${this.isExhibit(section) ? '展示藏书' : statusName(record.status,item)} <span>收藏评分 ${score(record.rating)}</span></p>${latest ? `<p class="collection-last-date">${this.isExhibit(section) ? '展示日期' : `最近${isBook ? '阅读' : '聆听'}`} <strong>${latest.experiencedAt || '日期待补充'}</strong> · 本次 ${score(latest.rating)}</p><p class="collection-selected-comment">${h(latest.comment || (this.isExhibit(section) ? '这本书先放在这里，留作书架展示。' : '这一次，还没有留下短评。'))}</p>${latest.memory ? `<blockquote>${h(latest.memory)}</blockquote>` : ''}` : '<p class="collection-selected-comment">还没有体验记录，期待下一次相遇。</p>'}<button type="button" class="collection-primary" data-collection-open="${h(item.id)}">查看${isBook ? '阅读卡片' : '聆听记录'} <span>${this.isExhibit(section) ? '· 本书展示' : events.length ? `· ${events.length} 次体验` : '→'}</span></button></div>`;
  }
}
