Secret Rotation Checklist

- [ ] Generate new Supabase anon key and service role key in Supabase dashboard.
- [ ] Store new `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` in production secret store.
- [ ] Store new `JWT_SECRET` and `AGENT_SECRET_KEY` in secret store.
- [ ] Deploy application (use maintenance window if necessary).
- [ ] Run smoke-tests: login, device registration, agent status, admin pages.
- [ ] If smoke-tests pass, revoke old Supabase keys.
- [ ] Rotate or re-issue agent secrets and communicate securely to managed agents.
- [ ] Record rotation in change log and notify stakeholders.
