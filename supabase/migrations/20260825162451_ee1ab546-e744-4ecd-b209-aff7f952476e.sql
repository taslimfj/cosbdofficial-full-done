CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  details text,
  task_type text NOT NULL DEFAULT 'task',
  task_date date NOT NULL,
  visibility text NOT NULL DEFAULT 'assigned',
  status text NOT NULL DEFAULT 'ongoing',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_type_chk CHECK (task_type IN ('task','meeting')),
  CONSTRAINT tasks_visibility_chk CHECK (visibility IN ('assigned','all','admin')),
  CONSTRAINT tasks_status_chk CHECK (status IN ('ongoing','closed'))
);

CREATE TABLE public.task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, member_id)
);

CREATE TABLE public.task_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, member_id),
  CONSTRAINT task_responses_status_chk CHECK (status IN ('completed','not_completed'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_assignees TO authenticated;
GRANT ALL ON public.task_assignees TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_responses TO authenticated;
GRANT ALL ON public.task_responses TO service_role;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tasks" ON public.tasks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members view assigned or public tasks" ON public.tasks FOR SELECT TO authenticated
USING (
  visibility = 'all'
  OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.member_id = auth.uid())
);

CREATE POLICY "Admins manage task assignees" ON public.task_assignees FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members view assignees of visible tasks" ON public.task_assignees FOR SELECT TO authenticated
USING (
  member_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_assignees.task_id AND t.visibility = 'all')
);

CREATE POLICY "Admins manage task responses" ON public.task_responses FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members view responses of visible tasks" ON public.task_responses FOR SELECT TO authenticated
USING (
  member_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_responses.task_id
      AND (t.visibility = 'all'
        OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id AND ta.member_id = auth.uid()))
  )
);

CREATE POLICY "Members answer own assigned tasks" ON public.task_responses FOR INSERT TO authenticated
WITH CHECK (
  member_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = task_responses.task_id AND ta.member_id = auth.uid())
);

CREATE POLICY "Members update own responses" ON public.task_responses FOR UPDATE TO authenticated
USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());

CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER task_responses_set_updated_at BEFORE UPDATE ON public.task_responses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sync_task_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int;
  done int;
BEGIN
  SELECT count(*) INTO total FROM public.task_assignees WHERE task_id = NEW.task_id;
  SELECT count(*) INTO done FROM public.task_responses WHERE task_id = NEW.task_id AND status = 'completed';
  IF total > 0 AND done >= total THEN
    UPDATE public.tasks SET status = 'closed' WHERE id = NEW.task_id;
  ELSE
    UPDATE public.tasks SET status = 'ongoing' WHERE id = NEW.task_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_responses_sync_status
AFTER INSERT OR UPDATE ON public.task_responses
FOR EACH ROW EXECUTE FUNCTION public.sync_task_status();