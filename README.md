# Thali

A free, private calorie, macro, water, weight and workout tracker with Indian foods built in. No account, no ads, no subscription. Runs as an installable web app (PWA). All data stays in your browser.

## Features
- Calorie and macro goals from your profile (Mifflin-St Jeor), recalculated when you log a new weight
- Diary with four meals, ~150 built-in Indian foods, custom foods, recent foods
- Packaged food search and barcode lookup through Open Food Facts (online only)
- Water, weight trend chart, workouts with MET-based calories, weekly totals, streaks
- JSON backup and restore, CSV export of the food log
- Works offline after first load, light and dark mode

## Host it free on GitHub Pages
1. Push this folder to a GitHub repository.
2. Repository Settings, Pages, Source: Deploy from a branch, branch `main`, folder `/ (root)`.
3. Open `https://<your-username>.github.io/<repo-name>/` and add it to your home screen.

## Develop
No build step. Run `python3 -m http.server` in this folder and open http://localhost:8000.
Add foods in `foods.js`: `[name, serving label, grams, kcal, protein, carbs, fat]`.
