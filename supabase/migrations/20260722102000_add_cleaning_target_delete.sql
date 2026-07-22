CREATE OR REPLACE FUNCTION public.cleaning_delete_target(_target_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target public.cleaning_targets%ROWTYPE;
BEGIN
  SELECT * INTO _target FROM public.cleaning_targets WHERE id = _target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cleaning target not found.';
  END IF;

  PERFORM public.cleaning_require_manager(_target.brand_id);

  DELETE FROM public.cleaning_tasks
  WHERE target_id = _target_id
    AND status <> 'completed';

  UPDATE public.cleaning_targets
  SET is_active = false,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = _target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cleaning_delete_target(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleaning_delete_target(uuid) TO authenticated;