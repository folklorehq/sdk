CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ag_catalog.ag_graph WHERE name = 'folklore') THEN
    PERFORM ag_catalog.create_graph('folklore');
  END IF;
END $$;
