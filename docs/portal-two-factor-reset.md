# Resetting a client's two-factor (LOVELEEDAY portal)

Two-factor only protects an account if resetting it is harder than asking nicely. Follow every step.

1. **Point them to their backup codes first.** Every person got ten at setup. On the code screen: "Lost your phone? Use a backup code." One code removes the old authenticator and takes them straight to setting up the new phone. No staff involvement.
2. **No codes? Confirm identity out of band, never by replying to the email.**
   - Call the phone number on file for their account (not a number in the request).
   - If their company has another owner or admin on the portal, that person confirms instead, in writing, from their own portal account.
   - If neither is possible, do not reset. Tell them we'll reset after a video call with photo ID matching the account name.
3. **Reset.** Delete the person's authenticator factors (Supabase, project `eydcfgoklajcztpoprsl`, `auth.mfa_factors` for their user id) and sign out their sessions (`auth.sessions`). Never reset a password and two-factor in the same request.
4. **Record it.** Insert an `audit_log` row: action `mfa.reset.manual`, target = their user id, meta = who asked, how identity was confirmed, who reset it.
5. **Tell them.** They sign in with their password and are taken to one-time setup, where they get ten new backup codes.

Red flags that stop a reset: urgency or pressure, a request from a new email address or phone, a request to also change the email or password, anyone asking on someone else's behalf.
