
    // --- 1. KHỞI TẠO DỮ LIỆU BAN ĐẦU ---
    const DEFAULT_USERS = [
      { username: 'TAMPHAT', password: '123456a@', name: 'Quản Trị Viên Tâm Phát', role: 'ADMIN' },
      { username: 'manager1', password: '123456', name: 'Lê Văn Quản Lý', role: 'MANAGER' },
      { username: 'staff1', password: '123456', name: 'Nguyễn Văn Nhân Viên A', role: 'STAFF' },
      { username: 'staff2', password: '123456', name: 'Trần Thị Nhân Viên B', role: 'STAFF' }
    ];

    const DEFAULT_ORDERS = [
      { id: 'ORD1', code: 'VN100001', staffName: 'Nguyễn Văn Nhân Viên A', value: 1500000, status: 'Giao thành công', invoiceStatus: 'Đã xuất hóa đơn', date: '2024-03-01', sharedWith: [] },
      { id: 'ORD2', code: 'VN100002', staffName: 'Nguyễn Văn Nhân Viên A', value: 52000000, status: 'Chờ xử lý', invoiceStatus: 'Chưa xuất hóa đơn', date: '2024-03-02', sharedWith: [] },
      { id: 'ORD3', code: 'VN100003', staffName: 'Trần Thị Nhân Viên B', value: 3200000, status: 'Hoàn trả', invoiceStatus: 'Chưa xuất hóa đơn', date: '2024-03-03', sharedWith: [] },
      { id: 'ORD4', code: 'VN100004', staffName: 'Trần Thị Nhân Viên B', value: 8500000, status: 'Giao thành công', invoiceStatus: 'Đã xuất hóa đơn', date: '2024-03-04', sharedWith: [] },
      { id: 'ORD5', code: 'VN100005', staffName: 'Lê Văn Quản Lý', value: 12000000, status: 'Chờ xử lý', invoiceStatus: 'Chưa xuất hóa đơn', date: '2024-03-05', sharedWith: [] },
      { id: 'ORD6', code: 'VN100006', staffName: 'Nguyễn Văn Nhân Viên A', value: 4500000, status: 'Giao thành công', invoiceStatus: 'Đã xuất hóa đơn', date: '2024-03-06', sharedWith: [] }
    ];

    // State ứng dụng
    let users = JSON.parse(localStorage.getItem('orderhub_users')) || DEFAULT_USERS;
    let orders = JSON.parse(localStorage.getItem('orderhub_orders')) || DEFAULT_ORDERS;
    let payrollRecords = JSON.parse(localStorage.getItem('orderhub_payroll')) || {};
    let assignedTasks = JSON.parse(localStorage.getItem('orderhub_tasks')) || [];
    let employeePets = JSON.parse(localStorage.getItem('orderhub_employee_pets')) || {};
    const EMPLOYEE_PET_OPTIONS = {
      cat: { emoji: '🐱', name: 'Mèo' }, dog: { emoji: '🐶', name: 'Chó' }, rabbit: { emoji: '🐰', name: 'Thỏ' },
      panda: { emoji: '🐼', name: 'Gấu trúc' }, fox: { emoji: '🦊', name: 'Cáo' }, frog: { emoji: '🐸', name: 'Ếch' },
      bear: { emoji: '🐻', name: 'Gấu' }, unicorn: { emoji: '🦄', name: 'Kỳ lân' }
    };
    let taskDeadlineRefreshTimer = null;
    let headerClockTimer = null;
    let pendingBulkOrderStatusUpdates = null;
    let dailyReminders = JSON.parse(localStorage.getItem('orderhub_daily_reminders')) || [];
    let dailyReminderTimer = null;
    let currentUser = JSON.parse(sessionStorage.getItem('orderhub_current_user')) || null;
    let chartInstances = {};

    // Keep legacy staff on the former default rate of 25,000 VND/hour.
    let userRanksMigrated = false;
    users.forEach(user => {
      if (user.role === 'STAFF' && ![1, 2, 3].includes(Number(user.rank))) {
        user.rank = 2;
        userRanksMigrated = true;
      }
    });
    if (userRanksMigrated) localStorage.setItem('orderhub_users', JSON.stringify(users));

    // Khởi tạo LocalStorage nếu trống
    if (!localStorage.getItem('orderhub_users')) localStorage.setItem('orderhub_users', JSON.stringify(users));
    if (!localStorage.getItem('orderhub_orders')) localStorage.setItem('orderhub_orders', JSON.stringify(orders));

    // --- 2. HÀM KHỞI CHẠY HỆ THỐNG ---
    window.addEventListener('DOMContentLoaded', () => {
      if (currentUser) {
        showAppUI();
      } else {
        document.getElementById('loginView').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
      }
    });

    window.addEventListener('storage', event => {
      if (event.key === 'orderhub_tasks') {
        try { assignedTasks = event.newValue ? JSON.parse(event.newValue) : []; }
        catch { assignedTasks = []; }
        notifyAssignedTasks();
        renderEmployeePet();
        if (currentUser && !document.getElementById('tabContent-tasks').classList.contains('hidden')) renderTaskList();
      }
      if (event.key === 'orderhub_employee_pets') {
        try { employeePets = event.newValue ? JSON.parse(event.newValue) : {}; }
        catch { employeePets = {}; }
        renderEmployeePet();
        renderEmployeePetSettings();
      }
      if (event.key === 'orderhub_daily_reminders') {
        try { dailyReminders = event.newValue ? JSON.parse(event.newValue) : []; }
        catch { dailyReminders = []; }
        evaluateDailyReminderPopups();
        if (currentUser && !document.getElementById('tabContent-tasks').classList.contains('hidden')) renderDailyReminders();
      }
      if (event.key === 'orderhub_daily_reminder_logs') evaluateDailyReminderPopups();
    });

    // --- 3. ĐĂNG NHẬP & PHÂN QUYỀN ---
    function handleLogin(e) {
      e.preventDefault();
      const uVal = document.getElementById('loginUsername').value.trim();
      const pVal = document.getElementById('loginPassword').value.trim();

      const found = users.find(u => u.username.toLowerCase() === uVal.toLowerCase() && u.password === pVal);
      if (found) {
        currentUser = found;
        sessionStorage.setItem('orderhub_current_user', JSON.stringify(currentUser));
        document.getElementById('loginAlert').classList.add('hidden');
        showAppUI();
      } else {
        const alertBox = document.getElementById('loginAlert');
        alertBox.classList.remove('hidden');
      }
    }

    function handleLogout() {
      if (confirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?')) {
        currentUser = null;
        sessionStorage.removeItem('orderhub_current_user');
        location.reload();
      }
    }

    function isEmployeeProfileComplete(account) {
      if (!account || !['STAFF', 'MANAGER'].includes(account.role)) return true;
      const info = account.employeeInfo || {};
      const fullName = String(info.fullName || '').trim();
      const nationalId = String(info.nationalId || '').trim();
      return Boolean(
        fullName && String(info.position || '').trim() && info.birthDate &&
        String(info.hometown || '').trim() && /^(\d{9}|\d{12})$/.test(nationalId) && info.startDate
      );
    }

    function applyRoleTabVisibility() {
      if (!currentUser) return;
      const profileIncomplete = ['STAFF', 'MANAGER'].includes(currentUser.role) && !isEmployeeProfileComplete(currentUser);
      const setHidden = (id, hidden) => document.getElementById(id).classList.toggle('hidden', hidden);
      setHidden('tabBtn-users', currentUser.role === 'STAFF' || profileIncomplete);
      setHidden('tabBtn-payroll', !['ADMIN', 'STAFF'].includes(currentUser.role) || profileIncomplete);
      setHidden('tabBtn-employee', !['ADMIN', 'STAFF', 'MANAGER'].includes(currentUser.role));
      setHidden('tabBtn-tasks', !['ADMIN', 'STAFF', 'MANAGER'].includes(currentUser.role) || profileIncomplete);
      document.getElementById('bulkOrderCheckWrap').classList.toggle('hidden', !['ADMIN', 'MANAGER', 'STAFF'].includes(currentUser.role) || profileIncomplete);
      ['orders', 'charts', 'reports'].forEach(tab => setHidden(`tabBtn-${tab}`, profileIncomplete));
      return profileIncomplete;
    }

    function openForgotPassword() {
      const modal = document.getElementById('forgotPasswordModal');
      modal.classList.remove('hidden');
      document.getElementById('forgotPasswordForm').reset();
      document.getElementById('forgotEmailStep').classList.remove('hidden');
      document.getElementById('forgotVerifyStep').classList.add('hidden');
      document.getElementById('forgotOtpNotice').classList.add('hidden');
    }

    function closeForgotPassword() {
      document.getElementById('forgotPasswordModal').classList.add('hidden');
    }

    function requestPasswordOtp(event) {
      event.preventDefault();
      const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
      const notice = document.getElementById('forgotOtpNotice');
      notice.classList.remove('hidden');
      const accountHasEmail = users.some(u => (u.email || '').trim().toLowerCase() === email);
      notice.textContent = accountHasEmail
        ? 'Email đã được gắn với tài khoản. Tuy nhiên, ứng dụng HTML cục bộ chưa kết nối máy chủ gửi thư nên chưa thể gửi OTP.'
        : 'Nếu email này đã đăng ký, hệ thống sẽ gửi mã OTP. Hiện ứng dụng HTML cục bộ chưa kết nối máy chủ gửi thư nên chưa thể gửi mã.';
    }

    function verifyPasswordOtp() {
      const notice = document.getElementById('forgotOtpNotice');
      notice.textContent = 'Chưa thể xác minh OTP hoặc đổi mật khẩu: cần API máy chủ để gửi và kiểm tra mã an toàn.';
      notice.classList.remove('hidden');
    }

    function showAppUI() {
      const latestUser = users.find(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
      if (latestUser) currentUser = latestUser;
      document.getElementById('loginView').classList.add('hidden');
      document.getElementById('mainApp').classList.remove('hidden');
      document.getElementById('mainApp').classList.add('flex');
      startHeaderClock();

      // Cập nhật Header
      document.getElementById('userDisplayName').innerText = currentUser.name;
      const badge = document.getElementById('userRoleBadge');
      badge.innerText = currentUser.role;
      if (currentUser.role === 'ADMIN') badge.className = 'inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white uppercase';
      else if (currentUser.role === 'MANAGER') badge.className = 'inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white uppercase';
      else badge.className = 'inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500 text-white uppercase';

      const profileIncomplete = applyRoleTabVisibility();

      // Khởi tạo giao diện
      populateOrderStaffFilter();
      updateDashboardStats();
      renderOrdersTable();
      populateReportStaffDropdown();
      renderUsersTable();
      renderEmployeePet();
      scheduleTaskDeadlineRefresh();
      notifyAssignedTasks();
      evaluateDailyReminderPopups();
      scheduleDailyReminderChecks();
      if (profileIncomplete) switchTab('employee');
    }

    function updateHeaderClock() {
      const now = new Date();
      const dateParts = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
      }).formatToParts(now);
      const part = type => dateParts.find(item => item.type === type)?.value || '';
      const weekday = part('weekday');
      document.getElementById('headerClockDate').textContent = `${weekday.charAt(0).toLocaleUpperCase('vi-VN')}${weekday.slice(1)}, ${part('day')}/${part('month')}/${part('year')}`;
      document.getElementById('headerClockTime').textContent = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).format(now);
    }

    function startHeaderClock() {
      if (headerClockTimer) clearInterval(headerClockTimer);
      updateHeaderClock();
      const quotes = [
        'Mỗi khoản chi có kế hoạch hôm nay giúp bạn chủ động hơn ngày mai.',
        'Doanh thu tạo cơ hội; quản lý dòng tiền giúp doanh nghiệp đi đường dài.',
        'Trước khi mua, hãy tự hỏi: món này cần thiết hay chỉ đang hấp dẫn?',
        'Ghi lại chi tiêu là bước nhỏ để hiểu tiền của mình đang đi đâu.',
        'Lợi nhuận tốt bắt đầu từ việc hiểu rõ chi phí.',
        'Dành dụm đều đặn quan trọng hơn chờ một khoản tiền thật lớn.',
        'Một mục tiêu rõ ràng giúp mỗi quyết định kinh doanh có thêm định hướng.',
        'Tách tiền cần thiết, tiết kiệm và vui chơi để ngân sách dễ cân bằng hơn.',
        'Khách hàng hài lòng là nền tảng cho sự phát triển bền vững.',
        'Hãy xem lại các khoản đăng ký định kỳ; khoản nhỏ cộng lại cũng đáng kể.',
        'Theo dõi dòng tiền thường xuyên giúp phát hiện vấn đề sớm hơn.',
        'Chi tiêu thông minh không phải là không mua, mà là mua đúng điều mình cần.'
      ];
      let quoteIndex = Math.floor(Math.random() * quotes.length);
      if (quotes.length > 1 && document.getElementById('headerQuote').textContent === quotes[quoteIndex]) quoteIndex = (quoteIndex + 1) % quotes.length;
      document.getElementById('headerQuote').textContent = `“${quotes[quoteIndex]}”`;
      headerClockTimer = setInterval(updateHeaderClock, 1000);
    }

    // --- 4. TÍNH TOÁN & HIỂN THỊ THỐNG KÊ (5 THẺ) ---
    function getOrderParticipants(order) {
      const listed = Array.isArray(order.sharedWith) ? order.sharedWith.filter(Boolean) : [];
      const names = listed.length ? [...listed] : [order.staffName];
      if (order.staffName && !names.includes(order.staffName)) names.unshift(order.staffName);
      const eligible = [...new Set(names)].filter(name => {
        const account = users.find(u => u.name === name);
        return !account || account.role !== 'ADMIN';
      });
      return eligible.length ? eligible : (order.staffName ? [order.staffName] : []);
    }

    function getOrderRevenue(order, personName) {
      const participants = getOrderParticipants(order);
      const index = participants.indexOf(personName);
      if (index < 0 || participants.length === 0) return 0;
      const total = Math.max(0, Math.round(Number(order.value) || 0));
      const base = Math.floor(total / participants.length);
      const remainder = total % participants.length;
      // Chia đến từng đồng; người đứng đầu danh sách nhận phần dư để bảo toàn tổng.
      return base + (index < remainder ? 1 : 0);
    }

    function getOrderRevenueForRow(order) {
      const name = currentUser.role === 'STAFF' ? currentUser.name : order.staffName;
      return getOrderRevenue(order, name);
    }

    function getFilteredOrdersForRole() {
      if (!currentUser) return [];
      if (currentUser.role === 'STAFF') {
        // Staff xem đơn do mình phụ trách HOẶC đơn được chia doanh thu
        return orders.filter(o => o.staffName === currentUser.name || (o.sharedWith && o.sharedWith.includes(currentUser.name)));
      }
      return orders;
    }

    function populateOrderStaffFilter() {
      const wrap = document.getElementById('orderStaffFilterWrap');
      const select = document.getElementById('orderStaffFilter');
      const canChooseStaff = ['ADMIN', 'MANAGER'].includes(currentUser?.role);
      wrap.classList.toggle('hidden', !canChooseStaff);
      if (!canChooseStaff) return;
      const previous = select.value;
      const employees = users.filter(user => user.role !== 'ADMIN');
      select.innerHTML = '<option value="ALL">Tất cả nhân viên</option>' + employees.map(user => `<option value="${payrollEscape(user.name)}">${payrollEscape(user.name)}</option>`).join('');
      if ([...select.options].some(option => option.value === previous)) select.value = previous;
      else select.value = 'ALL';
    }

    function updateDashboardStats() {
      const userOrders = getFilteredOrdersForRole();
      
      const total = userOrders.length;
      const totalVal = userOrders.reduce((sum, o) => sum + (currentUser.role === 'STAFF' ? getOrderRevenue(o, currentUser.name) : Number(o.value)), 0);
      const success = userOrders.filter(o => o.status === 'Giao thành công').length;
      const pending = userOrders.filter(o => o.status === 'Chờ xử lý').length;
      const returned = userOrders.filter(o => o.status === 'Hoàn trả').length;

      document.getElementById('statTotalOrders').innerText = total;
      document.getElementById('statTotalValue').innerText = totalVal.toLocaleString('vi-VN') + ' đ';
      document.getElementById('statSuccessOrders').innerText = success;
      document.getElementById('statPendingOrders').innerText = pending;
      document.getElementById('statReturnedOrders').innerText = returned;
    }

    // --- 5. BẢNG ĐƠN HÀNG & THAO TÁC ---
    function renderOrdersTable() {
      const userOrders = getFilteredOrdersForRole();
      const searchVal = document.getElementById('orderSearchInput').value.toLowerCase().trim();
      const filterStatus = document.getElementById('orderStatusFilter').value;
      const filterInvoice = document.getElementById('orderInvoiceFilter').value;
      const filterStaff = currentUser.role === 'STAFF' ? currentUser.name : document.getElementById('orderStaffFilter').value;

      // Tìm trùng lặp toàn database
      const codeCounts = {};
      orders.forEach(o => {
        const cleanCode = o.code.trim().toUpperCase();
        codeCounts[cleanCode] = (codeCounts[cleanCode] || 0) + 1;
      });

      const filtered = userOrders.filter(o => {
        const matchSearch = o.code.toLowerCase().includes(searchVal) || o.staffName.toLowerCase().includes(searchVal);
        const matchStatus = filterStatus === 'ALL' || o.status === filterStatus;
        const matchInvoice = filterInvoice === 'ALL' || (o.invoiceStatus || 'Chưa xuất hóa đơn') === filterInvoice;
        const matchStaff = filterStaff === 'ALL' || getOrderParticipants(o).includes(filterStaff);
        return matchSearch && matchStatus && matchInvoice && matchStaff;
      });

      const tbody = document.getElementById('ordersTableBody');
      tbody.innerHTML = '';

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">Không tìm thấy đơn hàng nào</td></tr>`;
        return;
      }

      filtered.forEach(o => {
        const cleanCode = o.code.trim().toUpperCase();
        const isDuplicate = codeCounts[cleanCode] > 1;
        const isHighValue = Number(o.value) > 50000000;

        // Phân màu trạng thái đơn
        let statusBadge = '';
        if (o.status === 'Giao thành công') statusBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">🟢 Giao thành công</span>';
        else if (o.status === 'Chờ xử lý') statusBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">🟡 Chờ xử lý</span>';
        else statusBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">🔴 Hoàn trả</span>';

        // Phân màu trạng thái hóa đơn
        let invoiceBadge = '';
        if (o.invoiceStatus === 'Đã xuất hóa đơn') invoiceBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">🔴 Đã xuất hóa đơn</span>';
        else invoiceBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">🟡 Chưa xuất hóa đơn</span>';

        // Phân chia doanh thu
        let shareInfo = '<span class="text-slate-400">Không</span>';
        const participants = getOrderParticipants(o);
        if (participants.length > 1) {
          shareInfo = `<span class="text-blue-600 font-semibold text-xs" title="${participants.join(', ')}"><i class="fa-solid fa-users"></i> Chia ${participants.length} người</span>`;
        }

        // Quyền thao tác
        let actions = '';
        const canEdit = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER' || (currentUser.role === 'STAFF' && o.staffName === currentUser.name);
        const canDelete = currentUser.role === 'ADMIN' || (currentUser.role === 'STAFF' && o.staffName === currentUser.name);

        if (canEdit || canDelete) {
          if (canEdit) actions += `<button onclick="editOrder('${o.id}')" class="text-blue-600 hover:text-blue-800 font-semibold mr-3"><i class="fa-solid fa-pen-to-square"></i> Sửa</button>`;
          if (canDelete) actions += `<button onclick="deleteOrder('${o.id}')" class="text-red-600 hover:text-red-800 font-semibold"><i class="fa-solid fa-trash"></i> Xóa</button>`;
        } else {
          actions = '<span class="text-slate-400 italic text-xs">Chỉ xem</span>';
        }

        const tr = document.createElement('tr');
        tr.className = `border-b ${isDuplicate ? 'bg-red-50/80' : 'hover:bg-slate-50'}`;
        tr.innerHTML = `
          <td class="px-4 py-3 font-semibold text-slate-800">
            ${o.code}
            ${isDuplicate ? '<span class="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded">TRÙNG</span>' : ''}
          </td>
          <td class="px-4 py-3">${o.staffName}</td>
          <td class="px-4 py-3 font-bold ${isHighValue ? 'text-red-600' : 'text-slate-700'}">
            ${Number(o.value).toLocaleString('vi-VN')} đ
          </td>
          <td class="px-4 py-3 font-semibold text-emerald-700" title="${getOrderParticipants(o).join(', ')}">
            ${getOrderRevenueForRow(o).toLocaleString('vi-VN')} đ${getOrderParticipants(o).length > 1 ? '<span class="block text-[10px] text-slate-400 font-normal">phần mỗi người</span>' : ''}
          </td>
          <td class="px-4 py-3">${statusBadge}</td>
          <td class="px-4 py-3">${invoiceBadge}</td>
          <td class="px-4 py-3">${shareInfo}</td>
          <td class="px-4 py-3 text-right whitespace-nowrap">${actions}</td>
        `;
        tbody.appendChild(tr);
      });
    }

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

    async function previewBulkOrderStatus(event) {
      if (!currentUser || !['ADMIN', 'MANAGER', 'STAFF'].includes(currentUser.role)) {
        event.target.value = '';
        return alert('Tài khoản này không có quyền đối soát trạng thái đơn hàng hàng loạt.');
      }
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (!window.XLSX) {
        event.target.value = '';
        return alert('Không tải được thư viện Excel. Hãy kiểm tra kết nối Internet.');
      }
      try {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const headerIndex = matrix.findIndex(row => {
          const headers = row.map(normalizeBulkOrderHeader);
          return headers.includes('ma van don') && headers.includes('trang thai');
        });
        if (headerIndex < 0) throw new Error('Không tìm thấy hai cột Mã Vận Đơn và Trạng Thái.');
        const headers = matrix[headerIndex].map(normalizeBulkOrderHeader);
        const codeIndex = headers.indexOf('ma van don');
        const statusIndex = headers.indexOf('trang thai');
        const importedByCode = new Map();
        let invalidRows = 0;
        for (const row of matrix.slice(headerIndex + 1)) {
          const code = String(row[codeIndex] ?? '').trim().toUpperCase();
          const sourceStatus = String(row[statusIndex] ?? '').trim();
          if (!code && !sourceStatus) continue;
          if (!code || !sourceStatus) { invalidRows++; continue; }
          const mappedStatus = mapShipmentStatusToOrderStatus(sourceStatus);
          if (!mappedStatus) { invalidRows++; continue; }
          if (!importedByCode.has(code)) importedByCode.set(code, new Set());
          importedByCode.get(code).add(mappedStatus);
        }

        const localByCode = new Map();
        orders.forEach(order => {
          const code = String(order.code || '').trim().toUpperCase();
          if (!localByCode.has(code)) localByCode.set(code, []);
          localByCode.get(code).push(order);
        });
        const updates = [];
        let unchanged = 0;
        let notFound = 0;
        let ambiguous = 0;
        let conflicting = 0;
        for (const [code, statuses] of importedByCode.entries()) {
          if (statuses.size > 1) { conflicting++; continue; }
          const matches = localByCode.get(code) || [];
          if (!matches.length) { notFound++; continue; }
          if (matches.length > 1) { ambiguous++; continue; }
          const targetStatus = [...statuses][0];
          const order = matches[0];
          if (order.status === targetStatus) { unchanged++; continue; }
          updates.push({ code, orderId: order.id, staffName: order.staffName, before: order.status, after: targetStatus });
        }
        pendingBulkOrderStatusUpdates = { updates, unchanged, notFound, ambiguous, conflicting, invalidRows };
        renderBulkOrderStatusPreview(file.name);
        document.getElementById('bulkOrderStatusModal').classList.remove('hidden');
      } catch (error) {
        alert(error.message || 'Không đọc được tệp Excel. Hãy chọn tệp xuất vận đơn có cột Mã Vận Đơn và Trạng Thái.');
      } finally {
        event.target.value = '';
      }
    }

    function renderBulkOrderStatusPreview(fileName) {
      const result = pendingBulkOrderStatusUpdates;
      const summary = [
        ['Sẽ cập nhật', result.updates.length, 'text-emerald-700'],
        ['Đã đúng trạng thái', result.unchanged, 'text-blue-700'],
        ['Không tìm thấy mã', result.notFound, 'text-amber-700'],
        ['Mã trùng trong OrderHub', result.ambiguous, 'text-red-700'],
        ['Mã có trạng thái xung đột', result.conflicting, 'text-red-700'],
        ['Dòng thiếu dữ liệu', result.invalidRows, 'text-slate-600']
      ];
      document.getElementById('bulkOrderStatusSummary').innerHTML = `<div class="col-span-2 md:col-span-4 text-xs text-slate-500 mb-1">Tệp: ${payrollEscape(fileName)}</div>` + summary.map(([label, value, color]) => `<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-[11px] text-slate-500">${label}</div><div class="mt-1 font-bold ${color}">${value}</div></div>`).join('');
      const list = document.getElementById('bulkOrderStatusChanges');
      list.innerHTML = result.updates.length
        ? result.updates.slice(0, 100).map(item => `<div class="flex flex-wrap justify-between gap-2 px-3 py-2"><span><strong>${payrollEscape(item.code)}</strong> · ${payrollEscape(item.staffName)}</span><span class="text-slate-500">${payrollEscape(item.before)} → <strong class="text-emerald-700">${payrollEscape(item.after)}</strong></span></div>`).join('') + (result.updates.length > 100 ? `<div class="px-3 py-2 text-slate-500">Còn ${result.updates.length - 100} đơn khác...</div>` : '')
        : '<div class="p-4 text-center text-sm text-slate-400">Không có đơn nào cần cập nhật.</div>';
      document.getElementById('bulkOrderStatusApplyButton').disabled = result.updates.length === 0;
      document.getElementById('bulkOrderStatusApplyButton').classList.toggle('opacity-50', result.updates.length === 0);
    }

    function closeBulkOrderStatusPreview() {
      document.getElementById('bulkOrderStatusModal').classList.add('hidden');
      pendingBulkOrderStatusUpdates = null;
    }

    function applyBulkOrderStatusUpdates() {
      if (!currentUser || !['ADMIN', 'MANAGER', 'STAFF'].includes(currentUser.role)) return alert('Tài khoản này không có quyền đối soát trạng thái hàng loạt.');
      const result = pendingBulkOrderStatusUpdates;
      if (!result || !result.updates.length) return;
      const permittedUpdates = currentUser.role === 'STAFF'
        ? result.updates.filter(update => orders.some(order => order.id === update.orderId && order.staffName === currentUser.name))
        : result.updates;
      const updateById = new Map(permittedUpdates.map(update => [update.orderId, update.after]));
      const deliveredDate = getLocalDateString();
      orders = orders.map(order => {
        const targetStatus = updateById.get(order.id);
        if (!targetStatus) return order;
        const deliveredAt = targetStatus === 'Giao thành công'
          ? (order.status === 'Giao thành công' ? (order.deliveredAt || order.date) : deliveredDate)
          : null;
        return { ...order, status: targetStatus, deliveredAt };
      });
      localStorage.setItem('orderhub_orders', JSON.stringify(orders));
      const updatedCount = permittedUpdates.length;
      closeBulkOrderStatusPreview();
      updateDashboardStats();
      renderOrdersTable();
      refreshPayrollAfterOrderChange();
      alert(`Đã cập nhật ${updatedCount} đơn hàng${currentUser.role === 'STAFF' ? ' thuộc quyền của bạn' : ''}. Các đơn khớp duy nhất được đổi theo trạng thái trong Excel; mã không tìm thấy, trùng hoặc xung đột đã được bỏ qua.`);
    }

    // --- 6. KIỂM TRÙNG TỨC THỜI & KIỂM TRA MÃ DUPLICATE ---
    function checkRealtimeCode(val) {
      const warningDiv = document.getElementById('codeWarning');
      const inputEl = document.getElementById('orderCodeInput');
      const cleanVal = val.trim().toUpperCase();
      const currentEditingId = document.getElementById('editingOrderId').value;

      if (!cleanVal) {
        warningDiv.classList.add('hidden');
        inputEl.className = "w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none";
        return;
      }

      // Check trùng
      const exists = orders.some(o => o.code.trim().toUpperCase() === cleanVal && o.id !== currentEditingId);
      if (exists) {
        warningDiv.innerText = "❌ Mã vận đơn này đã tồn tại trên hệ thống!";
        warningDiv.classList.remove('hidden');
        inputEl.className = "w-full p-2.5 border-2 border-red-500 bg-red-50 rounded-lg text-sm focus:outline-none";
      } else {
        warningDiv.classList.add('hidden');
        inputEl.className = "w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none";
      }
    }

    function runDuplicateCheck() {
      const codeMap = {};
      orders.forEach(o => {
        const clean = o.code.trim().toUpperCase();
        if (!codeMap[clean]) codeMap[clean] = [];
        codeMap[clean].push(o.staffName);
      });

      let dupCount = 0;
      let msg = "KẾT QUẢ QUÉT TOÀN BỘ CƠ SỞ DỮ LIỆU:\n\n";

      for (const [code, staffList] of Object.entries(codeMap)) {
        if (staffList.length > 1) {
          dupCount++;
          msg += `• Mã [${code}] bị trùng ${staffList.length} lần (Bởi NV: ${staffList.join(', ')})\n`;
        }
      }

      if (dupCount === 0) {
        alert("✅ Hệ thống ghi nhận: KHÔNG CÓ đơn hàng nào bị trùng lặp mã vận đơn!");
      } else {
        alert(msg + "\nCác dòng trùng lặp đã được tô màu đỏ nổi bật trong bảng.");
      }
      renderOrdersTable();
    }

    // --- 7. TẠO & SỬA ĐƠN HÀNG (MODAL) ---
    function openOrderModal(orderToEdit = null) {
      document.getElementById('orderForm').reset();
      document.getElementById('editingOrderId').value = '';
      document.getElementById('codeWarning').classList.add('hidden');
      
      const staffSelect = document.getElementById('orderStaffSelect');
      staffSelect.innerHTML = '';

      if (currentUser.role === 'STAFF') {
        // Staff chỉ tạo cho chính mình
        const opt = document.createElement('option');
        opt.value = currentUser.name;
        opt.innerText = currentUser.name;
        staffSelect.appendChild(opt);
        staffSelect.disabled = true;
      } else {
        // Admin / Manager được chọn nhân viên
        staffSelect.disabled = false;
        users.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.name;
          opt.innerText = `${u.name} (${u.role})`;
          staffSelect.appendChild(opt);
        });
      }

      // Render Checkboxes chia doanh thu
      renderRevenueShareCheckboxes([]);

      if (orderToEdit) {
        document.getElementById('orderModalTitle').innerText = 'Chỉnh Sửa Đơn Hàng';
        document.getElementById('editingOrderId').value = orderToEdit.id;
        staffSelect.value = orderToEdit.staffName;
        document.getElementById('orderCodeInput').value = orderToEdit.code;
        document.getElementById('orderValueInput').value = orderToEdit.value;
        document.getElementById('orderStatusSelect').value = orderToEdit.status;
        document.getElementById('orderInvoiceSelect').value = orderToEdit.invoiceStatus || 'Chưa xuất hóa đơn';

        if (orderToEdit.sharedWith && orderToEdit.sharedWith.length > 0) {
          document.getElementById('revenueShareOption').value = 'YES';
          renderRevenueShareCheckboxes(orderToEdit.sharedWith);
        } else {
          document.getElementById('revenueShareOption').value = 'NO';
        }
      } else {
        document.getElementById('orderModalTitle').innerText = 'Thêm Đơn Hàng Mới';
        document.getElementById('revenueShareOption').value = 'NO';
      }

      toggleRevenueShareUI();
      document.getElementById('orderModal').classList.remove('hidden');
    }

    function closeOrderModal() {
      document.getElementById('orderModal').classList.add('hidden');
    }

    function toggleRevenueShareUI() {
      const val = document.getElementById('revenueShareOption').value;
      const box = document.getElementById('revenueShareBox');
      if (val === 'YES') box.classList.remove('hidden');
      else box.classList.add('hidden');
    }

    function renderRevenueShareCheckboxes(selectedNames = []) {
      const container = document.getElementById('revenueShareCheckboxes');
      container.innerHTML = '';
      
      users.filter(u => u.role !== 'ADMIN').forEach(u => {
        const isChecked = selectedNames.includes(u.name) ? 'checked' : '';
        const label = document.createElement('label');
        label.className = "flex items-center space-x-2 text-xs py-1 hover:bg-slate-50 cursor-pointer";
        label.innerHTML = `
          <input type="checkbox" name="shareStaff" value="${u.name}" ${isChecked} class="rounded text-blue-600 focus:ring-blue-500">
          <span>${u.name} (${u.role})</span>
        `;
        container.appendChild(label);
      });
    }

    function handleSaveOrder(e) {
      e.preventDefault();
      const editingId = document.getElementById('editingOrderId').value;
      const staffName = document.getElementById('orderStaffSelect').value;
      const code = document.getElementById('orderCodeInput').value.trim().toUpperCase();
      const val = Number(document.getElementById('orderValueInput').value);
      const status = document.getElementById('orderStatusSelect').value;
      const invoiceStatus = document.getElementById('orderInvoiceSelect').value;

      // Validate Ràng buộc 1: Chiều dài mã
      if (code.length < 5 || code.length > 30) {
        alert("❌ Mã vận đơn phải dài từ 5 đến 30 ký tự!");
        return;
      }

      // Validate Ràng buộc 2: Giá trị ngưỡng
      if (val < 10000) {
        alert("❌ Giá trị đơn hàng quá nhỏ! Tối thiểu là 10.000 VNĐ.");
        return;
      }
      if (val > 100000000) {
        alert("❌ Giá trị vượt quá hạn mức cho phép (Tối đa 100.000.000 VNĐ)!");
        return;
      }

      // Validate Ràng buộc 3: Kiểm trùng mã
      const dup = orders.find(o => o.code.trim().toUpperCase() === code && o.id !== editingId);
      if (dup) {
        alert(`❌ Không thể lưu! Mã vận đơn [${code}] đã tồn tại trong cơ sở dữ liệu!`);
        return;
      }

      // Cảnh báo giá trị cao > 50tr
      if (val > 50000000) {
        alert("⚠️ CẢNH BÁO GIÁ TRỊ CAO: Đơn hàng có giá trị lớn hơn 50.000.000 VNĐ. Hệ thống sẽ ghi nhận và tô màu cảnh báo!");
      }

      // Xử lý chia doanh thu
      const shareOpt = document.getElementById('revenueShareOption').value;
      let sharedWithList = [];
      if (shareOpt === 'YES') {
        const checkboxes = document.querySelectorAll('input[name="shareStaff"]:checked');
        checkboxes.forEach(cb => sharedWithList.push(cb.value));
        
        if (!sharedWithList.includes(staffName)) {
          sharedWithList.push(staffName); // Tự động bao gồm người tạo/chủ đơn
        }
      }

      if (editingId) {
        // Cập nhật
        const idx = orders.findIndex(o => o.id === editingId);
        if (idx !== -1) {
          const previous = orders[idx];
          const deliveredAt = status === 'Giao thành công'
            ? (previous.status === 'Giao thành công' ? (previous.deliveredAt || previous.date) : getLocalDateString())
            : null;
          orders[idx] = { ...previous, staffName, code, value: val, status, invoiceStatus, sharedWith: sharedWithList, deliveredAt };
        }
      } else {
        // Thêm mới
        const newOrder = {
          id: 'ORD' + Date.now(),
          code,
          staffName,
          value: val,
          status,
          invoiceStatus,
          date: new Date().toISOString().split('T')[0],
          deliveredAt: status === 'Giao thành công' ? getLocalDateString() : null,
          sharedWith: sharedWithList
        };
        orders.unshift(newOrder);
      }

      localStorage.setItem('orderhub_orders', JSON.stringify(orders));
      closeOrderModal();
      updateDashboardStats();
      renderOrdersTable();
      refreshPayrollAfterOrderChange();
    }

    function getLocalDateString() {
      const now = new Date();
      return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }

    function editOrder(id) {
      const target = orders.find(o => o.id === id);
      if (target) openOrderModal(target);
    }

    function deleteOrder(id) {
      const target = orders.find(o => o.id === id);
      if (!target) return;

      if (confirm(`Bạn có chắc chắn muốn xóa đơn hàng [${target.code}] của nhân viên ${target.staffName}? Action này không thể hoàn tác!`)) {
        orders = orders.filter(o => o.id !== id);
        localStorage.setItem('orderhub_orders', JSON.stringify(orders));
        updateDashboardStats();
        renderOrdersTable();
        refreshPayrollAfterOrderChange();
      }
    }

    // --- 8. BIỂU ĐỒ THỐNG KÊ (4 LOẠI CHART) ---
    function renderCharts() {
      const userOrders = getFilteredOrdersForRole();

      // Hủy các instance cũ nếu có
      Object.values(chartInstances).forEach(chart => chart.destroy());

      // Biểu đồ 1: Tổng giá trị theo nhân viên
      const staffVal = {};
      userOrders.forEach(o => {
        getOrderParticipants(o).forEach(name => {
          if (currentUser.role === 'STAFF' && name !== currentUser.name) return;
          staffVal[name] = (staffVal[name] || 0) + getOrderRevenue(o, name);
        });
      });
      const ctx1 = document.getElementById('chart1').getContext('2d');
      chartInstances.chart1 = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: Object.keys(staffVal),
          datasets: [{
            label: 'Doanh thu phân bổ (VNĐ)',
            data: Object.values(staffVal),
            backgroundColor: '#1e3c72'
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });

      // Biểu đồ 2: Phân bố trạng thái đơn
      const statusCounts = { 'Chờ xử lý': 0, 'Giao thành công': 0, 'Hoàn trả': 0 };
      userOrders.forEach(o => { if (statusCounts[o.status] !== undefined) statusCounts[o.status]++; });
      const ctx2 = document.getElementById('chart2').getContext('2d');
      chartInstances.chart2 = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: ['Chờ xử lý', 'Giao thành công', 'Hoàn trả'],
          datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: ['#f59e0b', '#10b981', '#ef4444']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });

      // Biểu đồ 3: Số lượng đơn theo nhân viên
      const staffQty = {};
      userOrders.forEach(o => {
        getOrderParticipants(o).forEach(name => {
          if (currentUser.role === 'STAFF' && name !== currentUser.name) return;
          staffQty[name] = (staffQty[name] || 0) + 1;
        });
      });
      const ctx3 = document.getElementById('chart3').getContext('2d');
      chartInstances.chart3 = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: Object.keys(staffQty),
          datasets: [{
            label: 'Số lượng đơn hàng',
            data: Object.values(staffQty),
            backgroundColor: '#10b981'
          }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
      });

      // Biểu đồ 4: Top 5 đơn giá trị cao nhất
      const top5 = [...userOrders].sort((a,b) => Number(b.value) - Number(a.value)).slice(0, 5);
      const ctx4 = document.getElementById('chart4').getContext('2d');
      chartInstances.chart4 = new Chart(ctx4, {
        type: 'bar',
        data: {
          labels: top5.map(o => o.code),
          datasets: [{
            label: 'Giá trị (VNĐ)',
            data: top5.map(o => o.value),
            backgroundColor: '#ef4444'
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    // --- 9. XUẤT BÁO CÁO (EXCEL & PDF & PREVIEW) ---
    function populateReportStaffDropdown() {
      const select = document.getElementById('reportStaff');
      select.innerHTML = '';
      if (currentUser.role === 'ADMIN') {
        select.innerHTML = '<option value="ALL">Tất cả nhân viên</option>';
        users.filter(u => u.role !== 'ADMIN').forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.name;
          opt.innerText = u.name;
          select.appendChild(opt);
        });
        select.disabled = false;
      } else {
        const opt = document.createElement('option');
        opt.value = currentUser.name;
        opt.innerText = currentUser.name;
        select.appendChild(opt);
        select.value = currentUser.name;
        select.disabled = true;
      }
    }

    function getFilteredReportData() {
      let base = getFilteredOrdersForRole();
      const startDate = document.getElementById('reportStartDate').value;
      const endDate = document.getElementById('reportEndDate').value;
      const status = document.getElementById('reportStatus').value;
      const staff = currentUser.role === 'ADMIN' ? document.getElementById('reportStaff').value : currentUser.name;

      return base.filter(o => {
        const matchStart = !startDate || o.date >= startDate;
        const matchEnd = !endDate || o.date <= endDate;
        const matchStatus = status === 'ALL' || o.status === status;
        const matchStaff = staff === 'ALL' || getOrderParticipants(o).includes(staff);
        return matchStart && matchEnd && matchStatus && matchStaff;
      });
    }

    function getReportRevenue(order) {
      const selectedStaff = document.getElementById('reportStaff').value;
      if (currentUser.role !== 'ADMIN') return getOrderRevenue(order, currentUser.name);
      if (selectedStaff !== 'ALL') return getOrderRevenue(order, selectedStaff);
      return getOrderRevenue(order, order.staffName);
    }

    function getReportTotalValue(data) {
      const selectedStaff = document.getElementById('reportStaff').value;
      if (currentUser.role !== 'ADMIN') return data.reduce((sum, order) => sum + getOrderRevenue(order, currentUser.name), 0);
      if (selectedStaff !== 'ALL') return data.reduce((sum, order) => sum + getOrderRevenue(order, selectedStaff), 0);
      return data.reduce((sum, order) => sum + Number(order.value), 0);
    }

    function previewReport() {
      const data = getFilteredReportData();
      const container = document.getElementById('reportPreviewContainer');
      const tbody = document.getElementById('reportPreviewBody');
      
      document.getElementById('previewCount').innerText = data.length;
      document.getElementById('previewValue').innerText = getReportTotalValue(data).toLocaleString('vi-VN') + ' đ';

      tbody.innerHTML = '';
      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-slate-400">Không có dữ liệu phù hợp với bộ lọc</td></tr>`;
      } else {
        data.forEach((o, index) => {
          const tr = document.createElement('tr');
          tr.className = "border-b hover:bg-slate-50";
          tr.innerHTML = `
            <td class="p-2 border text-center">${index + 1}</td>
            <td class="p-2 border font-bold">${o.code}</td>
            <td class="p-2 border">${o.staffName}</td>
            <td class="p-2 border font-semibold text-right">${Number(o.value).toLocaleString('vi-VN')}</td>
            <td class="p-2 border font-semibold text-right text-emerald-700">${getReportRevenue(o).toLocaleString('vi-VN')}</td>
            <td class="p-2 border">${o.status}</td>
            <td class="p-2 border">${o.invoiceStatus || 'Chưa xuất hóa đơn'}</td>
            <td class="p-2 border">${o.date}</td>
          `;
          tbody.appendChild(tr);
        });
      }

      container.classList.remove('hidden');
    }

    function exportExcel() {
      const data = getFilteredReportData();
      if (data.length === 0) {
        alert("⚠️ Không có dữ liệu để xuất file Excel!");
        return;
      }

      // Sheet 1: Đơn hàng
      const sheet1Data = data.map((o, idx) => ({
        "STT": idx + 1,
        "Tên Nhân Viên": o.staffName,
        "Mã Vận Đơn": o.code,
        "Giá Trị (VNĐ)": Number(o.value),
        "Doanh Thu / Người (VNĐ)": getReportRevenue(o),
        "Trạng Thái Đơn": o.status,
        "Trạng Thái Hóa Đơn": o.invoiceStatus || 'Chưa xuất hóa đơn',
        "Ngày Tạo": o.date
      }));

      // Sheet 2: Tổng hợp theo nhân viên
      const summaryMap = {};
      const selectedStaff = document.getElementById('reportStaff').value;
      data.forEach(o => {
        const beneficiaries = currentUser.role !== 'ADMIN' ? [currentUser.name]
          : selectedStaff !== 'ALL' ? [selectedStaff] : getOrderParticipants(o);
        beneficiaries.forEach(staff => {
          if (!summaryMap[staff]) summaryMap[staff] = { count: 0, totalVal: 0 };
          summaryMap[staff].count++;
          summaryMap[staff].totalVal += getOrderRevenue(o, staff);
        });
      });

      const sheet2Data = Object.keys(summaryMap).map(staff => ({
        "Tên Nhân Viên": staff,
        "Số Đơn Hàng": summaryMap[staff].count,
        "Tổng Doanh Thu (VNĐ)": summaryMap[staff].totalVal,
        "Doanh Thu Trung Bình": Math.round(summaryMap[staff].totalVal / summaryMap[staff].count)
      }));

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
      const ws2 = XLSX.utils.json_to_sheet(sheet2Data);

      XLSX.utils.book_append_sheet(wb, ws1, "Đơn hàng");
      XLSX.utils.book_append_sheet(wb, ws2, "Tổng hợp");

      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `BaoCaoDonHang_${today}.xlsx`);
    }

    function exportPDF() {
      const data = getFilteredReportData();
      if (data.length === 0) {
        alert("⚠️ Không có dữ liệu để xuất file PDF!");
        return;
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const today = new Date().toLocaleDateString('vi-VN');

      // Title
      doc.setFontSize(16);
      doc.setTextColor(30, 60, 114);
      doc.text("BAO CAO DON HANG NOI BO", 14, 18);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Nguoi xuat: ${currentUser.name} (${currentUser.role})`, 14, 25);
      doc.text(`Ngay xuat: ${today}`, 14, 30);
      doc.text(`Tong so don: ${data.length} | Tong gia tri/doanh thu: ${getReportTotalValue(data).toLocaleString('vi-VN')} VND`, 14, 35);

      // Table 1 Detail
      const tableData = data.map((o, i) => [
        i + 1,
        o.code,
        o.staffName,
        Number(o.value).toLocaleString('vi-VN'),
        getReportRevenue(o).toLocaleString('vi-VN'),
        o.status,
        o.invoiceStatus || 'Chua xuat'
      ]);

      doc.autoTable({
        startY: 42,
        head: [['STT', 'Ma Van Don', 'Nhan Vien', 'Gia Tri (VND)', 'Doanh Thu/Nguoi', 'Trang Thai', 'Hoa Don']],
        body: tableData,
        headStyles: { fillColor: [30, 60, 114] },
        styles: { fontSize: 8 }
      });

      doc.save(`BaoCaoDonHang_${new Date().toISOString().split('T')[0]}.pdf`);
    }

    // --- 10. HỒ SƠ NHÂN VIÊN ---
    function renderEmployeeInfo() {
      if (!currentUser || !['ADMIN', 'STAFF', 'MANAGER'].includes(currentUser.role)) return;
      const admin = currentUser.role === 'ADMIN';
      const selectWrap = document.getElementById('employeeInfoSelectWrap');
      const select = document.getElementById('employeeInfoSelect');
      selectWrap.classList.toggle('hidden', !admin);
      document.getElementById('employeePetSettings').classList.remove('hidden');
      renderEmployeePetSettings();
      document.getElementById('employeeInfoSaveWrap').classList.toggle('hidden', admin);
      document.getElementById('employeeInfoReadOnlyNote').classList.toggle('hidden', !admin);
      document.getElementById('employeeInfoIntro').innerText = admin
        ? 'Admin có thể xem trạng thái hồ sơ của nhân viên; nhân viên tự nhập và cập nhật thông tin của mình.'
        : 'Bạn cần tự khai báo các thông tin có dấu * trước khi tiếp tục sử dụng hệ thống.';
      if (admin) {
        const previous = select.value;
        const staffAccounts = users.filter(u => u.role !== 'ADMIN');
        select.innerHTML = staffAccounts.map(u => `<option value="${payrollEscape(u.username)}">${payrollEscape(u.name)} (${payrollEscape(u.role)})</option>`).join('');
        if (staffAccounts.some(u => u.username === previous)) select.value = previous;
        select.onchange = renderEmployeeInfoForm;
      }
      renderEmployeeInfoForm();
    }

    function renderEmployeePetSettings() {
      if (!currentUser || !['ADMIN', 'STAFF', 'MANAGER'].includes(currentUser.role)) return;
      const pet = employeePets[currentUser.username.toLowerCase()] || '';
      const select = document.getElementById('employeePetChoice');
      if ([...select.options].some(option => option.value === pet)) select.value = pet;
      previewEmployeePet();
    }

    function previewEmployeePet() {
      const petKey = document.getElementById('employeePetChoice').value;
      const preview = document.getElementById('employeePetPreview');
      preview.innerHTML = EMPLOYEE_PET_OPTIONS[petKey] ? buildPetMascotSvg(petKey, 'happy', 'preview') : '<span class="text-3xl">🐾</span>';
    }

    function buildPetMascotSvg(petKey, mood, context) {
      const palette = {
        cat: ['#F5A45B','#FFE2C2','#C56A32'], dog: ['#D99A62','#F8D6AD','#A85E35'], rabbit: ['#F5DDE3','#FFF5F7','#D987A1'],
        panda: ['#F7F8FC','#FFFFFF','#30384B'], fox: ['#F28A45','#FFE0B5','#C75031'], frog: ['#78C77A','#DDF7AE','#318A55'],
        bear: ['#A96E48','#EBC29B','#70452F'], unicorn: ['#D6B8FF','#FFF0FC','#9C62D6']
      };
      const [main, light, dark] = palette[petKey] || palette.cat;
      const grad = `pet-${petKey}-${mood}-${context}`;
      const ears = {
        cat: '<path d="M25 39 22 16Q22 12 26 15L41 29M71 39 74 16Q74 12 70 15L55 29" fill="currentColor" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="m27 30-1-8 8 7m35 1 1-8-8 7" fill="#F6A5A5"/>',
        dog: '<ellipse cx="25" cy="38" rx="10" ry="18" transform="rotate(-22 25 38)" fill="currentColor" stroke="#fff" stroke-width="2"/><ellipse cx="71" cy="38" rx="10" ry="18" transform="rotate(22 71 38)" fill="currentColor" stroke="#fff" stroke-width="2"/>',
        rabbit: '<path d="M35 31Q23 6 31 5Q41 4 45 29M53 29Q58 4 68 7Q76 10 61 34" fill="currentColor" stroke="#fff" stroke-width="2"/><path d="M34 25Q29 12 33 11M59 24Q65 12 68 13" fill="none" stroke="#F3A8BA" stroke-width="4" stroke-linecap="round"/>',
        panda: '<circle cx="29" cy="30" r="11" fill="#30384B" stroke="#fff" stroke-width="2"/><circle cx="67" cy="30" r="11" fill="#30384B" stroke="#fff" stroke-width="2"/>',
        fox: '<path d="M23 43 18 12Q18 8 23 13L43 27M73 43 78 12Q78 8 73 13L53 27" fill="currentColor" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="m25 31-2-11 11 9m37 2 2-11-11 9" fill="#FFE7C5"/>',
        frog: '<path d="M27 34Q20 14 33 16Q43 17 43 34M53 34Q53 17 63 16Q76 14 69 34" fill="currentColor" stroke="#fff" stroke-width="2"/><circle cx="35" cy="25" r="7" fill="#fff"/><circle cx="61" cy="25" r="7" fill="#fff"/>',
        bear: '<circle cx="29" cy="30" r="10" fill="currentColor" stroke="#fff" stroke-width="2"/><circle cx="67" cy="30" r="10" fill="currentColor" stroke="#fff" stroke-width="2"/><circle cx="29" cy="30" r="4" fill="#F2B9A2"/><circle cx="67" cy="30" r="4" fill="#F2B9A2"/>',
        unicorn: '<path d="M27 42 22 21Q22 17 27 20L42 31M69 42 74 21Q74 17 69 20L54 31" fill="currentColor" stroke="#fff" stroke-width="2"/><path d="M48 28 54 5 61 30Z" fill="#FFD56B" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="m53 12 5 2" stroke="#F6A6D0" stroke-width="2"/>'
      }[petKey] || '';
      const earMarkup = ears.replaceAll('currentColor', main);
      const faceShape = petKey === 'fox'
        ? '<path d="M20 39Q21 26 34 25L48 31 62 25Q75 26 76 39L70 57 58 68 48 74 38 68 26 57Z" fill="url(#' + grad + ')" stroke="#fff" stroke-width="2"/>'
        : '<path d="M20 45Q19 28 34 25Q48 19 62 25Q77 28 76 45Q76 62 61 70Q48 78 35 70Q20 62 20 45Z" fill="url(#' + grad + ')" stroke="#fff" stroke-width="2"/>';
      const tailColor = petKey === 'panda' || petKey === 'frog' ? dark : main;
      const eyes = petKey === 'frog' ? '' : mood === 'happy'
        ? '<path d="M34 47q4-7 8 0m12 0q4-7 8 0" fill="none" stroke="#30384B" stroke-width="3.2" stroke-linecap="round"/>'
        : '<ellipse class="pet-blink" cx="38" cy="46" rx="3.3" ry="4.5" fill="#30384B"/><ellipse class="pet-blink" cx="58" cy="46" rx="3.3" ry="4.5" fill="#30384B"/>';
      const mouth = mood === 'sad'
        ? '<path d="M41 62Q48 54 55 62" fill="none" stroke="#704452" stroke-width="2.5" stroke-linecap="round"/><path d="M31 54q-4 7 0 9" fill="#8BD8F1" stroke="#fff" stroke-width="1.5"/>'
        : mood === 'happy' ? '<path d="M41 57Q48 66 55 57" fill="none" stroke="#704452" stroke-width="2.5" stroke-linecap="round"/>' : '<path d="M42 60q6 3 12 0" fill="none" stroke="#704452" stroke-width="2.5" stroke-linecap="round"/>';
      const pandaPatches = petKey === 'panda' ? '<ellipse cx="38" cy="46" rx="7" ry="9" transform="rotate(24 38 46)" fill="#30384B"/><ellipse cx="58" cy="46" rx="7" ry="9" transform="rotate(-24 58 46)" fill="#30384B"/>' : '';
      const frogEyes = petKey === 'frog' ? '<circle cx="35" cy="25" r="3" fill="#30384B"/><circle cx="61" cy="25" r="3" fill="#30384B"/>' : '';
      const horn = petKey === 'unicorn' ? '<path d="M48 23V7" stroke="#FFD56B" stroke-width="3" stroke-linecap="round"/><path d="M44 13h8" stroke="#F39BC8" stroke-width="2"/>' : '';
      const muzzle = ['dog','bear','fox','panda'].includes(petKey) ? '<ellipse cx="48" cy="56" rx="13" ry="9" fill="#FFF5E9" opacity=".95"/>' : '';
      return `<svg viewBox="0 0 96 96" class="pet-float h-full w-full overflow-visible" role="img" aria-label="Pet ${payrollEscape(EMPLOYEE_PET_OPTIONS[petKey]?.name || 'đáng yêu')}"><defs><linearGradient id="${grad}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${main}"/></linearGradient><filter id="shadow-${grad}" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#334155" flood-opacity=".18"/></filter></defs><g filter="url(#shadow-${grad})"><path class="pet-tail" d="M68 70Q86 75 81 59Q78 52 72 57" fill="none" stroke="${tailColor}" stroke-width="8" stroke-linecap="round"/>${earMarkup}<ellipse cx="48" cy="79" rx="24" ry="13" fill="${main}" stroke="#fff" stroke-width="2"/><ellipse cx="40" cy="82" rx="7" ry="4" fill="${light}"/><ellipse cx="56" cy="82" rx="7" ry="4" fill="${light}"/>${faceShape}${pandaPatches}${frogEyes}${horn}<ellipse cx="33" cy="55" rx="5" ry="3" fill="#F58FA0" opacity=".7"/><ellipse cx="63" cy="55" rx="5" ry="3" fill="#F58FA0" opacity=".7"/>${muzzle}${eyes}<path d="M45 53Q48 50 51 53Q51 57 48 58Q45 57 45 53Z" fill="${dark}"/>${mouth}<path class="pet-sparkle" d="M77 27l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#FFD76A"/><path d="M22 68q-3 2-4 5m56-5q3 2 4 5" fill="none" stroke="${dark}" stroke-width="2" stroke-linecap="round"/></g></svg>`;
    }

    function saveEmployeePet() {
      if (!currentUser || !['ADMIN', 'STAFF', 'MANAGER'].includes(currentUser.role)) return;
      const petKey = document.getElementById('employeePetChoice').value;
      const message = document.getElementById('employeePetSettingsMessage');
      if (!EMPLOYEE_PET_OPTIONS[petKey]) {
        message.textContent = 'Hãy chọn một pet trước nhé.';
        return;
      }
      employeePets[currentUser.username.toLowerCase()] = petKey;
      localStorage.setItem('orderhub_employee_pets', JSON.stringify(employeePets));
      closePetDeadlineReminder();
      message.textContent = `${EMPLOYEE_PET_OPTIONS[petKey].name} đã sẵn sàng đồng hành cùng bạn! Có thể đổi pet bất cứ lúc nào.`;
      renderEmployeePet();
    }

    function vietnamDateKey(date) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(date);
      const part = type => parts.find(item => item.type === type)?.value || '';
      return `${part('year')}-${part('month')}-${part('day')}`;
    }

    function taskCompletedOnTime(task, today = vietnamDateKey(new Date())) {
      if (!taskIsCompleted(task) || !task.deadline) return false;
      if (!task.completedAt) return false;
      const completedAt = new Date(task.completedAt);
      if (Number.isNaN(completedAt.getTime())) return false;
      return vietnamDateKey(completedAt) <= String(task.deadline);
    }

    function getEmployeePetMood(username) {
      const today = vietnamDateKey(new Date());
      const assigned = assignedTasks.filter(task => task.assignedTo && task.assignedTo.toLowerCase() === username.toLowerCase() && /^\d{4}-\d{2}-\d{2}$/.test(String(task.deadline || '')));
      const considered = assigned.filter(task => taskIsCompleted(task) || task.deadline < today);
      const onTime = considered.filter(task => taskCompletedOnTime(task, today)).length;
      if (considered.length === 0) return { mood: 'relaxed', label: 'Thư giãn', icon: '😌', count: 0, total: 0, message: 'Chưa có việc đến hạn. Bạn cứ bình tĩnh lên kế hoạch nhé!' };
      const ratio = onTime / considered.length;
      if (onTime === considered.length) return { mood: 'happy', label: 'Vui vẻ', icon: '😄', count: onTime, total: considered.length, message: `Tuyệt vời! Bạn đã hoàn thành đúng hạn ${onTime}/${considered.length} công việc. Pet đang rất tự hào về bạn!` };
      if (ratio >= 0.5) return { mood: 'relaxed', label: 'Thư giãn', icon: '😌', count: onTime, total: considered.length, message: `Bạn đã hoàn thành đúng hạn ${onTime}/${considered.length} công việc. Cứ từng bước hoàn thành những việc tiếp theo nhé.` };
      return { mood: 'sad', label: 'Buồn một chút', icon: '🥺', count: onTime, total: considered.length, message: `Pet thấy có việc chưa kịp hoàn thành đúng hạn (${onTime}/${considered.length}). Hãy chia nhỏ công việc hoặc trao đổi với quản lý nếu cần hỗ trợ nhé.` };
    }

    function daysUntilTaskDeadlineVietnam(deadline, today = vietnamDateKey(new Date())) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(deadline || ''))) return null;
      const toUtc = value => { const [year, month, day] = value.split('-').map(Number); return Date.UTC(year, month - 1, day); };
      return Math.round((toUtc(deadline) - toUtc(today)) / 86400000);
    }

    function closePetDeadlineReminder() {
      document.getElementById('employeePetReminderToast').classList.add('hidden');
    }

    function maybeShowPetDeadlineReminder(username, task, daysRemaining, pet) {
      if (daysRemaining < 0 || daysRemaining > 1) return;
      const today = vietnamDateKey(new Date());
      let logs = {};
      try { logs = JSON.parse(localStorage.getItem('orderhub_pet_reminder_logs')) || {}; } catch { logs = {}; }
      const userKey = username.toLowerCase();
      if (logs[userKey] === today) return;
      logs[userKey] = today;
      localStorage.setItem('orderhub_pet_reminder_logs', JSON.stringify(logs));
      const toast = document.getElementById('employeePetReminderToast');
      const dueText = daysRemaining === 0 ? 'Deadline là hôm nay' : 'Còn 1 ngày đến deadline';
      toast.innerHTML = `<div class="flex items-start gap-3"><span class="text-3xl">${pet.emoji}</span><div class="min-w-0 flex-1"><div class="font-bold text-amber-900">Pet nhắc bạn một chút!</div><p class="mt-1 text-xs font-semibold text-slate-800">${payrollEscape(task.title)}</p><p class="mt-1 text-[11px] text-amber-800">${dueText} · ${payrollEscape(formatTaskDeadline(task.deadline))}</p><button type="button" onclick="closePetDeadlineReminder();switchTab('tasks')" class="mt-2 rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-600">Mở công việc</button></div><button type="button" aria-label="Đóng nhắc việc" onclick="closePetDeadlineReminder()" class="text-amber-700"><i class="fa-solid fa-xmark"></i></button></div>`;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 18000);
    }

    function renderEmployeePet() {
      const widget = document.getElementById('employeePetWidget');
      if (!widget) return;
      if (!currentUser || !['ADMIN', 'STAFF', 'MANAGER'].includes(currentUser.role)) {
        widget.classList.add('hidden');
        return;
      }
      const pet = EMPLOYEE_PET_OPTIONS[employeePets[currentUser.username.toLowerCase()]];
      if (!pet) {
        widget.classList.add('hidden');
        return;
      }
      const state = getEmployeePetMood(currentUser.username);
      widget.classList.remove('hidden');
      const badge = document.getElementById('employeePetMoodBadge');
      badge.textContent = `${state.icon} ${state.label}`;
      badge.className = `rounded-full px-2.5 py-1 text-[11px] font-bold ${state.mood === 'happy' ? 'bg-emerald-100 text-emerald-800' : state.mood === 'sad' ? 'bg-rose-100 text-rose-800' : 'bg-sky-100 text-sky-800'}`;
      document.getElementById('employeePetMascot').innerHTML = buildPetMascotSvg(employeePets[currentUser.username.toLowerCase()], state.mood, 'widget');
      document.getElementById('employeePetMessage').textContent = state.message;
      document.getElementById('employeePetTaskCount').textContent = state.total ? `Hoàn thành đúng hạn: ${state.count}/${state.total} việc đến hạn` : 'Chưa có công việc đến hạn';
      const pending = assignedTasks.filter(task => task.assignedTo && task.assignedTo.toLowerCase() === currentUser.username.toLowerCase() && !taskIsCompleted(task) && /^\d{4}-\d{2}-\d{2}$/.test(String(task.deadline || '')))
        .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
      const nextTaskPanel = document.getElementById('employeePetNextTask');
      if (!pending.length) {
        nextTaskPanel.classList.add('hidden');
        closePetDeadlineReminder();
        return;
      }
      const nextTask = pending[0];
      const daysRemaining = daysUntilTaskDeadlineVietnam(nextTask.deadline);
      const deadlineLabel = daysRemaining < 0 ? `Đã quá hạn ${Math.abs(daysRemaining)} ngày` : daysRemaining === 0 ? 'Deadline hôm nay' : `Còn ${daysRemaining} ngày`;
      nextTaskPanel.classList.remove('hidden');
      document.getElementById('employeePetNextTaskTitle').textContent = nextTask.title;
      document.getElementById('employeePetNextTaskDeadline').textContent = `${deadlineLabel} · ${formatTaskDeadline(nextTask.deadline)}`;
      maybeShowPetDeadlineReminder(currentUser.username, nextTask, daysRemaining, pet);
    }

    function renderEmployeeInfoForm() {
      if (!currentUser || !['ADMIN', 'STAFF', 'MANAGER'].includes(currentUser.role)) return;
      const username = currentUser.role === 'ADMIN' ? document.getElementById('employeeInfoSelect').value : currentUser.username;
      const employee = users.find(u => u.username.toLowerCase() === String(username || '').toLowerCase() && u.role !== 'ADMIN');
      const form = document.getElementById('employeeInfoForm');
      const status = document.getElementById('employeeInfoStatus');
      if (!employee) {
        form.reset();
        form.classList.add('hidden');
        document.getElementById('employeeGradeCard').classList.add('hidden');
        document.getElementById('employeeRankMotivation').classList.add('hidden');
        status.classList.add('hidden');
        return;
      }
      form.classList.remove('hidden');
      const gradeCard = document.getElementById('employeeGradeCard');
      gradeCard.classList.remove('hidden');
      gradeCard.classList.add('flex');
      document.getElementById('employeeGradeLabel').innerText = employeePayGradeLabel(employee).split(' · ')[0];
      document.getElementById('employeeHourlyRateLabel').innerText = `${employeeHourlyRate(employee).toLocaleString('vi-VN')} đ/giờ`;
      const motivation = document.getElementById('employeeRankMotivation');
      const employeeRank = Number(employee.rank) || 2;
      motivation.classList.toggle('hidden', currentUser.role !== 'STAFF');
      if (currentUser.role === 'STAFF' && employee.role === 'STAFF') {
        if (employeeRank < 3) {
          const nextRank = employeeRank + 1;
          document.getElementById('employeeRankMotivationTitle').innerText = `Mục tiêu tiếp theo: Nhân viên bậc ${nextRank}`;
          document.getElementById('employeeRankMotivationText').innerText = `Chinh phục bậc ${nextRank} sẽ tăng đơn giá thêm 5.000 đ/giờ, tương đương thêm 40.000 đ cho mỗi ca làm đủ 8 giờ.`;
        } else {
          document.getElementById('employeeRankMotivationTitle').innerText = 'Bạn đã đạt bậc nhân viên cao nhất!';
          document.getElementById('employeeRankMotivationText').innerText = 'Hãy tiếp tục giữ vững chất lượng công việc và trao đổi với quản lý về những cơ hội phát triển tiếp theo.';
        }
      }
      const info = employee.employeeInfo || {};
      document.getElementById('employeeFullName').value = info.fullName || (currentUser.role === 'ADMIN' ? employee.name : '');
      document.getElementById('employeePosition').value = info.position || '';
      document.getElementById('employeeBirthDate').value = info.birthDate || '';
      document.getElementById('employeeHometown').value = info.hometown || '';
      document.getElementById('employeeNationalId').value = info.nationalId || '';
      document.getElementById('employeeStartDate').value = info.startDate || '';
      document.getElementById('employeePhone').value = info.phone || '';
      document.getElementById('employeeAddress').value = info.address || '';
      const readOnly = currentUser.role === 'ADMIN';
      form.querySelectorAll('input').forEach(input => { input.readOnly = readOnly; });
      document.getElementById('employeeInfoSaveButton').innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i>Lưu thông tin của tôi';
      status.classList.remove('hidden');
      if (isEmployeeProfileComplete(employee)) {
        status.className = 'mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800';
        status.innerText = readOnly ? 'Hồ sơ đã hoàn tất.' : 'Hồ sơ của bạn đã đầy đủ. Bạn có thể cập nhật khi thông tin thay đổi.';
      } else {
        status.className = 'mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900';
        status.innerText = readOnly ? 'Nhân viên chưa hoàn tất hồ sơ.' : 'Hồ sơ còn thiếu thông tin bắt buộc. Hãy điền đủ và lưu để mở các chức năng khác.';
      }
    }

    function saveEmployeeInfo(event) {
      event.preventDefault();
      if (!currentUser || !['STAFF', 'MANAGER'].includes(currentUser.role)) return alert('Nhân viên hãy đăng nhập tài khoản của mình để khai báo hồ sơ.');
      const employee = users.find(u => u.username.toLowerCase() === currentUser.username.toLowerCase() && u.role !== 'ADMIN');
      if (!employee) return alert('Không tìm thấy nhân viên cần cập nhật.');
      const newName = document.getElementById('employeeFullName').value.trim();
      const position = document.getElementById('employeePosition').value.trim();
      const birthDate = document.getElementById('employeeBirthDate').value;
      const hometown = document.getElementById('employeeHometown').value.trim();
      const nationalId = document.getElementById('employeeNationalId').value.trim();
      const startDate = document.getElementById('employeeStartDate').value;
      if (!newName || !position || !birthDate || !hometown || !startDate || !/^(\d{9}|\d{12})$/.test(nationalId)) {
        return alert('Vui lòng điền đủ họ tên, chức vụ, ngày sinh, quê quán, CCCD 9 hoặc 12 chữ số và ngày vào làm.');
      }
      const oldName = employee.name;
      employee.name = newName;
      employee.employeeInfo = {
        ...(employee.employeeInfo || {}),
        fullName: newName,
        position,
        birthDate,
        hometown,
        nationalId,
        startDate,
        phone: document.getElementById('employeePhone').value.trim(),
        address: document.getElementById('employeeAddress').value.trim()
      };
      orders.forEach(order => {
        if (order.staffName === oldName) order.staffName = newName;
        if (Array.isArray(order.sharedWith)) order.sharedWith = order.sharedWith.map(name => name === oldName ? newName : name);
      });
      localStorage.setItem('orderhub_users', JSON.stringify(users));
      localStorage.setItem('orderhub_orders', JSON.stringify(orders));
      currentUser = employee;
      sessionStorage.setItem('orderhub_current_user', JSON.stringify(currentUser));
      document.getElementById('userDisplayName').innerText = currentUser.name;
      applyRoleTabVisibility();
      renderEmployeeInfo();
      renderUsersTable();
      populateReportStaffDropdown();
      populateOrderStaffFilter();
      updateDashboardStats();
      renderOrdersTable();
      alert('Đã lưu hồ sơ nhân viên.');
    }

    // --- 11. QUẢN LÝ NGƯỜI DÙNG (ADMIN) ---
    function renderUsersTable() {
      const tbody = document.getElementById('usersTableBody');
      tbody.innerHTML = '';

      users.forEach(u => {
        let roleBadge = '';
        if (u.role === 'ADMIN') roleBadge = '<span class="px-2 py-0.5 text-xs font-bold rounded bg-red-100 text-red-700">ADMIN</span>';
        else if (u.role === 'MANAGER') roleBadge = '<span class="px-2 py-0.5 text-xs font-bold rounded bg-amber-100 text-amber-700">MANAGER</span>';
        else roleBadge = '<span class="px-2 py-0.5 text-xs font-bold rounded bg-blue-100 text-blue-700">STAFF</span>';

        let permText = u.role === 'ADMIN' ? 'Toàn quyền hệ thống' : u.role === 'MANAGER' ? 'Quản lý toàn bộ đơn, không thể xóa' : 'Xem/Sửa/Xóa đơn của chính mình';
        const rankCell = u.role === 'STAFF'
          ? `<select aria-label="Bậc của ${payrollEscape(u.name)}" data-user-rank="${payrollEscape(u.username)}" class="p-1.5 border border-slate-300 rounded text-xs bg-white"><option value="1" ${Number(u.rank) === 1 ? 'selected' : ''}>Bậc 1 · 20.000 đ/giờ</option><option value="2" ${Number(u.rank) === 2 ? 'selected' : ''}>Bậc 2 · 25.000 đ/giờ</option><option value="3" ${Number(u.rank) === 3 ? 'selected' : ''}>Bậc 3 · 30.000 đ/giờ</option></select>`
          : u.role === 'MANAGER' ? '<span class="text-amber-800 font-semibold text-xs">40.000 đ/giờ</span>' : '<span class="text-slate-400">—</span>';

        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-slate-50';
        tr.innerHTML = `
          <td class="px-4 py-3 font-semibold text-slate-800">${u.username}</td>
          <td class="px-4 py-3">${u.name}</td>
          <td class="px-4 py-3 text-xs">${u.email || '<span class="text-amber-700">Chưa cài đặt</span>'} ${currentUser.role === 'ADMIN' ? `<button type="button" class="text-blue-700 ml-2" onclick="setUserRecoveryEmail('${u.username}')">${u.email ? 'Sửa' : 'Thêm email'}</button>` : ''}</td>
          <td class="px-4 py-3">${roleBadge}</td>
          <td class="px-4 py-3">${rankCell}</td>
          <td class="px-4 py-3 text-xs text-slate-500">${permText}</td>
          <td class="px-4 py-3 text-right">${currentUser.role === 'ADMIN' && u.username.toLowerCase() !== currentUser.username.toLowerCase() ? '<button type="button" data-delete-user class="text-red-600 hover:text-red-800 font-semibold text-xs"><i class="fa-solid fa-trash mr-1"></i>Xóa tài khoản</button>' : '<span class="text-slate-300 text-xs">—</span>'}</td>
        `;
        const deleteButton = tr.querySelector('[data-delete-user]');
        if (deleteButton) deleteButton.addEventListener('click', () => deleteUserAccount(u.username));
        const rankSelect = tr.querySelector('[data-user-rank]');
        if (rankSelect) rankSelect.addEventListener('change', () => updateUserRank(rankSelect.dataset.userRank, rankSelect.value));
        tbody.appendChild(tr);
      });
    }

    function updateUserRank(username, value) {
      if (!currentUser || currentUser.role !== 'ADMIN') return alert('Chỉ Admin mới được đổi bậc nhân viên.');
      const account = users.find(user => user.username.toLowerCase() === String(username).toLowerCase());
      const rank = Number(value);
      if (!account || account.role !== 'STAFF' || ![1, 2, 3].includes(rank)) return;
      account.rank = rank;
      localStorage.setItem('orderhub_users', JSON.stringify(users));
      renderPayrollTable();
    }

    function deleteUserAccount(username) {
      if (!currentUser || currentUser.role !== 'ADMIN') {
        alert('Chỉ Admin mới có quyền xóa tài khoản.');
        return;
      }
      if (username.toLowerCase() === currentUser.username.toLowerCase()) {
        alert('Không thể xóa tài khoản Admin đang đăng nhập.');
        return;
      }
      const account = users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (!account) return;
      const confirmed = confirm(`Xác nhận xóa tài khoản ${account.username} — ${account.name} (${account.role})?\n\nTài khoản sẽ không thể đăng nhập nữa. Đơn hàng lịch sử của tài khoản được giữ lại. Thao tác này không thể hoàn tác.`);
      if (!confirmed) return;

      const adminAccount = users.find(u => u.username.toLowerCase() === currentUser.username.toLowerCase() && u.role === 'ADMIN');
      if (!adminAccount) {
        alert('Không xác minh được tài khoản Admin hiện tại. Không thể xóa tài khoản.');
        return;
      }
      const adminPassword = prompt('Nhập mật khẩu Admin để xác nhận xóa tài khoản:');
      if (adminPassword === null) return;
      if (adminPassword !== adminAccount.password) {
        alert('Mật khẩu Admin không đúng. Tài khoản chưa bị xóa.');
        return;
      }

      users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
      localStorage.setItem('orderhub_users', JSON.stringify(users));
      renderUsersTable();
      populateReportStaffDropdown();
      populateOrderStaffFilter();
      updateDashboardStats();
      renderOrdersTable();
      alert(`Đã xóa tài khoản ${account.username}. Đơn hàng lịch sử vẫn được giữ lại.`);
    }

    function openUserModal() {
      if (currentUser.role !== 'ADMIN') {
        alert("❌ Chỉ có tài khoản Admin mới có quyền tạo tài khoản người dùng!");
        return;
      }
      document.getElementById('newRole').value = 'STAFF';
      document.getElementById('newUserRank').value = '2';
      updateNewUserRankVisibility();
      document.getElementById('userModal').classList.remove('hidden');
    }

    function updateNewUserRankVisibility() {
      const role = document.getElementById('newRole').value;
      document.getElementById('newUserRankWrap').classList.toggle('hidden', role !== 'STAFF');
    }

    function closeUserModal() {
      document.getElementById('userModal').classList.add('hidden');
    }

    function handleCreateUser(e) {
      e.preventDefault();
      const username = document.getElementById('newUsername').value.trim();
      const password = document.getElementById('newPassword').value.trim();
      const name = document.getElementById('newDisplayName').value.trim();
      const email = document.getElementById('newUserEmail').value.trim();
      const role = document.getElementById('newRole').value;

      if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        alert("❌ Username này đã tồn tại!");
        return;
      }

      const rank = role === 'STAFF' ? Number(document.getElementById('newUserRank').value) || 2 : null;
      users.push({ username, password, name, email, role, ...(role === 'STAFF' ? { rank } : {}) });
      localStorage.setItem('orderhub_users', JSON.stringify(users));
      closeUserModal();
      renderUsersTable();
      populateReportStaffDropdown();
      populateOrderStaffFilter();
      alert("✅ Đã tạo tài khoản người dùng mới thành công!");
    }

    function setUserRecoveryEmail(username) {
      if (currentUser.role !== 'ADMIN') return alert('Chỉ Admin được cập nhật email khôi phục.');
      const account = users.find(u => u.username === username);
      if (!account) return;
      const email = prompt(`Nhập email khôi phục cho tài khoản ${username}:`, account.email || '');
      if (email === null) return;
      const cleaned = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return alert('Email chưa đúng định dạng.');
      account.email = cleaned;
      localStorage.setItem('orderhub_users', JSON.stringify(users));
      renderUsersTable();
      alert('Đã lưu email khôi phục.');
    }

    // --- 11. GIAO VIỆC ---
    function initTaskPeriodSelectors(monthId, yearId) {
      const monthSelect = document.getElementById(monthId);
      const yearSelect = document.getElementById(yearId);
      const now = new Date();
      const months = ['Tháng Một','Tháng Hai','Tháng Ba','Tháng Tư','Tháng Năm','Tháng Sáu','Tháng Bảy','Tháng Tám','Tháng Chín','Tháng Mười','Tháng Mười Một','Tháng Mười Hai'];
      if (!monthSelect.options.length) {
        monthSelect.innerHTML = months.map((name, i) => `<option value="${String(i + 1).padStart(2,'0')}">${name}</option>`).join('');
        monthSelect.value = String(now.getMonth() + 1).padStart(2,'0');
      }
      if (!yearSelect.options.length) {
        for (let year = now.getFullYear() - 10; year <= now.getFullYear() + 1; year++) yearSelect.add(new Option(`Năm ${year}`, String(year)));
        yearSelect.value = String(now.getFullYear());
      }
      return `${yearSelect.value}-${monthSelect.value}`;
    }

    function taskPeriodLabel(period) {
      const [year, month] = period.split('-').map(Number);
      const names = ['Tháng Một','Tháng Hai','Tháng Ba','Tháng Tư','Tháng Năm','Tháng Sáu','Tháng Bảy','Tháng Tám','Tháng Chín','Tháng Mười','Tháng Mười Một','Tháng Mười Hai'];
      return `${names[month - 1]} năm ${year}`;
    }

    function formatTaskDeadline(dateValue) {
      const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match ? `${match[3]}/${match[2]}/${match[1].slice(-2)}` : String(dateValue || '');
    }

    function taskIsCompleted(task) {
      if (typeof task.completed === 'boolean') return task.completed;
      return Number(task.progress) >= 100 || task.status === 'Hoàn thành';
    }

    function taskDaysUntilDeadline(deadline) {
      const match = String(deadline || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      const [, year, month, day] = match.map(Number);
      const dueUtc = Date.UTC(year, month - 1, day);
      const now = new Date();
      const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      return Math.round((dueUtc - todayUtc) / 86400000);
    }

    function taskDeadlineStatus(task, completed = taskIsCompleted(task)) {
      if (completed) return { text: 'Đã hoàn thành', className: 'bg-emerald-100 text-emerald-800' };
      const days = taskDaysUntilDeadline(task.deadline);
      if (days === null) return { text: 'Chưa có deadline hợp lệ', className: 'bg-slate-100 text-slate-600' };
      if (days < 0) return { text: `Chưa hoàn thành · Quá hạn ${Math.abs(days)} ngày`, className: 'bg-red-100 text-red-800' };
      if (days === 0) return { text: 'Deadline hôm nay', className: 'bg-amber-100 text-amber-800' };
      return { text: `Còn ${days} ngày`, className: 'bg-blue-100 text-blue-800' };
    }

    function scheduleTaskDeadlineRefresh() {
      if (taskDeadlineRefreshTimer) clearTimeout(taskDeadlineRefreshTimer);
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
      taskDeadlineRefreshTimer = setTimeout(() => {
        renderEmployeePet();
        if (currentUser && !document.getElementById('tabContent-tasks').classList.contains('hidden')) renderTaskList();
        scheduleTaskDeadlineRefresh();
      }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
    }

    function normalizeTaskDeadline(value) {
      if (typeof value === 'number' && window.XLSX) {
        const parts = XLSX.SSF.parse_date_code(value);
        if (parts) value = `${parts.y}-${String(parts.m).padStart(2,'0')}-${String(parts.d).padStart(2,'0')}`;
      }
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        value = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
      }
      const raw = String(value || '').trim();
      let dateParts = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (dateParts) {
        const [, year, month, day] = dateParts;
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        if (date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)) return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      }
      dateParts = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
      if (dateParts) {
        let [, day, month, year] = dateParts;
        if (year.length === 2) year = `20${year}`;
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        if (date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)) return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      }
      return '';
    }

    function renderTaskTab() {
      if (!currentUser || !['ADMIN', 'STAFF', 'MANAGER'].includes(currentUser.role)) return;
      const admin = currentUser.role === 'ADMIN';
      document.getElementById('taskCreateSection').classList.toggle('hidden', !admin);
      const period = initTaskPeriodSelectors('taskMonth', 'taskYear');
      initTaskPeriodSelectors('taskFilterMonth', 'taskFilterYear');
      const assignee = document.getElementById('taskAssignee');
      const reminderAssignee = document.getElementById('dailyReminderAssignee');
      const employeeFilterWrap = document.getElementById('taskEmployeeFilterWrap');
      const employeeFilter = document.getElementById('taskEmployeeFilter');
      employeeFilterWrap.classList.toggle('hidden', !admin);
      document.getElementById('dailyReminderCreateSection').classList.toggle('hidden', !admin);
      if (admin) {
        const previous = assignee.value;
        const eligible = users.filter(user => user.role !== 'ADMIN');
        assignee.innerHTML = eligible.map(user => `<option value="${payrollEscape(user.username)}">${payrollEscape(user.name)} (${payrollEscape(user.role)})</option>`).join('');
        if (eligible.some(user => user.username === previous)) assignee.value = previous;
        const previousReminderAssignee = reminderAssignee.value;
        reminderAssignee.innerHTML = '<option value="ALL">Tất cả nhân viên</option>' + eligible.map(user => `<option value="${payrollEscape(user.username)}">${payrollEscape(user.name)} (${payrollEscape(user.role)})</option>`).join('');
        if ([...reminderAssignee.options].some(option => option.value === previousReminderAssignee)) reminderAssignee.value = previousReminderAssignee;
        const previousFilter = employeeFilter.value;
        employeeFilter.innerHTML = '<option value="ALL">Tất cả nhân viên</option>' + eligible.map(user => `<option value="${payrollEscape(user.username)}">${payrollEscape(user.name)}</option>`).join('');
        if ([...employeeFilter.options].some(option => option.value === previousFilter)) employeeFilter.value = previousFilter;
        else employeeFilter.value = 'ALL';
        employeeFilter.onchange = renderTaskList;
        document.getElementById('taskMonth').onchange = () => {
          document.getElementById('taskFilterMonth').value = document.getElementById('taskMonth').value;
          document.getElementById('taskFilterYear').value = document.getElementById('taskYear').value;
          renderTaskList();
        };
        document.getElementById('taskYear').onchange = () => {
          document.getElementById('taskFilterMonth').value = document.getElementById('taskMonth').value;
          document.getElementById('taskFilterYear').value = document.getElementById('taskYear').value;
          renderTaskList();
        };
      }
      const filterMonth = document.getElementById('taskFilterMonth');
      const filterYear = document.getElementById('taskFilterYear');
      filterMonth.onchange = renderTaskList;
      filterYear.onchange = renderTaskList;
      if (admin && !filterMonth.dataset.initialized) {
        filterMonth.value = document.getElementById('taskMonth').value;
        filterYear.value = document.getElementById('taskYear').value;
        filterMonth.dataset.initialized = 'true';
      }
      document.getElementById('taskListScope').innerText = admin ? 'Lọc theo nhân viên và tháng để xem công việc đã giao.' : 'Danh sách công việc được giao cho tài khoản của bạn. Hãy đánh dấu hoàn thành khi xong.';
      renderTaskList();
      renderDailyReminders();
      notifyAssignedTasks();
      scheduleTaskDeadlineRefresh();
      evaluateDailyReminderPopups();
      scheduleDailyReminderChecks();
    }

    function renderDailyReminders() {
      if (!currentUser || !['ADMIN', 'STAFF', 'MANAGER'].includes(currentUser.role)) return;
      const admin = currentUser.role === 'ADMIN';
      const active = dailyReminders.filter(reminder => reminder.active !== false && (admin || reminder.assignedTo === 'ALL' || reminder.assignedTo.toLowerCase() === currentUser.username.toLowerCase()));
      const list = document.getElementById('dailyReminderList');
      if (!active.length) {
        list.innerHTML = '<div class="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">Chưa có công việc nhắc hằng ngày.</div>';
        return;
      }
      list.innerHTML = active.map(reminder => {
        const user = users.find(item => item.username.toLowerCase() === String(reminder.assignedTo).toLowerCase());
        const assigneeLabel = reminder.assignedTo === 'ALL' ? 'Tất cả nhân viên' : (user?.name || reminder.assignedName || reminder.assignedTo);
        const removeButton = admin ? `<button type="button" onclick="deleteDailyReminder('${reminder.id}')" class="text-red-600 hover:text-red-800 text-xs font-semibold"><i class="fa-solid fa-trash mr-1"></i>Xóa</button>` : '';
        return `<div class="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><div><div class="font-semibold text-slate-800">${payrollEscape(reminder.title)}</div>${reminder.description ? `<div class="mt-1 text-xs text-slate-600">${payrollEscape(reminder.description)}</div>` : ''}<div class="mt-1 text-[11px] text-slate-500">${payrollEscape(assigneeLabel)} · Nhắc lúc 09:00 và 14:00</div></div>${removeButton}</div>`;
      }).join('');
    }

    function createDailyReminder(event) {
      event.preventDefault();
      if (!currentUser || currentUser.role !== 'ADMIN') return alert('Chỉ Admin mới được tạo nhắc việc hằng ngày.');
      const assignedTo = document.getElementById('dailyReminderAssignee').value;
      if (assignedTo !== 'ALL' && !users.some(user => user.username.toLowerCase() === assignedTo.toLowerCase() && user.role !== 'ADMIN')) return alert('Hãy chọn nhân viên hợp lệ.');
      const title = document.getElementById('dailyReminderTitle').value.trim();
      if (!title) return alert('Vui lòng nhập tên việc cần nhắc.');
      const assignedUser = users.find(user => user.username.toLowerCase() === assignedTo.toLowerCase());
      dailyReminders.push({
        id: `REM${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
        title,
        description: document.getElementById('dailyReminderDescription').value.trim(),
        assignedTo,
        assignedName: assignedUser?.name || 'Tất cả nhân viên',
        active: true,
        createdBy: currentUser.username,
        createdAt: new Date().toISOString()
      });
      localStorage.setItem('orderhub_daily_reminders', JSON.stringify(dailyReminders));
      document.getElementById('dailyReminderTitle').value = '';
      document.getElementById('dailyReminderDescription').value = '';
      renderDailyReminders();
      alert('Đã tạo nhắc việc. Nhân viên sẽ nhận popup lúc 09:00 và 14:00 hằng ngày.');
    }

    function deleteDailyReminder(reminderId) {
      if (!currentUser || currentUser.role !== 'ADMIN') return alert('Chỉ Admin mới được xóa nhắc việc.');
      const reminder = dailyReminders.find(item => item.id === reminderId);
      if (!reminder || !confirm(`Xóa nhắc việc “${reminder.title}”?`)) return;
      dailyReminders = dailyReminders.filter(item => item.id !== reminderId);
      localStorage.setItem('orderhub_daily_reminders', JSON.stringify(dailyReminders));
      renderDailyReminders();
    }

    function evaluateDailyReminderPopups() {
      if (!currentUser || !['STAFF', 'MANAGER'].includes(currentUser.role)) return;
      const reminders = dailyReminders.filter(reminder => reminder.active !== false && (reminder.assignedTo === 'ALL' || reminder.assignedTo.toLowerCase() === currentUser.username.toLowerCase()));
      if (!reminders.length) return;
      const now = new Date();
      const currentMinute = now.getHours() * 60 + now.getMinutes();
      const today = getLocalDateString();
      let logs = {};
      try { logs = JSON.parse(localStorage.getItem('orderhub_daily_reminder_logs') || '{}'); } catch { logs = {}; }
      logs[currentUser.username] ||= {};
      logs[currentUser.username][today] ||= [];
      let changed = false;
      for (const slot of [{ time: '09:00', minute: 9 * 60 }, { time: '14:00', minute: 14 * 60 }]) {
        if (currentMinute < slot.minute || logs[currentUser.username][today].includes(slot.time)) continue;
        const slotDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(slot.minute / 60), slot.minute % 60, 0);
        const remindersAtSlot = reminders.filter(reminder => !reminder.createdAt || new Date(reminder.createdAt) <= slotDate);
        if (remindersAtSlot.length) showDailyReminderToast(remindersAtSlot, slot.time);
        logs[currentUser.username][today].push(slot.time);
        changed = true;
      }
      if (changed) localStorage.setItem('orderhub_daily_reminder_logs', JSON.stringify(logs));
    }

    function scheduleDailyReminderChecks() {
      if (dailyReminderTimer) clearTimeout(dailyReminderTimer);
      const now = new Date();
      const slots = [new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0), new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0)];
      let next = slots.find(slot => slot > now);
      if (!next) next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
      dailyReminderTimer = setTimeout(() => {
        evaluateDailyReminderPopups();
        scheduleDailyReminderChecks();
      }, Math.max(1000, next.getTime() - now.getTime()));
    }

    function showDailyReminderToast(reminders, time) {
      const container = document.getElementById('taskToastContainer');
      const toast = document.createElement('div');
      toast.className = 'rounded-xl bg-amber-500 text-slate-950 shadow-2xl border border-amber-300 p-4';
      const reminderItems = reminders.map(reminder => `<li class="mt-1"><strong>${payrollEscape(reminder.title)}</strong>${reminder.description ? `<span class="block text-xs text-slate-800">${payrollEscape(reminder.description)}</span>` : ''}</li>`).join('');
      toast.innerHTML = `<div class="flex gap-3"><div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-600"><i class="fa-solid fa-bell"></i></div><div class="min-w-0 flex-1"><div class="font-bold text-sm">Nhắc việc hằng ngày · ${time}</div><ul class="mt-1 list-disc pl-4 text-sm">${reminderItems}</ul><button type="button" class="mt-2 text-xs font-bold text-slate-900 underline" onclick="switchTab('tasks');this.closest('.rounded-xl').remove()">Mở tab Giao việc</button></div><button type="button" aria-label="Đóng nhắc việc" onclick="this.closest('.rounded-xl').remove()" class="text-slate-800"><i class="fa-solid fa-xmark"></i></button></div>`;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 20000);
    }

    function renderTaskList() {
      if (!currentUser || !['ADMIN', 'STAFF', 'MANAGER'].includes(currentUser.role)) return;
      const period = initTaskPeriodSelectors('taskFilterMonth', 'taskFilterYear');
      const admin = currentUser.role === 'ADMIN';
      const selectedEmployee = admin ? document.getElementById('taskEmployeeFilter').value : currentUser.username;
      const visibleTasks = assignedTasks.filter(task => task.period === period && (admin ? (selectedEmployee === 'ALL' || task.assignedTo.toLowerCase() === selectedEmployee.toLowerCase()) : task.assignedTo.toLowerCase() === currentUser.username.toLowerCase()))
        .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
      const tbody = document.getElementById('taskTableBody');
      tbody.innerHTML = visibleTasks.map((task, index) => {
        const assignedUser = users.find(user => user.username.toLowerCase() === task.assignedTo.toLowerCase());
        const completed = taskIsCompleted(task);
        const daysRemaining = taskDaysUntilDeadline(task.deadline);
        const deadlineLocked = daysRemaining !== null && daysRemaining < 0;
        const deadlineStatus = taskDeadlineStatus(task, completed);
        const completionHtml = admin
          ? `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${deadlineStatus.className}">${payrollEscape(deadlineStatus.text)}</span>`
          : `<div class="space-y-2"><label class="flex items-center gap-2 font-semibold ${deadlineLocked ? 'text-slate-400' : 'text-slate-700'}"><input type="checkbox" ${completed ? 'checked' : ''} ${deadlineLocked ? 'disabled title="Đã quá deadline, không thể chỉnh sửa"' : ''} onchange="saveTaskCompletion('${task.id}',this.checked)" class="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" />Đã hoàn thành</label><span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${deadlineStatus.className}">${payrollEscape(deadlineStatus.text)}</span>${deadlineLocked ? '<div class="text-[11px] text-red-700">Đã khóa chỉnh sửa do quá deadline.</div>' : ''}</div>`;
        const actions = admin ? `<button type="button" onclick="deleteAssignedTask('${task.id}')" class="text-red-600 hover:text-red-800 text-xs font-semibold"><i class="fa-solid fa-trash mr-1"></i>Xóa</button>` : '<span class="text-slate-300">—</span>';
        return `<tr class="${index % 2 ? 'bg-slate-50/60' : 'bg-white'} align-top"><td class="px-3 py-3"><div class="font-semibold text-slate-800">${payrollEscape(task.title)}</div>${task.description ? `<div class="mt-1 text-xs text-slate-500 whitespace-pre-wrap">${payrollEscape(task.description)}</div>` : ''}</td><td class="px-3 py-3">${payrollEscape(assignedUser?.name || task.assignedName || task.assignedTo)}</td><td class="px-3 py-3 whitespace-nowrap">${payrollEscape(formatTaskDeadline(task.deadline))}</td><td class="px-3 py-3">${completionHtml}</td><td class="px-3 py-3 text-right">${actions}</td></tr>`;
      }).join('');
      if (!visibleTasks.length) tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400">Chưa có công việc trong tháng này.</td></tr>';
      renderEmployeePet();
    }

    function createAssignedTask(event) {
      event.preventDefault();
      if (!currentUser || currentUser.role !== 'ADMIN') return alert('Chỉ Admin mới được giao công việc.');
      const period = initTaskPeriodSelectors('taskMonth', 'taskYear');
      const username = document.getElementById('taskAssignee').value;
      const assignee = users.find(user => user.username.toLowerCase() === username.toLowerCase() && user.role !== 'ADMIN');
      if (!assignee) return alert('Vui lòng chọn nhân viên được giao.');
      const title = document.getElementById('taskTitle').value.trim();
      const deadline = document.getElementById('taskDeadline').value;
      if (!title || !deadline) return alert('Vui lòng nhập tên công việc và deadline.');
      const task = {
        id: `TASK${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
        title,
        description: document.getElementById('taskDescription').value.trim(),
        period,
        deadline,
        assignedTo: assignee.username,
        assignedName: assignee.name,
        assignedBy: currentUser.username,
        createdAt: new Date().toISOString(),
        completed: false,
        seenBy: []
      };
      assignedTasks.push(task);
      localStorage.setItem('orderhub_tasks', JSON.stringify(assignedTasks));
      document.getElementById('taskTitle').value = '';
      document.getElementById('taskDescription').value = '';
      document.getElementById('taskDeadline').value = '';
      document.getElementById('taskFilterMonth').value = period.slice(5, 7);
      document.getElementById('taskFilterYear').value = period.slice(0, 4);
      renderTaskList();
      alert(`Đã giao công việc cho ${assignee.name}. Nhân viên sẽ nhận thông báo khi mở tài khoản.`);
    }

    function downloadTaskTemplate() {
      if (!currentUser || currentUser.role !== 'ADMIN') return alert('Chỉ Admin mới được tải mẫu giao việc.');
      if (!window.XLSX) return alert('Không tải được thư viện Excel. Hãy kiểm tra kết nối Internet.');
      const workbook = XLSX.utils.book_new();
      const tasksSheet = XLSX.utils.aoa_to_sheet([['Username','Tên công việc','Mô tả','Deadline (dd/mm/yyyy)']]);
      tasksSheet['!cols'] = [{ wch: 20 }, { wch: 42 }, { wch: 60 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(workbook, tasksSheet, 'Giao viec');
      const guideSheet = XLSX.utils.aoa_to_sheet([
        ['HƯỚNG DẪN NHẬP DANH SÁCH GIAO VIỆC'],
        ['Nhập mỗi công việc trên một dòng trong sheet Giao viec.'],
        ['Username phải trùng với tài khoản nhân viên trong OrderHub.'],
        ['Deadline nhập theo dd/mm/yyyy, ví dụ 07/11/2026; cũng có thể chọn ngày bằng Excel.'],
        ['Kỳ tháng của các công việc được lấy theo tháng đang chọn trong tab Giao việc.'],
        ['Các deadline phải thuộc tháng/năm đang chọn. Dòng không hợp lệ sẽ được bỏ qua.']
      ]);
      guideSheet['!cols'] = [{ wch: 95 }];
      XLSX.utils.book_append_sheet(workbook, guideSheet, 'Huong dan');
      XLSX.writeFile(workbook, 'MauGiaoViec_OrderHub.xlsx');
    }

    async function importAssignedTasks(event) {
      if (!currentUser || currentUser.role !== 'ADMIN') return alert('Chỉ Admin mới được nhập giao việc.');
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (!window.XLSX) { alert('Không tải được thư viện Excel. Hãy kiểm tra kết nối Internet.'); event.target.value = ''; return; }
      try {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const period = initTaskPeriodSelectors('taskMonth', 'taskYear');
        let imported = 0;
        let skipped = 0;
        const now = new Date().toISOString();
        for (const row of rows) {
          const username = String(row.Username || row.username || row['Tài khoản'] || row['Tài khoản nhân viên'] || '').trim();
          const assignee = users.find(user => user.username.toLowerCase() === username.toLowerCase() && user.role !== 'ADMIN');
          const title = String(row['Tên công việc'] || row['Công việc'] || row['Task'] || '').trim();
          const description = String(row['Mô tả'] || row['Yêu cầu'] || row['Description'] || '').trim();
          const deadline = normalizeTaskDeadline(row['Deadline (dd/mm/yyyy)'] || row.Deadline || row['Hạn hoàn thành'] || '');
          if (!assignee || !title || !deadline || deadline.slice(0, 7) !== period) { skipped++; continue; }
          assignedTasks.push({
            id: `TASK${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
            title, description, period, deadline,
            assignedTo: assignee.username, assignedName: assignee.name,
            assignedBy: currentUser.username, createdAt: now,
            completed: false, seenBy: []
          });
          imported++;
        }
        if (imported) {
          localStorage.setItem('orderhub_tasks', JSON.stringify(assignedTasks));
          document.getElementById('taskFilterMonth').value = period.slice(5, 7);
          document.getElementById('taskFilterYear').value = period.slice(0, 4);
          renderTaskList();
        }
        alert(`Đã nhập ${imported} công việc cho kỳ ${taskPeriodLabel(period)}. Bỏ qua ${skipped} dòng thiếu thông tin, sai username hoặc deadline ngoài tháng đã chọn.`);
      } catch (error) {
        alert('Không đọc được tệp Excel. Hãy dùng mẫu giao việc OrderHub đã tải xuống.');
      } finally {
        event.target.value = '';
      }
    }

    function saveTaskCompletion(taskId, completed) {
      const task = assignedTasks.find(item => item.id === taskId);
      if (!task || currentUser.role === 'ADMIN' || task.assignedTo.toLowerCase() !== currentUser.username.toLowerCase()) return;
      const daysRemaining = taskDaysUntilDeadline(task.deadline);
      if (daysRemaining !== null && daysRemaining < 0) {
        alert('Công việc đã quá deadline nên không thể chỉnh sửa.');
        renderTaskList();
        return;
      }
      const confirmationText = completed
        ? `Xác nhận đánh dấu “${task.title}” là đã hoàn thành?`
        : `Xác nhận bỏ đánh dấu hoàn thành cho “${task.title}”?`;
      if (!confirm(confirmationText)) {
        renderTaskList();
        return;
      }
      task.completed = Boolean(completed);
      task.completedAt = task.completed ? new Date().toISOString() : null;
      localStorage.setItem('orderhub_tasks', JSON.stringify(assignedTasks));
      renderEmployeePet();
      renderTaskList();
    }

    function deleteAssignedTask(taskId) {
      if (!currentUser || currentUser.role !== 'ADMIN') return alert('Chỉ Admin mới được xóa công việc.');
      const task = assignedTasks.find(item => item.id === taskId);
      if (!task || !confirm(`Xóa công việc “${task.title}” đã giao?`)) return;
      assignedTasks = assignedTasks.filter(item => item.id !== taskId);
      localStorage.setItem('orderhub_tasks', JSON.stringify(assignedTasks));
      renderTaskList();
    }

    function showTaskNotification(task) {
      const container = document.getElementById('taskToastContainer');
      const toast = document.createElement('div');
      toast.className = 'rounded-xl bg-slate-900 text-white shadow-2xl border border-white/10 p-4 animate-[fadeIn_.2s_ease-out]';
      toast.innerHTML = `<div class="flex gap-3"><div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-900"><i class="fa-solid fa-bell"></i></div><div class="min-w-0 flex-1"><div class="font-bold text-sm">Bạn vừa được giao việc</div><div class="mt-1 text-sm">${payrollEscape(task.title)}</div><div class="mt-1 text-xs text-slate-300">Deadline: ${payrollEscape(formatTaskDeadline(task.deadline))} · ${payrollEscape(taskPeriodLabel(task.period))}</div><button type="button" class="mt-2 text-xs font-semibold text-amber-300 hover:text-amber-200" onclick="switchTab('tasks');this.closest('.rounded-xl').remove()">Xem công việc</button></div><button type="button" aria-label="Đóng thông báo" class="text-slate-300 hover:text-white" onclick="this.closest('.rounded-xl').remove()"><i class="fa-solid fa-xmark"></i></button></div>`;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 12000);
    }

    function notifyAssignedTasks() {
      if (!currentUser || !['STAFF', 'MANAGER'].includes(currentUser.role)) return;
      let changed = false;
      assignedTasks.forEach(task => {
        if (task.assignedTo.toLowerCase() !== currentUser.username.toLowerCase()) return;
        task.seenBy ||= [];
        if (task.seenBy.some(username => username.toLowerCase() === currentUser.username.toLowerCase())) return;
        showTaskNotification(task);
        task.seenBy.push(currentUser.username);
        changed = true;
      });
      if (changed) localStorage.setItem('orderhub_tasks', JSON.stringify(assignedTasks));
    }

    // --- 12. TÍNH LƯƠNG ---
    function payrollPeriodValue() {
      const monthSelect = document.getElementById('payrollMonth');
      const yearSelect = document.getElementById('payrollYear');
      const now = new Date();
      const monthNames = ['Tháng Một','Tháng Hai','Tháng Ba','Tháng Tư','Tháng Năm','Tháng Sáu','Tháng Bảy','Tháng Tám','Tháng Chín','Tháng Mười','Tháng Mười Một','Tháng Mười Hai'];
      if (!monthSelect.options.length) {
        monthSelect.innerHTML = monthNames.map((name, index) => `<option value="${String(index + 1).padStart(2,'0')}">${name}</option>`).join('');
        monthSelect.value = String(now.getMonth() + 1).padStart(2,'0');
      }
      if (!yearSelect.options.length) {
        const currentYear = now.getFullYear();
        for (let year = currentYear - 10; year <= currentYear + 1; year++) yearSelect.add(new Option(`Năm ${year}`, String(year)));
        yearSelect.value = String(currentYear);
      }
      return `${yearSelect.value}-${monthSelect.value}`;
    }

    function payrollEmployees() {
      if (currentUser.role === 'STAFF') return [currentUser];
      return users.filter(u => u.role !== 'ADMIN');
    }

    function employeeHourlyRate(employee) {
      if (!employee || employee.role === 'ADMIN') return 0;
      if (employee.role === 'MANAGER') return 40000;
      const rates = { 1: 20000, 2: 25000, 3: 30000 };
      return rates[Number(employee.rank)] || rates[2];
    }

    function employeePayGradeLabel(employee) {
      if (employee.role === 'MANAGER') return 'Quản lý · 40.000 đ/giờ';
      const rank = [1, 2, 3].includes(Number(employee.rank)) ? Number(employee.rank) : 2;
      return `Nhân viên bậc ${rank} · ${employeeHourlyRate(employee).toLocaleString('vi-VN')} đ/giờ`;
    }

    function getPayrollRecord(username, period) {
      payrollRecords[period] ||= {};
      payrollRecords[period][username] ||= {
        shifts: 0, baseSalary: null, completionPercent: 100,
        otherIncome: 0, latePenalty: 0, missingPenalty: 0,
        insurance: 500000, advance: 0, hold: 0
      };
      return payrollRecords[period][username];
    }

    function calculatePayroll(employee, period) {
      const record = getPayrollRecord(employee.username, period);
      const shifts = Math.max(0, Number(record.shifts) || 0);
      const allowanceRatio = Math.min(26, shifts) / 26;
      const hourlyRate = employeeHourlyRate(employee);
      const baseSalary = record.baseSalary === null || record.baseSalary === '' || record.baseSalary === undefined
        ? shifts * 8 * hourlyRate : Math.max(0, Number(record.baseSalary) || 0);
      const completionPercent = Math.min(100, Math.max(0, Number(record.completionPercent ?? 100) || 0));
      const deliveredRevenue = orders.filter(o => o.status === 'Giao thành công' && String(o.deliveredAt || o.date || '').slice(0, 7) === period && getOrderParticipants(o).includes(employee.name))
        .reduce((sum, o) => sum + getOrderRevenue(o, employee.name), 0);
      const revenueBonus = Math.round(deliveredRevenue * 0.015);
      const attendance = Math.round(200000 * allowanceRatio);
      const meal = Math.round(500000 * allowanceRatio);
      const otherIncome = Number(record.otherIncome) || 0;
      const latePenalty = Number(record.latePenalty) || 0;
      const missingPenalty = Number(record.missingPenalty) || 0;
      const insurance = Number(record.insurance) || 0;
      const advance = Number(record.advance) || 0;
      const hold = Number(record.hold) || 0;
      const net = Math.round(baseSalary * completionPercent / 100 + revenueBonus + attendance + meal + otherIncome - latePenalty - missingPenalty - insurance - advance - hold);
      return { employee, record, shifts, allowanceRatio, hourlyRate, deliveredRevenue, baseSalary, completionPercent, revenueBonus, attendance, meal, otherIncome, latePenalty, missingPenalty, insurance, advance, hold, net };
    }

    function payrollMoney(value) {
      return `${Math.round(Number(value) || 0).toLocaleString('vi-VN')} đ`;
    }

    function payrollEscape(value) {
      return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }

    function renderPayroll() {
      if (!currentUser || !['ADMIN', 'STAFF'].includes(currentUser.role)) return;
      const period = payrollPeriodValue();
      const admin = currentUser.role === 'ADMIN';
      document.getElementById('payrollAdminActions').classList.toggle('hidden', !admin);
      document.getElementById('payrollExports').classList.toggle('hidden', !admin);
      document.getElementById('payrollEmployeeFilterWrap').classList.toggle('hidden', !admin);
      document.getElementById('payrollMonthlyTotals').classList.toggle('hidden', !admin);
      const filter = document.getElementById('payrollEmployeeFilter');
      if (admin) {
        const previous = filter.value;
        filter.innerHTML = '<option value="ALL">Tất cả nhân viên</option>' + payrollEmployees().map(u => `<option value="${payrollEscape(u.username)}">${payrollEscape(u.name)}</option>`).join('');
        if ([...filter.options].some(option => option.value === previous)) filter.value = previous;
      }
      const refreshPeriod = () => { document.getElementById('payrollPreviewSummary').classList.add('hidden'); renderPayrollTable(); };
      document.getElementById('payrollMonth').onchange = refreshPeriod;
      document.getElementById('payrollYear').onchange = refreshPeriod;
      filter.onchange = () => renderPayrollTable();
      renderPayrollTable();
    }

    function renderPayrollTable() {
      if (!currentUser || !['ADMIN', 'STAFF'].includes(currentUser.role)) return;
      const period = payrollPeriodValue();
      const filter = document.getElementById('payrollEmployeeFilter');
      const selectedUsername = currentUser.role === 'ADMIN' && filter.value !== 'ALL' ? filter.value : null;
      const employees = payrollEmployees().filter(u => !selectedUsername || u.username === selectedUsername);
      const tbody = document.getElementById('payrollTableBody');
      const admin = currentUser.role === 'ADMIN';
      const monthlyTotals = document.getElementById('payrollMonthlyTotals');
      if (admin) {
        const allResults = payrollEmployees().map(employee => calculatePayroll(employee, period));
        const totalNet = allResults.reduce((sum, payroll) => sum + payroll.net, 0);
        document.getElementById('payrollMonthlyTotalAmount').innerText = payrollMoney(totalNet);
        document.getElementById('payrollMonthlyTotalEmployees').innerText = `${allResults.length} nhân viên · Kỳ ${period} · Tổng của toàn bộ nhân viên, không phụ thuộc bộ lọc bên dưới`;
        monthlyTotals.classList.remove('hidden');
      } else {
        monthlyTotals.classList.add('hidden');
      }
      const input = (username, field, value, opts = {}) => `<input type="number" ${opts.min !== undefined ? `min="${opts.min}"` : ''} ${opts.max !== undefined ? `max="${opts.max}"` : ''} step="${opts.step || '1'}" value="${payrollEscape(value)}" data-payroll-user="${payrollEscape(username)}" data-payroll-field="${field}" class="w-24 p-1.5 border border-slate-300 rounded text-right text-xs focus:ring-1 focus:ring-blue-500" />`;
      tbody.innerHTML = employees.map((employee, index) => {
        const p = calculatePayroll(employee, period);
        const r = p.record;
        const baseValue = r.baseSalary === null || r.baseSalary === '' || r.baseSalary === undefined ? p.shifts * 8 * p.hourlyRate : Number(r.baseSalary);
        const cells = admin
          ? `<td class="px-3 py-2">${input(employee.username,'shifts',p.shifts,{min:0})}</td>
             <td class="px-3 py-2">${Math.round(p.allowanceRatio * 100)}% <span class="text-slate-400">(${Math.min(26,p.shifts)}/26 ca)</span></td>
             <td class="px-3 py-2">${input(employee.username,'baseSalary',baseValue,{min:0})}</td>
             <td class="px-3 py-2">${input(employee.username,'completionPercent',p.completionPercent,{min:0,max:100})}%</td>
             <td class="px-3 py-2">${payrollMoney(p.deliveredRevenue)}</td><td class="px-3 py-2 font-semibold text-emerald-700">${payrollMoney(p.revenueBonus)}</td>
             <td class="px-3 py-2">${payrollMoney(p.attendance)}</td><td class="px-3 py-2">${payrollMoney(p.meal)}</td>
             <td class="px-3 py-2">${input(employee.username,'otherIncome',r.otherIncome,{min:0})}</td>
             <td class="px-3 py-2">${input(employee.username,'latePenalty',r.latePenalty,{min:0})}</td>
             <td class="px-3 py-2">${input(employee.username,'missingPenalty',r.missingPenalty,{min:0})}</td>
             <td class="px-3 py-2">${input(employee.username,'insurance',r.insurance,{min:0})}</td>
             <td class="px-3 py-2">${input(employee.username,'advance',r.advance,{min:0})}</td>
             <td class="px-3 py-2">${input(employee.username,'hold',r.hold,{min:0})}</td>`
          : `<td class="px-3 py-2">${p.shifts}</td><td class="px-3 py-2">${Math.round(p.allowanceRatio * 100)}% (${Math.min(26,p.shifts)}/26 ca)</td><td class="px-3 py-2">${payrollMoney(p.baseSalary)}</td><td class="px-3 py-2">${p.completionPercent}%</td><td class="px-3 py-2">${payrollMoney(p.deliveredRevenue)}</td><td class="px-3 py-2 text-emerald-700">${payrollMoney(p.revenueBonus)}</td><td class="px-3 py-2">${payrollMoney(p.attendance)}</td><td class="px-3 py-2">${payrollMoney(p.meal)}</td><td class="px-3 py-2">${payrollMoney(p.otherIncome)}</td><td class="px-3 py-2">${payrollMoney(p.latePenalty)}</td><td class="px-3 py-2">${payrollMoney(p.missingPenalty)}</td><td class="px-3 py-2">${payrollMoney(p.insurance)}</td><td class="px-3 py-2">${payrollMoney(p.advance)}</td><td class="px-3 py-2">${payrollMoney(p.hold)}</td>`;
        return `<tr class="${index % 2 ? 'bg-slate-50/70' : 'bg-white'}"><td class="px-3 py-2">${index + 1}</td><td class="px-3 py-2 font-semibold text-slate-800">${payrollEscape(employee.name)}<span class="block text-[10px] text-slate-400">${payrollEscape(employee.username)} · ${payrollEscape(employeePayGradeLabel(employee))}</span></td>${cells}<td class="px-3 py-2 font-bold ${p.net < 0 ? 'text-red-700' : 'text-blue-800'}">${payrollMoney(p.net)}</td></tr>`;
      }).join('');
      tbody.onchange = handlePayrollInput;
      if (!employees.length) tbody.innerHTML = '<tr><td colspan="17" class="p-6 text-center text-slate-400">Không có nhân viên trong danh sách.</td></tr>';
    }

    function refreshPayrollAfterOrderChange() {
      if (currentUser && ['ADMIN', 'STAFF'].includes(currentUser.role)) renderPayroll();
    }

    function handlePayrollInput(event) {
      const target = event.target;
      const username = target.dataset.payrollUser;
      const field = target.dataset.payrollField;
      if (!username || !field || currentUser.role !== 'ADMIN') return;
      const period = payrollPeriodValue();
      const record = getPayrollRecord(username, period);
      record[field] = Number(target.value) || 0;
      if (field === 'completionPercent') record.completionPercent = Math.min(100, Math.max(0, record.completionPercent));
      localStorage.setItem('orderhub_payroll', JSON.stringify(payrollRecords));
      document.getElementById('payrollPreviewSummary').classList.add('hidden');
      renderPayrollTable();
    }

    function savePayrollPeriod() {
      if (currentUser.role !== 'ADMIN') return;
      localStorage.setItem('orderhub_payroll', JSON.stringify(payrollRecords));
      alert('Đã lưu bảng lương kỳ ' + payrollPeriodValue() + ' trên trình duyệt này.');
    }

    function downloadPayrollTemplate() {
      if (currentUser.role !== 'ADMIN' || !window.XLSX) return alert('Không tải được thư viện Excel. Kiểm tra kết nối Internet.');
      const headers = ['Username','Số ca','Tỷ lệ hoàn thành (%)','Lương cứng (VNĐ)','Thu nhập khác (VNĐ)','Phạt đi trễ/về sớm (VNĐ)','Phạt thiếu/sót/mất đơn (VNĐ)','Khấu trừ bảo hiểm (VNĐ)','Ứng tiền (VNĐ)','Tạm giữ/đền bù (VNĐ)'];
      const sheet = XLSX.utils.aoa_to_sheet([headers]);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Lich va phu cap');
      XLSX.writeFile(book, 'MauNhapBangLuong.xlsx');
    }

    async function importPayrollSchedule(event) {
      if (currentUser.role !== 'ADMIN') return;
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (!window.XLSX) { alert('Không tải được thư viện Excel. Kiểm tra kết nối Internet.'); return; }
      try {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
        const period = payrollPeriodValue();
        let imported = 0;
        for (const row of rows) {
          const username = String(row.Username || row.username || '').trim();
          const employee = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.role !== 'ADMIN');
          if (!employee) continue;
          const record = getPayrollRecord(employee.username, period);
          const read = (...keys) => { for (const key of keys) if (row[key] !== undefined && row[key] !== '') return Number(row[key]); return undefined; };
          const values = {
            shifts: read('Số ca','So ca'),
            completionPercent: read('Tỷ lệ hoàn thành (%)','Ty le hoan thanh (%)'), baseSalary: read('Lương cứng (VNĐ)','Luong cung (VND)'),
            otherIncome: read('Thu nhập khác (VNĐ)','Thu nhap khac (VND)'), latePenalty: read('Phạt đi trễ/về sớm (VNĐ)','Phat di tre/ve som (VND)'),
            missingPenalty: read('Phạt thiếu/sót/mất đơn (VNĐ)','Phat thieu/sot/mat don (VND)'), insurance: read('Khấu trừ bảo hiểm (VNĐ)','Khau tru bao hiem (VND)'),
            advance: read('Ứng tiền (VNĐ)','Ung tien (VND)'), hold: read('Tạm giữ/đền bù (VNĐ)','Tam giu/den bu (VND)')
          };
          for (const [key, value] of Object.entries(values)) if (value !== undefined && Number.isFinite(value)) record[key] = value;
          imported++;
        }
        localStorage.setItem('orderhub_payroll', JSON.stringify(payrollRecords));
        renderPayrollTable();
        alert(`Đã nhập dữ liệu lịch/ca cho ${imported} nhân viên vào kỳ ${period}.`);
      } catch (error) {
        alert('Không đọc được tệp Excel. Hãy dùng mẫu OrderHub đã tải xuống.');
      } finally { event.target.value = ''; }
    }

    function getPayrollExportRows(scope) {
      if (currentUser.role !== 'ADMIN') return [];
      const period = payrollPeriodValue();
      const selected = document.getElementById('payrollEmployeeFilter').value;
      const employees = payrollEmployees().filter(u => scope === 'all' || selected === 'ALL' || u.username === selected);
      return employees.map((employee, index) => {
        const p = calculatePayroll(employee, period);
        return {
          'STT': index + 1, 'Username': employee.username, 'Tên nhân viên': employee.name,
          'Bậc / Vai trò': employeePayGradeLabel(employee), 'Đơn giá giờ (VNĐ)': p.hourlyRate,
          'Số ca làm việc': p.shifts, 'Tỷ lệ chuyên cần/ăn ca (%)': Math.round(p.allowanceRatio * 100),
          'Doanh thu giao thành công (VNĐ)': p.deliveredRevenue, 'Lương cứng (VNĐ)': p.baseSalary,
          'Tỷ lệ hoàn thành (%)': p.completionPercent, 'Thưởng doanh thu 1,5% (VNĐ)': p.revenueBonus,
          'Chuyên cần (VNĐ)': p.attendance, 'Ăn ca (VNĐ)': p.meal, 'Thu nhập khác (VNĐ)': p.otherIncome,
          'Phạt đi trễ/về sớm (VNĐ)': p.latePenalty, 'Phạt thiếu/sót/mất đơn (VNĐ)': p.missingPenalty,
          'Khấu trừ bảo hiểm (VNĐ)': p.insurance, 'Ứng tiền (VNĐ)': p.advance,
          'Tạm giữ/đền bù (VNĐ)': p.hold, 'Thực nhận (VNĐ)': p.net
        };
      });
    }

    function previewPayroll() {
      if (currentUser.role !== 'ADMIN') return;
      const rows = getPayrollExportRows('selected');
      const summary = document.getElementById('payrollPreviewSummary');
      const totalShifts = rows.reduce((sum, row) => sum + row['Số ca làm việc'], 0);
      const totalBonus = rows.reduce((sum, row) => sum + row['Thưởng doanh thu 1,5% (VNĐ)'], 0);
      const totalNet = rows.reduce((sum, row) => sum + row['Thực nhận (VNĐ)'], 0);
      summary.innerHTML = [['Nhân viên',rows.length],['Tổng số ca',totalShifts],['Tổng thưởng doanh thu',payrollMoney(totalBonus)],['Tổng thực nhận',payrollMoney(totalNet)]].map(([label,value])=>`<div class="rounded-lg bg-slate-50 border border-slate-200 p-3"><div class="text-[10px] text-slate-500">${label}</div><strong class="block mt-1 text-sm text-slate-800">${value}</strong></div>`).join('');
      summary.classList.remove('hidden');
      summary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function exportPayrollExcel(scope) {
      if (currentUser.role !== 'ADMIN') return;
      if (!window.XLSX) return alert('Không tải được thư viện Excel. Kiểm tra kết nối Internet.');
      const rows = getPayrollExportRows(scope);
      if (!rows.length) return alert('Không có nhân viên để xuất.');
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Bang luong');
      XLSX.writeFile(book, `BangLuong_${payrollPeriodValue()}_${scope === 'all' ? 'ToanBo' : 'NhanVien'}.xlsx`);
    }

    function exportPayrollPDF(scope) {
      if (currentUser.role !== 'ADMIN') return;
      if (!window.jspdf || !window.jspdf.jsPDF) return alert('Không tải được thư viện PDF. Kiểm tra kết nối Internet.');
      const rows = getPayrollExportRows(scope);
      if (!rows.length) return alert('Không có nhân viên để xuất.');
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
      const pdfText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
      doc.setFontSize(14);
      doc.text(pdfText(`BANG LUONG NHAN VIEN - ${payrollPeriodValue()}`), 14, 14);
      doc.autoTable({
        startY: 20,
        head: [Object.keys(rows[0]).map(pdfText)],
        body: rows.map(row => Object.values(row).map(value => pdfText(typeof value === 'number' ? value.toLocaleString('vi-VN') : value))),
        styles: { fontSize: 6, cellPadding: 1.5 },
        headStyles: { fillColor: [30, 60, 114] },
        horizontalPageBreak: true
      });
      doc.save(`BangLuong_${payrollPeriodValue()}_${scope === 'all' ? 'ToanBo' : 'NhanVien'}.pdf`);
    }

    // --- 12. CHUYỂN TAB ---
    function switchTab(tabName) {
      if (tabName === 'payroll' && !['ADMIN', 'STAFF'].includes(currentUser?.role)) return alert('Tài khoản này không có quyền xem mục Thu nhập.');
      if (tabName === 'employee' && !['ADMIN', 'STAFF', 'MANAGER'].includes(currentUser?.role)) return alert('Tài khoản này không có quyền xem thông tin nhân viên.');
      if (tabName === 'tasks' && !['ADMIN', 'STAFF', 'MANAGER'].includes(currentUser?.role)) return alert('Tài khoản này không có quyền xem mục Giao việc.');
      if (['STAFF', 'MANAGER'].includes(currentUser?.role) && !isEmployeeProfileComplete(currentUser) && tabName !== 'employee') {
        return alert('Vui lòng hoàn tất thông tin nhân viên trước khi sử dụng các chức năng khác.');
      }
      document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('[id^="tabBtn-"]').forEach(el => {
        el.className = "py-2.5 px-4 font-semibold text-sm border-b-2 border-transparent text-slate-500 hover:text-slate-800 whitespace-nowrap";
      });

      document.getElementById(`tabContent-${tabName}`).classList.remove('hidden');
      document.getElementById(`tabBtn-${tabName}`).className = "py-2.5 px-4 font-semibold text-sm border-b-2 border-blue-600 text-blue-600 whitespace-nowrap";

      applyRoleTabVisibility();

      if (tabName === 'charts') {
        renderCharts();
      }
      if (tabName === 'payroll') renderPayroll();
      if (tabName === 'employee') renderEmployeeInfo();
      if (tabName === 'tasks') renderTaskTab();
    }
  
