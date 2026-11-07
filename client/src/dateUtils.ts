const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function todayIsoVn(date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatDateVn(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, year, month, day] = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)!;
    return `${day}/${month}/${year.slice(-2)}`;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date);
}

export function formatDateTimeVn(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
