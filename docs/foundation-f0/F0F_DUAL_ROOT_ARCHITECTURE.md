# Foundation F0-f — Dual-Root Architecture

Status: **PERSISTENT BOOTSTRAP ROOT TECHNICALLY PROVEN**

## Herziening

F0-d/F0-e model A, sequential root switching, is afgewezen: een actieve common-root zonder `00000000000000` sluit niet aan op de bestaande CLI-history en wordt geweigerd.

Gekozen kandidaat is model B: een persistent bootstrapproject met permanent de authoritative baseline en later dezelfde post-cutover common migrations als de existing execution line. Voor de PoC zijn execution roots deterministisch onder `/private/tmp` opgebouwd; er is niet tijdens één migratierun van root gewisseld.

Model C, een uitsluitend gegenereerde samengestelde bootstraproot, is als alternatief beoordeeld. Het vermijdt permanente common-kopieën, maar maakt buildoutput de enige uitvoerbare representatie en verhoogt CI-/provenancecomplexiteit. Model B is auditbaarder doordat de baseline permanent zichtbaar blijft. Beide modellen vereisen materialisatie; B is gekozen met één canonieke common-bron en harde bytevalidatie.

| criterium | B persistent | C build-only |
|---|---|---|
| CLI-compatibiliteit | bewezen | aannemelijk, niet gekozen |
| baseline-auditbaarheid | direct | indirect via build |
| byteverschilrisico | beheerst door validator | lager aantal permanente kopieën |
| ontwikkelaarsfout | kopiedrift mogelijk | verkeerde buildinput mogelijk |
| CI-complexiteit | middel | hoog |
| lokale reproduceerbaarheid | hoog | afhankelijk van builder |
| remote risico | rootselectie vereist | buildrootselectie vereist |
| onderhoud | manifest + validator | builder + manifest + validator |

Belangrijke open structuurkwestie: de huidige bronmap `supabase/migrations/` bevat ook de F0-baseline. Een existing execution view mag die file nooit aanbieden. Productlayout/materialisatie blijft daarom een implementatiegate.
