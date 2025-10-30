drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

drop policy "crud_access_to_service_role_for_withdrawals" on "public"."withdrawals";

revoke delete on table "public"."currencies" from "anon";

revoke insert on table "public"."currencies" from "anon";

revoke references on table "public"."currencies" from "anon";

revoke select on table "public"."currencies" from "anon";

revoke trigger on table "public"."currencies" from "anon";

revoke truncate on table "public"."currencies" from "anon";

revoke update on table "public"."currencies" from "anon";

revoke delete on table "public"."currencies" from "authenticated";

revoke insert on table "public"."currencies" from "authenticated";

revoke references on table "public"."currencies" from "authenticated";

revoke select on table "public"."currencies" from "authenticated";

revoke trigger on table "public"."currencies" from "authenticated";

revoke truncate on table "public"."currencies" from "authenticated";

revoke update on table "public"."currencies" from "authenticated";

revoke delete on table "public"."currencies" from "service_role";

revoke insert on table "public"."currencies" from "service_role";

revoke references on table "public"."currencies" from "service_role";

revoke select on table "public"."currencies" from "service_role";

revoke trigger on table "public"."currencies" from "service_role";

revoke truncate on table "public"."currencies" from "service_role";

revoke update on table "public"."currencies" from "service_role";

revoke delete on table "public"."deposits" from "anon";

revoke insert on table "public"."deposits" from "anon";

revoke references on table "public"."deposits" from "anon";

revoke select on table "public"."deposits" from "anon";

revoke trigger on table "public"."deposits" from "anon";

revoke truncate on table "public"."deposits" from "anon";

revoke update on table "public"."deposits" from "anon";

revoke delete on table "public"."deposits" from "authenticated";

revoke insert on table "public"."deposits" from "authenticated";

revoke references on table "public"."deposits" from "authenticated";

revoke select on table "public"."deposits" from "authenticated";

revoke trigger on table "public"."deposits" from "authenticated";

revoke truncate on table "public"."deposits" from "authenticated";

revoke update on table "public"."deposits" from "authenticated";

revoke delete on table "public"."deposits" from "service_role";

revoke insert on table "public"."deposits" from "service_role";

revoke references on table "public"."deposits" from "service_role";

revoke select on table "public"."deposits" from "service_role";

revoke trigger on table "public"."deposits" from "service_role";

revoke truncate on table "public"."deposits" from "service_role";

revoke update on table "public"."deposits" from "service_role";

revoke delete on table "public"."languages" from "anon";

revoke insert on table "public"."languages" from "anon";

revoke references on table "public"."languages" from "anon";

revoke select on table "public"."languages" from "anon";

revoke trigger on table "public"."languages" from "anon";

revoke truncate on table "public"."languages" from "anon";

revoke update on table "public"."languages" from "anon";

revoke delete on table "public"."languages" from "authenticated";

revoke insert on table "public"."languages" from "authenticated";

revoke references on table "public"."languages" from "authenticated";

revoke select on table "public"."languages" from "authenticated";

revoke trigger on table "public"."languages" from "authenticated";

revoke truncate on table "public"."languages" from "authenticated";

revoke update on table "public"."languages" from "authenticated";

revoke delete on table "public"."languages" from "service_role";

revoke insert on table "public"."languages" from "service_role";

revoke references on table "public"."languages" from "service_role";

revoke select on table "public"."languages" from "service_role";

revoke trigger on table "public"."languages" from "service_role";

revoke truncate on table "public"."languages" from "service_role";

revoke update on table "public"."languages" from "service_role";

revoke delete on table "public"."merchants" from "anon";

revoke insert on table "public"."merchants" from "anon";

revoke references on table "public"."merchants" from "anon";

revoke select on table "public"."merchants" from "anon";

revoke trigger on table "public"."merchants" from "anon";

revoke truncate on table "public"."merchants" from "anon";

revoke update on table "public"."merchants" from "anon";

revoke delete on table "public"."merchants" from "authenticated";

revoke insert on table "public"."merchants" from "authenticated";

revoke references on table "public"."merchants" from "authenticated";

revoke select on table "public"."merchants" from "authenticated";

revoke trigger on table "public"."merchants" from "authenticated";

revoke truncate on table "public"."merchants" from "authenticated";

revoke update on table "public"."merchants" from "authenticated";

revoke delete on table "public"."merchants" from "service_role";

revoke insert on table "public"."merchants" from "service_role";

revoke references on table "public"."merchants" from "service_role";

revoke select on table "public"."merchants" from "service_role";

revoke trigger on table "public"."merchants" from "service_role";

revoke truncate on table "public"."merchants" from "service_role";

revoke update on table "public"."merchants" from "service_role";

revoke delete on table "public"."orders" from "anon";

revoke insert on table "public"."orders" from "anon";

revoke references on table "public"."orders" from "anon";

revoke select on table "public"."orders" from "anon";

revoke trigger on table "public"."orders" from "anon";

revoke truncate on table "public"."orders" from "anon";

revoke update on table "public"."orders" from "anon";

revoke delete on table "public"."orders" from "authenticated";

revoke insert on table "public"."orders" from "authenticated";

revoke references on table "public"."orders" from "authenticated";

revoke select on table "public"."orders" from "authenticated";

revoke trigger on table "public"."orders" from "authenticated";

revoke truncate on table "public"."orders" from "authenticated";

revoke update on table "public"."orders" from "authenticated";

revoke delete on table "public"."orders" from "service_role";

revoke insert on table "public"."orders" from "service_role";

revoke references on table "public"."orders" from "service_role";

revoke select on table "public"."orders" from "service_role";

revoke trigger on table "public"."orders" from "service_role";

revoke truncate on table "public"."orders" from "service_role";

revoke update on table "public"."orders" from "service_role";

revoke delete on table "public"."tokens" from "anon";

revoke insert on table "public"."tokens" from "anon";

revoke references on table "public"."tokens" from "anon";

revoke select on table "public"."tokens" from "anon";

revoke trigger on table "public"."tokens" from "anon";

revoke truncate on table "public"."tokens" from "anon";

revoke update on table "public"."tokens" from "anon";

revoke delete on table "public"."tokens" from "authenticated";

revoke insert on table "public"."tokens" from "authenticated";

revoke references on table "public"."tokens" from "authenticated";

revoke select on table "public"."tokens" from "authenticated";

revoke trigger on table "public"."tokens" from "authenticated";

revoke truncate on table "public"."tokens" from "authenticated";

revoke update on table "public"."tokens" from "authenticated";

revoke delete on table "public"."tokens" from "service_role";

revoke insert on table "public"."tokens" from "service_role";

revoke references on table "public"."tokens" from "service_role";

revoke select on table "public"."tokens" from "service_role";

revoke trigger on table "public"."tokens" from "service_role";

revoke truncate on table "public"."tokens" from "service_role";

revoke update on table "public"."tokens" from "service_role";

revoke delete on table "public"."withdrawals" from "anon";

revoke insert on table "public"."withdrawals" from "anon";

revoke references on table "public"."withdrawals" from "anon";

revoke select on table "public"."withdrawals" from "anon";

revoke trigger on table "public"."withdrawals" from "anon";

revoke truncate on table "public"."withdrawals" from "anon";

revoke update on table "public"."withdrawals" from "anon";

revoke delete on table "public"."withdrawals" from "authenticated";

revoke insert on table "public"."withdrawals" from "authenticated";

revoke references on table "public"."withdrawals" from "authenticated";

revoke select on table "public"."withdrawals" from "authenticated";

revoke trigger on table "public"."withdrawals" from "authenticated";

revoke truncate on table "public"."withdrawals" from "authenticated";

revoke update on table "public"."withdrawals" from "authenticated";

revoke delete on table "public"."withdrawals" from "service_role";

revoke insert on table "public"."withdrawals" from "service_role";

revoke references on table "public"."withdrawals" from "service_role";

revoke select on table "public"."withdrawals" from "service_role";

revoke trigger on table "public"."withdrawals" from "service_role";

revoke truncate on table "public"."withdrawals" from "service_role";

revoke update on table "public"."withdrawals" from "service_role";

alter table "public"."withdrawals" drop constraint "withdrawals_merchant_id_fkey";

alter table "public"."withdrawals" drop constraint "withdrawals_tx_hash_key";

alter table "public"."withdrawals" drop constraint "withdrawals_pkey";

drop index if exists "public"."withdrawals_pkey";

drop index if exists "public"."withdrawals_tx_hash_key";

drop table "public"."withdrawals";


