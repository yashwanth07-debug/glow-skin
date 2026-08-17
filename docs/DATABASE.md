# Glow — Database Schema

## 1. Design principle (guide Part 4)
The MVP stores **zero data server-side** — history lives in the browser's localStorage so the app works with no account and nothing to break. This document defines the **production schema** (Supabase/PostgreSQL) the product would use, so the design is "Supabase-ready" and explainable to judges.

## 2. Production schema (PostgreSQL via Supabase)

### Table: `users`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | supabase auth user id |
| email | text UNIQUE NOT NULL | |
| created_at | timestamptz | |

### Table: `scans`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → users.id | owner |
| overall_score | smallint | 0–100 ("all" from skin-analysis) |
| skin_age | smallint | AI-derived |
| fitzpatrick | text | "I".."VI" |
| skin_tone_hex | text | e.g. #997152 |
| tone_colors | jsonb | eye/lip/brow/hair hexes |
| concern_scores | jsonb | {concern: ui_score} ×14 |
| mask_urls | jsonb | {concern: [urls]} |
| routine | jsonb | generated AM/PM plan |
| created_at | timestamptz | |

### Table: `products` (future)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name, brand | text | |
| concern_tags | text[] | which concerns it targets |
| link | text | product URL |

### Relationships
```
users 1───∞ scans
products ∞───∞ scans   (recommendation join, future)
```

## 3. LocalStorage schema (MVP — what the app actually uses)
Key: `glow:history:v1`
```json
[
  {
    "id": "scan_1723456789",
    "ts": 1723456789000,
    "overall": 76,
    "skinAge": 38,
    "fitzpatrick": "V",
    "tone": "#997152",
    "colors": { "eye": "#241711", "lip": "#cc7f71", "brow": "#805d47", "hair": "#B56637" },
    "scores": { "pore": 62, "texture": 84, "radiance": 81, "firmness": 78, "wrinkle": 70 },
    "masks": { "pore": ["https://…"] },
    "routine": { "am": ["Cleanser", "Vitamin C serum", "SPF 50"], "pm": ["Cleanser", "Retinol", "Moisturizer"] },
    "shareable": true
  }
]
```
History is capped at the latest 20 scans; each new scan is `unshift`ed.

## 4. Example records
```json
{
  "id": "scan_1",
  "ts": 1786610000000,
  "overall": 76,
  "skinAge": 38,
  "fitzpatrick": "V",
  "tone": "#997152",
  "scores": { "pore": 62, "texture": 84, "radiance": 81, "firmness": 78, "wrinkle": 70, "acne": 95, "dark_circle_v2": 60, "oiliness": 55, "moisture": 80, "redness": 88, "eye_bag": 66, "age_spot": 90, "droopy_upper_eyelid": 72, "droopy_lower_eyelid": 74 },
  "routine": {
    "am": ["Gentle low-pH cleanser", "Vitamin C serum (radiance 81)", "SPF 50 (Fitzpatrick V)"],
    "pm": ["Oil cleanser", "Salicylic acid 2x/wk (pore 62)", "Retinol 3x/wk (wrinkle 70)", "Ceramide moisturizer (firmness 78)"]
  }
}
```

## 5. Why each table exists
- `users`: ownership + cross-device sync (future)
- `scans`: the core record — one row per analysis, holds every result the UI shows
- `products`: future recommendation catalog join (the monetization layer)
