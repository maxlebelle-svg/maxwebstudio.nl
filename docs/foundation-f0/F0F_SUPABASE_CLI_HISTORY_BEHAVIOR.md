# Foundation F0-f — Supabase CLI History Behavior

Status: **LOCALLY PROVEN WITH CLI 2.108.0**

- Baseline en common in dezelfde actieve root: beide ontdekt en eenmaal toegepast in versievolgorde.
- Genuine historical history plus dezelfde common: alleen de nieuwe versie toegepast.
- Bestaande historyrow zonder corresponderende actieve file: CLI weigert, bewezen in F0-e.
- Extra lokale post-historyfile: als pending migration ontdekt en toegepast.
- Tweede run: geen statements opnieuw uitgevoerd; “up to date”.
- Reeds toegepaste file met gewijzigde bytes/statements: CLI 2.108.0 detecteerde de wijziging niet en history bleef gelijk.
- Historyvelden blijven `version`, `statements`, `name`; er is geen waargenomen checksumkolom.

Conclusie: CLI-history bewaakt versies en file-aanwezigheid, maar byte-immutability moet vóór iedere run extern worden afgedwongen. Geen `migration repair` of `db pull` is uitgevoerd.
