-- Temporary hosted-only diagnostic probe. Not product logic.
-- Question: does pgTAP TODO suppress a *failing* test in this harness?
begin;
select plan(2);
select todo('diagnostic probe: TODO suppresses failures', 1);
select fail('diagnostic probe: expected TODO failure');
select pass('diagnostic probe: active pass');
select * from finish();
rollback;
