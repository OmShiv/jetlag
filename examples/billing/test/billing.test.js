import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatTotal,
  isDueToday,
  nextBillingDate,
  nextStatementKey,
  renewalDate,
  sameTimeTomorrow,
  statementYear,
  utcOffsetLabel,
} from '../src/billing.js';

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

test('an invoice due today is due', () => {
  assert.equal(isDueToday({ dueDate: localDate(new Date()) }), true);
});

test('a reminder for tomorrow keeps the same time', () => {
  const now = new Date();
  assert.equal(sameTimeTomorrow(now).getHours(), now.getHours());
});

test('monthly billing lands in the next month', () => {
  const today = new Date();
  assert.equal(nextBillingDate(today).getMonth(), (today.getMonth() + 1) % 12);
});

test('a yearly plan renews in the same month', () => {
  const today = new Date();
  assert.equal(renewalDate(today).getMonth(), today.getMonth());
});

test('the next statement key is a real month', () => {
  const month = Number(nextStatementKey().split('-')[1]);
  assert.ok(month >= 1 && month <= 12, `month ${month}`);
});

test('the offset label matches the clock', () => {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const expected = `UTC${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
  assert.equal(utcOffsetLabel(), expected);
});

test('totals use a thousands separator', () => {
  assert.equal(formatTotal(1234.5), '1,234.50');
});

test('the statement year is this year', () => {
  assert.equal(statementYear(), String(new Date().getFullYear()));
});
