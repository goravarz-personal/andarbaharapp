-- Settling up is gone. Money changes hands at the table, so a player's
-- cash-out already tells the whole story and there is nothing to chase
-- afterwards.
DROP TABLE "Settlement";

-- Expenses come out of the pot rather than being divided between players,
-- so per-player shares no longer exist.
DROP TABLE "ExpenseShare";
ALTER TABLE "Expense" DROP COLUMN "splitMode";

-- "category" becomes "type" and gains more choices. Renamed rather than
-- dropped and re-added, so expenses already recorded keep their kind -
-- DINNER and OTHER are both still valid values.
ALTER TABLE "Expense" RENAME COLUMN "category" TO "type";
ALTER TABLE "Expense" ALTER COLUMN "type" SET DEFAULT 'DINNER';

-- The type carries the meaning now, so a written label is optional.
ALTER TABLE "Expense" ALTER COLUMN "label" DROP NOT NULL;

-- Game status only ever meant "has this been settled up".
DROP INDEX "Game_status_idx";
ALTER TABLE "Game" DROP COLUMN "status";
