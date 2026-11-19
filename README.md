# CommunityConnect

Text **and** voice announcements for shuls, schools and any community. An approved admin texts one number, and members get a text or a phone call.

- **Public site** (`index.html`): pricing, signup, and payment.
- **Admin site** (`app.html`): each organization's admins sign in with their email, **send messages** (with a live SMS segment calculator) and manage everything.
- **Supabase**: all data and all rules (who may send, to which groups, limits, history, change log).
- **n8n** (`n8n/communityconnect.n8n.json`): carries texts in and out between Twilio and Supabase.
- **Twilio**: phone numbers, texts and calls.
- **Stripe** (optional): payments.

```
Member/admin phone ⇄ Twilio ⇄ n8n ⇄ Supabase ⇄ Admin website (GitHub Pages)
                                         ⇡
                                Stripe payments (n8n)
```

## Text commands

| Command | What it does |
|---|---|
| `SEND MEN Mincha at 6:45` | Asks for YES, then sends by each member's preference (text or call) |
| `TEXT ALL …` / `CALL ALL …` | Texts only / voice calls only |
| `EMERGENCY ALL …` | Sends immediately, ignores quiet hours |
| `SCHEDULE BOARD 2026-12-01 19:00 …` | Sends later |
| `YES` / `NO` | Confirm / cancel the pending message (expires after 30 min) |
| `COMMANDS` | Help |
| Members: `STOP`, `START`, `JOIN [GROUP] [TEXT/CALL] [name]` | Opt out / back in / sign up |

Any other text from a member is saved as a **Reply** and forwarded to the office phone.

## Security

- Only phones on an organization's **Texters** list can send, and only to their allowed groups (FULL ADMIN = all groups).
- Website admins see **only their own organization** (Postgres row-level security). Org admins cannot change plan, billing, limits or phone numbers.
- Incoming texts are accepted only with a valid Twilio signature.
- Website admins can send only if an owner allows it, and only to their allowed groups.
- The sending functions can only be called with the Supabase **service role key**, which is kept in n8n. The key in `assets/config.js` is the public "publishable" key; it is safe to publish.
- Nothing is hard-deleted. Deletes hide the row and can be restored, and every change is written to an append-only change log with who made it.

See **[SETUP.md](SETUP.md)** for the one-time setup steps.
