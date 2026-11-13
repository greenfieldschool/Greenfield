---
name: resolve-issue-doc
description: Use when the user attaches an issues/*.docx or *.pdf from the school (text plus screenshots of the live site) and asks to resolve it.
---

# Resolve an issue document

## When to use
"Resolve @issues/issueN.docx", "fix what's in this document". The documents are written by school staff: short
notes in capitals or plain English, each followed by a screenshot. Several unrelated problems per document.

## Steps
1. **Extract the text**: `textutil -convert txt -stdout issues/<file>.docx` (PDF: use the pdf skill / Read with pages).
2. **Extract the screenshots in document order.** Unzip into a fresh scratchpad folder, then map image ids:
   ```bash
   D=<scratchpad>/issueN; mkdir -p $D && cd $D && unzip -o -q <repo>/issues/<file>.docx
   grep -o 'r:embed="[^"]*"' word/document.xml          # order of images in the text
   tr '>' '\n' < word/_rels/document.xml.rels | grep image  # rId -> media/imageX.png
   ```
   Read each image. The same image can be reused for two items (that happened in issue3), so read the text around it.
   Note the date in the screenshot's taskbar: it tells you which deployment the user was on.
3. **List the items** back to the user in one line each before fixing.
3a. **Treat each request as the problem, not the design.** The documents are written by school staff, not
   software people. They describe what they want in the words and shapes they know (an "icon", a fixed list of
   categories, "delete", "one page per section"), and that is often not the best way to build it. For every item,
   ask what they are really trying to achieve and whether there is a simpler, safer or more useful way:
   - Fixed lists in the request (categories, item names, sections) → usually data the school can edit, seeded with
     their list, not hard-coded pages.
   - "Delete" for real records → usually archive/deactivate (reversible, keeps history and audit), with a permanent
     delete only for records nothing depends on, or a merge for duplicates.
   - Several near-identical modules → one module with a filter (section, category, location).
   - Limits stated as rules ("max 2MB") → meet the intent kindly (shrink photos in the browser before upload rather
     than rejecting them).
   - Check whether something already built does the job, and extend it rather than adding a parallel feature.
   Say briefly what you'll do differently and why, in plain language, before building. For large items, get the
   user's go-ahead on the approach. Keep everything the school actually needs; improve the how, not the what.
4. **Check whether an item is already fixed**: `git log --format='%h %ad %s' --date=iso` and compare with the
   screenshot date. Recent commits often already cover older items; say so instead of redoing them.
5. **Reproduce crashes** ("Application error: a server-side exception has occurred … Digest"). We never have the
   server logs. The usual cause is an inline server action capturing a function / array method (see
   admin-portal-page skill). Prove it with a minimal scratch Next app if unsure, and scan the build output:
   ```bash
   grep -rhoE 'encryptActionBoundArgs\)\("[0-9a-f]+",\[[^]]*\]' .next/server/app | grep -E '\.(find|filter|map|some|includes)\]|\.[a-zA-Z]+\]'
   ```
6. Fix each item with the matching skill (admin-portal-page, supabase-migration, results-and-reports, …).
7. Update the Learn Centre (`src/app/admin/learn/page.tsx`) if a workflow changed.
8. Report per item: what was wrong, what changed, and anything the user must do (run a migration, assign
   subjects, …). Don't commit `issues/` files.

## Pitfalls we hit
- issue11 = issue10 (same three screenshots, from 16 Oct and 3 Nov) plus two new requests: an inventory module with
  six hard-coded categories, and a "Deactivate icon" that was also described as "permanently deleted". See step 3a:
  one asset register with editable categories, and archive + merge rather than plain delete.
- A new document can repeat earlier ones word for word (issues9 = issue8 plus one new item). Diff the text against
  older docs (`textutil` both) and check `git log`: say which items were already fixed and when, and only build
  what is new. issue10 = issues9 (same screenshots, reordered) plus an e-learning proposal (assignments, lesson
  notes, video classes) and a "Published Results" section. Compare screenshots with `cmp`, not by file name.
- "Where is X?" often means the feature exists but the page they were on doesn't lead to it (issues9: they were on
  Welfare criteria looking for the class score sheet). Link the two pages and use their words in the menu.
- "Save the first two, then the second two" meant a stale sheet could wipe others' scores; the fix was
  saving only changed cells, not a UI change.
- Duplicate records (subjects, classes) need merge functions that move all dependent rows, not plain deletes.
