-- Shared cleaning operations: manually saved areas/equipment, recurring work, manager verification, photos, points and area scores.
CREATE TYPE public.cleaning_target_kind AS ENUM ('area', 'equipment');
CREATE TYPE public.cleaning_task_status AS ENUM ('pending', 'overdue', 'completed');

CREATE TABLE public.cleaning_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind public.cleaning_target_kind NOT NULL DEFAULT 'area',
  icon text NOT NULL DEFAULT '✨',
  frequency_days integer NOT NULL DEFAULT 1 CHECK (frequency_days >= 1 AND frequency_days <= 365),
  estimated_minutes integer NOT NULL DEFAULT 15 CHECK (estimated_minutes >= 1 AND estimated_minutes <= 1440),
  is_active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);

CREATE TABLE public.cleaning_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.cleaning_targets(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.cleaning_task_status NOT NULL DEFAULT 'pending',
  estimated_minutes integer NOT NULL,
  completed_at timestamptz,
  manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  manager_notes text NOT NULL DEFAULT '',
  photo_path text NOT NULL DEFAULT '',
  points_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_id, scheduled_date)
);

CREATE INDEX idx_cleaning_targets_brand ON public.cleaning_targets(brand_id, is_active);
CREATE INDEX idx_cleaning_tasks_brand_date ON public.cleaning_tasks(brand_id, scheduled_date, status);
CREATE TRIGGER set_cleaning_targets_updated_at BEFORE UPDATE ON public.cleaning_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_cleaning_tasks_updated_at BEFORE UPDATE ON public.cleaning_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cleaning_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cleaning users view targets" ON public.cleaning_targets FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Cleaning users view tasks" ON public.cleaning_tasks FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

CREATE OR REPLACE FUNCTION public.cleaning_require_manager(_brand_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_access_brand(_brand_id) OR NOT (public.get_user_role(auth.uid()) = 'owner' OR public.has_page_permission(auth.uid(), 'cleaning')) THEN
    RAISE EXCEPTION 'You do not have permission to manage cleaning operations.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleaning_generate_tasks(_brand_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _target public.cleaning_targets%ROWTYPE; _created integer := 0; _last_date date;
BEGIN
  PERFORM public.cleaning_require_manager(_brand_id);
  FOR _target IN SELECT * FROM public.cleaning_targets WHERE brand_id = _brand_id AND is_active LOOP
    SELECT max(scheduled_date) INTO _last_date FROM public.cleaning_tasks WHERE target_id = _target.id;
    IF _last_date IS NULL OR current_date >= _last_date + _target.frequency_days THEN
      INSERT INTO public.cleaning_tasks (brand_id, target_id, scheduled_date, estimated_minutes)
      VALUES (_brand_id, _target.id, current_date, _target.estimated_minutes)
      ON CONFLICT (target_id, scheduled_date) DO NOTHING;
      IF FOUND THEN _created := _created + 1; END IF;
    END IF;
  END LOOP;
  UPDATE public.cleaning_tasks SET status = 'overdue' WHERE brand_id = _brand_id AND scheduled_date < current_date AND status = 'pending';
  RETURN _created;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleaning_create_target(_brand_id uuid, _name text, _kind public.cleaning_target_kind, _icon text DEFAULT '✨', _frequency_days integer DEFAULT 1, _estimated_minutes integer DEFAULT 15, _notes text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM public.cleaning_require_manager(_brand_id);
  IF btrim(_name) = '' THEN RAISE EXCEPTION 'Name is required.'; END IF;
  INSERT INTO public.cleaning_targets (brand_id, name, kind, icon, frequency_days, estimated_minutes, notes, created_by, updated_by)
  VALUES (_brand_id, btrim(_name), _kind, COALESCE(NULLIF(btrim(_icon), ''), '✨'), _frequency_days, _estimated_minutes, COALESCE(_notes, ''), auth.uid(), auth.uid()) RETURNING id INTO _id;
  PERFORM public.cleaning_generate_tasks(_brand_id);
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleaning_assign_task(_task_id uuid, _assigned_to uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _brand_id uuid;
BEGIN
  SELECT brand_id INTO _brand_id FROM public.cleaning_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cleaning task not found.'; END IF;
  PERFORM public.cleaning_require_manager(_brand_id);
  UPDATE public.cleaning_tasks SET assigned_to = _assigned_to, updated_at = now() WHERE id = _task_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleaning_complete_task(_task_id uuid, _photo_path text, _manager_notes text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _task public.cleaning_tasks%ROWTYPE; _duration integer; _points integer;
BEGIN
  SELECT * INTO _task FROM public.cleaning_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cleaning task not found.'; END IF;
  PERFORM public.cleaning_require_manager(_task.brand_id);
  IF btrim(_photo_path) = '' THEN RAISE EXCEPTION 'A completion photo is required.'; END IF;
  _duration := EXTRACT(EPOCH FROM (now() - _task.created_at))::integer / 60;
  _points := CASE WHEN _task.scheduled_date >= current_date THEN 10 ELSE 6 END + CASE WHEN _duration <= _task.estimated_minutes THEN 5 ELSE 0 END;
  UPDATE public.cleaning_tasks SET status = 'completed', completed_at = now(), manager_id = auth.uid(), manager_notes = COALESCE(_manager_notes, ''), photo_path = _photo_path, points_awarded = _points, updated_at = now() WHERE id = _task_id;
  RETURN jsonb_build_object('points', _points, 'duration_minutes', _duration);
END;
$$;

CREATE OR REPLACE FUNCTION public.cleaning_staff(_brand_id uuid) RETURNS TABLE(id uuid, display_name text) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.display_name FROM public.profiles p
  WHERE EXISTS (SELECT 1 FROM public.user_brand_access uba WHERE uba.user_id = p.id AND uba.brand_id = _brand_id)
  ORDER BY p.display_name;
$$;

REVOKE ALL ON FUNCTION public.cleaning_generate_tasks(uuid), public.cleaning_create_target(uuid, text, public.cleaning_target_kind, text, integer, integer, text), public.cleaning_assign_task(uuid, uuid), public.cleaning_complete_task(uuid, text, text), public.cleaning_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleaning_generate_tasks(uuid), public.cleaning_create_target(uuid, text, public.cleaning_target_kind, text, integer, integer, text), public.cleaning_assign_task(uuid, uuid), public.cleaning_complete_task(uuid, text, text), public.cleaning_staff(uuid) TO authenticated;

INSERT INTO storage.buckets (id, name, public) VALUES ('cleaning-photos', 'cleaning-photos', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Cleaning users upload photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'cleaning-photos');
CREATE POLICY "Cleaning photos public read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'cleaning-photos');
