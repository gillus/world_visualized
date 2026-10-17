# Daily curriculum sync: scheduled task prompt

Paste the prompt below into a daily scheduled Claude task on the PC that has
both connectors: **school** (local, Argo) and **Study Atlas** (this Worker).
Evening runs (e.g. 21:00) catch what teachers wrote in the register that day.
If `save_curriculum`'s schema changes, update this prompt with it.

---

Sync my children's school curriculum into Study Atlas. Use only the **school**
connector to read and Study Atlas's **save_curriculum** to write. Today is the
date of this run; all dates are YYYY-MM-DD.

1. Call school `list_students`. Do the steps below for each student, using its
   `student` id (e.g. `s`).
2. Read:
   - `get_lesson_topics` with `from` = today minus 42 days;
   - `get_homework` with `due_from` = today, `due_to` = today plus 21 days;
   - `get_reminders`, keeping only those dated from today to today plus 21 days.
3. Build one snapshot:
   - `student`: the id. `class`: the year and school level in Italian, without
     the section letter (class "2 A" in a scuola secondaria di primo grado →
     `"2ª media"`). `school_year`: from list_students. `as_of`: today.
   - `subjects`: one entry per subject, named as the register names it.
     `topics`: that subject's lesson topics, newest first, copied word for word
     (cut to 400 characters if longer; skip empty ones and repeats; at most 60).
     `upcoming`: its homework and reminders, soonest first (at most 30), each
     with `kind` = `test` if it mentions a verifica, interrogazione, test,
     prova or compito in classe, otherwise `homework` (homework) or `reminder`
     (reminders). Put a reminder under the subject it names; if it names none,
     under a subject called `PROMEMORIA`.
   - Never include grades, absences, notices, teacher fields, email addresses
     or anyone's name or initials. If a topic or homework text contains a
     person's name or initials, drop those words.
4. Call Study Atlas `save_curriculum` with `{ "snapshot": … }`, one call per
   student. If it reports an error, fix the snapshot and call it again.
5. If the school connector fails for a student, don't save anything for that
   student: yesterday's snapshot stays.

Finish with one line per student: subjects saved, number of topics, and the
next test if there is one.
