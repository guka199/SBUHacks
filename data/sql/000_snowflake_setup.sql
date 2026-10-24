-- One-time Snowflake setup for PostPilot. Run in a Snowsight SQL worksheet as ACCOUNTADMIN.
-- Creates a warehouse, database, an app role, and a service user that signs in with a key pair.
-- The app creates its own tables (USERS, ACCOUNTS, DRAFTS, POSTS) and the MEDIA stage on first start.
--
-- Key pair: generate it (the private key stays on your machine, git-ignored):
--   mkdir -p .secrets && openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out .secrets/snowflake_key.p8
--   openssl rsa -in .secrets/snowflake_key.p8 -pubout | grep -v "PUBLIC KEY" | tr -d '\n'
-- and paste the printed public key below.

USE ROLE ACCOUNTADMIN;

CREATE WAREHOUSE IF NOT EXISTS POSTPILOT_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;

CREATE DATABASE IF NOT EXISTS POSTPILOT;
CREATE SCHEMA IF NOT EXISTS POSTPILOT.APP;

CREATE ROLE IF NOT EXISTS POSTPILOT_APP;
GRANT USAGE ON WAREHOUSE POSTPILOT_WH TO ROLE POSTPILOT_APP;
GRANT USAGE ON DATABASE POSTPILOT TO ROLE POSTPILOT_APP;
GRANT USAGE, CREATE TABLE, CREATE STAGE ON SCHEMA POSTPILOT.APP TO ROLE POSTPILOT_APP;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE POSTPILOT_APP;   -- Cortex AI functions (later)
GRANT ROLE POSTPILOT_APP TO ROLE ACCOUNTADMIN;                     -- so you can browse the data in Snowsight

CREATE USER IF NOT EXISTS POSTPILOT_SVC
  TYPE = SERVICE
  DEFAULT_ROLE = POSTPILOT_APP
  DEFAULT_WAREHOUSE = POSTPILOT_WH
  DEFAULT_NAMESPACE = POSTPILOT.APP
  RSA_PUBLIC_KEY = '<PASTE_PUBLIC_KEY_HERE>';
GRANT ROLE POSTPILOT_APP TO USER POSTPILOT_SVC;

-- Copy this value into SNOWFLAKE_ACCOUNT in .env:
SELECT CURRENT_ORGANIZATION_NAME() || '-' || CURRENT_ACCOUNT_NAME() AS snowflake_account;
