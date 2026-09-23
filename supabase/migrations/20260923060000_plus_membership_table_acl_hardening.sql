-- Keep service_role on the membership read seam; lifecycle writes must go through
-- the SECURITY DEFINER RPCs instead of direct table DML.
revoke all on table public.plus_membership_plan from service_role;
grant select on table public.plus_membership_plan to service_role;

revoke all on table public.plus_membership_event from service_role;
grant select on table public.plus_membership_event to service_role;

revoke all on table public.plus_membership_state from service_role;
grant select on table public.plus_membership_state to service_role;

revoke all on table public.plus_membership_subscription from service_role;
grant select on table public.plus_membership_subscription to service_role;

revoke all on table public.plus_membership_stream_summary from service_role;
grant select on table public.plus_membership_stream_summary to service_role;
