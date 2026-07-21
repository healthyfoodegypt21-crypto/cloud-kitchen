import { supabase } from '@/integrations/supabase/client';
import { markSupabaseAvailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import {
  DuplicateAttendanceError,
  computeAttendanceHours,
  getAdvances,
  getAttendance,
  getBonuses,
  getDeductions,
  getEmployees,
  getHrSettings,
  getLockedMonths,
  monthKey,
  normalizeEmployee,
  type AttendanceStatus,
  type HrAdvance,
  type HrAttendance,
  type HrAuditEntry,
  type HrBonus,
  type HrDeduction,
  type HrEmployee,
  type HrEmployeeInput,
  type HrSettings,
  type RepaymentMethod,
} from '@/store/hr';

const DEFAULT_SETTINGS: HrSettings = { grace_period_minutes: 15 };
const AUDIT_TABLES = ['employees', 'employee_attendance', 'hr_advances', 'hr_deductions', 'hr_bonuses', 'hr_settings', 'hr_month_locks'];
const HR_REALTIME_TABLES = ['employees', 'employee_attendance', 'hr_advances', 'hr_deductions', 'hr_bonuses', 'hr_settings', 'hr_month_locks'];
const LEGACY_HR_MIGRATION_FLAG = 'cloud-kitchen.hr.shared-migration.v1';

export interface HrSnapshot {
  employees: HrEmployee[];
  advances: HrAdvance[];
  deductions: HrDeduction[];
  bonuses: HrBonus[];
  attendance: HrAttendance[];
  audit: HrAuditEntry[];
  settings: HrSettings;
  lockedMonths: string[];
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asDateValue(value: unknown) {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function formatTimeValue(value: unknown) {
  if (typeof value !== 'string' || !value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function combineDateAndTime(date: string, time: string) {
  const cleanDate = trimText(date);
  const cleanTime = trimText(time);
  if (!cleanDate || !cleanTime) return null;
  const parsed = new Date(`${cleanDate}T${cleanTime}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function mapEmployee(row: Record<string, unknown>): HrEmployee {
  return normalizeEmployee({
    id: String(row.id),
    employee_code: trimText(row.employee_code),
    full_name: trimText(row.full_name),
    job_title: trimText(row.role_title),
    department: trimText(row.department),
    branch: trimText(row.branch_name),
    hire_date: asDateValue(row.hire_date),
    status: (trimText(row.employment_status) || (row.is_active ? 'working' : 'resigned')) as HrEmployee['status'],
    manager_name: trimText(row.manager_name),
    base_salary: toNumber(row.salary),
    hourly_rate: toNumber(row.hourly_rate),
    overtime_hourly_rate: toNumber(row.overtime_hourly_rate),
    daily_work_hours: toNumber(row.daily_work_hours, 8),
    weekly_work_days: toNumber(row.weekly_work_days, 6),
    scheduled_check_in: trimText(row.scheduled_check_in),
    scheduled_check_out: trimText(row.scheduled_check_out),
    phone: trimText(row.phone),
    national_id: trimText(row.national_id),
    address: trimText(row.address),
    birth_date: asDateValue(row.birth_date),
    emergency_contact: trimText(row.emergency_contact),
    notes: trimText(row.notes),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
  });
}

function mapAttendance(row: Record<string, unknown>, employee: HrEmployee | undefined, settings: HrSettings): HrAttendance {
  const status = (trimText(row.status) || 'present') as AttendanceStatus;
  const checkIn = formatTimeValue(row.check_in);
  const checkOut = formatTimeValue(row.check_out);
  const hours = employee
    ? computeAttendanceHours({ check_in: checkIn, check_out: checkOut, status }, employee, settings)
    : {
        work_hours: toNumber(row.work_minutes) / 60,
        late_hours: toNumber(row.late_minutes) / 60,
        overtime_hours: toNumber(row.overtime_minutes) / 60,
      };

  return {
    id: String(row.id),
    employee_id: String(row.employee_id),
    date: asDateValue(row.attendance_date),
    check_in: checkIn,
    check_out: checkOut,
    status,
    work_hours: hours.work_hours,
    late_hours: hours.late_hours,
    overtime_hours: hours.overtime_hours,
    notes: trimText(row.notes),
    created_by: '',
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function mapAdvance(row: Record<string, unknown>): HrAdvance {
  return {
    id: String(row.id),
    employee_id: String(row.employee_id),
    date: asDateValue(row.advance_date),
    amount: toNumber(row.amount),
    reason: trimText(row.reason),
    repayment_method: trimText(row.repayment_method) as RepaymentMethod,
    installments: row.installments === null || row.installments === undefined ? null : toNumber(row.installments),
    repaid_amount: toNumber(row.repaid_amount),
    notes: trimText(row.notes),
    created_by: trimText(row.created_by_name),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function mapDeduction(row: Record<string, unknown>): HrDeduction {
  return {
    id: String(row.id),
    employee_id: String(row.employee_id),
    date: asDateValue(row.deduction_date),
    amount: toNumber(row.amount),
    reason: trimText(row.reason),
    notes: trimText(row.notes),
    created_by: trimText(row.created_by_name),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function mapBonus(row: Record<string, unknown>): HrBonus {
  return {
    id: String(row.id),
    employee_id: String(row.employee_id),
    date: asDateValue(row.bonus_date),
    amount: toNumber(row.amount),
    reason: trimText(row.reason),
    notes: trimText(row.notes),
    created_by: trimText(row.created_by_name),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function labelEntity(tableName: string) {
  switch (tableName) {
    case 'employees':
      return 'الموظفون';
    case 'employee_attendance':
      return 'الحضور';
    case 'hr_advances':
      return 'السلف';
    case 'hr_deductions':
      return 'الخصومات';
    case 'hr_bonuses':
      return 'المكافآت';
    case 'hr_settings':
      return 'إعدادات الموارد البشرية';
    case 'hr_month_locks':
      return 'اعتماد الرواتب';
    default:
      return tableName;
  }
}

function labelAction(actionType: string) {
  switch (actionType) {
    case 'INSERT':
      return 'إضافة';
    case 'UPDATE':
      return 'تعديل';
    case 'DELETE':
      return 'حذف';
    default:
      return actionType;
  }
}

function describeAuditRow(row: Record<string, unknown>) {
  const tableName = trimText(row.table_name);
  const newData = row.new_data && typeof row.new_data === 'object' ? (row.new_data as Record<string, unknown>) : null;
  const oldData = row.old_data && typeof row.old_data === 'object' ? (row.old_data as Record<string, unknown>) : null;
  const source = newData ?? oldData ?? {};

  switch (tableName) {
    case 'employees':
      return `موظف: ${trimText(source.full_name) || trimText(row.record_id)}`;
    case 'employee_attendance':
      return `حضور: ${asDateValue(source.attendance_date) || trimText(row.record_id)}`;
    case 'hr_advances':
      return `سلفة: ${trimText(source.reason) || trimText(row.record_id)}`;
    case 'hr_deductions':
      return `خصم: ${trimText(source.reason) || trimText(row.record_id)}`;
    case 'hr_bonuses':
      return `مكافأة: ${trimText(source.reason) || trimText(row.record_id)}`;
    case 'hr_settings':
      return 'حد التسامح';
    case 'hr_month_locks':
      return `شهر: ${trimText(source.month_key) || trimText(row.record_id)}`;
    default:
      return trimText(row.record_id);
  }
}

async function loadAuditLog() {
  const client = supabase as any;
  const { data, error } = await client
    .from('audit_logs')
    .select('id, actor_user_id, table_name, record_id, action_type, old_data, new_data, created_at')
    .in('table_name', AUDIT_TABLES)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return [] as HrAuditEntry[];
  }

  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const actorIds = [...new Set(rows.map((row) => trimText(row.actor_user_id)).filter(Boolean))];
  let displayNameMap = new Map<string, string>();

  if (actorIds.length > 0) {
    const profileRes = await client.from('profiles').select('id, display_name').in('id', actorIds);
    if (!profileRes.error && Array.isArray(profileRes.data)) {
      displayNameMap = new Map(profileRes.data.map((profile: Record<string, unknown>) => [String(profile.id), trimText(profile.display_name)]));
    }
  }

  return rows.map((row) => {
    const actorUserId = trimText(row.actor_user_id);
    const tableName = trimText(row.table_name);
    return {
      id: String(row.id),
      user: displayNameMap.get(actorUserId) || actorUserId || 'مستخدم غير معروف',
      timestamp: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      action: `${labelAction(trimText(row.action_type))} ${labelEntity(tableName)}`,
      entity: describeAuditRow(row),
      old_data: row.old_data ? JSON.stringify(row.old_data) : '',
      new_data: row.new_data ? JSON.stringify(row.new_data) : '',
    };
  });
}

function ensureNoError(results: Array<{ error: { message?: string } | null }>) {
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw new Error(failed.error.message || 'تعذر تحميل بيانات الموارد البشرية');
  }
}

function readLegacyMigrationFlag(primaryBrandId: string) {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(`${LEGACY_HR_MIGRATION_FLAG}.${primaryBrandId}`) === '1';
}

function writeLegacyMigrationFlag(primaryBrandId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${LEGACY_HR_MIGRATION_FLAG}.${primaryBrandId}`, '1');
}

export async function loadHrSnapshot(primaryBrandId: string): Promise<HrSnapshot> {
  const client = supabase as any;
  const [employeesRes, attendanceRes, advancesRes, deductionsRes, bonusesRes, settingsRes, locksRes] = await Promise.all([
    client.from('employees').select('*').order('full_name'),
    client.from('employee_attendance').select('*').order('attendance_date', { ascending: false }),
    client.from('hr_advances').select('*').order('advance_date', { ascending: false }),
    client.from('hr_deductions').select('*').order('deduction_date', { ascending: false }),
    client.from('hr_bonuses').select('*').order('bonus_date', { ascending: false }),
    client.from('hr_settings').select('*').eq('brand_id', primaryBrandId).maybeSingle(),
    client.from('hr_month_locks').select('month_key').eq('brand_id', primaryBrandId),
  ]);

  ensureNoError([employeesRes, attendanceRes, advancesRes, deductionsRes, bonusesRes, settingsRes, locksRes]);
  markSupabaseAvailable();

  const employees = (Array.isArray(employeesRes.data) ? employeesRes.data : []).map((row: Record<string, unknown>) => mapEmployee(row));
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const settings: HrSettings = settingsRes.data
    ? { grace_period_minutes: toNumber((settingsRes.data as Record<string, unknown>).grace_period_minutes, DEFAULT_SETTINGS.grace_period_minutes) }
    : { ...DEFAULT_SETTINGS };

  const attendance = (Array.isArray(attendanceRes.data) ? attendanceRes.data : [])
    .map((row: Record<string, unknown>) => mapAttendance(row, employeeMap.get(String(row.employee_id)), settings))
    .sort((left: HrAttendance, right: HrAttendance) => right.date.localeCompare(left.date));
  const advances = (Array.isArray(advancesRes.data) ? advancesRes.data : []).map((row: Record<string, unknown>) => mapAdvance(row));
  const deductions = (Array.isArray(deductionsRes.data) ? deductionsRes.data : []).map((row: Record<string, unknown>) => mapDeduction(row));
  const bonuses = (Array.isArray(bonusesRes.data) ? bonusesRes.data : []).map((row: Record<string, unknown>) => mapBonus(row));
  const audit = await loadAuditLog();
  const lockedMonths = Array.isArray(locksRes.data)
    ? locksRes.data.map((row: Record<string, unknown>) => trimText(row.month_key)).filter(Boolean)
    : [];

  return { employees, advances, deductions, bonuses, attendance, audit, settings, lockedMonths };
}

export async function migrateLegacyLocalHrData(primaryBrandId: string, actorUserId: string | null, actorName: string) {
  if (!primaryBrandId || readLegacyMigrationFlag(primaryBrandId)) return false;

  const localEmployees = getEmployees();
  if (localEmployees.length === 0) {
    writeLegacyMigrationFlag(primaryBrandId);
    return false;
  }

  const localAttendance = getAttendance();
  const localAdvances = getAdvances();
  const localDeductions = getDeductions();
  const localBonuses = getBonuses();
  const localSettings = getHrSettings();
  const localLockedMonths = getLockedMonths();
  const client = supabase as any;

  const employeePayloads = localEmployees.map((employee) => ({
    brand_id: primaryBrandId,
    ...buildEmployeePayload(employee, actorUserId),
    created_by: actorUserId,
  }));

  const upsertEmployeesRes = await client.from('employees').upsert(employeePayloads, { onConflict: 'employee_code' });
  if (upsertEmployeesRes.error) {
    throw new Error(upsertEmployeesRes.error.message || 'تعذر ترحيل بيانات الموظفين القديمة');
  }

  const remoteEmployeesRes = await client.from('employees').select('*').eq('brand_id', primaryBrandId);
  if (remoteEmployeesRes.error) {
    throw new Error(remoteEmployeesRes.error.message || 'تعذر مزامنة الموظفين بعد الترحيل');
  }

  const remoteEmployees = Array.isArray(remoteEmployeesRes.data) ? remoteEmployeesRes.data as Record<string, unknown>[] : [];
  const remoteEmployeeByCode = new Map(remoteEmployees.map((row) => [trimText(row.employee_code), String(row.id)]));
  const localCodes = new Set(localEmployees.map((employee) => employee.employee_code));
  const staleEmployeeIds = remoteEmployees
    .filter((row) => !localCodes.has(trimText(row.employee_code)))
    .map((row) => String(row.id));

  if (staleEmployeeIds.length > 0) {
    const deleteRes = await client.from('employees').delete().in('id', staleEmployeeIds);
    if (deleteRes.error) {
      throw new Error(deleteRes.error.message || 'تعذر حذف الموظفين غير الموجودين في بيانات المالك');
    }
  }

  const activeRemoteEmployeeIds = localEmployees
    .map((employee) => remoteEmployeeByCode.get(employee.employee_code))
    .filter((value): value is string => Boolean(value));
  const remoteEmployeeIdByLegacyId = new Map(localEmployees.map((employee) => [employee.id, remoteEmployeeByCode.get(employee.employee_code) ?? '']));

  if (activeRemoteEmployeeIds.length > 0) {
    const [clearAttendanceRes, clearAdvancesRes, clearDeductionsRes, clearBonusesRes] = await Promise.all([
      client.from('employee_attendance').delete().in('employee_id', activeRemoteEmployeeIds),
      client.from('hr_advances').delete().in('employee_id', activeRemoteEmployeeIds),
      client.from('hr_deductions').delete().in('employee_id', activeRemoteEmployeeIds),
      client.from('hr_bonuses').delete().in('employee_id', activeRemoteEmployeeIds),
    ]);

    ensureNoError([clearAttendanceRes, clearAdvancesRes, clearDeductionsRes, clearBonusesRes]);
  }

  const attendancePayload = localAttendance.flatMap((entry) => {
    const remoteEmployeeId = remoteEmployeeIdByLegacyId.get(entry.employee_id);
    if (!remoteEmployeeId) return [];
    return [{
      employee_id: remoteEmployeeId,
      attendance_date: entry.date,
      check_in: combineDateAndTime(entry.date, entry.check_in),
      check_out: combineDateAndTime(entry.date, entry.check_out),
      work_minutes: Math.round(entry.work_hours * 60),
      late_minutes: Math.round(entry.late_hours * 60),
      overtime_minutes: Math.round(entry.overtime_hours * 60),
      status: entry.status,
      notes: trimText(entry.notes),
      created_by: actorUserId,
    }];
  });

  const advancesPayload = localAdvances.flatMap((entry) => {
    const remoteEmployeeId = remoteEmployeeIdByLegacyId.get(entry.employee_id);
    if (!remoteEmployeeId) return [];
    return [{
      employee_id: remoteEmployeeId,
      advance_date: entry.date,
      amount: entry.amount,
      reason: trimText(entry.reason),
      repayment_method: entry.repayment_method,
      installments: entry.installments,
      repaid_amount: entry.repaid_amount,
      notes: trimText(entry.notes),
      created_by: actorUserId,
      created_by_name: trimText(entry.created_by) || trimText(actorName),
    }];
  });

  const deductionsPayload = localDeductions.flatMap((entry) => {
    const remoteEmployeeId = remoteEmployeeIdByLegacyId.get(entry.employee_id);
    if (!remoteEmployeeId) return [];
    return [{
      employee_id: remoteEmployeeId,
      deduction_date: entry.date,
      amount: entry.amount,
      reason: trimText(entry.reason),
      notes: trimText(entry.notes),
      created_by: actorUserId,
      created_by_name: trimText(entry.created_by) || trimText(actorName),
    }];
  });

  const bonusesPayload = localBonuses.flatMap((entry) => {
    const remoteEmployeeId = remoteEmployeeIdByLegacyId.get(entry.employee_id);
    if (!remoteEmployeeId) return [];
    return [{
      employee_id: remoteEmployeeId,
      bonus_date: entry.date,
      amount: entry.amount,
      reason: trimText(entry.reason),
      notes: trimText(entry.notes),
      created_by: actorUserId,
      created_by_name: trimText(entry.created_by) || trimText(actorName),
    }];
  });

  const insertResults = await Promise.all([
    attendancePayload.length > 0 ? client.from('employee_attendance').insert(attendancePayload) : Promise.resolve({ error: null }),
    advancesPayload.length > 0 ? client.from('hr_advances').insert(advancesPayload) : Promise.resolve({ error: null }),
    deductionsPayload.length > 0 ? client.from('hr_deductions').insert(deductionsPayload) : Promise.resolve({ error: null }),
    bonusesPayload.length > 0 ? client.from('hr_bonuses').insert(bonusesPayload) : Promise.resolve({ error: null }),
    client.from('hr_settings').upsert({
      brand_id: primaryBrandId,
      grace_period_minutes: Math.max(0, Math.round(localSettings.grace_period_minutes)),
      created_by: actorUserId,
      updated_by: actorUserId,
    }, { onConflict: 'brand_id' }),
    client.from('hr_month_locks').delete().eq('brand_id', primaryBrandId),
  ]);
  ensureNoError(insertResults as Array<{ error: { message?: string } | null }>);

  if (localLockedMonths.length > 0) {
    const lockInsertRes = await client.from('hr_month_locks').insert(localLockedMonths.map((key) => ({
      brand_id: primaryBrandId,
      month_key: key,
      locked_by: actorUserId,
    })));
    if (lockInsertRes.error) {
      throw new Error(lockInsertRes.error.message || 'تعذر ترحيل الشهور المعتمدة');
    }
  }

  writeLegacyMigrationFlag(primaryBrandId);
  return true;
}

export function subscribeToHrRealtime(onChange: () => void) {
  const channel = HR_REALTIME_TABLES.reduce((current, tableName) => (
    current.on('postgres_changes', { event: '*', schema: 'public', table: tableName }, onChange)
  ), (supabase as any).channel('hr-realtime'));

  return channel.subscribe();
}

export async function removeHrRealtimeSubscription(channel: Awaited<ReturnType<typeof subscribeToHrRealtime>>) {
  await supabase.removeChannel(channel);
}

function buildEmployeePayload(input: HrEmployeeInput, actorUserId: string | null) {
  const employeeCode = trimText(input.employee_code) || `EMP-${Date.now().toString().slice(-6)}`;
  const status = (input.status ?? 'working') as HrEmployee['status'];
  return {
    employee_code: employeeCode,
    full_name: trimText(input.full_name),
    phone: trimText(input.phone),
    role_title: trimText(input.job_title),
    hire_date: trimText(input.hire_date) || null,
    salary: toNumber(input.base_salary),
    is_active: status === 'working' || status === 'leave',
    notes: trimText(input.notes),
    updated_by: actorUserId,
    department: trimText(input.department),
    branch_name: trimText(input.branch),
    employment_status: status,
    manager_name: trimText(input.manager_name),
    hourly_rate: toNumber(input.hourly_rate),
    overtime_hourly_rate: toNumber(input.overtime_hourly_rate),
    daily_work_hours: toNumber(input.daily_work_hours, 8),
    weekly_work_days: Math.max(1, Math.round(toNumber(input.weekly_work_days, 6))),
    scheduled_check_in: trimText(input.scheduled_check_in) || null,
    scheduled_check_out: trimText(input.scheduled_check_out) || null,
    national_id: trimText(input.national_id),
    address: trimText(input.address),
    birth_date: trimText(input.birth_date) || null,
    emergency_contact: trimText(input.emergency_contact),
  };
}

export async function saveEmployee(input: HrEmployeeInput, primaryBrandId: string, actorUserId: string | null) {
  const client = supabase as any;
  const payload = buildEmployeePayload(input, actorUserId);
  const response = input.id
    ? await client.from('employees').update(payload).eq('id', input.id).select('*').single()
    : await client.from('employees').insert({ ...payload, brand_id: primaryBrandId, created_by: actorUserId }).select('*').single();

  if (response.error) {
    markSupabaseUnavailable();
    throw new Error(response.error.message || 'تعذر حفظ الموظف');
  }

  markSupabaseAvailable();
  return mapEmployee(response.data as Record<string, unknown>);
}

export async function removeEmployee(employeeId: string) {
  const response = await (supabase as any).from('employees').delete().eq('id', employeeId);
  if (response.error) {
    throw new Error(response.error.message || 'تعذر حذف الموظف');
  }
}

export async function saveAttendanceRecord(
  input: { id?: string; employee_id: string; date: string; check_in: string; check_out: string; status: AttendanceStatus; notes?: string },
  employee: Pick<HrEmployee, 'scheduled_check_in' | 'scheduled_check_out' | 'daily_work_hours'>,
  settings: HrSettings,
  actorUserId: string | null,
) {
  const client = supabase as any;
  const hours = computeAttendanceHours({ check_in: input.check_in, check_out: input.check_out, status: input.status }, employee, settings);
  const payload = {
    employee_id: input.employee_id,
    attendance_date: input.date,
    check_in: combineDateAndTime(input.date, input.check_in),
    check_out: combineDateAndTime(input.date, input.check_out),
    work_minutes: Math.round(hours.work_hours * 60),
    late_minutes: Math.round(hours.late_hours * 60),
    overtime_minutes: Math.round(hours.overtime_hours * 60),
    status: input.status,
    notes: trimText(input.notes),
    created_by: actorUserId,
  };
  const response = input.id
    ? await client.from('employee_attendance').update(payload).eq('id', input.id).select('*').single()
    : await client.from('employee_attendance').insert(payload).select('*').single();

  if (response.error) {
    if (response.error.code === '23505') {
      throw new DuplicateAttendanceError();
    }

    throw new Error(response.error.message || 'تعذر حفظ الحضور');
  }
}

export async function removeAttendanceRecord(attendanceId: string) {
  const response = await (supabase as any).from('employee_attendance').delete().eq('id', attendanceId);
  if (response.error) {
    throw new Error(response.error.message || 'تعذر حذف الحضور');
  }
}

export async function createAdvance(
  input: { employee_id: string; date: string; amount: number; reason: string; repayment_method: RepaymentMethod; installments: number | null; notes: string },
  actorUserId: string | null,
  actorName: string,
) {
  const response = await (supabase as any).from('hr_advances').insert({
    employee_id: input.employee_id,
    advance_date: input.date,
    amount: toNumber(input.amount),
    reason: trimText(input.reason),
    repayment_method: input.repayment_method,
    installments: input.installments,
    repaid_amount: 0,
    notes: trimText(input.notes),
    created_by: actorUserId,
    created_by_name: trimText(actorName),
  });

  if (response.error) {
    throw new Error(response.error.message || 'تعذر تسجيل السلفة');
  }
}

export async function settleAdvance(advanceId: string, currentRepaidAmount: number, currentAmount: number, amount: number) {
  const nextRepaidAmount = Math.min(currentAmount, currentRepaidAmount + Math.max(0, toNumber(amount)));
  const response = await (supabase as any).from('hr_advances').update({ repaid_amount: nextRepaidAmount }).eq('id', advanceId);
  if (response.error) {
    throw new Error(response.error.message || 'تعذر تسجيل السداد');
  }
}

export async function removeAdvance(advanceId: string) {
  const response = await (supabase as any).from('hr_advances').delete().eq('id', advanceId);
  if (response.error) {
    throw new Error(response.error.message || 'تعذر حذف السلفة');
  }
}

export async function createDeduction(
  input: { employee_id: string; date: string; amount: number; reason: string; notes: string },
  actorUserId: string | null,
  actorName: string,
) {
  const response = await (supabase as any).from('hr_deductions').insert({
    employee_id: input.employee_id,
    deduction_date: input.date,
    amount: toNumber(input.amount),
    reason: trimText(input.reason),
    notes: trimText(input.notes),
    created_by: actorUserId,
    created_by_name: trimText(actorName),
  });

  if (response.error) {
    throw new Error(response.error.message || 'تعذر تسجيل الخصم');
  }
}

export async function removeDeduction(deductionId: string) {
  const response = await (supabase as any).from('hr_deductions').delete().eq('id', deductionId);
  if (response.error) {
    throw new Error(response.error.message || 'تعذر حذف الخصم');
  }
}

export async function createBonus(
  input: { employee_id: string; date: string; amount: number; reason: string; notes: string },
  actorUserId: string | null,
  actorName: string,
) {
  const response = await (supabase as any).from('hr_bonuses').insert({
    employee_id: input.employee_id,
    bonus_date: input.date,
    amount: toNumber(input.amount),
    reason: trimText(input.reason),
    notes: trimText(input.notes),
    created_by: actorUserId,
    created_by_name: trimText(actorName),
  });

  if (response.error) {
    throw new Error(response.error.message || 'تعذر تسجيل المكافأة');
  }
}

export async function removeBonus(bonusId: string) {
  const response = await (supabase as any).from('hr_bonuses').delete().eq('id', bonusId);
  if (response.error) {
    throw new Error(response.error.message || 'تعذر حذف المكافأة');
  }
}

export async function persistHrSettings(primaryBrandId: string, settings: HrSettings, actorUserId: string | null) {
  const response = await (supabase as any).from('hr_settings').upsert({
    brand_id: primaryBrandId,
    grace_period_minutes: Math.max(0, Math.round(toNumber(settings.grace_period_minutes, DEFAULT_SETTINGS.grace_period_minutes))),
    updated_by: actorUserId,
    created_by: actorUserId,
  }, { onConflict: 'brand_id' }).select('*').single();

  if (response.error) {
    throw new Error(response.error.message || 'تعذر حفظ الإعدادات');
  }

  return { grace_period_minutes: toNumber((response.data as Record<string, unknown>).grace_period_minutes, DEFAULT_SETTINGS.grace_period_minutes) };
}

export async function lockHrMonth(primaryBrandId: string, year: number, month: number, actorUserId: string | null) {
  const response = await (supabase as any).from('hr_month_locks').insert({
    brand_id: primaryBrandId,
    month_key: monthKey(year, month),
    locked_by: actorUserId,
  });

  if (response.error && response.error.code !== '23505') {
    throw new Error(response.error.message || 'تعذر إغلاق الشهر');
  }
}

export async function unlockHrMonth(primaryBrandId: string, year: number, month: number) {
  const response = await (supabase as any).from('hr_month_locks').delete().eq('brand_id', primaryBrandId).eq('month_key', monthKey(year, month));
  if (response.error) {
    throw new Error(response.error.message || 'تعذر فتح الشهر');
  }
}