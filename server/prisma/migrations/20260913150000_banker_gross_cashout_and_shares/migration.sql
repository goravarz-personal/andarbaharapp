-- Cash-out becomes the GROSS table result, and the night's costs are carried
-- by named players instead of coming out of the pot.

-- Who is carrying each cost. Dinner stores nothing here: it always falls on
-- whoever won the most, worked out when the game is read.
CREATE TABLE "ExpenseShare" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ExpenseShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpenseShare_expenseId_userId_key" ON "ExpenseShare"("expenseId", "userId");

ALTER TABLE "ExpenseShare" ADD CONSTRAINT "ExpenseShare_expenseId_fkey"
    FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseShare" ADD CONSTRAINT "ExpenseShare_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry existing payers across rather than losing them: whoever paid for a
-- non-dinner cost becomes the one carrying it. Dinner needs no row.
INSERT INTO "ExpenseShare" ("id", "expenseId", "userId")
SELECT gen_random_uuid()::text, "id", "paidById"
FROM "Expense"
WHERE "type" <> 'DINNER';

ALTER TABLE "Expense" DROP COLUMN "paidById";

-- Winning is what the numbers say now, so the hand-set flag goes. The banker
-- is the thing actually worth recording about a seat.
ALTER TABLE "GamePlayer" DROP COLUMN "isWinner";
ALTER TABLE "GamePlayer" ADD COLUMN "isBanker" BOOLEAN NOT NULL DEFAULT false;
