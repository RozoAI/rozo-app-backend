create policy "crud_access_to_service_role_for_currencies"
on "public"."currencies"
as permissive
for all
to service_role
using (true)
with check (true);


create policy "crud_access_to_service_role_for_languages"
on "public"."languages"
as permissive
for all
to service_role
using (true)
with check (true);


create policy "crud_access_to_service_role_for_merchants"
on "public"."merchants"
as permissive
for all
to service_role
using (true)
with check (true);


create policy "crud_access_to_service_role_for_orders"
on "public"."orders"
as permissive
for all
to service_role
using (true)
with check (true);


create policy "crud_access_to_service_role_for_tokens"
on "public"."tokens"
as permissive
for all
to service_role
using (true)
with check (true);



