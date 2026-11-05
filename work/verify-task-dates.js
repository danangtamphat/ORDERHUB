const fs=require('fs'),vm=require('vm'),html=fs.readFileSync('outputs/OrderHub-ban-dung-thu.html','utf8');
const dateFn=html.match(/function formatTaskDeadline\(dateValue\) \{[\s\S]*?\n    \}/)[0];
const normalizeFn=html.match(/function normalizeTaskDeadline\(value\) \{[\s\S]*?\n    \}/)[0];
const ctx={Date,window:{XLSX:null}}; vm.runInNewContext(dateFn+'\n'+normalizeFn,ctx);
if(ctx.formatTaskDeadline('2026-11-07')!=='07/11/26') throw new Error('Deadline display format failed');
if(ctx.normalizeTaskDeadline('07/11/2026')!=='2026-11-07') throw new Error('dd/mm/yyyy import failed');
if(ctx.normalizeTaskDeadline('2026-11-07')!=='2026-11-07') throw new Error('ISO import failed');
console.log('Task deadline format/import checks OK');
