# ShiftCup

Weekly schedules for one café. Your team says when they can work, ShiftCup drafts the week, you approve it.

Live site: https://shiftcup-1dd3b.web.app

## What's in this repo

| Folder | What it is |
| --- | --- |
| `source/` | The app: Expo SDK 58, React Native, Expo Router, NativeWind, Supabase |
| `source/supabase/` | Database migrations and edge functions |
| `web/` | The built website that Firebase Hosting serves. Generated; don't edit by hand |
| `firebase.json`, `.firebaserc` | Firebase Hosting setup (project `shiftcup-1dd3b`) |

## First-time setup

```bash
cd source
cp .env.example .env   # then fill in your Supabase URL and anon key
npx pnpm@10 install
```

`.env` is git-ignored. Never commit it.

## Everyday commands

Run these from `source/`:

| Command | What it does |
| --- | --- |
| `npm run web` | Run the website locally at http://localhost:8081 |
| `npm run phone` | Run on your iPhone with Expo Go (same Wi-Fi; signed in to Expo on both) |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Check code with Biome |
| `npm run web:build` | Build the website into `../web` |
| `npm run web:deploy` | Build, then deploy to Firebase Hosting |

After deploying, commit and push so GitHub matches the live site:

```bash
git add -A && git commit -m "Describe the change" && git push
```

## Opening the app on an iPhone

1. Install **Expo Go** from the App Store and sign in to your Expo account.
2. On the Mac, run `npx expo login` once (same account), then `npm run phone`.
3. On the iPhone, open `exp://<your-mac-ip>:8081` in Safari (the address is printed by `npm run phone`).

Expo Go only runs the newest Expo SDK. When Expo releases a new SDK, the app needs upgrading before it opens in Expo Go again.

## Design notes

Shared UI lives in `source/src/components/kit.tsx`. Motion follows Emil Kowalski's design-engineering guidance:

- Use `PressScale` for anything tappable (scales to 0.97 on press). Don't use opacity flashes.
- Curves and shadows are in `source/src/lib/motion.ts`; haptics in `source/src/lib/haptics.ts`.
- NativeWind `className` does not style Reanimated's `Animated.View`. Put classes on a plain inner `View`.
- Tab switches never animate.
