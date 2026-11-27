import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, ClipboardList, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import DateInput from './DateInput';
import { todayIsoVn } from './dateUtils';

type Dealer='Mai Linh'|'ONVIZ'|'Thành Nam';
type Entry={id:string;dealer:Dealer;entryDate:string;description:string;quantity:number|null;unitPrice:number|null;debitAmount:number;creditAmount:number;balance:number};
type Form={dealer:Dealer;entryDate:string;description:string;quantity:string;unitPrice:string;debitAmount:string;creditAmount:string};
type Props={onError:(message:string)=>void;onNotice:(message:string)=>void};
const dealers:Dealer[]=['Mai Linh','ONVIZ','Thành Nam'];
const initial=(dealer:Dealer):Form=>({dealer,entryDate:todayIsoVn(),description:'',quantity:'',unitPrice:'',debitAmount:'',creditAmount:''});
const money=(value:number)=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(Number(value)||0)+' ₫';
const date=(value:string)=>{if(!value)return '—';const [y,m,d]=value.slice(0,10).split('-');return d+'/'+m+'/'+y.slice(-2)};
const amount=(s:string)=>s.trim()===''?0:Number(s.replace(',','.'));
async function request<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch('/api'+path,{credentials:'include',headers:{'Content-Type':'application/json',...init?.headers},...init});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'Không thể lưu dữ liệu công nợ.')}if(response.status===204)return undefined as T;return response.json()}
export default function DealerReceivablesPage({onError,onNotice}:Props){
 const [dealer,setDealer]=useState<Dealer>('Mai Linh');const [entries,setEntries]=useState<Entry[]>([]);const [balances,setBalances]=useState<Record<Dealer,number>>({'Mai Linh':0,ONVIZ:0,'Thành Nam':0});const [form,setForm]=useState<Form>(()=>initial('Mai Linh'));const [editing,setEditing]=useState<string|null>(null);const [query,setQuery]=useState('');const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);
 const load=useCallback(async()=>{setLoading(true);try{const data=await request<{entries:Entry[];balances:Record<Dealer,number>}>('/dealer-receivables?dealer='+encodeURIComponent(dealer));setEntries(data.entries);setBalances(data.balances)}catch(error){onError(error instanceof Error?error.message:'Không tải được công nợ.')}finally{setLoading(false)}},[dealer,onError]);
 useEffect(()=>{void load()},[load]);
 const visible=useMemo(()=>entries.filter(row=>row.description.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))),[entries,query]);
 const reset=()=>{setEditing(null);setForm(initial(dealer))};
 const save=async(event:FormEvent)=>{event.preventDefault();if(!form.description.trim()){onError('Vui lòng nhập diễn giải.');return}const qty=form.quantity===''?null:amount(form.quantity),price=form.unitPrice===''?null:amount(form.unitPrice);const debit=amount(form.debitAmount),credit=amount(form.creditAmount);if((qty===null)!==(price===null)){onError('Số lượng và đơn giá cần nhập cùng nhau.');return}if(debit>0&&credit>0){onError('Mỗi dòng chỉ nhập Nợ hoặc Có.');return}if(debit<=0&&credit<=0){onError('Vui lòng nhập số tiền phát sinh Nợ hoặc Có.');return}const payload={dealer:form.dealer,entryDate:form.entryDate,description:form.description.trim(),quantity:qty,unitPrice:price,debitAmount:debit,creditAmount:credit};setSaving(true);try{await request('/dealer-receivables'+(editing?'/'+editing:''),{method:editing?'PATCH':'POST',body:JSON.stringify(payload)});onNotice(editing?'Đã cập nhật dòng công nợ.':'Đã lưu dòng công nợ.');reset();await load()}catch(error){onError(error instanceof Error?error.message:'Không thể lưu dòng công nợ.')}finally{setSaving(false)}};
 const edit=(row:Entry)=>{setEditing(row.id);setForm({dealer:row.dealer,entryDate:row.entryDate,description:row.description,quantity:row.quantity==null?'':String(row.quantity),unitPrice:row.unitPrice==null?'':String(row.unitPrice),debitAmount:row.debitAmount?String(row.debitAmount):'',creditAmount:row.creditAmount?String(row.creditAmount):''});window.scrollTo({top:0,behavior:'smooth'})};
 const remove=async(row:Entry)=>{if(!window.confirm('Xóa dòng công nợ “'+row.description+'”? Số dư sau dòng này sẽ được tính lại.'))return;try{await request('/dealer-receivables/'+row.id,{method:'DELETE'});onNotice('Đã xóa dòng công nợ.');await load()}catch(error){onError(error instanceof Error?error.message:'Không thể xóa dòng công nợ.')}};
 const set=(key:keyof Form,value:string)=>setForm(current=>({...current,[key]:value}));
 return <div className="dealer-receivables-page">
  <section className="panel dealer-receivables-header"><div className="panel-head"><div><h3><ClipboardList size={19}/> Theo dõi công nợ đại lý</h3><p>Sổ chi tiết thu phải, phát sinh Nợ/Có và số dư lũy kế của từng đại lý.</p></div></div>
   <div className="dealer-receivable-summary">{dealers.map(name=><button type="button" key={name} className={'dealer-receivable-balance'+(dealer===name?' active':'')} onClick={()=>{setDealer(name);if(form.dealer!==name)setForm(initial(name))}}><span>{name}</span><strong className={balances[name]<0?'debt-credit':''}>{money(Math.abs(balances[name]))}</strong><small>{balances[name]<0?'Dư Có':'Dư Nợ'} · Nhấn để xem sổ</small></button>)}</div>
  </section>
  <section className="panel dealer-receivable-editor"><div className="panel-head"><div><h3>{editing?<Pencil size={18}/>:<Plus size={18}/>} {editing?'Chỉnh sửa phát sinh':'Ghi nhận công nợ'} · {dealer}</h3><p>Ghi khoản phát sinh Nợ hoặc Có; số dư được tính tự động theo ngày hạch toán.</p></div>{editing&&<button className="btn-secondary" type="button" onClick={reset}><X size={15}/> Hủy sửa</button>}</div>
   <form onSubmit={save}><div className="dealer-receivable-form-grid">
    <label>Đại lý<select value={form.dealer} onChange={e=>{set('dealer',e.target.value);setDealer(e.target.value as Dealer)}}>{dealers.map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Ngày hạch toán<DateInput value={form.entryDate} onChange={v=>set('entryDate',v)} required ariaLabel="Ngày hạch toán"/></label>
    <label className="dealer-receivable-description">Diễn giải<input value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Tên sản phẩm, thu tiền, số dư đầu kỳ..." maxLength={300} required/></label>
    <label>Số lượng<input type="number" step="0.01" min="0" value={form.quantity} onChange={e=>set('quantity',e.target.value)} placeholder="Tùy chọn"/></label>
    <label>Đơn giá<input type="number" step="0.01" min="0" value={form.unitPrice} onChange={e=>set('unitPrice',e.target.value)} placeholder="Tùy chọn"/></label>
    <label>Phát sinh Nợ<input type="number" step="0.01" min="0" value={form.debitAmount} onChange={e=>set('debitAmount',e.target.value)} placeholder="0"/></label>
    <label>Phát sinh Có<input type="number" step="0.01" min="0" value={form.creditAmount} onChange={e=>set('creditAmount',e.target.value)} placeholder="0"/></label>
   </div><div className="dealer-receivable-form-footer"><span>Nếu nhập số lượng và đơn giá, hãy tự nhập tổng phát sinh ở cột Nợ hoặc Có theo chứng từ.</span><button className="btn-primary" disabled={saving}>{editing?<Pencil size={15}/>:<Plus size={15}/>} {saving?'Đang lưu...':editing?'Lưu thay đổi':'Thêm phát sinh'}</button></div></form>
  </section>
  <section className="panel dealer-receivable-ledger"><div className="dealer-receivable-ledger-head"><div><h3>Sổ chi tiết công nợ · {dealer}</h3><p>{visible.length} dòng ghi nhận · Số dư hiện tại: <b>{money(Math.abs(balances[dealer]))} {balances[dealer]<0?'Dư Có':'Dư Nợ'}</b></p></div><label className="dealer-receivable-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm theo diễn giải..."/></label></div>
   <div className="table-scroll"><table className="data-table dealer-receivable-table"><thead><tr><th>Ngày hạch toán</th><th>Diễn giải</th><th>Số lượng</th><th>Đơn giá</th><th>Phát sinh Nợ</th><th>Phát sinh Có</th><th>Số dư Nợ/Có</th><th>Thao tác</th></tr></thead><tbody>{visible.map(row=><tr key={row.id}><td>{date(row.entryDate)}</td><td className="dealer-receivable-description-cell">{row.description}</td><td>{row.quantity==null?'—':new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(row.quantity)}</td><td>{row.unitPrice==null?'—':money(row.unitPrice)}</td><td>{row.debitAmount?money(row.debitAmount):'—'}</td><td>{row.creditAmount?money(row.creditAmount):'—'}</td><td className={Number(row.balance)<0?'debt-credit':'debt-balance'}>{money(Math.abs(Number(row.balance)))} {Number(row.balance)<0?'Có':'Nợ'}</td><td><div className="dealer-receivable-row-actions"><button type="button" className="text-button" onClick={()=>edit(row)} aria-label="Sửa"><Pencil size={14}/> Sửa</button><button type="button" className="danger-link" onClick={()=>void remove(row)} aria-label="Xóa"><Trash2 size={14}/> Xóa</button></div></td></tr>)}
    {!visible.length&&<tr><td colSpan={8} className="empty-state">{loading?'Đang tải sổ công nợ...':query?'Không tìm thấy phát sinh phù hợp.':'Chưa có phát sinh công nợ cho đại lý này.'}</td></tr>}
   </tbody></table></div>
   <div className="dealer-receivable-closing"><span><ArrowDownLeft size={15}/> Tổng phát sinh Nợ: <b>{money(entries.reduce((sum,row)=>sum+Number(row.debitAmount||0),0))}</b></span><span><ArrowUpRight size={15}/> Tổng phát sinh Có: <b>{money(entries.reduce((sum,row)=>sum+Number(row.creditAmount||0),0))}</b></span></div>
  </section>
 </div>
}
