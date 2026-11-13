-- Ending a night is now something the admin does, rather than something
-- inferred from everybody having cashed out. The inference becomes the
-- precondition: you cannot end a night somebody is still sitting at.

ALTER TABLE "Game" ADD COLUMN "endedAt" TIMESTAMP(3);

-- Nights already in the book were written up after the fact, so they are
-- over. Stamping them as ended on the night they were played keeps them out
-- of the "still running" list, which would otherwise suddenly hold every
-- game ever played.
UPDATE "Game" g
SET "endedAt" = g."playedOn"
WHERE NOT EXISTS (
  SELECT 1 FROM "GamePlayer" gp WHERE gp."gameId" = g."id" AND gp."cashOut" IS NULL
);
