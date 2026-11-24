const TYPES = ['movie', 'book', 'music'];
const STATUSES = ['wish', 'doing', 'done'];
const now = () => new Date().toISOString();
export const newId = () => globalThis.crypto.randomUUID();

function text(value, label, limit = 500, required = false) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new Error(`${label}无效（最多 ${limit} 字）`);
  return value;
}
function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${label}无效`);
  return value;
}
function ratingValue(value) {
  if (!Number.isInteger(value) || value < 0 || value > 5) throw new Error('评分必须为 0 至 5 的整数');
  return value;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function optionalDate(value, label = '体验日期') {
  if (typeof value !== 'string' || (value && !validDate(value))) throw new Error(`${label}必须为空或有效的 YYYY-MM-DD 日期`);
  return value;
}
export function validateDoubanUrl(value = '') {
  if (typeof value !== 'string') throw new Error('豆瓣链接无效');
  if (!value.trim()) return '';
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('豆瓣链接必须为完整的 HTTPS 网址'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !(url.hostname === 'douban.com' || url.hostname.endsWith('.douban.com'))) throw new Error('豆瓣链接必须使用 https://douban.com 或其真实子域名');
  return url.href;
}
export function canonicalDoubanUrl(value = '', expectedType = '') {
  const normalized = validateDoubanUrl(value);
  if (!normalized) return '';
  const url = new URL(normalized);
  const mobile = url.hostname === 'm.douban.com' && url.pathname.match(/^\/(movie|book|music)\/subject\/(\d+)\/?$/);
  const desktop = url.hostname.match(/^(movie|book|music)\.douban\.com$/);
  const subject = url.pathname.match(/^\/subject\/(\d+)\/?$/);
  const type = mobile ? mobile[1] : desktop && subject ? desktop[1] : '';
  const id = mobile ? mobile[2] : subject?.[1];
  if (!type || !id) throw new Error('豆瓣作品链接须为电影、读书或音乐的 /subject/数字/ 页面');
  if (expectedType && expectedType !== type) throw new Error('豆瓣作品链接与所选书影音类型不一致');
  return `https://${type}.douban.com/subject/${id}/`;
}
export function validateCover(value = '') {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('封面链接无效');
  if (!value) return '';
  if (/^assets\/[a-zA-Z0-9_\-./]+\.(?:png|jpe?g|webp|svg)$/i.test(value) && !value.split('/').includes('..')) return value;
  let url;
  try { url = new URL(value); } catch { throw new Error('封面须为 HTTPS 图片网址或本地 assets 图片'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('封面须为 HTTPS 图片网址');
  return url.href;
}

export class MediaItem {
  constructor({id, title, original = '', type, subtype = '', creator = '', year = null, tags = [], cover = '', description = '', doubanUrl = ''} = {}) {
    text(id, '作品编号', 200, true); text(title, '作品名', 300, true);
    if (!TYPES.includes(type)) throw new Error('作品类型必须为书籍、影视或音乐');
    text(original, '原名', 300); text(subtype, '子类型', 100); text(creator, '创作者', 300); text(description, '作品介绍', 5000);
    if (year !== null && (!Number.isInteger(year) || year < 0 || year > 9999)) throw new Error('作品年份无效');
    if (!Array.isArray(tags) || tags.length > 100 || tags.some(tag => typeof tag !== 'string' || tag.length > 100)) throw new Error('作品标签无效');
    Object.assign(this, {id, title, original, type, subtype, creator, year, tags: Object.freeze([...tags]), cover: validateCover(cover), description, doubanUrl: canonicalDoubanUrl(doubanUrl, type)});
    Object.freeze(this);
  }
}

export class MediaRecord {
  constructor({itemId, status = 'wish', rating = 0, comment = '', memory = '', experiencedAt = '', updatedAt = now()} = {}) {
    text(itemId, '作品编号', 200, true);
    if (!STATUSES.includes(status)) throw new Error('标记状态无效');
    ratingValue(rating);
    if (status !== 'done' && rating !== 0) throw new Error('已体验后才能评分');
    text(comment, '短评', 500); text(memory, '时光记忆', 140); optionalDate(experiencedAt); timestamp(updatedAt, '更新时间');
    Object.assign(this, {itemId, status, rating, comment, memory, experiencedAt, updatedAt});
    Object.freeze(this);
  }
}

export class ExperienceEvent {
  constructor({id = newId(), itemId, experiencedAt = '', originalExperiencedAt = '', dateNote = '', rating = 0, comment = '', memory = '', doubanRecordUrl = '', createdAt = now(), updatedAt = createdAt} = {}) {
    text(id, '体验编号', 200, true); text(itemId, '作品编号', 200, true); optionalDate(experiencedAt); ratingValue(rating);
    optionalDate(originalExperiencedAt, '原始日期'); text(dateNote, '日期说明', 500);
    text(comment, '短评', 500); text(memory, '时光记忆', 140); timestamp(createdAt, '创建时间'); timestamp(updatedAt, '更新时间');
    Object.assign(this, {id, itemId, experiencedAt, originalExperiencedAt, dateNote, rating, comment, memory, doubanRecordUrl: validateDoubanUrl(doubanRecordUrl), createdAt, updatedAt});
    Object.freeze(this);
  }
}

export class RecordSubject {
  constructor() { this.observers = new Set(); }
  subscribe(observer) {
    if (!observer || typeof observer.update !== 'function') throw new Error('观察者需要 update 方法');
    this.observers.add(observer);
    return () => this.unsubscribe(observer);
  }
  unsubscribe(observer) { this.observers.delete(observer); }
  notify(snapshot, event) {
    const errors = [];
    for (const observer of [...this.observers]) {
      try { observer.update(snapshot, event); } catch (error) { errors.push(error); }
    }
    return errors;
  }
}

export class RecordStore extends RecordSubject {
  constructor(items, snapshotOrRecords = []) {
    super();
    this.items = Object.freeze(items.map(item => item instanceof MediaItem ? item : new MediaItem(item)));
    this.records = new Map(); this.events = new Map();
    this.replace(snapshotOrRecords, false);
  }
  all() { return Object.freeze([...this.records.values()]); }
  allEvents() { return Object.freeze([...this.events.values()]); }
  snapshot() { return Object.freeze({items: this.items, records: this.all(), events: this.allEvents()}); }
  get(itemId) { return this.records.get(itemId) || null; }
  getEvent(id) { return this.events.get(id) || null; }
  validate(record) {
    const value = record instanceof MediaRecord ? record : new MediaRecord(record);
    if (!this.itemIds.has(value.itemId)) throw new Error('记录中含有未知作品');
    return value;
  }
  save(record) {
    const value = this.validate(record);
    this.records.set(value.itemId, value);
    this.notify(this.snapshot(), {type: 'save', itemId: value.itemId});
    return value;
  }
  remove(itemId) {
    if (this.allEvents().some(event => event.itemId === itemId)) throw new Error('这部作品还有体验记录，请先逐条删除体验，再删除收藏');
    if (this.records.delete(itemId)) this.notify(this.snapshot(), {type: 'remove', itemId});
  }
  saveEvent(event) {
    let value = event instanceof ExperienceEvent ? event : new ExperienceEvent(event);
    if (!this.itemIds.has(value.itemId)) throw new Error('体验记录中含有未知作品');
    const previousEvent = this.events.get(value.id);
    if (previousEvent && previousEvent.itemId !== value.itemId) throw new Error('已有体验不能改为另一部作品');
    if (previousEvent) value = new ExperienceEvent({...value, createdAt: previousEvent.createdAt});
    const previous = this.get(value.itemId);
    const record = new MediaRecord({...previous, itemId: value.itemId, status: 'done', updatedAt: value.updatedAt});
    this.records.set(value.itemId, record);
    this.events.set(value.id, value);
    this.notify(this.snapshot(), {type: 'saveEvent', itemId: value.itemId, eventId: value.id});
    return value;
  }
  removeEvent(id) {
    const previous = this.getEvent(id);
    if (this.events.delete(id)) this.notify(this.snapshot(), {type: 'removeEvent', itemId: previous.itemId, eventId: id});
  }
  replace(snapshotOrRecords, emit = true) {
    const data = Array.isArray(snapshotOrRecords) ? {items: this.items, records: snapshotOrRecords, events: []} : snapshotOrRecords;
    if (!data || !Array.isArray(data.items) || !Array.isArray(data.records) || !Array.isArray(data.events)) throw new Error('备份必须包含作品、收藏和体验列表');
    const items = [], itemIds = new Set(), records = new Map(), events = new Map();
    for (const raw of data.items) {
      const item = raw instanceof MediaItem ? raw : new MediaItem(raw);
      if (itemIds.has(item.id)) throw new Error('作品目录含重复编号');
      itemIds.add(item.id); items.push(item);
    }
    for (const raw of data.records) {
      const record = raw instanceof MediaRecord ? raw : new MediaRecord(raw);
      if (!itemIds.has(record.itemId)) throw new Error('收藏中含有未知作品');
      if (records.has(record.itemId)) throw new Error('收藏中含重复作品');
      records.set(record.itemId, record);
    }
    for (const raw of data.events) {
      const event = raw instanceof ExperienceEvent ? raw : new ExperienceEvent(raw);
      if (!itemIds.has(event.itemId)) throw new Error('体验中含有未知作品');
      if (!records.has(event.itemId)) throw new Error('体验记录缺少对应收藏');
      if (events.has(event.id)) throw new Error('体验中含重复编号');
      events.set(event.id, event);
    }
    this.items = Object.freeze(items); this.itemIds = itemIds; this.records = records; this.events = events;
    if (emit) this.notify(this.snapshot(), {type: 'replace'});
  }
}

export class RecordObserver {
  update() { throw new Error('子类应实现 update'); }
}
