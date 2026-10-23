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
- Permission logic lives in the database (`chat_can_read`, `chat_can_post`, `chat_dm_kind`); the UI only mirrors it.
- Permission functions must return definite booleans (wrap with `coalesce(…, false)`).
- Keep parent–parent messages private unless reported; don't add admin read access without the user asking.
- Test rule changes with the PGlite harness: who can read/post per space, DMs allowed/refused, block, mute,
  unsend/archive, reported-message visibility, child moving class.

## Ideas not built yet
Push/email notifications, attachments/photos, read receipts for announcements, translation, parents messaging the
school office directly.
