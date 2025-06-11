alter table "public"."currencies" add column "usd_price" numeric not null;

alter table "public"."orders" add column "description" text;

alter table "public"."orders" add column "display_amount" numeric not null;

alter table "public"."orders" alter column "source_chain_name" drop not null;

alter table "public"."orders" alter column "source_token_address" drop not null;

alter table "public"."orders" alter column "source_token_amount" drop not null;

alter table "public"."orders" alter column "source_txn_hash" drop not null;


