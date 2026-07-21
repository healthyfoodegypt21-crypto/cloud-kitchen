// Local-first Human Resources store.
// Mirrors the pattern used by src/store/inventory.ts: pure helpers + localStorage
// persistence so the module works fully offline and is easy to unit-test.

export type EmployeeStatus = 'working' | 'leave' | 'suspended' | 'resigned';
export type AttendanceStatus = 'present' | 'absent' | 'annual_leave' | 'sick_leave' | 'mission';
export type RepaymentMethod = 'one_time' | 'installments' | 'salary_deduction';

export interface HrDocument {
  name: string;
  note: string;
}

export interface HrEmployee {
  id: string;
  employee_code: string;
  full_name: string;
  job_title: string;
  department: string;
  branch: string;
  hire_date: string;
  status: EmployeeStatus;
  manager_name: string;
  // Financial
  base_salary: number;
  hourly_rate: number;
  overtime_hourly_rate: number;
  daily_work_hours: number;
  weekly_work_days: number;
  scheduled_check_in: string;
  scheduled_check_out: string;
  // Personal
  phone: string;
  national_id: string;
  address: string;
  birth_date: string;
  emergency_contact: string;
  // Documents (metadata only in local mode)
  documents: HrDocument[];
  notes: string;
  created_at: string;
  updated_at: string;
}

export type HrEmployeeInput = Partial<HrEmployee> & { full_name: string; job_title: string };

export interface HrAdvance {
  id: string;
  employee_id: string;
  date: string;
  amount: number;
  reason: string;
  repayment_method: RepaymentMethod;
  installments: number | null;
  repaid_amount: number;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface HrDeduction {
  id: string;
  employee_id: string;
  date: string;
  amount: number;
  reason: string;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface HrBonus {
  id: string;
  employee_id: string;
  date: string;
  amount: number;
  reason: string;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface HrAttendance {
  id: string;
  employee_id: string;
  date: string;
  check_in: string;
  check_out: string;
  status: AttendanceStatus;
  work_hours: number;
  late_hours: number;
  overtime_hours: number;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface HrSettings {
  grace_period_minutes: number;
}

export interface HrAuditEntry {
  id: string;
  user: string;
  timestamp: string;
  action: string;
  entity: string;
  old_data: string;
  new_data: string;
}

export interface PayrollResult {
  employeeId: string;
  employeeName: string;
  jobTitle: string;
  year: number;
  month: number;
  baseSalary: number;
  hourlyRate: number;
  overtimeRate: number;
  dailyRate: number;
  daysInMonth: number;
  fridaysCount: number;
  officialHolidays: number;
  expectedWorkDays: number;
  actualWorkDays: number;
  absentDays: number;
  absenceValue: number;
  lateHours: number;
  lateValue: number;
  overtimeHours: number;
  overtimeValue: number;
  totalBonuses: number;
  totalDeductions: number;
  advancesDue: number;
  netSalary: number;
}

const EMPLOYEES_KEY = 'cloud-kitchen.hr.employees';
const ADVANCES_KEY = 'cloud-kitchen.hr.advances';
const DEDUCTIONS_KEY = 'cloud-kitchen.hr.deductions';
const BONUSES_KEY = 'cloud-kitchen.hr.bonuses';
const ATTENDANCE_KEY = 'cloud-kitchen.hr.attendance';
const SETTINGS_KEY = 'cloud-kitchen.hr.settings';
const LOCKED_MONTHS_KEY = 'cloud-kitchen.hr.locked-months';
const AUDIT_KEY = 'cloud-kitchen.hr.audit';
const SEED_FLAG_KEY = 'cloud-kitchen.hr.seeded';

const DEFAULT_SETTINGS: HrSettings = { grace_period_minutes: 15 };

function hasWindow() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readList<T>(key: string): T[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, value: T[]): T[] {
  if (hasWindow()) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
  return value;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ----- date helpers ------------------------------------------------------

export function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function countFridays(year: number, month: number) {
  const total = daysInMonth(year, month);
  let count = 0;
  for (let day = 1; day <= total; day += 1) {
    if (new Date(year, month - 1, day).getDay() === 5) count += 1;
  }
  return count;
}

export function timeToMinutes(value: string): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// ----- attendance calculation -------------------------------------------

export interface AttendanceHours {
  work_hours: number;
  late_hours: number;
  overtime_hours: number;
}

export function computeAttendanceHours(
  record: { check_in: string; check_out: string; status: AttendanceStatus },
  employee: Pick<HrEmployee, 'scheduled_check_in' | 'scheduled_check_out' | 'daily_work_hours'>,
  settings: HrSettings = DEFAULT_SETTINGS,
): AttendanceHours {
  const empty: AttendanceHours = { work_hours: 0, late_hours: 0, overtime_hours: 0 };
  if (record.status !== 'present' && record.status !== 'mission') return empty;

  const checkIn = timeToMinutes(record.check_in);
  const checkOut = timeToMinutes(record.check_out);
  if (checkIn === null || checkOut === null) return empty;

  let workedMinutes = checkOut - checkIn;
  if (workedMinutes < 0) workedMinutes += 24 * 60; // overnight shift
  const workHours = round2(workedMinutes / 60);

  const scheduledIn = timeToMinutes(employee.scheduled_check_in);
  const scheduledOut = timeToMinutes(employee.scheduled_check_out);
  const grace = Math.max(0, settings.grace_period_minutes ?? 0);

  let lateMinutes = 0;
  if (scheduledIn !== null) {
    lateMinutes = Math.max(0, checkIn - scheduledIn - grace);
  }

  let expectedMinutes = (employee.daily_work_hours || 0) * 60;
  if (scheduledIn !== null && scheduledOut !== null) {
    let scheduledSpan = scheduledOut - scheduledIn;
    if (scheduledSpan < 0) scheduledSpan += 24 * 60;
    if (scheduledSpan > 0) expectedMinutes = scheduledSpan;
  }
  const overtimeMinutes = expectedMinutes > 0 ? Math.max(0, workedMinutes - expectedMinutes) : 0;

  return {
    work_hours: workHours,
    late_hours: round2(lateMinutes / 60),
    overtime_hours: round2(overtimeMinutes / 60),
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

// ----- settings ----------------------------------------------------------

export function getHrSettings(): HrSettings {
  if (!hasWindow()) return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<HrSettings>;
    return { grace_period_minutes: toNumber(parsed.grace_period_minutes, DEFAULT_SETTINGS.grace_period_minutes) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveHrSettings(settings: HrSettings): HrSettings {
  const next: HrSettings = { grace_period_minutes: Math.max(0, toNumber(settings.grace_period_minutes, 15)) };
  if (hasWindow()) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// ----- audit log ---------------------------------------------------------

export function getAuditLog(): HrAuditEntry[] {
  return readList<HrAuditEntry>(AUDIT_KEY).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function appendAudit(entry: { user: string; action: string; entity: string; oldData?: unknown; newData?: unknown }): HrAuditEntry {
  const record: HrAuditEntry = {
    id: createId('aud'),
    user: entry.user || 'مستخدم غير معروف',
    timestamp: nowIso(),
    action: entry.action,
    entity: entry.entity,
    old_data: entry.oldData === undefined ? '' : JSON.stringify(entry.oldData),
    new_data: entry.newData === undefined ? '' : JSON.stringify(entry.newData),
  };
  const all = readList<HrAuditEntry>(AUDIT_KEY);
  all.push(record);
  // keep the log bounded
  writeList(AUDIT_KEY, all.slice(-500));
  return record;
}

// ----- employees ---------------------------------------------------------

export function normalizeEmployee(input: HrEmployeeInput): HrEmployee {
  const timestamp = nowIso();
  return {
    id: input.id ?? createId('emp'),
    employee_code: (input.employee_code ?? '').trim() || `EMP-${Date.now().toString().slice(-6)}`,
    full_name: input.full_name.trim(),
    job_title: input.job_title.trim(),
    department: (input.department ?? '').trim(),
    branch: (input.branch ?? '').trim(),
    hire_date: input.hire_date ?? '',
    status: input.status ?? 'working',
    manager_name: (input.manager_name ?? '').trim(),
    base_salary: toNumber(input.base_salary),
    hourly_rate: toNumber(input.hourly_rate),
    overtime_hourly_rate: toNumber(input.overtime_hourly_rate),
    daily_work_hours: toNumber(input.daily_work_hours, 8),
    weekly_work_days: toNumber(input.weekly_work_days, 6),
    scheduled_check_in: (input.scheduled_check_in ?? '').trim(),
    scheduled_check_out: (input.scheduled_check_out ?? '').trim(),
    phone: (input.phone ?? '').trim(),
    national_id: (input.national_id ?? '').trim(),
    address: (input.address ?? '').trim(),
    birth_date: input.birth_date ?? '',
    emergency_contact: (input.emergency_contact ?? '').trim(),
    documents: Array.isArray(input.documents) ? input.documents : [],
    notes: (input.notes ?? '').trim(),
    created_at: input.created_at ?? timestamp,
    updated_at: timestamp,
  };
}

export function getEmployees(): HrEmployee[] {
  return readList<HrEmployee>(EMPLOYEES_KEY).map((row) => normalizeEmployee(row)).sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'));
}

export function upsertEmployee(input: HrEmployeeInput): HrEmployee[] {
  const record = normalizeEmployee(input);
  const all = readList<HrEmployee>(EMPLOYEES_KEY);
  const index = all.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    all[index] = { ...all[index], ...record };
  } else {
    all.push(record);
  }
  writeList(EMPLOYEES_KEY, all);
  return getEmployees();
}

export function deleteEmployee(id: string): HrEmployee[] {
  writeList(EMPLOYEES_KEY, readList<HrEmployee>(EMPLOYEES_KEY).filter((item) => item.id !== id));
  return getEmployees();
}

// ----- advances ----------------------------------------------------------

export function getAdvances(): HrAdvance[] {
  return readList<HrAdvance>(ADVANCES_KEY).sort((a, b) => b.date.localeCompare(a.date));
}

export function advanceRemaining(advance: HrAdvance) {
  return Math.max(0, round2(advance.amount - advance.repaid_amount));
}

export function addAdvance(input: Omit<HrAdvance, 'id' | 'repaid_amount' | 'created_at'> & { repaid_amount?: number }): HrAdvance[] {
  const record: HrAdvance = {
    id: createId('adv'),
    employee_id: input.employee_id,
    date: input.date,
    amount: toNumber(input.amount),
    reason: (input.reason ?? '').trim(),
    repayment_method: input.repayment_method,
    installments: input.installments ? Math.max(1, Math.round(toNumber(input.installments))) : null,
    repaid_amount: toNumber(input.repaid_amount),
    notes: (input.notes ?? '').trim(),
    created_by: input.created_by || '',
    created_at: nowIso(),
  };
  const all = readList<HrAdvance>(ADVANCES_KEY);
  all.push(record);
  writeList(ADVANCES_KEY, all);
  return getAdvances();
}

export function repayAdvance(id: string, amount: number): HrAdvance[] {
  const all = readList<HrAdvance>(ADVANCES_KEY);
  const index = all.findIndex((item) => item.id === id);
  if (index >= 0) {
    const next = Math.min(all[index].amount, all[index].repaid_amount + Math.max(0, toNumber(amount)));
    all[index] = { ...all[index], repaid_amount: round2(next) };
    writeList(ADVANCES_KEY, all);
  }
  return getAdvances();
}

export function deleteAdvance(id: string): HrAdvance[] {
  writeList(ADVANCES_KEY, readList<HrAdvance>(ADVANCES_KEY).filter((item) => item.id !== id));
  return getAdvances();
}

// ----- deductions --------------------------------------------------------

export function getDeductions(): HrDeduction[] {
  return readList<HrDeduction>(DEDUCTIONS_KEY).sort((a, b) => b.date.localeCompare(a.date));
}

export function addDeduction(input: Omit<HrDeduction, 'id' | 'created_at'>): HrDeduction[] {
  const record: HrDeduction = {
    id: createId('ded'),
    employee_id: input.employee_id,
    date: input.date,
    amount: toNumber(input.amount),
    reason: (input.reason ?? '').trim(),
    notes: (input.notes ?? '').trim(),
    created_by: input.created_by || '',
    created_at: nowIso(),
  };
  const all = readList<HrDeduction>(DEDUCTIONS_KEY);
  all.push(record);
  writeList(DEDUCTIONS_KEY, all);
  return getDeductions();
}

export function deleteDeduction(id: string): HrDeduction[] {
  writeList(DEDUCTIONS_KEY, readList<HrDeduction>(DEDUCTIONS_KEY).filter((item) => item.id !== id));
  return getDeductions();
}

// ----- bonuses -----------------------------------------------------------

export function getBonuses(): HrBonus[] {
  return readList<HrBonus>(BONUSES_KEY).sort((a, b) => b.date.localeCompare(a.date));
}

export function addBonus(input: Omit<HrBonus, 'id' | 'created_at'>): HrBonus[] {
  const record: HrBonus = {
    id: createId('bon'),
    employee_id: input.employee_id,
    date: input.date,
    amount: toNumber(input.amount),
    reason: (input.reason ?? '').trim(),
    notes: (input.notes ?? '').trim(),
    created_by: input.created_by || '',
    created_at: nowIso(),
  };
  const all = readList<HrBonus>(BONUSES_KEY);
  all.push(record);
  writeList(BONUSES_KEY, all);
  return getBonuses();
}

export function deleteBonus(id: string): HrBonus[] {
  writeList(BONUSES_KEY, readList<HrBonus>(BONUSES_KEY).filter((item) => item.id !== id));
  return getBonuses();
}

// ----- attendance --------------------------------------------------------

export function getAttendance(): HrAttendance[] {
  return readList<HrAttendance>(ATTENDANCE_KEY).sort((a, b) => b.date.localeCompare(a.date));
}

export function getAttendanceForDate(date: string): HrAttendance[] {
  return getAttendance().filter((item) => item.date === date);
}

export class DuplicateAttendanceError extends Error {
  constructor() {
    super('تم تسجيل هذا الموظف بالفعل في نفس اليوم');
    this.name = 'DuplicateAttendanceError';
  }
}

export function upsertAttendance(
  input: { id?: string; employee_id: string; date: string; check_in: string; check_out: string; status: AttendanceStatus; notes?: string; created_by?: string },
  employee: Pick<HrEmployee, 'scheduled_check_in' | 'scheduled_check_out' | 'daily_work_hours'>,
  settings: HrSettings = getHrSettings(),
): HrAttendance[] {
  const all = readList<HrAttendance>(ATTENDANCE_KEY);
  const duplicate = all.find((item) => item.employee_id === input.employee_id && item.date === input.date && item.id !== input.id);
  if (duplicate) throw new DuplicateAttendanceError();

  const hours = computeAttendanceHours({ check_in: input.check_in, check_out: input.check_out, status: input.status }, employee, settings);
  const existingIndex = input.id ? all.findIndex((item) => item.id === input.id) : -1;
  const base: HrAttendance = {
    id: input.id ?? createId('att'),
    employee_id: input.employee_id,
    date: input.date,
    check_in: input.check_in,
    check_out: input.check_out,
    status: input.status,
    work_hours: hours.work_hours,
    late_hours: hours.late_hours,
    overtime_hours: hours.overtime_hours,
    notes: (input.notes ?? '').trim(),
    created_by: input.created_by || '',
    created_at: existingIndex >= 0 ? all[existingIndex].created_at : nowIso(),
  };
  if (existingIndex >= 0) {
    all[existingIndex] = base;
  } else {
    all.push(base);
  }
  writeList(ATTENDANCE_KEY, all);
  return getAttendance();
}

export function deleteAttendance(id: string): HrAttendance[] {
  writeList(ATTENDANCE_KEY, readList<HrAttendance>(ATTENDANCE_KEY).filter((item) => item.id !== id));
  return getAttendance();
}

// ----- month lock --------------------------------------------------------

export function getLockedMonths(): string[] {
  return readList<string>(LOCKED_MONTHS_KEY);
}

export function isMonthLocked(year: number, month: number): boolean {
  return getLockedMonths().includes(monthKey(year, month));
}

export function lockMonth(year: number, month: number): string[] {
  const key = monthKey(year, month);
  const all = getLockedMonths();
  if (!all.includes(key)) all.push(key);
  return writeList(LOCKED_MONTHS_KEY, all);
}

export function unlockMonth(year: number, month: number): string[] {
  const key = monthKey(year, month);
  return writeList(LOCKED_MONTHS_KEY, getLockedMonths().filter((item) => item !== key));
}

// ----- payroll -----------------------------------------------------------

function inMonth(dateValue: string, year: number, month: number) {
  return typeof dateValue === 'string' && dateValue.slice(0, 7) === monthKey(year, month);
}

export function advanceDueForMonth(advance: HrAdvance, year: number, month: number): number {
  const remaining = advanceRemaining(advance);
  if (remaining <= 0) return 0;
  // Only start collecting from the month the advance was taken onward.
  if (advance.date && advance.date.slice(0, 7) > monthKey(year, month)) return 0;
  if (advance.repayment_method === 'installments' && advance.installments && advance.installments > 0) {
    const perInstallment = round2(advance.amount / advance.installments);
    return Math.min(perInstallment, remaining);
  }
  return remaining;
}

export function calculatePayroll(params: {
  employee: HrEmployee;
  year: number;
  month: number;
  attendance: HrAttendance[];
  advances: HrAdvance[];
  deductions: HrDeduction[];
  bonuses: HrBonus[];
  officialHolidays: number;
  settings?: HrSettings;
}): PayrollResult {
  const { employee, year, month, officialHolidays } = params;
  const monthAttendance = params.attendance.filter((item) => item.employee_id === employee.id && inMonth(item.date, year, month));
  const monthBonuses = params.bonuses.filter((item) => item.employee_id === employee.id && inMonth(item.date, year, month));
  const monthDeductions = params.deductions.filter((item) => item.employee_id === employee.id && inMonth(item.date, year, month));
  const employeeAdvances = params.advances.filter((item) => item.employee_id === employee.id);

  const totalDays = daysInMonth(year, month);
  const fridaysCount = countFridays(year, month);
  const holidays = Math.max(0, Math.round(toNumber(officialHolidays)));
  const expectedWorkDays = Math.max(0, totalDays - fridaysCount - holidays);
  const dailyRate = expectedWorkDays > 0 ? round2(employee.base_salary / expectedWorkDays) : 0;
  const hourlyRate = employee.hourly_rate > 0
    ? employee.hourly_rate
    : round2(dailyRate / (employee.daily_work_hours > 0 ? employee.daily_work_hours : 8));
  const overtimeRate = employee.overtime_hourly_rate > 0 ? employee.overtime_hourly_rate : round2(hourlyRate * 1.5);

  const actualWorkDays = monthAttendance.filter((item) => item.status === 'present' || item.status === 'mission').length;
  const absentDays = monthAttendance.filter((item) => item.status === 'absent').length;
  const lateHours = round2(monthAttendance.reduce((sum, item) => sum + toNumber(item.late_hours), 0));
  const overtimeHours = round2(monthAttendance.reduce((sum, item) => sum + toNumber(item.overtime_hours), 0));

  const absenceValue = round2(absentDays * dailyRate);
  const lateValue = round2(lateHours * hourlyRate);
  const overtimeValue = round2(overtimeHours * overtimeRate);
  const totalBonuses = round2(monthBonuses.reduce((sum, item) => sum + toNumber(item.amount), 0));
  const totalDeductions = round2(monthDeductions.reduce((sum, item) => sum + toNumber(item.amount), 0));
  const advancesDue = round2(employeeAdvances.reduce((sum, item) => sum + advanceDueForMonth(item, year, month), 0));

  const netSalary = round2(
    employee.base_salary
    + overtimeValue
    + totalBonuses
    - totalDeductions
    - advancesDue
    - absenceValue
    - lateValue,
  );

  return {
    employeeId: employee.id,
    employeeName: employee.full_name,
    jobTitle: employee.job_title,
    year,
    month,
    baseSalary: round2(employee.base_salary),
    hourlyRate,
    overtimeRate,
    dailyRate,
    daysInMonth: totalDays,
    fridaysCount,
    officialHolidays: holidays,
    expectedWorkDays,
    actualWorkDays,
    absentDays,
    absenceValue,
    lateHours,
    lateValue,
    overtimeHours,
    overtimeValue,
    totalBonuses,
    totalDeductions,
    advancesDue,
    netSalary,
  };
}

// ----- seed --------------------------------------------------------------

const SEED_EMPLOYEES: HrEmployeeInput[] = [
  {
    full_name: 'أحمد إبراهيم',
    employee_code: 'EMP-1001',
    job_title: 'شيف رئيسي',
    department: 'المطبخ',
    branch: 'الفرع الرئيسي',
    hire_date: '2024-01-15',
    status: 'working',
    manager_name: 'إدارة التشغيل',
    base_salary: 9000,
    daily_work_hours: 9,
    weekly_work_days: 6,
    scheduled_check_in: '09:00',
    scheduled_check_out: '18:00',
    phone: '01001234567',
    national_id: '29001010123456',
    address: 'مدينة نصر، القاهرة',
    birth_date: '1990-01-01',
    emergency_contact: '01100000000',
  },
  {
    full_name: 'منى سعيد',
    employee_code: 'EMP-1002',
    job_title: 'كاشير',
    department: 'الكول سنتر',
    branch: 'الفرع الرئيسي',
    hire_date: '2024-03-01',
    status: 'working',
    manager_name: 'إدارة التشغيل',
    base_salary: 6000,
    daily_work_hours: 8,
    weekly_work_days: 6,
    scheduled_check_in: '10:00',
    scheduled_check_out: '18:00',
    phone: '01007654321',
    national_id: '29503030123456',
    address: 'المعادي، القاهرة',
    birth_date: '1995-03-03',
    emergency_contact: '01200000000',
  },
  {
    full_name: 'محمود علي',
    employee_code: 'EMP-1003',
    job_title: 'عامل نظافة',
    department: 'الخدمات',
    branch: 'الفرع الرئيسي',
    hire_date: '2024-06-10',
    status: 'working',
    manager_name: 'المشرف العام',
    base_salary: 4500,
    daily_work_hours: 8,
    weekly_work_days: 6,
    scheduled_check_in: '08:00',
    scheduled_check_out: '16:00',
    phone: '01009998887',
    national_id: '29806060123456',
    address: 'شبرا، القاهرة',
    birth_date: '1998-06-06',
    emergency_contact: '01500000000',
  },
];

export function seedLocalHrData(): void {
  if (!hasWindow()) return;
  if (window.localStorage.getItem(SEED_FLAG_KEY)) return;
  if (readList<HrEmployee>(EMPLOYEES_KEY).length === 0) {
    const employees = SEED_EMPLOYEES.map((employee) => normalizeEmployee(employee));
    writeList(EMPLOYEES_KEY, employees);
  }
  window.localStorage.setItem(SEED_FLAG_KEY, '1');
}
