# Disposable PDF Project

## Quick Backend Deploy (to get `REACT_APP_BACKEND_URL`)

Use Render:

1. Push this repo to GitHub.
2. In Render, create a new **Blueprint** service from this repo.
3. Render will pick [`render.yaml`](/Users/apple/Downloads/Disposable-pdf-main/render.yaml) automatically.
4. Set backend environment variables from [`backend/.env.example`](/Users/apple/Downloads/Disposable-pdf-main/backend/.env.example).
5. After deploy, copy backend URL (example: `https://disposable-pdf-backend.onrender.com`).

Then in Vercel frontend env:

- `REACT_APP_BACKEND_URL=https://disposable-pdf-backend.onrender.com`
