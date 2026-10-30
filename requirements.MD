# Requirements: Calendário do Pai (PWA)

## Functional
- RF01: Monthly calendar view, navigable by month, today highlighted.
- RF02: Tapping a day opens its detail screen (past days included).
- RF03: Create, edit and delete activities (name, icon/emoji, color).
- RF04: Mark an activity as done / not done on a given day.
- RF05: Activities flagged "uses muscle groups" (e.g. Academia) let the user
  pick one or more muscle groups. Default list: Superiores, Inferiores, Peito, Costas, Pernas, Ombros,
  Bíceps, Tríceps, Abdômen, Cardio.
- RF06: Toggle "Choveu" per day.
- RF07: Calendar cells show small indicators (dots for completed activities,
  a rain icon).
- RF08: Past days can be edited freely.
- RF09: Optional note per day.
- RF10: Monthly summary: days at the gym, days it rained, rainy days where
  he skipped the gym.
- RF11: Export all data to a JSON file and import it back (backup).

## Non-functional
- RNF01: Dark and light mode following the system setting.
- RNF02: Fully offline after first load; data stored on the device only.
- RNF03: Large text, tap targets of at least 44px.
- RNF04: All UI text in Brazilian Portuguese.
- RNF05: Logging a day takes under 10 seconds.
- RNF06: Works on iPhone Safari (iOS 16.4+), installed via Add to Home Screen.
- RNF07: Footer shows the app version.

## Out of scope (v1)
Login, cloud sync, automatic weather lookup, notifications, widgets.

## Data model (draft)
- Activity: id, name, icon, color, usesMuscleGroups
- MuscleGroup: id, name
- DayEntry: date (YYYY-MM-DD), rained, notes
- Completion: date, activityId, muscleGroupIds[]