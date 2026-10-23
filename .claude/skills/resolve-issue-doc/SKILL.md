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
- "Save the first two, then the second two" meant a stale sheet could wipe others' scores; the fix was
  saving only changed cells, not a UI change.
- Duplicate records (subjects, classes) need merge functions that move all dependent rows, not plain deletes.
