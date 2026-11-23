---
name: messaging
description: Use for teacher–parent and parent–parent messaging: class announcements, class parents' chats, private messages, unread badges, reporting, blocking and moderation.
---

# Messaging

## Design (from research into ClassDojo/Remind school policies and parent WhatsApp-group guidance)
- **Class spaces**, one pair per class, membership derived from enrolment (`chat_parent_class_ids`,
  `chat_teacher_class_ids`), so access follows the pupil when they move class:
  - *Announcements*: teachers of the class (class + subject teachers) and admins post; parents read and reply privately.
  - *Parents' chat*: parents talk; the class teacher and admins can read and moderate. Parents are told this, and the
    guidelines are pinned (logistics only, no comments about staff/pupils, concerns go to the teacher or office).
- **Private messages**:
  - teacher ↔ parent of a pupil in a class the teacher teaches (admins ↔ any parent). Kept as a school record; admins can read.
  - parent ↔ parent of the same class, only if the recipient opted in (`chat_settings.allow_parent_dm`, default off).
    Private to the two; admins see a message only if reported. Block either way (`chat_blocks`).
- **School office** (23 Nov 2026, `20261123c_school_office_messages.sql`): one `kind = 'office'` conversation per
  parent (`direct_key = 'office:<parent uid>'`, only the parent is a member), started by the parent with
  `chat_start_office()`. Front desk has chat role `office` (`chat_role`, `getChatRole`): sees office conversations
  only, no New button, no class spaces or teacher–parent messages. Admins see them too (`chat_is_office`). Staff
  replies are labelled "School office"; staff unread counts only parent messages after the last office reply. The
  parent is emailed on replies; staff only get the badge. Test:
  [`office-messages-pglite-test.mjs`](office-messages-pglite-test.mjs) (31 checks).
- **Records**: nothing is deleted. Unsend (15 min) and moderation copy the original to `chat_message_archive`
  (admins only) and blank the body.
- **Safety**: report (⋯ menu), admin/class-teacher remove with reason, mute in a class chat (`chat_mutes`),
  20 messages/minute limit, students have no access, no phone numbers or emails shown.
- **Teacher reply hours** (`chat_settings.reply_from/to`): shown to parents with the office number for urgent matters.
  Never blocks sending.
- **Live updates**: `LiveRefresh` polls `router.refresh()` every 7s while the tab is visible (no websockets).

## Where things live
- SQL: `docs/migrations/20261025_messaging.sql` (tables `chat_*`, functions `chat_*`; read via RLS, writes via
  functions or the insert trigger which stamps sender, name and label).
- `src/lib/chat.ts` (types, loaders, Lagos time formatting), `src/lib/chat-actions.ts` (server actions),
  `src/components/chat/pages.tsx` (inbox, conversation, new, settings — shared by portal and admin),
  `src/components/chat/client.tsx` (composer, refresher, scroller, message menu).
- Routes: `/portal/messages/**`, `/admin/messages/**`, admin `/admin/messages/moderation` (admin-only in middleware).
- Badges: `chat_unread_total()` in `src/app/admin/layout.tsx` and `src/app/portal/layout.tsx`.

## Rules
- `profiles.role` is an enum: compare it as `role::text` with text arrays. `email_from_chat_message` compared it with
  `staff_roles text[]`, the error was swallowed by its handler, and no message email was queued until 23 Nov 2026.
- Permission logic lives in the database (`chat_can_read`, `chat_can_post`, `chat_dm_kind`); the UI only mirrors it.
- Permission functions must return definite booleans (wrap with `coalesce(…, false)`).
- Keep parent–parent messages private unless reported; don't add admin read access without the user asking.
- Test rule changes with the PGlite harness: who can read/post per space, DMs allowed/refused, block, mute,
  unsend/archive, reported-message visibility, child moving class.

## Ideas not built yet
Push notifications (email alerts are built: see the `email` skill), attachments/photos, read receipts for announcements, translation, parents messaging the
school office directly.

## Expert review
Before calling the work done, answer these as a safeguarding lead and school communications manager (30+ years) would. Where an answer needs a decision the school hasn't made, ask.

- **Child protection first.** Staff–family messages stay on the school's record; pupils have no private messaging
  with staff. Any new channel is checked against this before it is built.
- **Professional boundaries.** Reply hours are shown, urgent matters go to the office, and nobody discusses another
  child.
- **Moderation is fair and recorded.** Every removal has a reason and a name; reports reach a named person quickly.
- **Records and requests.** Messages are kept per the school's policy, and the school may have to produce a
  person's messages if they ask under the NDPA.
- **Tone.** Announcements are short and clear, with one action; avoid anything that starts a reply-all storm.
