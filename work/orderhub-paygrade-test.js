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
const tests = [
 [{role:'STAFF',rank:1},20000],
 [{role:'STAFF',rank:2},25000],
 [{role:'STAFF',rank:3},30000],
 [{role:'MANAGER'},40000],
 [{role:'STAFF'},25000],
];
for(const [user,expected] of tests) { const actual=employeeHourlyRate(user); if(actual!==expected) throw new Error(`${JSON.stringify(user)} expected ${expected}, got ${actual}`); }
console.log(`Pay grade rates passed: ${tests.length} cases`);
