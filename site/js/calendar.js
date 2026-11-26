import {RecordObserver} from './domain.js';

const TYPES = ['book', 'movie', 'music'];
const TYPE_NAMES = {book: '书籍', movie: '影视', music: '音乐'};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const padded = value => String(value).padStart(2, '0');
const monthKey = (year, month) => `${String(year).padStart(4, '0')}-${padded(month)}`;
const today = () => ({year: new Date().getFullYear(), month: new Date().getMonth() + 1});

function firstDay(year, month) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('请选择有效的年份和月份');
  }
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, 1);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

/** Monday-first, actual four-to-six-week grid. Adjacent-month cells stay blank. */
export function buildMonthCells(year, month) {
  const first = firstDay(year, month);
  const last = new Date(first);
  last.setUTCMonth(first.getUTCMonth() + 1, 0);
  const offset = (first.getUTCDay() + 6) % 7;
  const count = Math.ceil((offset + last.getUTCDate()) / 7) * 7;
  return Array.from({length: count}, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= last.getUTCDate()
      ? {day, date: `${monthKey(year, month)}-${padded(day)}`, weekday: index % 7}
      : {day: null, date: null, weekday: index % 7};
  });
}

/** Both visualizations consume exactly the same selection. Array order breaks same-day ties. */
export function selectCalendarEvents(snapshot, {year, month, types = TYPES, query = ''}) {
  firstDay(year, month);
  const selected = new Set(types);
  const itemMap = new Map((snapshot.items || []).map(item => [item.id, item]));
  const term = String(query).trim().toLocaleLowerCase();
  const entries = (snapshot.events || []).map((event, index) => ({event, item: itemMap.get(event.itemId), index})).filter(({item}) => {
    return item && selected.has(item.type) && (!term || `${item.title} ${item.original || ''} ${item.creator || ''} ${(item.tags || []).join(' ')}`.toLocaleLowerCase().includes(term));
  });
  const dated = entries.filter(({event}) => event.experiencedAt?.slice(0, 7) === monthKey(year, month))
    .sort((a, b) => a.event.experiencedAt.localeCompare(b.event.experiencedAt) || a.index - b.index);
  const undated = entries.filter(({event}) => !event.experiencedAt);
  const days = new Map();
  for (const entry of dated) {
    if (!days.has(entry.event.experiencedAt)) days.set(entry.event.experiencedAt, []);
    days.get(entry.event.experiencedAt).push(entry);
  }
  return {dated, undated, days};
}

function cover(item, className = '') {
  const label = escape(TYPE_NAMES[item.type] || '作品');
  return `<span class="calendar-cover ${className}"><span class="calendar-cover-fallback" aria-hidden="true">${label}<span>${escape(item.title)}</span></span>${item.cover ? `<img src="${escape(item.cover)}" alt="${escape(item.title)}封面" loading="lazy">` : ''}</span>`;
}

function stars(event) {
  return event.rating ? `<span class="calendar-stars" aria-label="${event.rating}星">${'★'.repeat(event.rating)}${'☆'.repeat(5 - event.rating)}</span>` : '<span class="calendar-unrated">未评分</span>';
}

export class CalendarView extends RecordObserver {
  constructor(element, controller) { super(); Object.assign(this, {element, controller}); }
  update(snapshot) { this.controller.acceptSnapshot(snapshot); this.render(); }
  render() {
    const controller = this.controller;
    const selection = controller.selection;
    this.element.innerHTML = buildMonthCells(controller.year, controller.month).map(({date, day}) => {
      if (!date) return '<div class="calendar-day calendar-day-outside" aria-hidden="true"></div>';
      const entries = selection.days.get(date) || [];
      const content = entries.slice(0, 3).map(({item, event}) => `<button type="button" class="calendar-poster" data-calendar-event="${escape(event.id)}" aria-label="${escape(item.title)}，${date}，${event.rating ? `${event.rating}星` : '未评分'}，查看本次体验" title="${escape(item.title)}">${cover(item)}<span class="calendar-type-mark" data-media-type="${item.type}">${TYPE_NAMES[item.type].slice(0, 1)}</span></button>`).join('');
      return `<div class="calendar-day${entries.length ? ' has-experiences' : ''}" data-calendar-date="${date}"><div class="calendar-day-heading"><time datetime="${date}">${day}</time>${entries.length > 1 ? `<span aria-label="${entries.length}次体验">${entries.length}</span>` : ''}</div><div class="calendar-posters" data-count="${Math.min(entries.length, 3)}">${content}</div>${entries.length > 3 ? `<button type="button" class="calendar-more" data-calendar-day="${date}" aria-label="${date}还有${entries.length - 3}次体验，展开当天全部${entries.length}条">＋${entries.length - 3}</button>` : ''}</div>`;
    }).join('');
    controller.applyHighlight();
  }
}

export class ExperienceTimelineView extends RecordObserver {
  constructor(element, controller) { super(); Object.assign(this, {element, controller}); }
  update(snapshot) { this.controller.acceptSnapshot(snapshot); this.render(); }
  render() {
    const {dated, undated, days} = this.controller.selection;
    const row = ({event, item}) => `<button type="button" class="calendar-timeline-entry" data-calendar-event="${escape(event.id)}" aria-label="${escape(item.title)}，${event.experiencedAt || '日期待补充'}，查看本次体验"><span class="calendar-entry-copy"><span class="calendar-entry-title">${escape(item.title)}</span><span class="calendar-entry-meta">${TYPE_NAMES[item.type]}${event.memory ? ` · ${escape(event.memory)}` : ''}</span></span>${stars(event)}</button>`;
    const dayGroups = [...days].map(([date, entries]) => `<li class="calendar-timeline-day" data-timeline-date="${date}"><time class="calendar-date-dot" datetime="${date}" aria-label="${date}">${Number(date.slice(-2))}</time><div class="calendar-timeline-day-entries">${entries.map(row).join('')}</div></li>`).join('');
    this.element.innerHTML = `<div class="calendar-section-heading"><h3>时间轴 <span>TIMELINE</span></h3><span>${dated.length} 次体验</span></div>${dated.length ? `<ol class="calendar-timeline-days">${dayGroups}</ol>` : `<div class="calendar-empty-timeline"><span class="calendar-empty-rule"></span><p>${this.controller.types.size ? '这个月，留白也很好。' : '还没有选中作品类型。'}</p><small>${this.controller.types.size ? '留下体验，或切换月份与筛选。' : '选择书籍、影视或音乐，再看看那些时光。'}</small></div>`}<section class="calendar-undated"><div class="calendar-section-heading"><h3>日期待补充</h3><span>${undated.length} 次</span></div>${undated.length ? `<div class="calendar-undated-list">${undated.map(row).join('')}</div>` : '<p class="calendar-undated-empty">记不清的日子，可以暂时留空。</p>'}</section>`;
    this.controller.applyHighlight();
  }
}

export class CalendarController {
  constructor(element, {onOpenEvent = () => {}, onAddEvent = () => {}, onImport = () => {}} = {}) {
    Object.assign(this, {element, onOpenEvent, onAddEvent, onImport, ...today(), query: '', types: new Set(TYPES), activated: false, highlightedId: null});
    this.snapshot = {items: [], records: [], events: []};
    this.element.classList.add('memory-calendar');
    this.element.innerHTML = `<header class="calendar-masthead"><div class="calendar-title"><p>BOOKS / FILMS / MUSIC</p><h2>书影音 <span>Calendar</span></h2><div class="calendar-title-line"></div></div><div class="calendar-actions"><button type="button" class="calendar-action" data-calendar-add>＋ 记录一次体验</button><button type="button" class="calendar-action calendar-action-subtle" data-calendar-import>导入 CSV</button></div></header><div class="calendar-toolbar"><fieldset class="calendar-filters"><legend class="sr-only">日历作品类型，可多选</legend>${TYPES.map(type => `<label><input type="checkbox" data-calendar-type="${type}" checked><span>${TYPE_NAMES[type]}</span></label>`).join('')}<button type="button" data-calendar-all>全部</button></fieldset><div class="calendar-month-controls"><button type="button" class="calendar-month-step" data-calendar-prev aria-label="上个月">‹</button><label><span class="sr-only">月份</span><select data-calendar-month aria-label="月份">${MONTH_NAMES.map((name, index) => `<option value="${index + 1}">${name} · ${index + 1}月</option>`).join('')}</select></label><label><span class="sr-only">年份</span><input type="number" data-calendar-year aria-label="年份" min="1" max="9999" step="1" inputmode="numeric"></label><button type="button" class="calendar-month-step" data-calendar-next aria-label="下个月">›</button></div></div><div class="calendar-summary" role="status" aria-live="polite"></div><div class="calendar-composition"><aside class="calendar-experience-timeline" aria-label="当前月份体验时间轴"></aside><section class="calendar-month" aria-label="书影音封面月历"><div class="calendar-weekdays" aria-hidden="true">${['MON 一', 'TUE 二', 'WED 三', 'THU 四', 'FRI 五', 'SAT 六', 'SUN 日'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-grid"></div><p class="calendar-note">作品留在格子里，时光留在记忆里。<span>点击封面，回看那次体验。</span></p></section></div><dialog class="calendar-day-dialog" aria-label="当天的全部体验"><div class="calendar-day-dialog-heading"><h3></h3><button type="button" data-calendar-close-day aria-label="关闭当天列表">×</button></div><div class="calendar-day-list"></div></dialog>`;
    this.grid = this.element.querySelector('.calendar-grid');
    this.timeline = this.element.querySelector('.calendar-experience-timeline');
    this.summary = this.element.querySelector('.calendar-summary');
    this.dayDialog = this.element.querySelector('.calendar-day-dialog');
    this.calendarView = new CalendarView(this.grid, this);
    this.timelineView = new ExperienceTimelineView(this.timeline, this);
    this.bind();
    this.render();
  }
  get selection() { return selectCalendarEvents(this.snapshot, this); }
  acceptSnapshot(snapshot) {
    if (snapshot === this.snapshot) return;
    this.snapshot = snapshot;
    if (this.highlightedId && !snapshot.events.some(event => event.id === this.highlightedId)) this.highlightedId = null;
    this.updateSummary();
    if (this.dayDialog.open) this.renderDayList(this.dayDialog.dataset.date);
  }
  refresh(snapshot) { this.acceptSnapshot(snapshot); this.render(); }
  update(snapshot) { this.refresh(snapshot); }
  activate() {
    if (!this.activated) {
      this.activated = true;
      const dates = this.snapshot.events.map(event => event.experiencedAt).filter(Boolean).sort();
      const latest = dates.at(-1);
      if (latest) { this.year = Number(latest.slice(0, 4)); this.month = Number(latest.slice(5, 7)); }
      this.render();
    }
  }
  setQuery(query) { if (this.query === query) return; this.query = query; this.render(); }
  setMonth(year, month) {
    firstDay(Number(year), Number(month));
    this.year = Number(year); this.month = Number(month); this.highlightedId = null;
    this.render();
  }
  stepMonth(delta) {
    const index = (this.year - 1) * 12 + this.month - 1 + delta;
    if (index < 0 || index >= 9999 * 12) return;
    this.setMonth(Math.floor(index / 12) + 1, index % 12 + 1);
  }
  bind() {
    this.element.addEventListener('click', event => {
      const target = event.target.closest('button'); if (!target) return;
      if (target.hasAttribute('data-calendar-prev')) this.stepMonth(-1);
      else if (target.hasAttribute('data-calendar-next')) this.stepMonth(1);
      else if (target.hasAttribute('data-calendar-all')) { this.types = new Set(TYPES); this.render(); }
      else if (target.hasAttribute('data-calendar-add')) this.onAddEvent();
      else if (target.hasAttribute('data-calendar-import')) this.onImport();
      else if (target.hasAttribute('data-calendar-close-day')) this.dayDialog.close();
      else if (target.dataset.calendarDay) this.openDay(target.dataset.calendarDay);
      else if (target.dataset.calendarEvent) this.openEvent(target.dataset.calendarEvent, Boolean(target.closest('.calendar-experience-timeline')));
    });
    this.element.addEventListener('change', event => {
      if (event.target.dataset.calendarType) {
        if (event.target.checked) this.types.add(event.target.dataset.calendarType); else this.types.delete(event.target.dataset.calendarType);
        this.render();
      } else if (event.target.hasAttribute('data-calendar-month')) this.setMonth(this.year, Number(event.target.value));
      else if (event.target.hasAttribute('data-calendar-year')) {
        if (event.target.checkValidity() && event.target.value) this.setMonth(Number(event.target.value), this.month);
        else { event.target.reportValidity(); event.target.value = this.year; }
      }
    });
    const highlight = event => {
      const target = event.target.closest('[data-calendar-event]');
      this.highlightedId = target?.dataset.calendarEvent || null;
      this.applyHighlight();
    };
    this.element.addEventListener('pointerover', highlight);
    this.element.addEventListener('focusin', highlight);
    this.element.addEventListener('pointerleave', () => { this.highlightedId = null; this.applyHighlight(); });
    this.element.addEventListener('focusout', event => { if (!this.element.contains(event.relatedTarget)) { this.highlightedId = null; this.applyHighlight(); } });
    this.element.addEventListener('error', event => {
      if (event.target instanceof HTMLImageElement && event.target.closest('.calendar-cover')) event.target.remove();
    }, true);
    this.dayDialog.addEventListener('click', event => {
      if (event.target !== this.dayDialog) return;
      const rect = this.dayDialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.dayDialog.close();
    });
  }
  openEvent(id, locate) {
    const event = this.snapshot.events.find(value => value.id === id); if (!event) return;
    this.highlightedId = id; this.applyHighlight();
    if (locate && event.experiencedAt) {
      const day = [...this.grid.querySelectorAll('[data-calendar-date]')].find(node => node.dataset.calendarDate === event.experiencedAt);
      day?.scrollIntoView({block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    }
    if (this.dayDialog.open) this.dayDialog.close();
    this.onOpenEvent(id);
  }
  renderDayList(date) {
    const entries = this.selection.days.get(date) || [];
    this.dayDialog.querySelector('h3').textContent = `${date} · ${entries.length} 次体验`;
    this.dayDialog.querySelector('.calendar-day-list').innerHTML = entries.map(({event, item}) => `<button type="button" class="calendar-day-list-entry" data-calendar-event="${escape(event.id)}">${cover(item)}<span><strong>${escape(item.title)}</strong><small>${TYPE_NAMES[item.type]}</small>${stars(event)}${event.memory ? `<p>${escape(event.memory)}</p>` : ''}</span></button>`).join('') || '<p>这一天暂时没有符合筛选的体验。</p>';
  }
  openDay(date) { this.dayDialog.dataset.date = date; this.renderDayList(date); this.dayDialog.showModal(); }
  applyHighlight() {
    for (const node of this.element.querySelectorAll('[data-calendar-event]')) node.classList.toggle('is-highlighted', Boolean(this.highlightedId) && node.dataset.calendarEvent === this.highlightedId);
    const event = this.snapshot.events.find(value => value.id === this.highlightedId);
    for (const node of this.grid.querySelectorAll('[data-calendar-date]')) node.classList.toggle('is-highlighted-day', Boolean(event?.experiencedAt) && node.dataset.calendarDate === event.experiencedAt);
  }
  updateSummary() {
    const {dated, undated} = this.selection;
    const counts = TYPES.map(type => `${TYPE_NAMES[type]} ${dated.filter(({item}) => item.type === type).length}`).join('　/　');
    this.summary.textContent = `${this.year} 年 ${this.month} 月 · ${dated.length} 次体验　　${counts}${undated.length ? `　　日期待补充 ${undated.length}` : ''}`;
  }
  render() {
    this.element.querySelector('[data-calendar-year]').value = this.year;
    this.element.querySelector('[data-calendar-month]').value = this.month;
    this.element.querySelector('[data-calendar-prev]').disabled = this.year === 1 && this.month === 1;
    this.element.querySelector('[data-calendar-next]').disabled = this.year === 9999 && this.month === 12;
    this.element.querySelectorAll('[data-calendar-type]').forEach(input => { input.checked = this.types.has(input.dataset.calendarType); });
    this.updateSummary();
    this.calendarView.render(); this.timelineView.render();
    if (this.dayDialog.open) this.renderDayList(this.dayDialog.dataset.date);
  }
}
