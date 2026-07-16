-- Cleaning assignments must support operational staff who do not have an application login.
ALTER TABLE public.cleaning_tasks
  ADD COLUMN assigned_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX idx_cleaning_tasks_assigned_employee ON public.cleaning_tasks(assigned_employee_id);

CREATE OR REPLACE FUNCTION public.cleaning_assign_task(_task_id uuid, _assigned_to uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _brand_id uuid;
BEGIN
  SELECT brand_id INTO _brand_id FROM public.cleaning_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cleaning task not found.'; END IF;
  PERFORM public.cleaning_require_manager(_brand_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = _assigned_to AND brand_id = _brand_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Choose an active employee from this branch.';
  END IF;
  UPDATE public.cleaning_tasks
  SET assigned_employee_id = _assigned_to, assigned_to = NULL, updated_at = now()
  WHERE id = _task_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleaning_start_task(_task_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _task public.cleaning_tasks%ROWTYPE;
BEGIN
  SELECT * INTO _task FROM public.cleaning_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cleaning task not found.'; END IF;
  PERFORM public.cleaning_require_manager(_task.brand_id);
  IF _task.status = 'completed' THEN RAISE EXCEPTION 'This cleaning task has already been completed.'; END IF;
  IF _task.assigned_employee_id IS NULL THEN RAISE EXCEPTION 'Assign an employee before starting the task.'; END IF;
  UPDATE public.cleaning_tasks SET started_at = COALESCE(started_at, now()), updated_at = now() WHERE id = _task_id;
END;
$$;

DROP FUNCTION IF EXISTS public.cleaning_staff(uuid);

CREATE FUNCTION public.cleaning_staff(_brand_id uuid)
RETURNS TABLE(id uuid, display_name text, role_title text, has_app_login boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_access_brand(_brand_id) THEN
    RAISE EXCEPTION 'You do not have access to this branch.';
  END IF;
  RETURN QUERY
    SELECT e.id, e.full_name, e.role_title, e.user_id IS NOT NULL
    FROM public.employees e
    WHERE e.brand_id = _brand_id AND e.is_active
    ORDER BY e.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.cleaning_assign_task(uuid, uuid), public.cleaning_start_task(uuid), public.cleaning_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleaning_assign_task(uuid, uuid), public.cleaning_start_task(uuid), public.cleaning_staff(uuid) TO authenticated;
