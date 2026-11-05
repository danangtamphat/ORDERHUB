const fs=require('fs'),vm=require('vm'),html=fs.readFileSync('outputs/OrderHub-ban-dung-thu.html','utf8');
function extract(name){const start=html.indexOf('    function '+name+'(');if(start<0)throw Error('Missing '+name);const end=html.indexOf('\n    }',start)+6;return html.slice(start,end)}
const ctx={Date,Math};vm.runInNewContext(['taskIsCompleted','taskDaysUntilDeadline','taskDeadlineStatus'].map(extract).join('\n'),ctx);
const now=new Date(),yesterday=new Date(now);yesterday.setDate(now.getDate()-1);
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const incomplete={deadline:iso(yesterday),completed:false};
if(!ctx.taskDeadlineStatus(incomplete).text.includes('Chưa hoàn thành'))throw Error('Overdue task is not marked incomplete');
if(ctx.taskDeadlineStatus({...incomplete,completed:true}).text!=='Đã hoàn thành')throw Error('Completed task not recognized');
if(!ctx.taskIsCompleted({progress:100}))throw Error('Legacy completed task migration failed');
console.log('Countdown/completion checks OK');
