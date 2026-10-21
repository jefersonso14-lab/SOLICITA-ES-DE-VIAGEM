alter table public.travel_requests
  add column if not exists origin text,
  add column if not exists job_site_address text,
  add column if not exists hotel_quote_requested boolean not null default false,
  add column if not exists vehicle_quote_requested boolean not null default false,
  add column if not exists meal_extra_payment boolean not null default false,
  add column if not exists taxi_uber_requested boolean not null default false,
  add column if not exists notebook_loan_requested boolean not null default false,
  add column if not exists vacation_status text not null default 'pending'
    check (vacation_status in ('pending', 'yes', 'no'));
