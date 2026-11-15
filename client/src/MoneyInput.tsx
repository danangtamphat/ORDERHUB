import type { InputHTMLAttributes } from 'react';

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: string | number | null | undefined;
  onValueChange: (value: string) => void;
};

export default function MoneyInput({ value, onValueChange, ...props }: MoneyInputProps) {
  const digits = value == null ? '' : String(value).replace(/\D/g, '');
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return <input {...props} type="text" inputMode="numeric" value={formatted} onChange={event => onValueChange(event.target.value.replace(/\D/g, ''))}/>;
}
