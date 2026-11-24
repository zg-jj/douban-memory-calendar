import {MediaItem, MediaRecord, ExperienceEvent, RecordStore, validateDoubanUrl, validateCover, newId, canonicalDoubanUrl} from './domain.js';
export {canonicalDoubanUrl} from './domain.js';

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const FIELD_DEFINITIONS = [
  {key:'title',label:'作品名',required:true,aliases:['作品名','标题','名称','title','name']},
  {key:'type',label:'类型',required:true,aliases:['类型','作品类型','type','media_type']},
  {key:'experiencedAt',label:'体验日期',required:false,aliases:['体验日期','完成日期','日期','experiencedAt','date','finished_at']},
  {key:'originalExperiencedAt',label:'原始日期',required:false,aliases:['原始日期','原始记录日期','originalExperiencedAt','original_date']},
  {key:'dateNote',label:'日期说明',required:false,aliases:['日期说明','日期备注','dateNote','date_note']},
  {key:'rating',label:'评分',required:false,aliases:['评分','我的评分','rating','score']},
  {key:'comment',label:'短评',required:false,aliases:['短评','评论','comment','review']},
  {key:'memory',label:'记忆',required:false,aliases:['记忆','时光记忆','memory']},
  {key:'doubanUrl',label:'豆瓣作品链接',required:false,aliases:['豆瓣作品链接','作品链接','doubanUrl','subject_url','url']},
  {key:'doubanRecordUrl',label:'豆瓣记录链接',required:false,aliases:['豆瓣记录链接','个人记录链接','doubanRecordUrl','record_url']},
  {key:'cover',label:'封面链接',required:false,aliases:['封面链接','封面','cover','cover_url']},
  {key:'creator',label:'创作者',required:false,aliases:['创作者','作者','导演','creator','author']},
  {key:'status',label:'收藏状态',required:false,aliases:['收藏状态','状态','status']}
];

export function parseCSV(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_CSV_BYTES) throw new Error('CSV 不得超过 5 MB');
  text = text.replace(/^\uFEFF/, '');
  const table = [], lineNumbers = [];
  let cells = [], value = '', quoted = false, closed = false, rowStart = 1, line = 1;
  const pushCell = () => { cells.push(value); value = ''; closed = false; };
  const pushRow = () => {
    pushCell();
    if (cells.some(cell => cell.trim() !== '')) { table.push(cells); lineNumbers.push(rowStart); }
    cells = []; rowStart = line + 1;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else {
        value += char;
        if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) line++;
      }
    } else if (char === ',') pushCell();
    else if (char === '\r' || char === '\n') {
      pushRow();
      if (char === '\r' && text[i + 1] === '\n') i++;
      line++; rowStart = line;
    } else if (char === '"') {
      if (value !== '' || closed) throw new Error(`CSV 第 ${line} 行引号位置无效`);
      quoted = true;
    } else {
      if (closed && !/\s/.test(char)) throw new Error(`CSV 第 ${line} 行闭合引号后应为逗号或换行`);
      if (!closed) value += char;
    }
  }
  if (quoted) throw new Error(`CSV 第 ${rowStart} 行的引号没有闭合`);
  if (value || cells.length || closed) pushRow();
  if (!table.length) throw new Error('CSV 为空，请包含标题行和记录');
  const headers = table.shift().map(cell => cell.trim());
  lineNumbers.shift();
  if (headers.some(header => !header)) throw new Error('CSV 标题行含有空列名');
  if (!table.length) throw new Error('CSV 只有标题行，还没有可导入记录');
  if (table.length > 10000) throw new Error('单次最多导入 10000 条记录');
  return {headers, rows: table, lineNumbers};
}

export function detectMapping(headers) {
  const normalize = value => value.trim().toLowerCase().replace(/[\s_-]/g, '');
  return Object.fromEntries(FIELD_DEFINITIONS.map(field => [field.key, headers.findIndex(header => field.aliases.some(alias => normalize(alias) === normalize(header)))]));
}

const typeAliases = new Map([
  ['movie','movie'],['影视','movie'],['电影','movie'],['电视剧','movie'],['剧集','movie'],['纪录片','movie'],['动画','movie'],['影','movie'],
  ['book','book'],['书籍','book'],['图书','book'],['书','book'],['music','music'],['音乐','music'],['专辑','music'],['音','music']
]);
const statusAliases = new Map([
  ['','done'],['done','done'],['已体验','done'],['看过','done'],['读过','done'],['听过','done'],['完成','done'],
  ['wish','wish'],['想体验','wish'],['想看','wish'],['想读','wish'],['想听','wish'],
  ['doing','doing'],['进行中','doing'],['在看','doing'],['在读','doing'],['在听','doing']
]);
const itemKey = item => JSON.stringify([item.type, item.title.trim(), item.creator.trim()]);
const eventKey = event => JSON.stringify([event.itemId,event.experiencedAt,event.rating,event.comment,event.memory,event.doubanRecordUrl]);

export function previewCSV(parsed, mapping, currentSnapshot) {
  const base = new RecordStore(currentSnapshot.items, currentSnapshot).snapshot();
  const items = [...base.items], records = new Map(base.records.map(record => [record.itemId,record]));
  const events = [...base.events], fingerprints = new Map();
  const indexEvent = (event,index) => {
    const key=eventKey(event);
    if(!fingerprints.has(key))fingerprints.set(key,[]);
    fingerprints.get(key).push(index);
  };
  events.forEach(indexEvent);
  const rows = [], errors = [], updatedItemIds = new Set(), originalItemIds = new Set(base.items.map(item=>item.id));
  const updatedEventIds = new Set(), originalEventIds = new Set(base.events.map(event=>event.id));
  let addedItems = 0, addedEvents = 0, addedRecords = 0, skipped = 0;
  const result = () => ({snapshot:errors.length ? null : new RecordStore(items,{items,records:[...records.values()],events}).snapshot(),rows,errors,addedItems,updatedItems:updatedItemIds.size,updatedEvents:updatedEventIds.size,addedEvents,addedRecords,skipped});
  for (const field of FIELD_DEFINITIONS) {
    const index = Number(mapping[field.key] ?? -1);
    if (!Number.isInteger(index) || index < -1 || index >= parsed.headers.length || (field.required && index < 0)) errors.push({rowNumber:1,message:`请选择有效的“${field.label}”列`});
  }
  const indexes = FIELD_DEFINITIONS.map(field=>Number(mapping[field.key] ?? -1)).filter(index=>index>=0);
  if (new Set(indexes).size !== indexes.length) errors.push({rowNumber:1,message:'同一列不能对应多个字段'});
  if (errors.length) return result();
  const knownUrls = new Map(), knownKeys = new Map();
  const indexItem = item => {
    if (item.doubanUrl) knownUrls.set(canonicalDoubanUrl(item.doubanUrl),item);
    const key = itemKey(item);
    if (!knownKeys.has(key)) knownKeys.set(key,[]);
    knownKeys.get(key).push(item);
  };
  items.forEach(indexItem);
  parsed.rows.forEach((cells,rowIndex) => {
    const rowNumber = parsed.lineNumbers?.[rowIndex] ?? rowIndex + 2;
    const values = Object.fromEntries(FIELD_DEFINITIONS.map(field => [field.key,Number(mapping[field.key] ?? -1) < 0 ? '' : (cells[Number(mapping[field.key])] ?? '').trim()]));
    const preview = {rowNumber,title:values.title,type:values.type,status:values.status||'已体验',date:values.experiencedAt,action:'',error:''};
    rows.push(preview);
    try {
      if (cells.length !== parsed.headers.length) throw new Error(`实际 ${cells.length} 列，与标题行 ${parsed.headers.length} 列不一致`);
      if (!values.title) throw new Error('作品名不能为空');
      const type = typeAliases.get(values.type.toLowerCase()), status = statusAliases.get(values.status.toLowerCase());
      if (!type) throw new Error('类型须为书籍、影视或音乐');
      if (!status) throw new Error('收藏状态须为想体验、进行中或已体验');
      if (values.rating && !/^[0-5]$/.test(values.rating)) throw new Error('评分须为 0 至 5 的整数');
      const rating = values.rating ? Number(values.rating) : 0;
      if (status !== 'done' && rating) throw new Error('想体验或进行中的作品不能带正评分');
      const doubanUrl = canonicalDoubanUrl(values.doubanUrl), doubanRecordUrl = validateDoubanUrl(values.doubanRecordUrl), cover = validateCover(values.cover);
      if (doubanUrl && new URL(doubanUrl).hostname !== `${type}.douban.com`) throw new Error('豆瓣作品链接与所选书影音类型不一致');
      const key = itemKey({...values,type}), candidates = knownKeys.get(key) || [];
      let item = doubanUrl ? knownUrls.get(doubanUrl) : null;
      if (item && item.type !== type) throw new Error('同一豆瓣作品链接对应的类型冲突');
      if (!item && candidates.length > 1) throw new Error('同名同类型同创作者的作品不唯一，请补充豆瓣作品链接');
      if (!item && candidates.length === 1) item = candidates[0];
      if (item?.doubanUrl && doubanUrl && canonicalDoubanUrl(item.doubanUrl) !== doubanUrl) throw new Error('作品名称和创作者相同，但豆瓣作品链接不同，请核对');
      const isNewItem = !item;
      const candidate = item || new MediaItem({id:`import-${newId()}`,title:values.title,type,creator:values.creator,cover,doubanUrl});
      // Validate the full row before adding any part of it to the candidate snapshot.
      const rowRecord = new MediaRecord({itemId:candidate.id,status,rating,comment:values.comment,memory:values.memory,experiencedAt:values.experiencedAt});
      const event = status === 'done' ? new ExperienceEvent({itemId:candidate.id,experiencedAt:values.experiencedAt,
        originalExperiencedAt:values.originalExperiencedAt,dateNote:values.dateNote,rating,comment:values.comment,memory:values.memory,doubanRecordUrl}) : null;
      let enrichedItem = false;
      if (isNewItem) { item=candidate;items.push(item);indexItem(item);addedItems++; }
      else if ((!item.doubanUrl && doubanUrl) || (!item.cover && cover)) {
        const enriched = new MediaItem({...item,doubanUrl:item.doubanUrl||doubanUrl,cover:item.cover||cover});
        items[items.findIndex(value=>value.id===item.id)]=enriched;
        const keyed=knownKeys.get(itemKey(item));keyed[keyed.findIndex(value=>value.id===item.id)]=enriched;
        if(enriched.doubanUrl)knownUrls.set(canonicalDoubanUrl(enriched.doubanUrl),enriched);
        item=enriched;
        enrichedItem=true;
        if(originalItemIds.has(item.id))updatedItemIds.add(item.id);
      }
      preview.type=type;preview.status=status;
      // Provenance is deliberately excluded from identity: it may fill a unique
      // duplicate, but must never create another experience or merge repeats.
      if (event && fingerprints.has(eventKey(event))) {
        preview.action=enrichedItem?'已补充作品信息；重复体验，跳过':'重复体验，跳过';
        if(event.originalExperiencedAt||event.dateNote){
          const matches=fingerprints.get(eventKey(event));
          if(matches.length!==1)preview.action+='；存在多次相同体验，未补充日期来源信息';
          else {
            const index=matches[0], previous=events[index];
            const originalExperiencedAt=previous.originalExperiencedAt||event.originalExperiencedAt;
            const dateNote=previous.dateNote||event.dateNote;
            if(originalExperiencedAt!==previous.originalExperiencedAt||dateNote!==previous.dateNote){
              events[index]=new ExperienceEvent({...previous,originalExperiencedAt,dateNote});
              if(originalEventIds.has(previous.id))updatedEventIds.add(previous.id);
              preview.action+='；已补充原始日期说明';
            }
            if((previous.originalExperiencedAt&&event.originalExperiencedAt&&previous.originalExperiencedAt!==event.originalExperiencedAt)||
              (previous.dateNote&&event.dateNote&&previous.dateNote!==event.dateNote))preview.action+='；日期来源信息冲突，保留原值';
          }
        }
        skipped++;return;
      }
      const existing = records.get(item.id);
      if (!existing) { records.set(item.id,rowRecord);addedRecords++; }
      else if (event && existing.status !== 'done') records.set(item.id,new MediaRecord({...existing,status:'done',updatedAt:event.updatedAt}));
      if (event) { indexEvent(event,events.length);events.push(event);addedEvents++;preview.action=existing?'新增体验，保留收藏评分':'新增收藏与体验'; }
      else if (existing) { skipped++;preview.action='收藏已存在，保留原值'; }
      else preview.action='新增收藏';
      if(enrichedItem)preview.action='已补充作品信息；'+preview.action;
    } catch (error) {
      preview.error=error.message;preview.action='需修正';errors.push({rowNumber,message:error.message});
    }
  });
  return result();
}
