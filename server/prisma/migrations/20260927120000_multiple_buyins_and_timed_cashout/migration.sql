-- A player can buy chips more than once in a night, and cashing out happens
-- once at the end. Buy-ins become a list with their own times; the cash-out
-- becomes optional, because a player who is still at the table has not made
-- one yet.

CREATE TABLE "BuyIn" (
    "id" TEXT NOT NULL,
    "gamePlayerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BuyIn_gamePlayerId_idx" ON "BuyIn"("gamePlayerId");

ALTER TABLE "BuyIn" ADD CONSTRAINT "BuyIn_gamePlayerId_fkey"
    FOREIGN KEY ("gamePlayerId") REFERENCES "GamePlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GamePlayer" ADD COLUMN "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "GamePlayer" ADD COLUMN "cashedOutAt" TIMESTAMP(3);

-- Carry every buy-in already recorded into the new table as a single trip to
-- the banker, timed at the night it belongs to rather than now.
INSERT INTO "BuyIn" ("id", "gamePlayerId", "amount", "at")
SELECT gen_random_uuid()::text, gp."id", gp."buyIn", g."playedOn"
FROM "GamePlayer" gp
JOIN "Game" g ON g."id" = gp."gameId"
WHERE gp."buyIn" > 0;

-- Nights already in the book were entered after the fact, so their cash-outs
-- are real ones. Stamp them with the night's date so they are not mistaken
-- for players still at the table.
UPDATE "GamePlayer" gp
SET "cashedOutAt" = g."playedOn"
FROM "Game" g
WHERE g."id" = gp."gameId";

ALTER TABLE "GamePlayer" DROP COLUMN "buyIn";
ALTER TABLE "GamePlayer" ALTER COLUMN "cashOut" DROP NOT NULL;
ALTER TABLE "GamePlayer" ALTER COLUMN "cashOut" DROP DEFAULT;

-- Several people can buy food over an evening, so a cost records who laid the
-- money out and when.
ALTER TABLE "Expense" ADD COLUMN "paidById" TEXT;
ALTER TABLE "Expense" ADD COLUMN "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidById_fkey"
    FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A cost already attributed to one person keeps that attribution.
UPDATE "Expense" e
SET "paidById" = s."userId"
FROM "ExpenseShare" s
WHERE s."expenseId" = e."id";
