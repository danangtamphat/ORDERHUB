
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
    let currentUser = JSON.parse(sessionStorage.getItem('orderhub_current_user')) || null;
    let chartInstances = {};

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
      document.getElementById('loginView').classList.add('hidden');
      document.getElementById('mainApp').classList.remove('hidden');
      document.getElementById('mainApp').classList.add('flex');

      // Cập nhật Header
      document.getElementById('userDisplayName').innerText = currentUser.name;
      const badge = document.getElementById('userRoleBadge');
      badge.innerText = currentUser.role;
      if (currentUser.role === 'ADMIN') badge.className = 'inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white uppercase';
      else if (currentUser.role === 'MANAGER') badge.className = 'inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white uppercase';
      else badge.className = 'inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500 text-white uppercase';

      // Ẩn/hiện Tab Người dùng theo phân quyền
      if (currentUser.role === 'STAFF') {
        document.getElementById('tabBtn-users').classList.add('hidden');
      } else {
        document.getElementById('tabBtn-users').classList.remove('hidden');
      }

      // Khởi tạo giao diện
      updateDashboardStats();
      renderOrdersTable();
      populateReportStaffDropdown();
      renderUsersTable();
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

      // Tìm trùng lặp toàn database
      const codeCounts = {};
      orders.forEach(o => {
        const cleanCode = o.code.trim().toUpperCase();
        codeCounts[cleanCode] = (codeCounts[cleanCode] || 0) + 1;
      });

      const filtered = userOrders.filter(o => {
        const matchSearch = o.code.toLowerCase().includes(searchVal) || o.staffName.toLowerCase().includes(searchVal);
        const matchStatus = filterStatus === 'ALL' || o.status === filterStatus;
        return matchSearch && matchStatus;
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
          orders[idx] = { ...orders[idx], staffName, code, value: val, status, invoiceStatus, sharedWith: sharedWithList };
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
          sharedWith: sharedWithList
        };
        orders.unshift(newOrder);
      }

      localStorage.setItem('orderhub_orders', JSON.stringify(orders));
      closeOrderModal();
      updateDashboardStats();
      renderOrdersTable();
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
      select.innerHTML = '<option value="ALL">Tất cả nhân viên</option>';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.name;
        opt.innerText = u.name;
        select.appendChild(opt);
      });
    }

    function getFilteredReportData() {
      let base = getFilteredOrdersForRole();
      const startDate = document.getElementById('reportStartDate').value;
      const endDate = document.getElementById('reportEndDate').value;
      const status = document.getElementById('reportStatus').value;
      const staff = document.getElementById('reportStaff').value;

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
      if (currentUser.role === 'STAFF') return getOrderRevenue(order, currentUser.name);
      if (selectedStaff !== 'ALL') return getOrderRevenue(order, selectedStaff);
      return getOrderRevenue(order, order.staffName);
    }

    function getReportTotalValue(data) {
      const selectedStaff = document.getElementById('reportStaff').value;
      if (currentUser.role === 'STAFF') return data.reduce((sum, order) => sum + getOrderRevenue(order, currentUser.name), 0);
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
        const beneficiaries = currentUser.role === 'STAFF' ? [currentUser.name]
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

    // --- 10. QUẢN LÝ NGƯỜI DÙNG (ADMIN) ---
    function renderUsersTable() {
      const tbody = document.getElementById('usersTableBody');
      tbody.innerHTML = '';

      users.forEach(u => {
        let roleBadge = '';
        if (u.role === 'ADMIN') roleBadge = '<span class="px-2 py-0.5 text-xs font-bold rounded bg-red-100 text-red-700">ADMIN</span>';
        else if (u.role === 'MANAGER') roleBadge = '<span class="px-2 py-0.5 text-xs font-bold rounded bg-amber-100 text-amber-700">MANAGER</span>';
        else roleBadge = '<span class="px-2 py-0.5 text-xs font-bold rounded bg-blue-100 text-blue-700">STAFF</span>';

        let permText = u.role === 'ADMIN' ? 'Toàn quyền hệ thống' : u.role === 'MANAGER' ? 'Quản lý toàn bộ đơn, không thể xóa' : 'Xem/Sửa/Xóa đơn của chính mình';

        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-slate-50';
        tr.innerHTML = `
          <td class="px-4 py-3 font-semibold text-slate-800">${u.username}</td>
          <td class="px-4 py-3">${u.name}</td>
          <td class="px-4 py-3 text-xs">${u.email || '<span class="text-amber-700">Chưa cài đặt</span>'} ${currentUser.role === 'ADMIN' ? `<button type="button" class="text-blue-700 ml-2" onclick="setUserRecoveryEmail('${u.username}')">${u.email ? 'Sửa' : 'Thêm email'}</button>` : ''}</td>
          <td class="px-4 py-3">${roleBadge}</td>
          <td class="px-4 py-3 text-xs text-slate-500">${permText}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    function openUserModal() {
      if (currentUser.role !== 'ADMIN') {
        alert("❌ Chỉ có tài khoản Admin mới có quyền tạo tài khoản người dùng!");
        return;
      }
      document.getElementById('userModal').classList.remove('hidden');
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

      users.push({ username, password, name, email, role });
      localStorage.setItem('orderhub_users', JSON.stringify(users));
      closeUserModal();
      renderUsersTable();
      populateReportStaffDropdown();
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

    // --- 11. CHUYỂN TAB ---
    function switchTab(tabName) {
      document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('[id^="tabBtn-"]').forEach(el => {
        el.className = "py-2.5 px-4 font-semibold text-sm border-b-2 border-transparent text-slate-500 hover:text-slate-800 whitespace-nowrap";
      });

      document.getElementById(`tabContent-${tabName}`).classList.remove('hidden');
      document.getElementById(`tabBtn-${tabName}`).className = "py-2.5 px-4 font-semibold text-sm border-b-2 border-blue-600 text-blue-600 whitespace-nowrap";

      if (tabName === 'charts') {
        renderCharts();
      }
    }
  
