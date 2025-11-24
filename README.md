# IČO & Invoice Extractor Configuration

This application requires API keys to function.

## 1. Get Your Keys

### Google Gemini API
- **Link**: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **Key**: `API_KEY`

### Supabase
- **Link**: [https://supabase.com/dashboard](https://supabase.com/dashboard) -> Select Project -> Project Settings -> API
- **URL**: `SUPABASE_URL`
- **Key**: `SUPABASE_ANON_KEY` (use the `anon public` key)

---

## 2. Local Development Setup

1. Create a file named `.env` in the root directory.
2. Paste your keys:
   ```bash
   API_KEY=your_gemini_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
3. Run `npm run dev`.

---

## 3. Deployment on Render.com

Since you cannot upload `.env` files to Render, you must set them in the dashboard.

1. Go to your **Render Dashboard**.
2. Select your Service.
3. Click **Environment** in the left sidebar.
4. Click **Add Environment Variable**.
5. Add all 3 keys (`API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`).
6. **Trigger a new deployment** (Manual Deploy -> Clear Cache & Deploy) so the build process can read these variables.

---

## 4. Database Setup

The app requires a table named `invoices` in Supabase.

1. Open your app.
2. Process an invoice.
3. Click **Save to DB**.
4. If the table is missing, a **"DB Setup"** panel will appear with the SQL code.
5. Copy that code and run it in the **Supabase SQL Editor**.
