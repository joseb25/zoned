# Project notes (personal fork)

Context for anyone, human or AI, picking this project up in a new session. Keep personal data (paces, race goals, health numbers) out of this file, the fork is public.

## What this is

A single-user replacement for a paid running-coach app. It is a fork of Zoned (MIT, by alarboulletmarin), a React 19 + Vite 7 static PWA with no backend. All data stays in the browser's local storage on the device. The user is on iPhone with an Apple Watch.

## Where things live

- Fork: `joseb25/zoned`. Work happens on branch `personal-additions`. `main` is untouched upstream code.
- In the local clone the fork's git remote is named `fork`, and `origin` points at upstream, which the session cannot push to.
- Hosting: Cloudflare Pages, project `my-runna-plan`, address `https://my-runna-plan.pages.dev/`. Production branch is `personal-additions`, framework preset None, build command `npx vite build`, output directory `dist`, environment variables `VERCEL=1` (skips the headless Chrome download in postinstall) and `NODE_VERSION=22`. Pages falls back to `index.html` for unknown paths, so deep links such as `/library` work.
- Install on iPhone: open the address in Safari, Share, Add to Home Screen, then use the app from the icon (Safari and the installed app have separate storage).

## What was added on top of Zoned

| Area | Files | State |
| --- | --- | --- |
| Apple Watch export | `src/lib/export/appleWorkoutBuilder.ts` (pure), `appleWorkout.ts` (download), menu entry in `src/components/domain/ExportMenu.tsx` | Working on a real device |
| Heat adjustment | `src/lib/heat.ts`, input in `src/components/domain/AppleWatchExportDialog.tsx` | Connected to the Apple Watch export, untested on a real device |
| Pace adaptation | `src/lib/planGenerator/paceAdapt.ts`, field `actualWorkPaceMinKm` on `PlanSession` | Code and tests only, no screen to enter paces or show the suggestion |

### Apple Watch export details

- Uses `@bibixx/workoutkit` (MIT, reverse-engineered `.workout` format, works in the browser, no Apple developer account). Needs iOS 17 and watchOS 10 or later. The format has no public spec and could break with a future watchOS.
- Pace targets come from the VMA saved in the runner profile, through `calculateTrainingPaces` and `getPaceForZone`. Without a VMA the file has no alerts.
- Every step carries a `SpeedRangeAlert` (metric "current" by default, "average" on request): work steps use the zone range, warm-up, cool-down and recovery steps use the easy range (zones 1 and 2 share one range). The heat factor multiplies every range.
- The Watch ignores a pace alert on its dedicated warm-up and cool-down slots (Apple's custom workout screen only offers a heart rate alert there, and a real run was silent during the warm-up). So with a VMA, warm-up and cool-down are written as ordinary "recovery" steps at the start and end of the block, named "Warm-up" and "Cool-down". The Watch no longer labels them as warm-up and cool-down. Without a VMA there are no alerts and the dedicated slots are used.
- Consecutive warm-up segments are merged into one step, same for cool-down.
- Tapping "Apple Watch" in the export menu opens a small dialog (`AppleWatchExportDialog`): optional temperature (C) and humidity (%) feed `heatAdjustment`, whose `paceFactor` slows every pace range, and a switch picks the alert pace, "current" or "average". The alert pace is remembered in this browser (`src/lib/export/watchExportPrefs.ts`), the weather is not. The dialog warns when no VMA is saved, because then the file has no alerts.
- In the file format "current" is the default and has no explicit marker: the library reads it back as an absent metric, "average" is written explicitly.
- The `treadmill` option exists in the builder (writes an indoor workout) but the menu does not expose it.

### Verified on a real iPhone and Apple Watch

- Opening the `.workout` file adds it to the Watch, the step list shows the pace ranges, the Watch shows "behind" with current pace, and a haptic buzz fires when behind the target range.
- The Watch needs Haptics set to Default or Prominent and Silent Mode off, otherwise alerts are silent. This cost a round of debugging.
- Indoor walking is not a valid test, the workout is outdoor and pace comes from GPS.

- A pace alert on the dedicated warm-up slot stayed silent on a real run, while the main steps buzzed.
- After moving warm-up and cool-down into regular block steps, the warm-up alert works on a real run.

### Not verified

- Whether the Watch buzzes when running too fast (ahead of the range), only "behind" was seen.
- Whether the Watch buzzes when pace returns into the range.
- Whether Apple's first-kilometre grace period for pace alerts applies to custom workouts.
- Whether "current" pace (now the default) reacts better than "average", or buzzes too often while pace settles at the start of a step. The dialog switch makes it easy to compare.
- The heat dialog on a real device (layout on the phone, the effect of the slowed ranges on a real run).

## Constraints worth remembering

- A web app on iOS cannot give live pace coaching. It cannot read the Watch's live data or run in the background with the screen locked. Live alerts rely on the Watch. Phone notifications or spoken cues would need a native app (free signing expires every 7 days, App Store or TestFlight needs the $99/year program).
- Zoned's no-network rule: the app makes no network calls. A weather fetch for heat adjustment would break that rule and needs a deliberate decision.
- Free-text session notes keep paces from generation time after a VMA change. Read paces from `paceNotes`.

## Roadmap, unbuilt

1. A place to enter the real average pace of the hard part of a session (`actualWorkPaceMinKm`), and a banner that shows and applies the VMA suggestion from `suggestVmaAdjustment`.
2. Expose the treadmill (indoor) option in the export menu.
3. Refresh stale free-text notes after a VMA change.

## Checks

```
bunx tsc --noEmit
bun test                      # one known failure on pristine upstream: planIcs "places each session on its own day"
bun run check:i18n
bun run check:typography
bunx vite build
```
