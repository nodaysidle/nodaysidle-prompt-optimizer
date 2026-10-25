---
title: Xiaomi Mi 10T (apollo) custom-ROM feasibility audit
author: Nodaysidle
date: 2026-10-24
branch: master
cost: { minutes: 1, tokens: 1367 }
touches:
  - AGENTS.md
---

## Decided
- Connected device is a stock Xiaomi Mi 10T: model M2007J3SY, codename `apollo`, product `apollo_eea` (EEA/Europe), SoC Snapdragon 865 (SM8250/kona).
- It runs the FINAL official firmware: Android 12 / MIUI 14 (V14.0.1.0.SJDEUXM), security patch 2023-03-01. No official Android 13+ exists for this device — Android 12 is the official EOL.
- Bootloader is LOCKED (ro.boot.flash.locked=1, vbmeta locked, verifiedbootstate=green) but OEM unlock is PERMITTED: sys.oem_unlock_allowed=1.
- Custom ROM path is viable and current: LineageOS ships a unified `apollon` target (Mi 10T / 10T Pro / Redmi K30S Ultra), up to 23.2 (Android 16) / 24.0 (Android 17) as of late 2026.

## Tried and ruled out
- Did NOT use the android-profiler skill that launched this: the request was a device audit + ROM feasibility, not performance profiling. Read device directly via `adb shell getprop` instead.
- No "bypass" tool needed/recommended — Xiaomi has an official Mi Unlock path; paid unlock services/exploits ruled out as scammy or verified-boot-tripping.

## Watch out
- Device codename is `apollo` but LineageOS build name is `apollon` (unified family tree). Match the exact variant (Mi 10T vs 10T Pro, camera blobs) before flashing or you brick it.
- Official Mi Unlock tool is WINDOWS-ONLY. On this Linux box, fastboot can flash but cannot do the unlock handshake — need Windows or a VM with USB passthrough.
- Xiaomi's 2025 unlock policy tightened: ~1 unlock/account/year, Mi-account binding + mandatory wait (72–168h, sources conflict), quotas. Unlocking wipes the device.
