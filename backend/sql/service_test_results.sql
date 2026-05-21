create extension if not exists pgcrypto;

create table if not exists public.service_test_results (
  id uuid primary key default gen_random_uuid(),
  service_appointment_id uuid not null references public.service_appointments(id) on delete cascade,
  patient_clerk_id text not null,
  service_id uuid null,
  result_title text not null,
  result_summary text null,
  result_values jsonb null,
  result_file_url text null,
  result_file_public_id text null,
  result_status text not null default 'Draft',
  uploaded_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_test_results_status_check
    check (result_status in ('Draft', 'Available', 'Hidden'))
);

create index if not exists idx_service_test_results_appointment
on public.service_test_results(service_appointment_id);

create index if not exists idx_service_test_results_patient
on public.service_test_results(patient_clerk_id);

create unique index if not exists unique_service_result_per_appointment
on public.service_test_results(service_appointment_id);

create or replace function public.set_service_test_results_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists service_test_results_set_updated_at on public.service_test_results;

create trigger service_test_results_set_updated_at
before update on public.service_test_results
for each row
execute function public.set_service_test_results_updated_at();
