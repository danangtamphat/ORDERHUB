const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('outputs/OrderHub-ban-dung-thu.html','utf8');
const match=html.match(/function isEmployeeProfileComplete\(account\) \{[\s\S]*?\n    \}/);
const ctx={}; vm.runInNewContext(match[0],ctx);
const valid={role:'STAFF',name:'Account Name',employeeInfo:{fullName:'Nguyen Van A',position:'Nhan vien',birthDate:'1990-01-01',hometown:'Ha Noi',nationalId:'012345678901',startDate:'2020-01-01'}};
if(!ctx.isEmployeeProfileComplete(valid)) throw new Error('Valid profile rejected');
for(const [field,value] of [['nationalId','123'],['fullName',''],['position','']]) if(ctx.isEmployeeProfileComplete({...valid,employeeInfo:{...valid.employeeInfo,[field]:value}})) throw new Error(`Invalid ${field} accepted`);
console.log('Employee profile required-field checks OK');
