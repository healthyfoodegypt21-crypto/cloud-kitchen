CREATE OR REPLACE FUNCTION public.cleaning_delete_task(_task_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task public.cleaning_tasks%ROWTYPE;
BEGIN
  SELECT * INTO _task FROM public.cleaning_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cleaning task not found.';
  END IF;

  PERFORM public.cleaning_require_manager(_task.brand_id);

  IF _task.status = 'completed' THEN
    RAISE EXCEPTION 'Completed cleaning tasks cannot be deleted.';
  END IF;

  DELETE FROM public.cleaning_tasks WHERE id = _task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cleaning_delete_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleaning_delete_task(uuid) TO authenticated;