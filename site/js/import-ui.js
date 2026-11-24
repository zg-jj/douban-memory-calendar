import {parseCSV,detectMapping,previewCSV,FIELD_DEFINITIONS} from './csv.js';
import {escapeHtml as h} from './views.js';
import {enrichMissingArtwork,normalizeArtworkCSV} from './artwork.js';

export function installCsvUI(app){
  document.body.insertAdjacentHTML('beforeend',`<dialog id="csv-dialog" class="csv-dialog" aria-labelledby="csv-title">
    <button id="close-csv" class="close-button" aria-label="关闭CSV导入">×</button>
    <p class="dialog-eyebrow">把记录带进你的日历</p><h2 id="csv-title">导入书影音记录</h2>
    <p class="csv-intro">选择CSV文件，确认列名与内容后导入。这是文件导入，不会连接你的豆瓣账号。可识别的作品会补齐封面；其余作品请填写封面链接，未填写时显示文字占位。</p>
    <div class="csv-file-row"><label class="primary csv-file-label">选择CSV文件<input id="csv-file" type="file" accept=".csv,text/csv" hidden></label><span id="csv-filename">尚未选择文件</span></div>
    <p class="csv-downloads"><a href="templates/书影音导入模板.csv" download>下载空白模板</a><a href="templates/书影音导入示例.csv" download>下载示例CSV</a></p>
    <div id="csv-mapping" class="csv-mapping"></div>
    <p id="csv-error" class="error" role="alert"></p>
    <div id="csv-summary" role="status"></div><div id="csv-preview" class="csv-preview"></div>
    <div class="dialog-actions"><span>有错误时整批不写入；已存在的收藏评分保持原值。</span><button id="confirm-csv" class="primary" disabled>确认导入</button></div>
  </dialog>`);
  const $=selector=>document.querySelector(selector),dialog=$('#csv-dialog');
  let parsed=null,mapping={},preview=null;
  const drawPreview=()=>{
    if(!parsed)return;
    $('#csv-error').textContent='';
    try{
      const catalog=app.artworkCatalog||[];
      const current=enrichMissingArtwork(app.store.snapshot(),catalog);
      preview=previewCSV(normalizeArtworkCSV(parsed,mapping,catalog),mapping,current.snapshot);
      if(preview.snapshot){const artwork=enrichMissingArtwork(preview.snapshot,app.artworkCatalog||[]);preview.snapshot=artwork.snapshot;preview.artworkItems=artwork.updatedItems;}
      if(preview.snapshot)preview.artworkItems+=current.updatedItems;
      $('#csv-summary').textContent=`新增作品 ${preview.addedItems} · 新增收藏 ${preview.addedRecords} · 新增体验 ${preview.addedEvents} · 补充作品信息 ${preview.updatedItems||0} · 自动补图 ${preview.artworkItems||0} · 重复跳过 ${preview.skipped} · 错误 ${preview.errors.length}`;
      $('#confirm-csv').disabled=preview.errors.length>0||!preview.snapshot;
      const display=preview.rows.slice(0,200);
      $('#csv-preview').innerHTML=`<table><thead><tr><th>行</th><th>作品</th><th>类型</th><th>体验日期</th><th>处理结果</th></tr></thead><tbody>${display.map(row=>`<tr class="${row.error?'csv-row-error':''}"><td>${row.rowNumber}</td><td>${h(row.title)}</td><td>${h(row.type)}</td><td>${h(row.date||'日期待补充')}</td><td>${h(row.error||row.action)}</td></tr>`).join('')}</tbody></table>${preview.rows.length>200?'<p>预览展示前200行，校验与导入覆盖全部记录。</p>':''}`;
      if(preview.errors.length)$('#csv-error').textContent=preview.errors.map(error=>`第${error.rowNumber}行：${error.message}`).slice(0,8).join('；');
    }catch(error){preview=null;$('#confirm-csv').disabled=true;$('#csv-error').textContent=error.message;}
  };
  app.openCsvImport=()=>dialog.showModal();
  $('#close-csv').addEventListener('click',()=>dialog.close());
  $('#csv-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    preview=null;parsed=null;$('#confirm-csv').disabled=true;$('#csv-error').textContent='';
    $('#csv-preview').innerHTML='';$('#csv-summary').textContent='';$('#csv-mapping').innerHTML='';
    $('#csv-filename').textContent=file.name;
    try{
      if(file.size>5*1024*1024)throw new Error('CSV文件不得超过5MB');
      const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
      parsed=parseCSV(text);mapping=detectMapping(parsed.headers);
      $('#csv-mapping').innerHTML=`<h3>确认字段对应</h3>${FIELD_DEFINITIONS.map(field=>`<label>${h(field.label)}${field.required?' *':''}<select data-map="${field.key}"><option value="-1">不导入这一列</option>${parsed.headers.map((head,i)=>`<option value="${i}" ${mapping[field.key]===i?'selected':''}>${h(head)}</option>`).join('')}</select></label>`).join('')}`;
      drawPreview();
    }catch(error){$('#csv-error').textContent=error.message.includes('encoded')?'文件不是UTF-8编码，请在导出时选择UTF-8 CSV。':error.message;}
    event.target.value='';
  });
  $('#csv-mapping').addEventListener('change',event=>{if(event.target.dataset.map){mapping[event.target.dataset.map]=Number(event.target.value);drawPreview();}});
  $('#confirm-csv').addEventListener('click',()=>{
    if(!parsed)return;
    // Rebuild against the latest state so an older preview cannot overwrite new edits.
    drawPreview();if(!preview?.snapshot||preview.errors.length)return;
    try{app.store.replace(preview.snapshot);app.resetQueue();app.render();dialog.close();
      app.toast(app.storageError?'已导入，但本地保存失败，请导出备份':`已导入 ${preview.addedEvents} 次体验，跳过 ${preview.skipped} 条重复记录${preview.updatedItems||preview.artworkItems?'，已补充作品信息':''}`);
    }catch(error){$('#csv-error').textContent=error.message;}
  });
}
