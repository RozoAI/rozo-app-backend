create type "public"."payment_status" as enum ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DISCREPANCY');

create table "public"."currencies" (
    "currency_id" text not null,
    "display_name" text not null
);


alter table "public"."currencies" enable row level security;

create table "public"."languages" (
    "language_id" character varying not null,
    "display_name" character varying not null
);


alter table "public"."languages" enable row level security;

create table "public"."merchants" (
    "merchant_id" uuid not null default gen_random_uuid(),
    "dynamic_id" uuid not null,
    "email" text not null,
    "display_name" text,
    "description" text,
    "logo_url" text,
    "wallet_address" text not null,
    "created_at" timestamp with time zone not null default (now() AT TIME ZONE 'utc'::text),
    "updated_at" timestamp with time zone not null default (now() AT TIME ZONE 'utc'::text),
    "default_currency" character varying not null,
    "default_token_id" character varying not null,
    "default_language" character varying not null
);


alter table "public"."merchants" enable row level security;

create table "public"."orders" (
    "order_id" uuid not null default gen_random_uuid(),
    "merchant_id" uuid not null,
    "payment_id" character varying not null,
    "status" payment_status not null,
    "callback_payload" jsonb,
    "display_currency" character varying not null,
    "merchant_chain_id" character varying not null,
    "merchant_address" character varying not null,
    "required_token" character varying not null,
    "required_amount_usd" numeric not null,
    "created_at" timestamp with time zone not null default (now() AT TIME ZONE 'utc'::text),
    "updated_at" timestamp with time zone default (now() AT TIME ZONE 'utc'::text),
    "source_txn_hash" character varying not null,
    "source_chain_name" character varying not null,
    "source_token_address" character varying not null,
    "source_token_amount" numeric not null
);


alter table "public"."orders" enable row level security;

create table "public"."tokens" (
    "token_id" character varying not null,
    "token_name" character varying not null,
    "token_address" character varying not null,
    "chain_id" character varying not null,
    "chain_name" character varying not null
);


alter table "public"."tokens" enable row level security;

CREATE UNIQUE INDEX currencies_pkey ON public.currencies USING btree (currency_id);

CREATE UNIQUE INDEX languages_pkey ON public.languages USING btree (language_id);

CREATE INDEX merchants_dynamic_id_idx ON public.merchants USING btree (dynamic_id);

CREATE UNIQUE INDEX merchants_dynamic_id_key ON public.merchants USING btree (dynamic_id);

CREATE UNIQUE INDEX merchants_email_key ON public.merchants USING btree (email);

CREATE UNIQUE INDEX merchants_pkey ON public.merchants USING btree (merchant_id);

CREATE UNIQUE INDEX orders_payment_id_key ON public.orders USING btree (payment_id);

CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (order_id);

CREATE UNIQUE INDEX orders_source_txn_hash_key ON public.orders USING btree (source_txn_hash);

CREATE UNIQUE INDEX tokens_pkey ON public.tokens USING btree (token_id);

alter table "public"."currencies" add constraint "currencies_pkey" PRIMARY KEY using index "currencies_pkey";

alter table "public"."languages" add constraint "languages_pkey" PRIMARY KEY using index "languages_pkey";

alter table "public"."merchants" add constraint "merchants_pkey" PRIMARY KEY using index "merchants_pkey";

alter table "public"."orders" add constraint "orders_pkey" PRIMARY KEY using index "orders_pkey";

alter table "public"."tokens" add constraint "tokens_pkey" PRIMARY KEY using index "tokens_pkey";

alter table "public"."merchants" add constraint "merchants_default_currency_fkey" FOREIGN KEY (default_currency) REFERENCES currencies(currency_id) not valid;

alter table "public"."merchants" validate constraint "merchants_default_currency_fkey";

alter table "public"."merchants" add constraint "merchants_default_language_fkey" FOREIGN KEY (default_language) REFERENCES languages(language_id) not valid;

alter table "public"."merchants" validate constraint "merchants_default_language_fkey";

alter table "public"."merchants" add constraint "merchants_default_token_id_fkey" FOREIGN KEY (default_token_id) REFERENCES tokens(token_id) not valid;

alter table "public"."merchants" validate constraint "merchants_default_token_id_fkey";

alter table "public"."merchants" add constraint "merchants_dynamic_id_key" UNIQUE using index "merchants_dynamic_id_key";

alter table "public"."merchants" add constraint "merchants_email_key" UNIQUE using index "merchants_email_key";

alter table "public"."orders" add constraint "orders_display_currency_fkey" FOREIGN KEY (display_currency) REFERENCES currencies(currency_id) not valid;

alter table "public"."orders" validate constraint "orders_display_currency_fkey";

alter table "public"."orders" add constraint "orders_payment_id_key" UNIQUE using index "orders_payment_id_key";

alter table "public"."orders" add constraint "orders_source_txn_hash_key" UNIQUE using index "orders_source_txn_hash_key";

grant delete on table "public"."currencies" to "anon";

grant insert on table "public"."currencies" to "anon";

grant references on table "public"."currencies" to "anon";

grant select on table "public"."currencies" to "anon";

grant trigger on table "public"."currencies" to "anon";

grant truncate on table "public"."currencies" to "anon";

grant update on table "public"."currencies" to "anon";

grant delete on table "public"."currencies" to "authenticated";

grant insert on table "public"."currencies" to "authenticated";

grant references on table "public"."currencies" to "authenticated";

grant select on table "public"."currencies" to "authenticated";

grant trigger on table "public"."currencies" to "authenticated";

grant truncate on table "public"."currencies" to "authenticated";

grant update on table "public"."currencies" to "authenticated";

grant delete on table "public"."currencies" to "service_role";

grant insert on table "public"."currencies" to "service_role";

grant references on table "public"."currencies" to "service_role";

grant select on table "public"."currencies" to "service_role";

grant trigger on table "public"."currencies" to "service_role";

grant truncate on table "public"."currencies" to "service_role";

grant update on table "public"."currencies" to "service_role";

grant delete on table "public"."languages" to "anon";

grant insert on table "public"."languages" to "anon";

grant references on table "public"."languages" to "anon";

grant select on table "public"."languages" to "anon";

grant trigger on table "public"."languages" to "anon";

grant truncate on table "public"."languages" to "anon";

grant update on table "public"."languages" to "anon";

grant delete on table "public"."languages" to "authenticated";

grant insert on table "public"."languages" to "authenticated";

grant references on table "public"."languages" to "authenticated";

grant select on table "public"."languages" to "authenticated";

grant trigger on table "public"."languages" to "authenticated";

grant truncate on table "public"."languages" to "authenticated";

grant update on table "public"."languages" to "authenticated";

grant delete on table "public"."languages" to "service_role";

grant insert on table "public"."languages" to "service_role";

grant references on table "public"."languages" to "service_role";

grant select on table "public"."languages" to "service_role";

grant trigger on table "public"."languages" to "service_role";

grant truncate on table "public"."languages" to "service_role";

grant update on table "public"."languages" to "service_role";

grant delete on table "public"."merchants" to "anon";

grant insert on table "public"."merchants" to "anon";

grant references on table "public"."merchants" to "anon";

grant select on table "public"."merchants" to "anon";

grant trigger on table "public"."merchants" to "anon";

grant truncate on table "public"."merchants" to "anon";

grant update on table "public"."merchants" to "anon";

grant delete on table "public"."merchants" to "authenticated";

grant insert on table "public"."merchants" to "authenticated";

grant references on table "public"."merchants" to "authenticated";

grant select on table "public"."merchants" to "authenticated";

grant trigger on table "public"."merchants" to "authenticated";

grant truncate on table "public"."merchants" to "authenticated";

grant update on table "public"."merchants" to "authenticated";

grant delete on table "public"."merchants" to "service_role";

grant insert on table "public"."merchants" to "service_role";

grant references on table "public"."merchants" to "service_role";

grant select on table "public"."merchants" to "service_role";

grant trigger on table "public"."merchants" to "service_role";

grant truncate on table "public"."merchants" to "service_role";

grant update on table "public"."merchants" to "service_role";

grant delete on table "public"."orders" to "anon";

grant insert on table "public"."orders" to "anon";

grant references on table "public"."orders" to "anon";

grant select on table "public"."orders" to "anon";

grant trigger on table "public"."orders" to "anon";

grant truncate on table "public"."orders" to "anon";

grant update on table "public"."orders" to "anon";

grant delete on table "public"."orders" to "authenticated";

grant insert on table "public"."orders" to "authenticated";

grant references on table "public"."orders" to "authenticated";

grant select on table "public"."orders" to "authenticated";

grant trigger on table "public"."orders" to "authenticated";

grant truncate on table "public"."orders" to "authenticated";

grant update on table "public"."orders" to "authenticated";

grant delete on table "public"."orders" to "service_role";

grant insert on table "public"."orders" to "service_role";

grant references on table "public"."orders" to "service_role";

grant select on table "public"."orders" to "service_role";

grant trigger on table "public"."orders" to "service_role";

grant truncate on table "public"."orders" to "service_role";

grant update on table "public"."orders" to "service_role";

grant delete on table "public"."tokens" to "anon";

grant insert on table "public"."tokens" to "anon";

grant references on table "public"."tokens" to "anon";

grant select on table "public"."tokens" to "anon";

grant trigger on table "public"."tokens" to "anon";

grant truncate on table "public"."tokens" to "anon";

grant update on table "public"."tokens" to "anon";

grant delete on table "public"."tokens" to "authenticated";

grant insert on table "public"."tokens" to "authenticated";

grant references on table "public"."tokens" to "authenticated";

grant select on table "public"."tokens" to "authenticated";

grant trigger on table "public"."tokens" to "authenticated";

grant truncate on table "public"."tokens" to "authenticated";

grant update on table "public"."tokens" to "authenticated";

grant delete on table "public"."tokens" to "service_role";

grant insert on table "public"."tokens" to "service_role";

grant references on table "public"."tokens" to "service_role";

grant select on table "public"."tokens" to "service_role";

grant trigger on table "public"."tokens" to "service_role";

grant truncate on table "public"."tokens" to "service_role";

grant update on table "public"."tokens" to "service_role";


