drop function if exists public.notification_prefs_set(uuid, text, boolean, boolean);
drop function if exists public.sso_required_for_email(text);
drop function if exists public.sso_required_for_tenant(uuid);
drop function if exists public.sso_session_allowed(uuid);
drop function if exists private.sso_required(uuid);
drop table if exists public.notification_prefs;
