const users = [{name:'Owner',role:'STAFF'},{name:'Staff B',role:'STAFF'},{name:'Staff C',role:'STAFF'},{name:'Admin',role:'ADMIN'}];    function getOrderParticipants(order) {
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

const order={value:300001,staffName:'Owner',sharedWith:['Owner','Staff B','Staff C']};
const shares=getOrderParticipants(order).map(name=>getOrderRevenue(order,name));
if(shares.join(',')!=='100001,100000,100000'||shares.reduce((a,b)=>a+b,0)!==order.value)throw new Error('Split allocation check failed: '+shares);
const adminOrder={value:90000,staffName:'Owner',sharedWith:['Owner','Admin']};
if(getOrderParticipants(adminOrder).includes('Admin'))throw new Error('Admin was incorrectly included as a revenue recipient.');
console.log('Revenue split check passed:',shares.join(' + '),'=',shares.reduce((a,b)=>a+b,0));
