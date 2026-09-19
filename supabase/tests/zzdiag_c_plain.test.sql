-- Temporary hosted-only diagnostic probe. Not product logic.
-- Sanity: a plain passing file must pass in this harness.
begin;
select plan(1);
select pass('diagnostic probe: plain pass');
select * from finish();
rollback;
