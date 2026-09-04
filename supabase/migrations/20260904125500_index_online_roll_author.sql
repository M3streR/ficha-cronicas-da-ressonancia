create index if not exists online_roll_records_author_created_idx
  on public.online_roll_records (author_id, created_at desc)
  where author_id is not null;
