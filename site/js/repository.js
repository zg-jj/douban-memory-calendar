import {ExperienceEvent, RecordStore} from './domain.js';

export const STORAGE_KEY = 'douban-memory-calendar-v3';
export const LEGACY_STORAGE_KEY = 'douban-memory-lab-v2';
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export class LocalRecordRepository {
  constructor(storage, seedItems) {
    this.storage = storage;
    this.seedItems = seedItems;
    this.migratedFromLegacy = false;
  }
  load() {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw !== null) return this.parse(raw);
    const legacy = this.storage.getItem(LEGACY_STORAGE_KEY);
    if (legacy !== null) {
      const snapshot = this.parse(legacy);
      this.migratedFromLegacy = true;
      return snapshot;
    }
    return new RecordStore(this.seedItems).snapshot();
  }
  save(snapshot) { this.storage.setItem(STORAGE_KEY, this.serialize(snapshot)); }
  serialize(snapshot) {
    const data = new RecordStore(this.seedItems, snapshot).snapshot();
    return JSON.stringify({schemaVersion: 3, ...data}, null, 2);
  }
  parse(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('备份不得超过 5 MB');
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('JSON 格式不正确'); }
    if (data?.schemaVersion === 3) return new RecordStore(this.seedItems, data).snapshot();
    if (data?.schemaVersion !== 2 || !Array.isArray(data.records)) throw new Error('不是可识别的书影音备份（支持第 2、3 版）');
    const old = new RecordStore(this.seedItems, data.records);
    const events = old.all().filter(record => record.status === 'done').map(record => new ExperienceEvent({
      id: `legacy-${record.itemId}`, itemId: record.itemId, experiencedAt: record.experiencedAt,
      rating: record.rating, comment: record.comment, memory: record.memory,
      createdAt: record.updatedAt, updatedAt: record.updatedAt
    }));
    return new RecordStore(this.seedItems, {...old.snapshot(), events}).snapshot();
  }
}
