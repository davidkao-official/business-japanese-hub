-- service_role reads membership evidence but writes only through lifecycle RPCs.
begin;

select plan(22);

insert into auth.users (id, aud, role) values
  ('65000000-0000-0000-0000-000000000601','authenticated','authenticated');

select ok(
  has_function_privilege('service_role','public.record_plus_membership_event(text,text,text,text,uuid,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,boolean,jsonb)','execute'),
  'service_role can invoke the lifecycle writer'
);

select ok(has_table_privilege('service_role','public.plus_membership_plan','select'),'service_role can select membership plans');
select isnt(has_table_privilege('service_role','public.plus_membership_plan','insert'),true,'service_role cannot insert membership plans');
select isnt(has_table_privilege('service_role','public.plus_membership_plan','update'),true,'service_role cannot update membership plans');
select isnt(has_table_privilege('service_role','public.plus_membership_plan','delete'),true,'service_role cannot delete membership plans');

select ok(has_table_privilege('service_role','public.plus_membership_event','select'),'service_role can select membership events');
select isnt(has_table_privilege('service_role','public.plus_membership_event','insert'),true,'service_role cannot insert membership events directly');
select isnt(has_table_privilege('service_role','public.plus_membership_event','update'),true,'service_role cannot update membership events');
select isnt(has_table_privilege('service_role','public.plus_membership_event','delete'),true,'service_role cannot delete membership events');

select ok(has_table_privilege('service_role','public.plus_membership_state','select'),'service_role can select membership state');
select isnt(has_table_privilege('service_role','public.plus_membership_state','insert'),true,'service_role cannot insert membership state directly');
select isnt(has_table_privilege('service_role','public.plus_membership_state','update'),true,'service_role cannot update membership state');
select isnt(has_table_privilege('service_role','public.plus_membership_state','delete'),true,'service_role cannot delete membership state');

select ok(has_table_privilege('service_role','public.plus_membership_subscription','select'),'service_role can select subscription bindings');
select isnt(has_table_privilege('service_role','public.plus_membership_subscription','insert'),true,'service_role cannot insert subscription bindings directly');
select isnt(has_table_privilege('service_role','public.plus_membership_subscription','update'),true,'service_role cannot update subscription bindings');
select isnt(has_table_privilege('service_role','public.plus_membership_subscription','delete'),true,'service_role cannot delete subscription bindings');

select ok(has_table_privilege('service_role','public.plus_membership_stream_summary','select'),'service_role can select stream summaries');
select isnt(has_table_privilege('service_role','public.plus_membership_stream_summary','insert'),true,'service_role cannot insert stream summaries directly');
select isnt(has_table_privilege('service_role','public.plus_membership_stream_summary','update'),true,'service_role cannot update stream summaries');
select isnt(has_table_privilege('service_role','public.plus_membership_stream_summary','delete'),true,'service_role cannot delete stream summaries');

set local role service_role;
select is(public.record_plus_membership_event(
  'acl-test','customer601','subscription601','event601',
  '65000000-0000-0000-0000-000000000601','plus_early_access_monthly',
  'membership_started','2026-09-22','2026-09-22','2026-10-22'
),'applied','service_role writes membership evidence through the RPC');
reset role;

select * from finish();
rollback;
