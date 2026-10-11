# Çekim Takvimi

A small Turkish shoot and reminder planner built with plain HTML, CSS, and JavaScript.

## Run locally

Open `index.html` in a browser.

## Publish

A GitHub Actions workflow publishes the site to GitHub Pages when changes are pushed to `main`. In the repository settings, set Pages' build and deployment source to **GitHub Actions** if it is not already enabled.

## Data storage

Shoots and reminders are saved on the device immediately and synchronized through the existing Supabase project when signed in. Offline edits are queued and sent when the connection returns. The same account can be used on other devices; live changes are sent through Supabase Realtime. GitHub Pages publishes the app code, while Supabase stores the shared records.
