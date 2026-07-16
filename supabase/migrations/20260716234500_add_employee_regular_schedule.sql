-- Regular shift hours belong to the employee record; daily check-in/out remains in employee_attendance.
ALTER TABLE public.employees
  ADD COLUMN scheduled_check_in time,
  ADD COLUMN scheduled_check_out time;
