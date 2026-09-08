# Focus

Focus is a personal task planner with live cross-device sync, offline support, and optional Google Calendar integration.

## What changed in version 4

- Tasks now live as individual Firestore documents under `users/{uid}/tasks/{taskId}`.
- Firebase Authentication identifies the user on every device.
- Firestore listeners keep open phones and browsers updated in real time.
- IndexedDB keeps the app usable offline and sends queued changes after reconnection.
- Existing `focus_tasks` browser data can be imported once from the in-app migration banner.
- Google Calendar is independent from task sync and reuses an event for each task instead of creating duplicates.
- The app now has a normal Vite build and an automatically generated service worker.

The Firebase web configuration is intentionally public client configuration. Access to task data is enforced by Authentication and [`firestore.rules`](./firestore.rules), not by hiding the API key.

## One-time Firebase setup

The project is already configured for `focus-task-manager-517df`. Complete these steps in the Firebase console before using the new app:

1. Open **Build → Authentication → Sign-in method** and enable **Google**.
2. Under **Authentication → Settings → Authorized domains**, add `sid-dogra.github.io`.
3. Open **Build → Firestore Database**, create the database in production mode, and choose a nearby region.
4. Install the project dependencies with `pnpm install`.
5. Sign into the Firebase CLI with `pnpm dlx --allow-build=protobufjs --allow-build=re2 firebase-tools login`.
6. Publish the locked-down database rules with `pnpm deploy:rules`.

The checked-in rules allow only the verified Firebase user whose email is `dograsiddhant@gmail.com`, and only inside that user's own path. Update both [`src/lib/firebase.js`](./src/lib/firebase.js) and [`firestore.rules`](./firestore.rules) if the authorized email changes.

## Local development

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173/focus/`. Add `localhost` to Firebase Authentication's authorized domains if it is not already present.

Before publishing:

```sh
pnpm test
pnpm build
```

## Publishing the web app

The GitHub Pages workflow in [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) tests, builds, and publishes the app whenever `main` is pushed. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

The expected public URL is `https://sid-dogra.github.io/focus/`.

## Moving existing tasks safely

1. Publish the new version and sign in on the browser that currently has the complete task list.
2. When the purple migration banner appears, choose **Move tasks**.
3. Wait until the header says **Synced**.
4. Open Focus on the phone, sign in with the same Google account, and confirm the tasks appear.
5. In **Settings → Data Backup**, export a JSON backup.

The migration keeps the old browser copy. It imports a task only when its ID is missing from Firestore or the local copy is newer, so rerunning it is safe.

## Data model

```text
users/{firebaseUid}/tasks/{taskId}   one document per task
users/{firebaseUid}/settings/app     shared app settings
```

Completing a task sets `active: false`. Deleting a task also hides it and leaves a small deletion marker in Firestore, preventing a stale device or old backup from bringing it back. Backups include active, completed, and deleted task records so that protection survives a restore.

## Google Calendar

Calendar access is optional and separate from Firebase login. Enter the Google OAuth client ID in Focus settings. The OAuth client should include these JavaScript origins:

- `https://sid-dogra.github.io`
- `http://localhost:5173` for development

Pushing a scheduled Focus task stores a private `focusTaskId` property on its calendar event. Later pushes update that event instead of creating another copy.
