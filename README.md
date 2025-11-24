# IČO & Invoice Extractor Configuration

This application requires API keys to function. These keys must be set as environment variables to keep them secure.

## Quick Setup

1. Create a file named `.env` in the root directory of this project.
2. Copy and paste the following template into that file:

```bash
# -----------------------------
# Google Gemini API (Required)
# -----------------------------
# Get your key here: https://aistudio.google.com/app/apikey
API_KEY=paste_your_gemini_key_here

# -----------------------------
# Supabase Database (Optional)
# -----------------------------
# Find these in Supabase Dashboard: Project Settings > API
SUPABASE_URL=paste_your_supabase_url
SUPABASE_ANON_KEY=paste_your_supabase_anon_key
```

3. Save the file.
4. Restart your development server (e.g., `npm run dev` or stop/start the preview).

## Troubleshooting

- **Keys not detected?** Make sure the file is named exactly `.env` (no extension like .txt).
- **Changes not showing?** Environment variables are loaded when the application starts. You must restart the server after changing them.
