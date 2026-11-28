import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eye, FileSpreadsheet, ImagePlus, RefreshCw, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

type ReturnOrder = {
  id: string;
  orderCode: string;
  trackingCode: string;
  source: string;
  products: string[];
  confirmedAt: string | null;
};
type Props = { onError: (message: string) => void; onNotice: (message: string) => void };
const API = '/api';
const moneySafeText = (value: unknown) => String(value ?? '').trim();
const normalizeHeader = (value: unknown) => moneySafeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export default function ReturnReconciliationPage({ onError, onNotice }: Props) {
  const [orders, setOrders] = useState<ReturnOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/return-reconciliation/orders`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể tải danh sách đơn hoàn.');
      setOrders(data.orders || []);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Không thể tải danh sách đơn hoàn.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, []);

  const importFile = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('Tệp Excel không có trang tính dữ liệu.');
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
      const headerIndex = rows.findIndex(row => row.some(cell => normalizeHeader(cell) === 'ma don hang'));
      if (headerIndex < 0) throw new Error('Không tìm thấy cột “Mã đơn hàng” trong tệp.');
      const headers = rows[headerIndex].map(normalizeHeader);
      const column = (aliases: string[]) => headers.findIndex(header => aliases.includes(header));
      const orderCol = column(['ma don hang']);
      const trackingCol = column(['ma van don']);
      const sourceCol = column(['nguon don']);
      const productCol = column(['san pham']);
      if ([orderCol, trackingCol, sourceCol, productCol].some(index => index < 0)) {
        throw new Error('Tệp cần có đủ cột: Mã đơn hàng, Mã vận đơn, Nguồn đơn và Sản phẩm.');
      }

      const grouped = new Map<string, { orderCode: string; trackingCode: string; source: string; products: string[] }>();
      let currentKey = '';
      for (const row of rows.slice(headerIndex + 1)) {
        const orderCode = moneySafeText(row[orderCol]);
        const trackingCode = moneySafeText(row[trackingCol]);
        const source = moneySafeText(row[sourceCol]);
        const product = moneySafeText(row[productCol]);
        if (orderCode) {
          currentKey = orderCode;
          const key = trackingCode || orderCode;
          const record = grouped.get(key) || { orderCode, trackingCode, source, products: [] };
          record.orderCode = orderCode;
          if (trackingCode) record.trackingCode = trackingCode;
          if (source) record.source = source;
          if (product && !record.products.includes(product)) record.products.push(product);
          grouped.set(key, record);
        } else if (currentKey && product) {
          const record = [...grouped.values()].find(item => item.orderCode === currentKey);
          if (record && !record.products.includes(product)) record.products.push(product);
        }
      }
      const valid = [...grouped.values()].filter(row => row.orderCode && row.trackingCode && row.source && row.products.length);
      if (!valid.length) throw new Error('Không có đơn nào đủ mã đơn, mã vận đơn, nguồn đơn và sản phẩm.');
      const response = await fetch(`${API}/return-reconciliation/import`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: valid })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Không thể nhập danh sách đơn hoàn.');
      onNotice(`Đã nhập ${result.imported} đơn hoàn từ tệp Excel.`);
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Không thể đọc tệp Excel.');
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const ordered = useMemo(() => [...orders].sort((a, b) => {
    if (a.confirmedAt && b.confirmedAt) return b.confirmedAt.localeCompare(a.confirmedAt);
    if (a.confirmedAt) return 1;
    if (b.confirmedAt) return -1;
    return a.orderCode.localeCompare(b.orderCode);
  }), [orders]);

  const confirmReturn = async (order: ReturnOrder) => {
    const file = selectedFiles[order.id];
    if (!file) { onError('Vui lòng tải ảnh xác nhận cho đơn này trước.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { onError('Ảnh cần có định dạng JPG, PNG hoặc WebP.'); return; }
    if (file.size > 5 * 1024 * 1024) { onError('Ảnh tối đa 5 MB.'); return; }
    setConfirming(order.id);
    try {
      const response = await fetch(`${API}/return-reconciliation/orders/${order.id}/confirm`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }, body: file
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Không thể xác nhận đơn hoàn.');
      setSelectedFiles(current => { const next = { ...current }; delete next[order.id]; return next; });
      onNotice(`Đã lưu ảnh xác nhận cho đơn ${order.orderCode}.`);
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Không thể xác nhận đơn hoàn.');
    } finally {
      setConfirming(null);
    }
  };

  return <section className="panel return-reconciliation-panel">
    <div className="panel-head return-reconciliation-head">
      <div><h3><Check size={18}/> Đối soát đơn hoàn</h3><p>Nhập danh sách từ Excel và tải ảnh xác nhận nhận hàng cho từng đơn.</p></div>
      <div className="return-reconciliation-actions">
        <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" hidden onChange={event => void importFile(event.target.files?.[0])}/>
        <button className="btn-secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16}/> Làm mới</button>
        <button className="btn-primary" onClick={() => fileInput.current?.click()} disabled={importing}>{importing?<><RefreshCw size={16} className="spin"/> Đang nhập...</>:<><FileSpreadsheet size={16}/> Nhập file Excel</>}</button>
      </div>
    </div>
    <div className="return-reconciliation-summary"><b>{orders.length}</b> đơn trong danh sách <span>•</span> <b>{orders.filter(order => order.confirmedAt).length}</b> đã có ảnh xác nhận</div>
    <div className="table-wrap"><table className="data-table return-reconciliation-table"><thead><tr><th>Mã đơn hàng</th><th>Mã vận đơn</th><th>Nguồn đơn</th><th>Sản phẩm</th><th>Xác nhận nhận hàng</th></tr></thead>
      <tbody>{ordered.map(order => <tr key={order.id}>
        <td className="return-order-code">{order.orderCode}</td><td>{order.trackingCode}</td><td>{order.source}</td>
        <td className="return-products">{order.products.join(' · ')}</td>
        <td>{order.confirmedAt ? <button className="return-proof-view" onClick={() => window.open(`${API}/return-reconciliation/orders/${order.id}/photo`, '_blank', 'noopener,noreferrer')}><Eye size={15}/> Đã xác nhận · Xem ảnh</button> :
          <div className="return-proof-actions"><label className="btn-secondary return-file-button"><ImagePlus size={15}/>{selectedFiles[order.id] ? 'Đã chọn ảnh' : 'Chọn ảnh'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) setSelectedFiles(current => ({ ...current, [order.id]: file })); }}/></label><button className="btn-primary" disabled={!selectedFiles[order.id] || confirming===order.id} onClick={() => void confirmReturn(order)}>{confirming===order.id?'Đang lưu...':<><Upload size={15}/> Xác nhận</>}</button></div>}
        </td></tr>)}
        {!loading && !ordered.length && <tr><td colSpan={5} className="empty-cell">Chưa có đơn hoàn. Hãy nhập file Excel để bắt đầu.</td></tr>}
        {loading && <tr><td colSpan={5} className="empty-cell">Đang tải danh sách...</td></tr>}
      </tbody></table></div>
    <p className="return-reconciliation-note">Ảnh JPG, PNG hoặc WebP; tối đa 5 MB mỗi đơn. Sau khi xác nhận, bản ghi và ảnh được lưu để nhân viên cùng xem.</p>
  </section>;
}
