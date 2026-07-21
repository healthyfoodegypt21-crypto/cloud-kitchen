import { beforeEach, describe, expect, it } from 'vitest';
import {
  addAdvance, addBonus, addDeduction, advanceDueForMonth, calculatePayroll, computeAttendanceHours, countFridays,
  daysInMonth, DuplicateAttendanceError, getAdvances, getEmployees, normalizeEmployee, repayAdvance, seedLocalHrData,
  timeToMinutes, upsertAttendance, upsertEmployee, type HrAttendance, type HrEmployee,
} from '@/store/hr';

function buildEmployee(overrides: Partial<HrEmployee> = {}): HrEmployee {
  return normalizeEmployee({
    full_name: 'موظف اختبار',
    job_title: 'وظيفة',
    base_salary: 6000,
    daily_work_hours: 8,
    scheduled_check_in: '09:00',
    scheduled_check_out: '17:00',
    ...overrides,
  });
}

describe('hr store — date helpers', () => {
  it('counts days and Fridays in a month', () => {
    expect(daysInMonth(2025, 1)).toBe(31);
    expect(daysInMonth(2024, 2)).toBe(29); // leap year
    // January 2025 has Fridays on 3,10,17,24,31 -> 5
    expect(countFridays(2025, 1)).toBe(5);
  });

  it('parses HH:MM to minutes and rejects invalid input', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('')).toBeNull();
    expect(timeToMinutes('25:00')).toBeNull();
  });
});

describe('hr store — attendance calculation', () => {
  const employee = buildEmployee();

  it('applies the grace period before counting late hours', () => {
    const onTime = computeAttendanceHours({ check_in: '09:10', check_out: '17:00', status: 'present' }, employee, { grace_period_minutes: 15 });
    expect(onTime.late_hours).toBe(0);
    const late = computeAttendanceHours({ check_in: '09:45', check_out: '17:00', status: 'present' }, employee, { grace_period_minutes: 15 });
    expect(late.late_hours).toBe(0.5); // 45 - 15 grace = 30 min
  });

  it('computes overtime beyond the scheduled span', () => {
    const record = computeAttendanceHours({ check_in: '09:00', check_out: '19:00', status: 'present' }, employee, { grace_period_minutes: 15 });
    expect(record.work_hours).toBe(10);
    expect(record.overtime_hours).toBe(2); // scheduled span is 8h
  });

  it('returns zeros for non-working statuses', () => {
    const record = computeAttendanceHours({ check_in: '09:00', check_out: '17:00', status: 'annual_leave' }, employee);
    expect(record).toEqual({ work_hours: 0, late_hours: 0, overtime_hours: 0 });
  });
});

describe('hr store — attendance persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('prevents duplicate attendance for the same employee and day', () => {
    const employee = buildEmployee();
    upsertEmployee(employee);
    upsertAttendance({ employee_id: employee.id, date: '2025-01-05', check_in: '09:00', check_out: '17:00', status: 'present' }, employee);
    expect(() => upsertAttendance({ employee_id: employee.id, date: '2025-01-05', check_in: '10:00', check_out: '18:00', status: 'present' }, employee)).toThrow(DuplicateAttendanceError);
  });
});

describe('hr store — advances', () => {
  beforeEach(() => window.localStorage.clear());

  it('tracks repayment and monthly installment due', () => {
    addAdvance({ employee_id: 'emp-1', date: '2025-01-10', amount: 3000, reason: 'test', repayment_method: 'installments', installments: 3, notes: '', created_by: 'tester' });
    const advance = getAdvances()[0];
    expect(advanceDueForMonth(advance, 2025, 1)).toBe(1000);
    // not yet started in December 2024
    expect(advanceDueForMonth(advance, 2024, 12)).toBe(0);

    repayAdvance(advance.id, 1000);
    const updated = getAdvances()[0];
    expect(updated.repaid_amount).toBe(1000);
    expect(advanceDueForMonth(updated, 2025, 2)).toBe(1000);
  });

  it('collects the full remaining amount for one-time advances', () => {
    addAdvance({ employee_id: 'emp-2', date: '2025-01-01', amount: 2000, reason: 'test', repayment_method: 'one_time', installments: null, notes: '', created_by: 'tester' });
    const advance = getAdvances()[0];
    expect(advanceDueForMonth(advance, 2025, 1)).toBe(2000);
  });
});

describe('hr store — payroll', () => {
  beforeEach(() => window.localStorage.clear());

  it('computes net salary from all components', () => {
    const employee = buildEmployee({ base_salary: 6200 }); // 6200 / 31 expected days = 200/day when no holidays/fridays subtracted... adjusted below
    const attendance: HrAttendance[] = [
      { id: 'a1', employee_id: employee.id, date: '2025-01-06', check_in: '09:00', check_out: '17:00', status: 'present', work_hours: 8, late_hours: 0, overtime_hours: 0, notes: '', created_by: '', created_at: '' },
      { id: 'a2', employee_id: employee.id, date: '2025-01-07', check_in: '', check_out: '', status: 'absent', work_hours: 0, late_hours: 0, overtime_hours: 0, notes: '', created_by: '', created_at: '' },
    ];
    addBonus({ employee_id: employee.id, date: '2025-01-15', amount: 500, reason: 'bonus', notes: '', created_by: 't' });
    addDeduction({ employee_id: employee.id, date: '2025-01-16', amount: 200, reason: 'late', notes: '', created_by: 't' });

    const result = calculatePayroll({
      employee, year: 2025, month: 1, attendance,
      advances: [], deductions: [{ id: 'd1', employee_id: employee.id, date: '2025-01-16', amount: 200, reason: 'late', notes: '', created_by: 't', created_at: '' }],
      bonuses: [{ id: 'b1', employee_id: employee.id, date: '2025-01-15', amount: 500, reason: 'bonus', notes: '', created_by: 't', created_at: '' }],
      officialHolidays: 0,
    });

    // January 2025: 31 days, 5 Fridays, 0 holidays -> 26 expected work days
    expect(result.expectedWorkDays).toBe(26);
    expect(result.actualWorkDays).toBe(1);
    expect(result.absentDays).toBe(1);
    expect(result.totalBonuses).toBe(500);
    expect(result.totalDeductions).toBe(200);
    const dailyRate = Math.round((6200 / 26) * 100) / 100;
    const expectedNet = Math.round((6200 + 0 + 500 - 200 - 0 - dailyRate - 0) * 100) / 100;
    expect(result.netSalary).toBe(expectedNet);
  });
});

describe('hr store — seed', () => {
  beforeEach(() => window.localStorage.clear());

  it('seeds demo employees only once', () => {
    seedLocalHrData();
    const first = getEmployees().length;
    expect(first).toBeGreaterThan(0);
    seedLocalHrData();
    expect(getEmployees()).toHaveLength(first);
  });
});
