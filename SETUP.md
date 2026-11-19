# One-time setup

Supabase project: **shul-messaging** (`zuyqaicvnpwqawfxakjg`). The database, rules and your imported data are already in place.

## 1. Supabase login emails
Supabase → **Authentication → URL Configuration**
- **Site URL**: `https://silberc1-wq.github.io/shul-messaging-admin/app.html`
- **Redirect URLs**: add `https://silberc1-wq.github.io/shul-messaging-admin/**`

Recommended: Authentication → **Emails → SMTP Settings**. Connect a sender like Resend or Postmark. The built-in sender only allows a few emails per hour.

## 2. n8n
1. Import `n8n/communityconnect.n8n.json`.
2. **Config** node: paste your Twilio Account SID (starts with `AC`).
3. Create credentials:
   - **Supabase API**: Host `https://zuyqaicvnpwqawfxakjg.supabase.co`, Service Role Secret from Supabase → Project Settings → API Keys (secret key). Never put this key on the website.
   - **Twilio API**: Account SID + Auth Token.
   - **Stripe API**: only if you take payments.
4. Activate the workflow and copy the **Production URL** of the *Twilio Inbound SMS* node.

## 3. Twilio
- For **each** number: Phone Numbers → (number) → Messaging → *A message comes in* → **Webhook**, `HTTP POST`, paste the n8n Production URL.
- **A2P 10DLC (required for US texting):** you register as an ISV. Each organization gets **one Brand + one Campaign** with *its own* details, not yours, and all of its numbers share that campaign through one Messaging Service. The signup form collects the details. In the admin site, open **Carrier Registration → Copy for Twilio** and paste them into Twilio → Messaging → Regulatory Compliance. Then record the Brand/Campaign SIDs and status there.

## 4. Payments (Stripe)
1. In Stripe, create a Product per plan with a monthly and a yearly Price, then a **Payment Link** for each.
2. Admin site → **Plans & Pricing** → paste the links into *Monthly payment link* / *Yearly payment link*.
3. The pricing page sends people to the link with their signup reference. When they pay, n8n marks the signup **PAID**, and renewals extend *Paid until*.
4. Approve the signup in **New Signups**: enter the Twilio number you bought, and the organization, owner login, groups and checklist are created.

The **Keep My Number** plan keeps the number reserved with sending paused (yearly fee).

## 5. GitHub Pages
Repo Settings → Pages → Deploy from branch → `main` / root. The site is served at `https://silberc1-wq.github.io/shul-messaging-admin/`.

## Database backups and fixes
- Supabase makes daily backups (Project → Database → Backups).
- All schema changes are stored as migrations in Supabase. To get them locally: `supabase link --project-ref zuyqaicvnpwqawfxakjg && supabase db pull`.
- Undo a mistake: admin site → **Change Log** → *Undo*, or **Show deleted** → *Restore* on any list.
