# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Parent fee payments

Parent checkout uses Paystack. Configure `PAYSTACK_SECRET_KEY` in the server environment and set `APP_URL` to the public frontend origin used for the payment return URL (for local Vite development, `http://localhost:5173`). Keep the secret key on the server; never expose it through a `VITE_` variable. Without a key, the parent portal remains available but checkout is disabled.

The school database must be available to the server. Run `node server/server.js` from this directory to start the API and `npm run dev` to start the frontend.

## Initial principal account

Before starting the server with a new, empty database, set `INITIAL_PRINCIPAL_PASSWORD` in the server environment to a unique password of at least 12 characters. The first principal sign-in must change that password. Never put this value in a `VITE_` variable or expose it in the frontend.

Signed-in users can change their password from their workspace. Accounts issued by an administrator must change their temporary password at first sign-in. Password-reset requests are recorded in the database; until an administrator review and delivery workflow is configured, users should contact the school administrator through the school's usual channel.
