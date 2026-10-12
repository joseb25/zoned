# Personal fork notes

This copy of Zoned (MIT, by alarboulletmarin) has three additions for single-user use.

## What was added

1. Apple Watch export, `src/lib/export/appleWorkout*.ts`. A workout page now has
   "Apple Watch (.workout)" in its Export menu. Hard steps carry a pace-range alert
   from the VMA saved in the runner profile. Uses `@bibixx/workoutkit` (MIT).
2. Heat adjustment, `src/lib/heat.ts`. Dew-point table, pure functions. Not yet wired
   to any screen.
3. Pace adaptation, `src/lib/planGenerator/paceAdapt.ts`. Suggests a VMA change from the
   last three weeks of tempo and interval sessions. Needs the new
   `actualWorkPaceMinKm` field on a session. Not yet wired to any screen.

## Run it

```
bun install        # set VERCEL=1 to skip the headless Chrome download
bun run dev        # http://localhost:5173
bun test
bunx vite build    # static site in dist/
```

## Put it on the iPhone

The site is static, so any HTTPS static host works (Cloudflare Pages, Netlify, GitHub
Pages, Vercel). Open the URL in Safari, Share, Add to Home Screen. All training data
stays in the browser's local storage on that device, so use the app's backup export
before clearing Safari data.

## Apple Watch file, first test

Export one workout, open the `.workout` file on the iPhone (Files or AirDrop), and
check that the Workout app offers to add it to the Watch. Needs iOS 17 and watchOS 10
or later. The format is reverse engineered, so a future watchOS update could break it.

## Known limits

- Free-text session notes still quote the paces from generation time after a VMA change.
  Read paces from `paceNotes`.
- Heat percentages assume a heat-acclimated runner. Treat them as a starting point.
