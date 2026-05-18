# FestyVille — Build & Release Guide

Every team member must be able to trigger a build from their local machine.
All EAS commands are run from the `frontend/` directory.

---

## Prerequisites

1. **Node.js 18+** installed locally
2. **EAS CLI** installed globally:
   ```bash
   npm install -g eas-cli
   ```
3. **Expo account** — create one at https://expo.dev if you don't have one
4. **Apple Developer account** ($99/yr) — for iOS builds and App Store submission
5. **Google Play Console account** ($25 one-time) — for Android submission

---

## First-Time Setup

```bash
cd frontend

# Log in to your Expo account
eas login

# Link the project to your Expo account (run once per repo clone)
eas project:init

# Set up iOS certificates and provisioning profiles (interactive)
# EAS handles cert generation and storage automatically
eas credentials --platform ios

# Set up Android keystore (EAS generates and stores it securely)
eas credentials --platform android
```

---

## Build Profiles

Three profiles are defined in `frontend/eas.json`:

| Profile | Purpose | Distribution | Android output |
|---------|---------|--------------|----------------|
| `development` | Device testing with dev client | Internal (ad-hoc) | APK |
| `preview` | Internal QA / stakeholder review | Internal (ad-hoc) | APK |
| `production` | App Store / Google Play submission | Store | AAB |

---

## Triggering Builds

All builds run in the cloud — no Mac required for iOS.

```bash
cd frontend

# iOS development build (installs on physical device via TestFlight-like link)
eas build --platform ios --profile development

# Android development build (APK, side-loadable)
eas build --platform android --profile development

# Both platforms at once
eas build --platform all --profile development

# Preview build (internal distribution)
eas build --platform all --profile preview

# Production build (App Store / Play Store)
eas build --platform all --profile production
```

After the build completes, EAS prints a download/install link for internal builds, or a build artifact you submit to the stores.

---

## OTA Updates (expo-updates)

JS/TS code changes can be shipped **without** a full App Store review using EAS Update.

```bash
cd frontend

# Push an update to the preview channel
eas update --channel preview --message "Fix build timer display"

# Push an update to production
eas update --channel production --message "Hotfix leaderboard score rounding"
```

> **Important:** OTA updates only cover JS/TS and asset changes. Any native module changes (new packages with native code, app.json plugin changes) still require a full build.

---

## Submitting to Stores

```bash
cd frontend

# Submit the latest production iOS build to App Store Connect
eas submit --platform ios --latest

# Submit the latest production Android build to Google Play
eas submit --platform android --latest
```

Before submitting, update `eas.json` → `submit.production.ios`:
- `appleId`: your Apple ID email
- `ascAppId`: the numeric App ID from App Store Connect

For Android, place your Google service account JSON at `frontend/google-service-account.json`.

---

## Environment Channels

| Channel | Who uses it | Update frequency |
|---------|-------------|------------------|
| `preview` | Internal team, QA | Per PR merge |
| `production` | End users | Per release |

---

## Useful Commands

```bash
# View all builds for this project
eas build:list

# Check build status
eas build:view

# View update history
eas update:list

# Manage credentials
eas credentials
```

---

## Replit Note

In this Replit environment, the app runs as **Expo Web** (port 5000) for rapid iteration.
EAS CLI commands must be run **locally** — they are not supported inside Replit.
The `frontend/eas.json` config is committed and ready; clone the repo and run from your machine.
