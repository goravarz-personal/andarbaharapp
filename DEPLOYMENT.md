# Putting AadarBahar online

This walks you through getting the app onto the internet so you can send your
friends a link. No command line, no servers to look after.

**Time:** about 20 minutes, most of it waiting for things to build.
**Cost:** nothing. Paying $7/month later removes the one annoyance (below).

---

## What you are setting up

Three pieces, each free:

| Piece | What it does | Who provides it |
| --- | --- | --- |
| **Database** | Holds the games, players and payments | Neon |
| **API** | The rules — works out who owes whom | Render |
| **App** | What your friends actually open | Render |

The app and the API are kept separate on purpose. On the free plan the API
falls asleep when nobody has used it for 15 minutes, and takes 30–60 seconds to
wake up. Because the app is a separate, always-awake piece, it still opens
instantly and shows a loading state while the API stretches. If that trade
annoys you, upgrading the API to Render's $7/month plan removes it entirely and
changes nothing else.

---

## Step 1 — Create the database

1. Go to **[neon.com](https://neon.com)** and sign up. Signing in with your
   GitHub account is the quickest route.
2. Create a project. Call it **aadarbahar**. For the region, pick whichever is
   closest to you and your friends.
3. When it finishes, Neon shows you a **connection string**. It looks like:

   ```
   postgresql://neondb_owner:AbC123xyz@ep-cool-name-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

4. **Copy it and keep it somewhere for the next step.** If you lose it, it is
   under *Connection Details* on the project dashboard.

> If Neon offers you a *pooled* and a *direct* connection string, take the
> direct one. The app runs database migrations when it starts, and that works
> more reliably on a direct connection.

**Careful:** that string is the key to everything in the app. Do not paste it
into a chat, an email, or a file you commit to GitHub.

---

## Step 2 — Deploy

1. Make sure this project is pushed to your GitHub account.
2. Go to **[render.com](https://render.com)** and sign up with GitHub.
3. Click **New** → **Blueprint**.
4. Choose the `andarbaharapp` repository. Render finds the `render.yaml` file
   and offers to create two services: `aadarbahar-api` and `aadarbahar-app`.
5. It will ask you for two values:

   | Field | What to put |
   | --- | --- |
   | `DATABASE_URL` | The connection string you copied from Neon |
   | `ADMIN_PASSWORD` | A password **you choose** for your own admin account |

   Pick a real password for `ADMIN_PASSWORD` — this account can edit every
   game and every player. If you leave it blank the app falls back to
   `admin123` and will force you to change it the moment you sign in.

6. Click **Apply**. Render builds both pieces. The first build takes about five
   minutes; the app one is the slower of the two.

When it finishes you will have two addresses:

- **`https://aadarbahar-app.onrender.com`** ← this is the one you send people
- `https://aadarbahar-api.onrender.com` ← the engine; nobody needs to see it

> **If the blueprint is rejected because of the region:** open `render.yaml`,
> delete the line `region: singapore`, commit, push, and try again. Free plans
> cannot always use every region.

---

## Step 3 — Sign in and secure your account

1. Open your app address on your own phone.
2. Sign in as **`admin`** with the password you chose in step 2.
3. If you left the password blank, the app signs you in and then refuses to go
   any further until you set a real one. Set it now.

---

## Step 4 — Add your friends

Still on your own phone, in the app:

1. Go to the **Players** tab → **Add a player**.
2. Enter their name and pick a username (their first name in lower case is
   fine). Leave the password field alone.
3. The app shows you a **one-time password** and a **Send them their sign-in**
   button, which hands it to WhatsApp or wherever you like.
4. Repeat for everyone. They will each be asked to choose their own password
   the first time they sign in.

Everyone can see every game, every player's record, and the whole who-owes-whom
board. Only admins can record games or change numbers. If you want someone else
to be able to record games, open **Players** → **Manage the roster** → **Make
admin**.

---

## Step 5 — Send out the link

Something like this works. Replace the address with your own:

> Made us an app for tracking our games — buy-ins, cash-outs, dinner, and who
> owes who at the end.
>
> https://aadarbahar-app.onrender.com
>
> Open that on your phone and it will show you how to add it to your home
> screen — takes two taps and then it works like a normal app. Your username is
> below, and it will ask you to pick your own password when you first sign in.

The app shows each person the right instructions for their phone when they open
it — one tap on Android, Share → *Add to Home Screen* on an iPhone.

> **One thing worth telling iPhone users:** the *Add to Home Screen* option only
> exists in **Safari**. If they open the link from inside WhatsApp it may use a
> different browser, in which case they should tap the *Open in Safari* option
> first. The app says this too, but it helps if they hear it from you.

---

## Living with it

**Updating the app.** Push a change to GitHub and Render rebuilds and deploys
by itself. Your friends get the new version next time they open it — no
reinstall, no app store.

**Backups.** Neon keeps point-in-time history on the free plan, so a mistake is
recoverable. For your own copy, the Neon dashboard has an export option. Worth
doing occasionally once there is real money history in it.

**Getting rid of the sleeping.** On the Render dashboard, open `aadarbahar-api`
→ **Settings** → **Instance Type** → **Starter ($7/month)**. Nothing else
changes. The app half stays free either way.

**If you stop paying attention to it.** Neon suspends a database that has had
no queries for a long stretch on the free plan, but the data stays. It wakes up
on the next request.

---

## When something is wrong

**"Could not reach the server" when signing in.**
The API is probably still waking up — wait a minute and try again. If it
persists, open `https://aadarbahar-api.onrender.com/api/health` in a browser.
You should see `{"ok":true,...}`. If you see an error instead, go to the Render
dashboard, open `aadarbahar-api`, and read the **Logs** tab — the message there
usually says exactly what is missing.

**The app loads, but signing in says it cannot reach the server.**
The app has the API's address compiled into it, and that address is wrong.
Read the error carefully - it names the address the app actually tried. On the
Render dashboard open `aadarbahar-app` → **Environment** and check
`EXPO_PUBLIC_API_URL` holds the API's **full public URL**, including
`https://` and `.onrender.com`:

```
https://aadarbahar-api.onrender.com
```

A bare service name like `aadarbahar-api` is Render's *internal* address. It
works between services inside Render, but means nothing to a browser on
someone's phone. Fix the value, then **Manual Deploy** → **Clear build cache &
deploy** - the address is read at build time, so it needs a rebuild rather than
a restart.

**The API keeps restarting.**
Almost always the database. Check `DATABASE_URL` in Render's **Environment**
tab matches what Neon shows you, including the `?sslmode=require` at the end.

**"JWT_SECRET must be at least 32 characters".**
Render was supposed to generate this. In the API's **Environment** tab, delete
`JWT_SECRET`, then add it again with a long random value —
`openssl rand -hex 32` produces a suitable one, or mash the keyboard for 40-odd
characters.

**A friend cannot sign in.**
Open **Players** → **Manage the roster** → **Reset password** next to their
name. You get a fresh one-time password to send them.

**Someone sees an old version of the app.**
Fully close it and reopen. The app checks for a new version each time it
starts.

---

## Other ways to host it

The Render route above is the one this project is set up for. If you would
rather do something else:

**Your own server (a VPS, or a machine at home).** `server/Dockerfile` builds
the API into a container, and `docker-compose.yml` at the root runs a Postgres
next to it. Build from the repository root:

```bash
docker build -f server/Dockerfile -t aadarbahar-api .
docker run -d -p 4000:4000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e ADMIN_PASSWORD="choose-something" \
  -e NODE_ENV=production \
  aadarbahar-api
```

Build the app with `npm run build:web --workspace mobile` (set
`EXPO_PUBLIC_API_URL` to your API's address first) and serve `mobile/dist` with
any web server. You will need HTTPS: phones refuse to install an app to the
home screen over plain HTTP. Caddy or a Cloudflare Tunnel both handle that for
free.

*Note: the Dockerfile follows the standard pattern for this stack but has not
been built end to end, so expect to iterate on it.*

**Fly.io, Railway, Koyeb.** All work. Point them at `server/Dockerfile`, give
them the same environment variables listed in `server/.env.example`, and host
the built `mobile/dist` folder anywhere static.

---

## Real App Store and Play Store apps

The home-screen install covers most of what an app store gives you, for
nothing. If you want the real thing later, the project is a standard Expo app,
so `npx eas build --platform ios` and `--platform android` are all that stands
between you and store builds.

Two things to know before you spend the money:

- Apple charges **$99/year**, Google **$25 once**.
- Apple reviews apps that involve card games and real money carefully. This is
  a private ledger and not gambling, but expect questions, and be ready to
  explain that no wagering or payment happens in the app.

Set `EXPO_PUBLIC_API_URL` to your hosted API before building, or the app will
look for a server on the local network and find nothing.
