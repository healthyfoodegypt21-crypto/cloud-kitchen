-- Record real execution time instead of measuring elapsed time since the task was created.
ALTER TABLE public.cleaning_tasks
  ADD COLUMN started_at timestamptz;

CREATE OR REPLACE FUNCTION public.cleaning_start_task(_task_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _task public.cleaning_tasks%ROWTYPE;
BEGIN
  SELECT * INTO _task FROM public.cleaning_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cleaning task not found.'; END IF;
  IF NOT public.can_access_brand(_task.brand_id) THEN RAISE EXCEPTION 'You do not have access to this cleaning task.'; END IF;
  IF _task.status = 'completed' THEN RAISE EXCEPTION 'This cleaning task has already been completed.'; END IF;
  IF _task.assigned_to IS NULL THEN RAISE EXCEPTION 'Assign an employee before starting the task.'; END IF;
  IF _task.assigned_to <> auth.uid() THEN
    PERFORM public.cleaning_require_manager(_task.brand_id);
  END IF;
  UPDATE public.cleaning_tasks
  SET started_at = COALESCE(started_at, now()), updated_at = now()
  WHERE id = _task_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleaning_complete_task(_task_id uuid, _photo_path text, _manager_notes text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _task public.cleaning_tasks%ROWTYPE; _duration integer; _points integer;
BEGIN
  SELECT * INTO _task FROM public.cleaning_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cleaning task not found.'; END IF;
  PERFORM public.cleaning_require_manager(_task.brand_id);
  IF btrim(_photo_path) = '' THEN RAISE EXCEPTION 'A completion photo is required.'; END IF;
  _duration := GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(_task.started_at, _task.created_at)))::integer / 60);
  _points := CASE WHEN _task.scheduled_date >= current_date THEN 10 ELSE 6 END
    + CASE WHEN _duration <= _task.estimated_minutes THEN 5 ELSE 0 END;
  UPDATE public.cleaning_tasks
  SET status = 'completed', completed_at = now(), manager_id = auth.uid(), manager_notes = COALESCE(_manager_notes, ''),
      photo_path = _photo_path, points_awarded = _points, updated_at = now()
  WHERE id = _task_id;
  RETURN jsonb_build_object('points', _points, 'duration_minutes', _duration);
END;
$$;

REVOKE ALL ON FUNCTION public.cleaning_start_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleaning_start_task(uuid) TO authenticated;
