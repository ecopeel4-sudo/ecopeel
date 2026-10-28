# EcoPeel

EcoPeel is a responsive monitoring dashboard for the banana-peel bioplastic production machine. The Arduino Mega remains responsible for local machine sequencing and safety. The ESP32 will relay machine data to Firebase Realtime Database, and this website reads it for monitoring.

## Current features

- Public access: live dashboard, current machine state, sensor readings, workflow progress, and notifications.
- Admin-only access: production history and analytics.
- Firebase Authentication email/password sign-in, with administrator access checked using the Firebase custom claim \`admin: true\`.
- Clearly labelled demo data when Firebase client configuration is not present.
- Responsive layout for desktop, tablet, and mobile.
- Monitoring only. This site does not start, stop, or control the machine.

## Run locally

Requires Node.js 20.19+ or a current supported Node.js LTS release.

\`\`\`bash
npm install
cp .env.example .env.local
npm run dev
\`\`\`

On Windows PowerShell, copy the environment template with:

\`\`\`powershell
Copy-Item .env.example .env.local
\`\`\`

Fill in the Firebase web app configuration values in \`.env.local\` using Firebase Console → Project settings → Your apps. Do not put a Firebase Admin SDK service-account private key in any \`VITE_*\` variable or in browser code.

To create a production build:

\`\`\`bash
npm run build
npm run preview
\`\`\`

## Vercel setup

Import \`ecopeel4-sudo/ecopeel\` in Vercel and choose the Vite framework preset. The default build command is \`npm run build\`, and the output directory is \`dist\`. Add each \`VITE_FIREBASE_*\` variable from \`.env.example\` under Vercel Project → Settings → Environment Variables, then redeploy.

## Firebase data layout

The app currently listens to these Realtime Database paths:

- \`ecopeel/live\` — the latest machine state and current sensor readings.
- \`ecopeel/notifications\` — notification records as an array or keyed object.
- \`ecopeel/history\` — production batch records (admin-only in the app and should be protected by rules).
- \`ecopeel/telemetry\` — a time series of sensor readings for charts.

Suggested \`ecopeel/live\` fields:

\`\`\`json
{
  "status": "Dehydrating",
  "machineOn": true,
  "currentStep": "Dehydrating",
  "progress": 60,
  "temperature": 58.5,
  "dehydratorTemperature": 54.8,
  "humidity": 31,
  "loadedMolders": 4,
  "targetMolders": 6,
  "online": true,
  "updatedAt": 1793158800000,
  "fault": false
}
\`\`\`

Use a Unix timestamp in milliseconds for \`updatedAt\`, \`createdAt\`, and telemetry timestamps. Field names can be adapted when the Arduino/ESP32 message format is implemented.

## Admin security

The admin login uses Firebase Authentication email/password and the Realtime Database allowlist at \`ecopeel/admins/{uid}\`. After creating an admin user in Firebase Authentication, add the user's UID as a Boolean \`true\` at \`ecopeel/admins/{uid}\` using the Firebase Console. The app verifies this role by reading only that user's own allowlist entry. Do not allow clients to write to \`ecopeel/admins\`; the example rules deny client writes there.

The public dashboard only needs public read access to live monitoring data, notifications, and telemetry. Production history should only be readable by admins. Device writes should require a separately authenticated device identity. Review \`database.rules.example.json\` before applying its rules to your project; don't deploy permissive test rules.

## Material sensors and notifications

The Material sensors page reads semantic sensor states from `ecopeel/live/materialSensors`. The ESP32 should convert each sensor's electrical signal into an explicit `empty` Boolean; do not assume HIGH or LOW means empty without confirming the sensor wiring and logic.

Suggested sensor fields under `ecopeel/live`:

```json
{
  "materialSensors": {
    "water": { "empty": false, "sensorType": "non_contact_liquid", "updatedAt": 1793158800000 },
    "vinegar": { "empty": false, "sensorType": "non_contact_liquid", "updatedAt": 1793158800000 },
    "glycerin": { "empty": true, "sensorType": "non_contact_liquid", "updatedAt": 1793158800000 },
    "cornStarch": { "empty": false, "sensorType": "ir", "updatedAt": 1793158800000 }
  }
}
```

For this contract, `empty: true` means the supply is empty and `empty: false` means material is detected/available. If the field is missing or has an unknown format, the website shows “Waiting for data” instead of guessing.

Notifications may use these category values at `ecopeel/notifications/{notificationId}`:
`malfunction`, `emergency_stop`, `empty_chamber`, `no_molder`, `over_temperature`, `batch_done`, and `empty_material`. A material-empty alert should include the material key, for example:

```json
{
  "title": "Glycerin is empty",
  "message": "The glycerin sensor reports an empty supply. Refill it before starting the relevant process.",
  "type": "empty_material",
  "category": "empty_material",
  "materialKey": "glycerin",
  "autoGenerated": true,
  "active": true,
  "createdAt": 1793158800000,
  "read": false
}
```

The web app can write and resolve material-empty notifications while an administrator is signed in and the page is open. For reliable alerts when the website is closed or nobody is signed in, the ESP32 firmware should also write the same notification when an empty state begins, and set `active: false` when the supply is restored. The website's mark-as-read and delete actions are administrator-only and use the existing Firebase rules; do not make notification writes public.

## Important

- The initial displayed values are illustrative demo data when Firebase is not configured. They are not real sensor readings.
- Firebase client configuration identifies the project but is not an admin secret. Access control must be enforced by Firebase Authentication and Realtime Database Security Rules.
- The web app is not a safety controller. Use independent hardware emergency stops and thermal protection; machine safety must work even when Wi-Fi, Firebase, or Vercel is unavailable.
