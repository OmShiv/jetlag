// A small billing module. Every function here passes its tests on the laptop
// it was written on. Run `npx github:OmShiv/jetlag npm test` to see where they don't.

export function isDueToday(invoice, now = new Date()) {
  return invoice.dueDate === now.toISOString().slice(0, 10);
}

export function sameTimeTomorrow(date) {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

export function nextBillingDate(date) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}

export function renewalDate(date) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + 1);
  return next;
}

export function nextStatementKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 2).padStart(2, '0')}`;
}

export function utcOffsetLabel(date = new Date()) {
  const hours = Math.trunc(-date.getTimezoneOffset() / 60);
  return `UTC${hours < 0 ? '-' : '+'}${String(Math.abs(hours)).padStart(2, '0')}:00`;
}

export function formatTotal(amount) {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2 });
}

export function statementYear(date = new Date()) {
  return date.toLocaleDateString(undefined, { year: 'numeric' });
}
