# AadarBaharApp

A game-night ledger for iOS and Android. It keeps track of who played, what
they put in, what they took out, who won, what dinner cost, and — the part that
usually causes the arguments — who owes whom afterwards.

Every player gets their own login and can see the whole ledger. An admin
records the games and manages the group.

<p align="center">
  <img src="docs/screens/dashboard.png" width="30%" alt="Dashboard showing what you are owed" />
  <img src="docs/screens/game-detail.png" width="30%" alt="A game night with buy-ins, cash-outs and expenses" />
  <img src="docs/screens/settle.png" width="30%" alt="Who owes whom" />
</p>

## What it does

**Games.** Date, location, everyone at the table, each player's buy-in and
cash-out, and who won. The app adds up the pot as you type and tells you when
the cash-outs don't match the buy-ins, before you save something that will not
reconcile.

**Dinner and expenses.** Any cost attached to a night, split three ways:

| Split | What it means |
| --- | --- |
| `EQUAL` | Shared across everyone seated. Add a latecomer and it re-splits itself. |
| `CUSTOM` | You set each person's share by hand. They have to add up to the total. |
| `PAYER` | Whoever paid is treating the table and carries the whole cost. |

**Settling up.** Settling a game nets each player's position — table result,
minus their share of the expenses, plus whatever they fronted — and works out
the *fewest* payments that clear the night. Four players settle in three
payments, not twelve. Outstanding IOUs across all games net down to one line
per pair of people.

**Players.** Add someone and they get their own login on the spot, with a
one-time password you can send them. Every player sees every game, the
leaderboard, and their own history: games played, win rate, lifetime net, best
and worst nights.

**Admin.** One account with full control: records and edits games, adds and
removes players, promotes other admins, resets passwords, records payments by
hand, and deletes anything that was entered wrong.

## Getting started

You need [Node](https://nodejs.org) 20 or newer. Everything else installs
itself, and the database is a SQLite file — nothing to set up.

```bash
git clone <this repo>
cd andarbaharapp
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` works around a resolution bug in npm 10 that trips over
> React Native's peer dependency graph. npm 11+ does not need it.

### 1. Start the API

```bash
cp server/.env.example server/.env   # then edit JWT_SECRET
npm run db:setup                     # creates the database and the admin account
npm run server
```

`db:setup` creates an admin account from `server/.env` — `admin` / `admin123`
by default. The app makes you change that password the first time you sign in.

To start with something to look at, seed a few demo players and games:

```bash
SEED_DEMO_DATA=true npm run db:seed
```

That adds `ravi`, `meera`, `arjun` and `sana`, all with the password
`andar123`, across two game nights.

### 2. Start the app

```bash
npm run mobile
```

Then open it:

- **On your phone** — install [Expo Go](https://expo.dev/go) and scan the QR
  code. The app finds the API automatically, as long as the phone and the
  computer are on the same Wi-Fi.
- **iOS simulator** — press `i` (needs Xcode, so macOS).
- **Android emulator** — press `a` (needs Android Studio).
- **In a browser** — press `w`. Handy for typing up a game on a laptop.

If the app cannot reach the API, tap **Server** on the sign-in screen and enter
the address by hand — `http://192.168.1.5:4000`, say. It is remembered.

### 3. Ship it to the app stores

The project is plain Expo, so [EAS Build](https://docs.expo.dev/build/setup/)
handles both platforms:

```bash
npx eas build --platform ios
npx eas build --platform android
```

Point `EXPO_PUBLIC_API_URL` at wherever the API is hosted before building, and
put the API behind HTTPS — the `NSAllowsArbitraryLoads` and
`usesCleartextTraffic` flags in `app.json` are there for plain-HTTP home
networks during development, and should come out for a store build.

## How it is put together

```
server/    Express + Prisma API over SQLite
mobile/    Expo (React Native) app for iOS, Android and web
```

### Money

Every amount is stored as an integer number of **paise**. Floating point
belongs nowhere near a ledger people argue over: `0.1 + 0.2` is not `0.3`, and
a rupee that goes missing in rounding is a rupee someone has to explain.
Formatting happens only at the edge, in `mobile/src/utils/money.ts`.

Splitting an odd amount hands the leftover paise out one at a time in a stable
order, so the shares always add back up to exactly what was spent.

### Ledgers are derived, never stored

A player's net for a game is worked out from the game as it stands right now:

```
net = (cash-out - buy-in) - their share of the expenses + what they paid for
```

Nothing is cached. Correct a buy-in three weeks later and every history,
statistic and leaderboard position follows automatically. `server/src/services/
ledger.service.ts` holds the whole calculation, and it is the part covered by
the most tests.

### Who can do what

| | Player | Admin |
| --- | --- | --- |
| See every game, player and payment | yes | yes |
| Edit their own profile and password | yes | yes |
| Confirm money paid **to them** | yes | yes |
| Record and edit games, expenses, players | no | yes |
| Reset passwords, change roles, delete things | no | yes |

A few rules are deliberate rather than incidental:

- **The player being paid confirms the payment**, not the one paying — they are
  the one with something to lose from a wrong tap.
- **Re-settling a game refuses to wipe payments already marked paid** unless
  you confirm.
- **The last active admin cannot be demoted or deactivated**, so the group
  cannot lock itself out.
- **Deleting a player who has played deactivates them instead**, so past games
  stay intact.
- **Changing a password, resetting one, or deactivating an account retires the
  existing sign-in tokens.**

## Development

```bash
npm test           # 53 tests: ledger maths and the API end to end
npm run typecheck  # both halves
npm run server     # API with reload on save
npm run mobile     # Expo dev server
```

The test suite runs against a throwaway SQLite file and covers rounding, the
three split modes, transfer minimisation, IOU netting, and the API — sign-in,
roles, game CRUD, settling, history and statistics.

### API

All routes live under `/api` and need `Authorization: Bearer <token>` except
`/api/health` and `/api/auth/login`.

| Method | Route | |
| --- | --- | --- |
| `POST` | `/auth/login` | Sign in |
| `GET` `PATCH` | `/auth/me` | Your account |
| `POST` | `/auth/change-password` | Returns a fresh token |
| `GET` | `/dashboard` | Home screen figures |
| `GET` `POST` | `/players` | Roster · add (admin) |
| `GET` | `/players/leaderboard` | Ranked by lifetime net |
| `GET` | `/players/:id` | Profile, stats, history, balances |
| `PATCH` `DELETE` | `/players/:id` | Edit · remove (admin) |
| `POST` | `/players/:id/reset-password` | Admin |
| `GET` `POST` | `/games` | List · record (admin) |
| `GET` `PATCH` `DELETE` | `/games/:id` | One game |
| `POST` `PATCH` `DELETE` | `/games/:id/players[/:seatId]` | Seats (admin) |
| `POST` `PATCH` `DELETE` | `/games/:id/expenses[/:expenseId]` | Costs (admin) |
| `GET` | `/games/:id/settlement-preview` | The split, without saving it |
| `POST` | `/games/:id/settle` · `/reopen` | Admin |
| `GET` `POST` | `/settlements` | IOUs · record one by hand (admin) |
| `GET` | `/settlements/outstanding` | Netted per pair |
| `PATCH` `DELETE` | `/settlements/:id` | Mark paid · remove |

### Using a different database

SQLite is the default because it needs nothing. To move to Postgres, change the
provider in `server/prisma/schema.prisma`, point `DATABASE_URL` at the new
database, and run `npm run db:setup`. No application code changes.

## Licence

MIT.
