# Foundation F0-d — Bootstrap Architecture

Status: **DESIGN COMPLETE / IMPLEMENTATION NOT AUTHORIZED**

## Definitieve architectuur

Er komen twee strikt gescheiden invoerpaden die na een geblokkeerd cutoverpunt samenkomen.

### Bestaande omgevingen

Bestaande test-, staging- en productieprojecten behouden uitsluitend hun echte Supabase migration history. Geen historische versie wordt gerepareerd, herschreven of opnieuw uitgevoerd. Zij ontvangen later kleine, append-only reconciliationmigraties en daarna alleen gemeenschappelijke migraties met een versie vanaf het goedgekeurde cutoverpoint.

### Nieuwe lege omgevingen

Een nieuwe lege database gebruikt model C:

1. een aparte bootstrapprojectroot/configuratie met uitsluitend `00000000000000_authoritative_baseline.sql`;
2. registratie van precies één echte bootstrapversie en baselinefingerprint;
3. omschakeling naar een aparte common-migrationbron die uitsluitend versies vanaf het cutoverpoint bevat;
4. nooit zicht op de geabsorbeerde historische SQL-bestanden tijdens bootstrap of latere common-runs.

Geabsorbeerde migratie-identiteiten worden alleen in een auditmanifest genoemd als provenance, met hun werkelijke checksumstatus. Ze worden niet als applied history rows gesynthetiseerd. Zo wordt geen uitvoering of byte-identiteit geclaimd die niet heeft plaatsgevonden.

### Gemeenschappelijke lijn

Iedere nieuwe common migration moet aantoonbaar werken op zowel de actuele bestaande runtime als de bootstrapfingerprint. Het contract vereist preconditions, definitievergelijking, securitycontrole, lokale dubbele-lijntests en staginggoedkeuring.

## Isolatie- en promotiegrenzen

- Lokale bootstrap mag alleen in een disposable database met expliciete environment sentinel `empty_local_bootstrap`.
- Staging en productie mogen nooit via het bootstrapcommando worden gereset of opnieuw opgebouwd.
- Een runner moet stoppen wanneer de database niet leeg is, een remote projectlink aanwezig is, het historyprofiel niet overeenkomt of een schemafingerprint afwijkt.
- Promotie vereist handmatige goedkeuring van baselinechecksum, bootstrapmanifest, common-cutover en beide missing-lineage gates.
- Baselinechecksum in dit ontwerp: `6c8b9a8137850edadb6fe976938d44e16a5eecadc740481a65423bf72251ff11`.

## Supabase-tooling

De architectuur gebruikt gescheiden projectroots/configuraties omdat de normale migrationsdirectory anders historische bestanden opnieuw zichtbaar maakt. Een lokale uitvoeringsfase moet nog bewijzen hoe de geïnstalleerde Supabase CLI deze roots en historytabellen exact behandelt; in F0-d is geen CLI-run, history repair of remote koppeling uitgevoerd.
