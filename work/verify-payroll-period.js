const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('outputs/OrderHub-ban-dung-thu.html', 'utf8');
const match = html.match(/function payrollPeriodValue\(\) \{[\s\S]*?\n    \}/);
if (!match) throw new Error('payrollPeriodValue missing');
function select() {
  return {
    options: [], _value: '',
    get value() { return this._value; },
    set value(value) { this._value = String(value); },
    set innerHTML(source) {
      this.options = [...source.matchAll(/<option value="([^"]+)">/g)].map(m => ({ value: m[1] }));
      if (this.options.length) this._value = this.options[0].value;
    },
    add(option) { this.options.push(option); if (this.options.length === 1) this._value = option.value; }
  };
}
const month = select();
const year = select();
const context = {
  document: { getElementById: id => id === 'payrollMonth' ? month : year },
  Date,
  Option: function(text, value) { return { text, value }; }
};
vm.runInNewContext(match[0], context);
const actual = context.payrollPeriodValue();
const now = new Date();
const expected = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
console.log('Default payroll period check OK:', actual);
