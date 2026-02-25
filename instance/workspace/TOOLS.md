# Alma — Available Tools

## Capture
- `capture_item(text, type?)` — Parse text/voice into task, event, reminder, or note
- `capture_voice(audio_id)` — Transcribe and capture from voice note

## Calendar
- `calendar_today()` — Get today's events
- `calendar_upcoming(days)` — Get events for next N days
- `calendar_create(title, start, end, location?)` — Create event
- `calendar_update(event_id, changes)` — Update event
- `calendar_delete(event_id)` — Delete event

## Tasks
- `tasks_pending(user_id?)` — Get pending tasks (optionally for specific member)
- `tasks_overdue()` — Get overdue tasks
- `tasks_create(title, due?, assigned_to?)` — Create task
- `tasks_complete(task_id)` — Mark task done
- `tasks_assign(task_id, user_id)` — Assign to family member

## Home Maintenance
- `maintenance_overdue()` — Get overdue maintenance tasks
- `maintenance_upcoming(days)` — Get upcoming maintenance
- `maintenance_add_item(category, name, brand?, model?, install_date?)` — Add home item
- `maintenance_log(item_id, action, cost?, provider?)` — Log maintenance performed

## Nudge
- `nudge_send(user_id, message)` — Send a nudge to a family member
- `nudge_count_today(user_id)` — Check how many nudges sent today (max 5)

## Family
- `family_members()` — List family members
- `family_preferences()` — Get family preferences
- `family_set_preference(key, value)` — Set a preference

## Briefing
- `briefing_generate(user_id)` — Generate morning briefing on demand
