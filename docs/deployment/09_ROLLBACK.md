# 09 Rollback

Korte rollback-samenvatting.

Volledige procedure:

- `docs/deployment/ROLLBACK_PLAN.md`

Principes:

- rollback is procedureel, niet automatisch
- geen rollback SQL zonder review
- altijd eerst backup vastleggen
- Netlify deploy kan snel terug
- database rollback vereist restore/handmatige policy review
