-- Compatibilidad para el sistema de invitacion.
-- Para el flujo completo actual, ejecutar sql/admin_notifications.sql.
-- Este script no redefine triggers ni admin_get_profiles para no pisar funciones nuevas.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_set_password text,
  ADD COLUMN IF NOT EXISTS password_changed_by_user boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_source text DEFAULT 'self_email',
  ADD COLUMN IF NOT EXISTS send_confirmation_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS seller_id uuid,
  ADD COLUMN IF NOT EXISTS password_prompt_dismissed_on date,
  ADD COLUMN IF NOT EXISTS password_prompt_manual_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_prompt_manual_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_password_reset_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

ALTER TABLE public.profiles
  ALTER COLUMN send_confirmation_email SET DEFAULT false;

UPDATE public.profiles
SET
  password_changed_by_user = COALESCE(password_changed_by_user, false),
  send_confirmation_email = COALESCE(send_confirmation_email, false)
WHERE password_changed_by_user IS NULL
   OR send_confirmation_email IS NULL;
