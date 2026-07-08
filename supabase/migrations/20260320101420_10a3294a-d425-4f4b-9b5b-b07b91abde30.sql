
-- Fix permissive achievements insert policy
DROP POLICY "System can insert achievements" ON public.achievements;
CREATE POLICY "Authenticated can insert own achievements" ON public.achievements FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
