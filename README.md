# Çekim Takvimi

A small Turkish shoot and reminder planner built with plain HTML, CSS, and JavaScript.

## Run locally

Open `index.html` in a browser.

## Publish

A GitHub Actions workflow publishes the site to GitHub Pages when changes are pushed to `main`. In the repository settings, set Pages' build and deployment source to **GitHub Actions** if it is not already enabled.

## Data storage

Shoots and reminders are saved on the device immediately. GitHub Pages installs a service worker to keep the app shell available offline. If cloud sync is configured and the user is signed in, edits are queued locally while offline and sent when the connection returns. Cloud sync requires a Supabase project; set its URL and publishable key in `supabase-config.js` and apply `supabase-schema.sql` before enabling accounts.
