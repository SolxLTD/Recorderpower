
<img width="1459" height="841" alt="image" src="https://github.com/user-attachments/assets/60c75445-f713-4811-b7d0-f0ac0d13ac6c" />







# Recorderpower — School Intelligence

School record-keeping software for principals, staff, students, and parents.

## Run locally

Install dependencies with `npm install`. Configure the PostgreSQL settings in `.env`, then start the API with `node server/server.js` and the frontend with `npm run dev`.

The frontend is served at `http://localhost:5173`, and the API at `http://localhost:5000`.

## Initial principal account

Before starting the server with a new, empty database, set `INITIAL_PRINCIPAL_PASSWORD` in the server environment to a unique password of at least 12 characters. The first principal sign-in must change that password. Never put this value in a `VITE_` variable or expose it in the frontend.

Signed-in users can change their password from their workspace. Accounts issued by an administrator must change their temporary password at first sign-in. Password-reset requests are recorded in the database; until an administrator review and delivery workflow is configured, users should contact the school administrator through the school's usual channel.

## Parent fee payments

Parent checkout uses school details. Configure
