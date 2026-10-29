\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'nexalab_pinning_test' OR inet_server_addr() <> '127.0.0.1'::inet OR inet_server_port() <> 55490 THEN
  RAISE EXCEPTION 'This verification only accepts isolated loopback nexalab_pinning_test on port 55490';
 END IF;
END $$;
SET LOCAL search_path = p36_finish_1029, public;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA p36_finish_1029 TO anon, authenticated;
GRANT ALL ON "LabRelease", "LabReviewerAuthorization", "LabReleaseReview" TO anon, authenticated;
\i prisma/migrations/20261029020000_lab_release_access/migration.sql
DO $$
DECLARE r text; t text; operation text; denied integer:=0;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH t IN ARRAY ARRAY['LabRelease','LabReviewerAuthorization','LabReleaseReview'] LOOP
   FOREACH operation IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege(r,format('%I.%I','p36_finish_1029',t),operation) THEN RAISE EXCEPTION 'Unexpected % privilege for % on %',operation,r,t; END IF;
   END LOOP;
   EXECUTE format('SET LOCAL ROLE %I',r);
   BEGIN
    EXECUTE format('SELECT count(*) FROM %I',t);
    RAISE EXCEPTION 'Unexpected direct access';
   EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1;
   END;
   RESET ROLE;
  END LOOP;
 END LOOP;
 IF denied<>6 THEN RAISE EXCEPTION 'Expected six denials'; END IF;
 RAISE NOTICE 'PASS: 42 privilege checks, six actual role SELECT denials';
END $$;
SELECT count(*) AS owner_still_reads FROM "LabRelease";
ROLLBACK;

