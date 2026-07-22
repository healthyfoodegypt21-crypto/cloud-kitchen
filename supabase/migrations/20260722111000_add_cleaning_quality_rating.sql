ALTER TABLE public.cleaning_tasks
  ADD COLUMN IF NOT EXISTS quality_rating integer NOT NULL DEFAULT 5 CHECK (quality_rating BETWEEN 1 AND 5);

DROP FUNCTION IF EXISTS public.cleaning_complete_task(uuid, text, text);

CREATE OR REPLACE FUNCTION public.cleaning_complete_task(
  _task_id uuid,
  _photo_path text,
  _manager_notes text DEFAULT '',
  _quality_rating integer DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task public.cleaning_tasks%ROWTYPE;
  _duration integer;
  _points integer;
  _normalized_rating integer;
BEGIN
  SELECT * INTO _task FROM public.cleaning_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cleaning task not found.'; END IF;

  PERFORM public.cleaning_require_manager(_task.brand_id);
  IF btrim(_photo_path) = '' THEN RAISE EXCEPTION 'A completion photo is required.'; END IF;

  _normalized_rating := GREATEST(1, LEAST(COALESCE(_quality_rating, 5), 5));
  _duration := GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(_task.started_at, _task.created_at)))::integer / 60);
  _points := CASE WHEN _task.scheduled_date >= current_date THEN 10 ELSE 6 END
    + CASE WHEN _duration <= _task.estimated_minutes THEN 5 ELSE 0 END
    + CASE WHEN _normalized_rating >= 4 THEN 2 ELSE 0 END;

  UPDATE public.cleaning_tasks
  SET status = 'completed',
      completed_at = now(),
      manager_id = auth.uid(),
      manager_notes = COALESCE(_manager_notes, ''),
      photo_path = _photo_path,
      points_awarded = _points,
      quality_rating = _normalized_rating,
      updated_at = now()
  WHERE id = _task_id;

  RETURN jsonb_build_object('points', _points, 'duration_minutes', _duration, 'quality_rating', _normalized_rating);
END;
$$;

REVOKE ALL ON FUNCTION public.cleaning_complete_task(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleaning_complete_task(uuid, text, text, integer) TO authenticated;