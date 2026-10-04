-- Demo orders only. Dates are relative to when this file is run.
insert into public.orders(order_number, customer_name, customer_email, status, tracking_number, estimated_delivery, delivered_at, created_at)
values
  ('ORD-1001', 'Alex Morgan', 'alex@example.com', 'processing', null, now() + interval '5 days', null, now() - interval '1 day'),
  ('ORD-1002', 'Jamie Chen', 'jamie@example.com', 'shipped', 'NS-784109235', now() + interval '2 days', null, now() - interval '3 days'),
  ('ORD-1003', 'Taylor Reed', 'taylor@example.com', 'delivered', 'NS-784109181', now() - interval '2 days', now() - interval '2 days', now() - interval '7 days'),
  ('ORD-1004', 'Jordan Lee', 'jordan@example.com', 'cancelled', null, null, null, now() - interval '4 days'),
  ('ORD-1025', 'Sam Rivera', 'sam@example.com', 'delivered', 'NS-784108810', now() - interval '12 days', now() - interval '12 days', now() - interval '17 days')
on conflict (order_number) do nothing;
