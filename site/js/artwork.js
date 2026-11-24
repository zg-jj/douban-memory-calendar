import {MediaItem, RecordStore, canonicalDoubanUrl} from './domain.js';

const titleKey = (type, title) => JSON.stringify([type, title.trim()]);

function validateCatalog(catalog) {
  if (!Array.isArray(catalog)) throw new Error('封面目录必须为数组');
  return catalog.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('封面目录条目无效');
    const aliases = raw.aliases ?? [];
    if (!Array.isArray(aliases) || aliases.length > 100 || aliases.some(alias => typeof alias !== 'string' || !alias.trim() || alias.length > 300)) {
      throw new Error('封面目录别名无效');
    }
    if (raw.ambiguous !== undefined && typeof raw.ambiguous !== 'boolean') throw new Error('封面目录重名标记无效');
    if (raw.correctsTitle !== undefined && (typeof raw.correctsTitle !== 'string' || !raw.correctsTitle.trim() || raw.correctsTitle.length > 300 || raw.correctsTitle.trim() === raw.title?.trim())) {
      throw new Error('已确认版本的原作品名无效');
    }
    const item = new MediaItem({
      id: `artwork-${index}`, type: raw.type, title: raw.title, year: raw.year,
      subtype: raw.subtype, creator: raw.creator, doubanUrl: raw.doubanUrl, cover: raw.cover
    });
    return {item, aliases: [...new Set(aliases.map(alias => alias.trim()))], ambiguous: raw.ambiguous === true, correctsTitle: raw.correctsTitle?.trim() || ''};
  });
}

/** Apply only the edition corrections explicitly confirmed in this catalog. */
export function normalizeArtworkCSV(parsed, mapping, catalog) {
  const entries = validateCatalog(catalog).filter(entry => entry.correctsTitle);
  const titleIndex = mapping.title, typeIndex = mapping.type;
  if (!entries.length || !Number.isInteger(titleIndex) || titleIndex < 0 || !Number.isInteger(typeIndex) || typeIndex < 0) return parsed;
  const movieTypes = new Set(['movie','影视','电影','电视剧','剧集','纪录片','动画','影']);
  const rows = parsed.rows.map(cells => {
    if (cells.length !== parsed.headers.length || !movieTypes.has(cells[typeIndex]?.trim().toLowerCase())) return cells;
    const candidates = entries.filter(entry => entry.item.type === 'movie' && entry.correctsTitle === cells[titleIndex]?.trim());
    if (candidates.length !== 1) return cells;
    const {item} = candidates[0], row = [...cells];
    row[titleIndex] = item.title;
    row[typeIndex] = item.subtype || item.type;
    // Artwork and subject links from the previous edition must not carry across.
    if (Number.isInteger(mapping.cover) && mapping.cover >= 0) row[mapping.cover] = item.cover;
    if (Number.isInteger(mapping.doubanUrl) && mapping.doubanUrl >= 0) row[mapping.doubanUrl] = item.doubanUrl;
    return row;
  });
  return {...parsed, rows};
}

/** Fill missing artwork and confirmed editions without rewriting personal history. */
export function enrichMissingArtwork(snapshot, catalog) {
  if (!snapshot || !Array.isArray(snapshot.items)) throw new Error('作品快照无效');
  const validated = new RecordStore(snapshot.items, snapshot).snapshot();
  // Validate the entire catalog before calculating any candidate changes.
  const entries = validateCatalog(catalog);
  const byUrl = new Map(), byTitle = new Map();
  const add = (map, key, entry) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  };
  for (const entry of entries) {
    if (entry.item.doubanUrl) add(byUrl, entry.item.doubanUrl, entry);
    const titles = new Set([entry.item.title.trim(), ...entry.aliases]);
    for (const title of titles) add(byTitle, titleKey(entry.item.type, title), entry);
  }
  const updatedIds = new Set();
  const items = validated.items.map((validatedItem, index) => {
    let item = validatedItem, original = snapshot.items[index];
    const corrections = entries.filter(entry => entry.item.type === item.type && entry.correctsTitle && entry.correctsTitle === item.title.trim());
    if (corrections.length === 1) {
      const edition = corrections[0].item;
      item = new MediaItem({...item, title: edition.title, year: edition.year, subtype: edition.subtype, cover: edition.cover, doubanUrl: edition.doubanUrl});
      original = item;
      updatedIds.add(item.id);
    }
    if (item.cover && item.doubanUrl) return original;
    const exact = item.doubanUrl ? byUrl.get(canonicalDoubanUrl(item.doubanUrl, item.type)) || [] : [];
    let candidate;
    if (exact.length) {
      // An exact subject URL takes precedence over titles and other metadata.
      if (exact.length !== 1) return original;
      candidate = exact[0];
    } else {
      const candidates = (byTitle.get(titleKey(item.type, item.title)) || []).filter(entry => {
        const source = entry.item;
        if (item.doubanUrl && source.doubanUrl && item.doubanUrl !== source.doubanUrl) return false;
        if (item.year !== null && source.year !== null && item.year !== source.year) return false;
        if (item.creator.trim() && source.creator.trim() && item.creator.trim() !== source.creator.trim()) return false;
        if (entry.ambiguous && (item.year === null || source.year === null || item.year !== source.year)) return false;
        return true;
      });
      if (candidates.length !== 1) return original;
      candidate = candidates[0];
    }
    const cover = item.cover || candidate.item.cover;
    const doubanUrl = item.doubanUrl || candidate.item.doubanUrl;
    if (cover === item.cover && doubanUrl === item.doubanUrl) return original;
    updatedIds.add(item.id);
    return new MediaItem({...item, cover, doubanUrl});
  });
  if (!updatedIds.size) return {snapshot, updatedItems: 0};
  return {snapshot: Object.freeze({...snapshot, items: Object.freeze(items)}), updatedItems: updatedIds.size};
}
