-- Temporary hosted-only diagnostic probe. Not product logic.
-- Question: does a TODO test that unexpectedly passes fail this harness?
begin;
select plan(2);
select todo('diagnostic probe: TODO unexpected pass', 1);
select pass('diagnostic probe: TODO-marked pass');
select pass('diagnostic probe: active pass');
select * from finish();
rollback;
