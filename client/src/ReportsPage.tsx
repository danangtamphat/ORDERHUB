import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Eye, FileSpreadsheet, FileText } from 'lucide-react';
import { formatDateVn, todayIsoVn } from './dateUtils';

type Order = { id: string; trackingCode: string; amountVnd: number; grossAmountVnd: number; shareGroupId: string|null; status: 'pending'|'delivered'|'returned'; adminReconciled: boolean; invoiceStatus: 'not_issued'|'issued'; ownerUserId: string; ownerName: string; createdAt: string };
type Person = { id: string; displayName: string; role: string; active?: boolean };
type User = { role: 'admin'|'manager'|'staff' };
const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
const addDays = (value: string, days: number) => { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const monthStart = (value: string) => `${value.slice(0, 7)}-01`;
const nextMonth = (value: string) => { const d = new Date(`${monthStart(value)}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
const payrollPeriod = (value = todayIsoVn()) => {
  const [year, month, day] = value.split('-').map(Number);
  const offset = day >= 26 ? 0 : -1;
  const start = new Date(Date.UTC(year, month - 1 + offset, 26, 12));
  const end = new Date(Date.UTC(year, month - 1 + offset + 1, 25, 12));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
};
const dateOfOrder = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const currentCommissionPeriod = () => {
  const period = payrollPeriod();
  return { from: period.from, until: addDays(period.to, 1) };
};

export default function ReportsPage({ orders, people, user }: { orders: Order[]; people: Person[]; user: User }) {
  const [from, setFrom] = useState(()=>monthStart(todayIsoVn())), [to, setTo] = useState(()=>todayIsoVn()), [range,setRange]=useState<'today'|'yesterday'|'lastWeek'|'month'|'lastMonth'|'payroll'>('month'), [status, setStatus] = useState(''), [invoice, setInvoice] = useState(''), [person, setPerson] = useState(''), [showPreview, setShowPreview] = useState(false), [currentPage,setCurrentPage]=useState(1);
  const pageSize = 15;
  const filtered = useMemo(() => orders.filter(o => (!from || dateOfOrder(o.createdAt) >= from) && (!to || dateOfOrder(o.createdAt) <= to) && (!status || o.status === status) && (!invoice || o.invoiceStatus === invoice) && (!person || o.ownerUserId === person)), [orders, from, to, status, invoice, person]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)), pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => setCurrentPage(1), [from,to,status,invoice,person]);
  useEffect(() => { if (currentPage > pageCount) setCurrentPage(pageCount); }, [currentPage,pageCount]);
  const statusName = { pending: 'Chờ xử lý', delivered: 'Giao thành công', returned: 'Hoàn trả' };
  const totals = useMemo(() => { const seen = new Set<string>(); return filtered.reduce((sum, o) => { const key = o.shareGroupId || o.id; if (seen.has(key)) return sum; seen.add(key); return { count: sum.count + 1, value: sum.value + Number(o.grossAmountVnd ?? o.amountVnd) }; }, { count: 0, value: 0 }); }, [filtered]);
  const commissionPeriod = useMemo(currentCommissionPeriod, []);
  const commissionStats = useMemo(() => {
    const delivered = orders.filter(o => o.status === 'delivered' && dateOfOrder(o.createdAt) >= commissionPeriod.from && dateOfOrder(o.createdAt) < commissionPeriod.until && (!person || o.ownerUserId === person));
    const aggregateValue = (rows: Order[]) => rows.reduce((sum, o, index) => {
      if (user.role !== 'admin') return sum + Number(o.amountVnd);
      const group = o.shareGroupId || o.id;
      if (rows.slice(0, index).some(prev => (prev.shareGroupId || prev.id) === group)) return sum;
      return sum + Number(o.grossAmountVnd ?? o.amountVnd);
    }, 0);
    const reconciled = delivered.filter(o => o.adminReconciled);
    const awaiting = delivered.filter(o => !o.adminReconciled);
    const commissionBase = reconciled.reduce((sum, o) => sum + Number(o.amountVnd), 0);
    return { deliveredValue: aggregateValue(delivered), awaitingValue: aggregateValue(awaiting), reconciledValue: aggregateValue(reconciled), bonus: Math.round(commissionBase * .015) };
  }, [orders, commissionPeriod, person, user.role]);
  const setQuickRange = (kind: 'today'|'yesterday'|'lastWeek'|'month'|'lastMonth'|'payroll') => {
    const today = todayIsoVn();
    setRange(kind);
    if (kind === 'today') { setFrom(today); setTo(today); }
    else if (kind === 'yesterday') { const yesterday = addDays(today, -1); setFrom(yesterday); setTo(yesterday); }
    else if (kind === 'lastWeek') { const d=new Date(`${today}T12:00:00Z`),offset=(d.getUTCDay()+6)%7,monday=addDays(today,-offset);setFrom(addDays(monday,-7));setTo(addDays(monday,-1)); }
    else if (kind === 'month') { setFrom(monthStart(today)); setTo(today); }
    else if (kind === 'lastMonth') { const first=new Date(`${monthStart(today)}T12:00:00Z`);first.setUTCDate(0);const last=first.toISOString().slice(0,10);setFrom(monthStart(last));setTo(last); }
    else { const period = payrollPeriod(today); setFrom(period.from); setTo(period.to); }
  };
  const excel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map((o, i) => ({ STT: i + 1, 'Mã vận đơn': o.trackingCode, 'Nhân viên': o.ownerName, 'Giá trị đơn hàng': Number(o.grossAmountVnd ?? o.amountVnd), 'Doanh thu / người': Number(o.amountVnd), 'Trạng thái đơn': statusName[o.status], 'Admin đối soát': o.adminReconciled ? 'Đã xác nhận' : 'Chờ đối soát', 'Xuất hóa đơn': o.invoiceStatus === 'issued' ? 'Đã xuất hóa đơn' : 'Chưa xuất hóa đơn', 'Ngày tạo': formatDateVn(o.createdAt) })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo'); XLSX.writeFile(wb, 'Bao_cao_don_hang.xlsx');
  };
  return <div className="report-page"><section className="panel report-filter-panel"><div className="panel-head"><div><h3>Xem nhanh báo cáo</h3><p>Chọn khoảng thời gian; mặc định từ đầu tháng đến hôm nay.</p></div></div><div className="report-quick-filters"><span>Thời gian:</span>{([['today','Hôm nay'],['yesterday','Hôm qua'],['lastWeek','Tuần trước'],['month','Tháng này'],['lastMonth','Tháng trước'],['payroll','Kỳ lương (26–25)']] as const).map(([key,label])=><button type="button" key={key} className={`btn-secondary ${range===key?'range-active':''}`} onClick={() => setQuickRange(key)}>{label}</button>)}<strong className="quick-range-dates">{formatDateVn(from)} – {formatDateVn(to)}</strong></div><div className="report-filter-grid"><label>Trạng thái đơn<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Tất cả trạng thái</option><option value="pending">Chờ xử lý</option><option value="delivered">Giao thành công</option><option value="returned">Hoàn trả</option></select></label><label>Xuất hóa đơn<select value={invoice} onChange={e => setInvoice(e.target.value)}><option value="">Tất cả hóa đơn</option><option value="not_issued">Chưa xuất hóa đơn</option><option value="issued">Đã xuất hóa đơn</option></select></label><label>Nhân viên<select value={person} onChange={e => setPerson(e.target.value)}><option value="">Tất cả nhân viên</option>{people.filter(p => p.active !== false && p.role !== 'admin').map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label></div><div className="report-buttons"><button className="btn-secondary" onClick={() => setShowPreview(x => !x)}><Eye size={15} />{showPreview ? 'Ẩn xem trước' : 'Xem trước'}</button><button className="btn-primary report-excel" onClick={excel}><FileSpreadsheet size={15} /> Xuất Excel (.xlsx)</button><button className="btn-secondary" onClick={() => window.print()}><FileText size={15} /> Xuất PDF / In</button></div></section><section className="panel report-result"><div className="report-result-head"><div><h3>{showPreview ? 'Xem trước dữ liệu báo cáo' : 'Kết quả báo cáo'}</h3><span>{totals.count} đơn · Tổng giá trị {money(totals.value)}</span></div><div className="report-commission-summary"><div><small>Giá trị đơn giao thành công · kỳ thưởng 26–25</small><strong>{money(commissionStats.deliveredValue)}</strong><small>Chờ admin đối soát: {money(commissionStats.awaitingValue)}</small></div><div><small>Đã đối soát: {money(commissionStats.reconciledValue)} · Thưởng 1,5%</small><strong>{money(commissionStats.bonus)}</strong><small>Kỳ {formatDateVn(commissionPeriod.from)}–{formatDateVn(addDays(commissionPeriod.until, -1))}</small></div></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>STT</th><th>Mã vận đơn</th><th>Nhân viên</th><th>Giá trị đơn (VNĐ)</th><th>Doanh thu / người</th><th>Trạng thái đơn</th><th>Đối soát</th><th>Xuất hóa đơn</th><th>Ngày tạo</th></tr></thead><tbody>{pageRows.map((o, i) => <tr key={o.id}><td>{(currentPage-1)*pageSize+i+1}</td><td><b>{o.trackingCode}</b></td><td>{o.ownerName}</td><td>{money(Number(o.grossAmountVnd ?? o.amountVnd))}</td><td className="revenue-green">{money(Number(o.amountVnd))}</td><td>{statusName[o.status]}</td><td>{o.adminReconciled ? 'Đã xác nhận' : o.status==='delivered'?'Chờ admin':'Chưa giao thành công'}</td><td>{o.invoiceStatus === 'issued' ? 'Đã xuất hóa đơn' : 'Chưa xuất hóa đơn'}</td><td>{formatDateVn(o.createdAt)}</td></tr>)}</tbody></table>{!filtered.length && <div className="income-empty">Không có đơn hàng phù hợp với bộ lọc.</div>}</div>{pageCount>1&&<nav className="orders-pagination" aria-label="Phân trang báo cáo"><button className="btn-secondary" disabled={currentPage===1} onClick={()=>setCurrentPage(p=>Math.max(1,p-1))}>‹ Trước</button><span>Trang <strong>{currentPage}</strong> / {pageCount} · {filtered.length} bản ghi</span><button className="btn-secondary" disabled={currentPage===pageCount} onClick={()=>setCurrentPage(p=>Math.min(pageCount,p+1))}>Tiếp ›</button></nav>}</section></div>;
}
