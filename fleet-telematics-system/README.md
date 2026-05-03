# Vehicle Telematics and Fleet Tracking System

This project has three parts:

```text
fleet-telematics-system/
  supabase/
    schema.sql
  mobile-tracker/
    App.js
    app.json
    eas.json
    package.json
    .env.example
  web-dashboard/
    app/
    components/
    lib/
    package.json
    vercel.json
    .env.local.example
```

## 1. Supabase

In Supabase SQL Editor, run:

```text
supabase/schema.sql
```

This creates `location_logs`, RLS demo policies for `car_01`, and enables Supabase Realtime for live web tracking.

## 2. Mobile App

The mobile app is an Expo React Native app. It uploads this phone's GPS location as vehicle ID `car_01`.

Local Expo Go test:

```powershell
cd "D:\FYP\gps tracker app\fleet-telematics-system\mobile-tracker"
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run start:tunnel
```

Open Expo Go, scan the QR code, then tap **Start Tracking**.

Build with EAS:

```powershell
cd "D:\FYP\gps tracker app\fleet-telematics-system\mobile-tracker"
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npx.cmd" eas-cli login
& "C:\Program Files\nodejs\npx.cmd" eas-cli build --platform android --profile preview
```

The `preview` profile creates an installable Android APK. The `production` profile is for store builds.

## 3. Web Dashboard

The web dashboard is a Next.js app. It can show:

- Live location with **Start Live Tracking**
- Historical route with **Start Time**, **End Time**, and **Fetch Route**
- Visible track clearing with **Clear Tracks**

Run locally:

```powershell
cd "D:\FYP\gps tracker app\fleet-telematics-system\web-dashboard"
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run dev
```

Open:

```text
http://localhost:3000
```

## 4. Deploy Web to Vercel

Push this folder to GitHub.

In Vercel:

1. New Project.
2. Import your GitHub repo.
3. Set **Root Directory** to:

```text
fleet-telematics-system/web-dashboard
```

4. Add Environment Variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://upqyuoekanzvdxnfonxw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_iHdlJa91BpMp_nHKsm74eA_ZU7bwbYp
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-javascript-api-key
```

5. Deploy.

After deployment, open the Vercel URL and click **Start Live Tracking** while the phone app is uploading.

Google Maps setup:

1. In Google Cloud Console, enable **Maps JavaScript API**.
2. Create an API key.
3. Restrict it to the Maps JavaScript API.
4. Add browser referrer restrictions for:

```text
http://localhost:3000/*
https://your-vercel-domain.vercel.app/*
```

5. Put that key in `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` locally and in Vercel.

## 5. Important Notes

- Do not use the Supabase `service_role` key in mobile or web code.
- The publishable/anon key is okay for this public demo because RLS limits access to `car_01`.
- If the web dashboard shows fetch errors, check the Supabase URL/key in `.env.local` locally or Vercel Environment Variables in production.
- Google Maps requires billing to be enabled in Google Cloud, even if your usage stays inside the free monthly credit.
- Phone GPS is not millisecond realtime. Expect roughly 1-3 seconds depending on device, GPS signal, network, and Supabase.
