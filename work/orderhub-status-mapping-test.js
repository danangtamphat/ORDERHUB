function normalizeBulkOrderHeader(value) {
      return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function mapShipmentStatusToOrderStatus(value) {
      const status = normalizeBulkOrderHeader(value);
      if (!status) return null;
      if (/hoan tra|chuyen hoan|tra hang|return/.test(status)) return 'Hoàn trả';
      if (/giao thanh cong|giao hang thanh cong|phat thanh cong|phat hang thanh cong|da phat|da giao|delivered|success/.test(status)) return 'Giao thành công';
      return 'Chờ xử lý';
    }
const tests = [
  ['Giao thành công', 'Giao thành công'],
  ['Đã phát hàng thành công', 'Giao thành công'],
  ['Đang vận chuyển', 'Chờ xử lý'],
  ['Chuyển hoàn', 'Hoàn trả'],
  ['', null],
];
for (const [input, expected] of tests) {
  const actual = mapShipmentStatusToOrderStatus(input);
  if (actual !== expected) throw new Error(`${input}: expected ${expected}, got ${actual}`);
}
console.log(`Status mapping passed: ${tests.length} cases`);
