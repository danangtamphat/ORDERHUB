import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDateVn } from './dateUtils';

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  required?: boolean;
  readOnly?: boolean;
};

function parseDisplayDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = match[3].length === 2 ? 2000 + rawYear : rawYear;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function DateInput({ value, onChange, className, ariaLabel = 'Ngày tháng năm', required, readOnly }: Props) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(formatDateVn(value));

  useEffect(() => setDraft(formatDateVn(value)), [value]);

  const openPicker = () => {
    const input = nativeRef.current;
    if (!input || readOnly) return;
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };

  return <span className={`date-input-control${className ? ` ${className}` : ''}`}>
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      placeholder="DD/MM/YY"
      value={draft}
      required={required}
      readOnly={readOnly}
      onChange={event => {
        const next = event.target.value;
        setDraft(next);
        if (!next.trim()) onChange('');
        else {
          const parsed = parseDisplayDate(next);
          if (parsed) onChange(parsed);
        }
      }}
      onBlur={() => {
        if (draft && !parseDisplayDate(draft)) setDraft(formatDateVn(value));
      }}
    />
    {!readOnly && <button type="button" className="date-input-picker" aria-label="Mở lịch chọn ngày" onClick={openPicker}><CalendarDays size={16}/></button>}
    <input ref={nativeRef} className="date-input-native" type="date" value={value} onChange={event => onChange(event.target.value)} tabIndex={-1} aria-hidden="true" />
  </span>;
}
