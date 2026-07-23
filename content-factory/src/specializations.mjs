const S = (vertical, id, name, topics, photographySubjects = topics) => ({ vertical, id, name, topics, photography_subjects: photographySubjects });

export const SPECIALIZATIONS = Object.freeze([
  S("installateur", "zonnepanelen", "Zonnepanelen", ["zonnepanelen", "omvormers", "dakscan", "monitoring"]),
  S("installateur", "warmtepompen", "Warmtepompen", ["warmtepomp", "hybride installatie", "all-electric", "inregelen"]),
  S("installateur", "airco", "Airconditioning", ["airco", "split-unit", "klimaatbeheersing", "onderhoud"]),
  S("installateur", "laadpalen", "Laadpalen", ["laadpaal", "load balancing", "thuisladen", "zakelijk laden"]),
  S("installateur", "thuisbatterijen", "Thuisbatterijen", ["thuisbatterij", "energieopslag", "energiemanagement", "zelfconsumptie"]),

  S("restaurant", "sushi", "Sushirestaurant", ["sushi", "sashimi", "omakase", "take-away"]),
  S("restaurant", "italiaans", "Italiaans restaurant", ["Italiaanse keuken", "pasta", "antipasti", "tiramisu"]),
  S("restaurant", "steakhouse", "Steakhouse", ["steaks", "grill", "dry-aged", "shared dining"]),
  S("restaurant", "lunchroom", "Lunchroom", ["lunch", "broodjes", "koffie", "high tea"]),
  S("restaurant", "cafe", "Café", ["borrel", "speciaalbier", "terras", "lokale sfeer"]),

  S("autobedrijf", "occasions", "Occasions", ["occasionaanbod", "inruil", "proefrit", "afleverpakketten"]),
  S("autobedrijf", "lease", "Lease", ["private lease", "financial lease", "zakelijke lease", "wagenpark"]),
  S("autobedrijf", "elektrische-autos", "Elektrische auto’s", ["elektrische auto", "actieradius", "laadadvies", "EV-onderhoud"]),
  S("autobedrijf", "bedrijfswagens", "Bedrijfswagens", ["bestelwagens", "bedrijfswageninrichting", "fleetservice", "zakelijke mobiliteit"]),
  S("autobedrijf", "schadeherstel", "Schadeherstel", ["autoschade", "spotrepair", "uitdeuken", "verzekeringsafhandeling"]),

  S("loodgieter", "lekkage", "Lekkage en spoed", ["lekdetectie", "lekkage", "noodreparatie", "waterschade beperken"]),
  S("loodgieter", "sanitair", "Sanitair", ["sanitair", "toilet", "kranen", "montage"]),
  S("loodgieter", "leidingwerk", "Leidingwerk", ["waterleiding", "afvoer", "gasleiding", "leidingrenovatie"]),
  S("loodgieter", "badkamerrenovatie", "Badkamerrenovatie", ["badkamer", "inloopdouche", "leidingplan", "afmontage"]),
  S("loodgieter", "cv-service", "CV-service", ["cv-ketel", "storing", "onderhoud", "verwarming"]),

  S("schilder", "binnenschilderwerk", "Binnenschilderwerk", ["wanden", "plafonds", "houtwerk", "lakwerk"]),
  S("schilder", "buitenschilderwerk", "Buitenschilderwerk", ["kozijnen", "gevelhout", "weersbestendig", "onderhoud"]),
  S("schilder", "monumentaal", "Monumentaal schilderwerk", ["monument", "kleurhistorie", "traditionele verf", "restauratie"]),
  S("schilder", "spuitwerk", "Spuitwerk", ["airless spuiten", "latex spuiten", "lakspuiten", "egale afwerking"]),
  S("schilder", "zakelijk-onderhoud", "Zakelijk vastgoedonderhoud", ["meerjarenonderhoud", "bedrijfspand", "VvE", "planning"]),

  S("dakdekker", "platte-daken", "Platte daken", ["bitumen", "EPDM", "dakinspectie", "dakisolatie"]),
  S("dakdekker", "pannendaken", "Pannendaken", ["dakpannen", "nokvorsten", "dakbeschot", "renovatie"]),
  S("dakdekker", "lekkage", "Daklekkage", ["lekdetectie", "spoedreparatie", "stormschade", "waterdichting"]),
  S("dakdekker", "groene-daken", "Groene daken", ["sedumdak", "waterbuffering", "biodiversiteit", "onderhoud"]),
  S("dakdekker", "dakisolatie", "Dakisolatie", ["isolatiewaarde", "energiebesparing", "binnenzijde", "buitenzijde"]),

  S("elektricien", "groepenkasten", "Groepenkasten", ["groepenkast", "aardlekschakelaar", "uitbreiding", "keuring"]),
  S("elektricien", "storingen", "Elektrische storingen", ["storing zoeken", "kortsluiting", "spoedservice", "veilig herstel"]),
  S("elektricien", "domotica", "Domotica", ["slimme woning", "lichtsturing", "energiemonitoring", "automatisering"]),
  S("elektricien", "zakelijke-installaties", "Zakelijke installaties", ["bedrijfspand", "verlichting", "krachtstroom", "onderhoud"]),
  S("elektricien", "laadinfra", "Laadinfrastructuur", ["laadpunten", "load balancing", "parkeerterrein", "beheer"]),

  S("hovenier", "tuinontwerp", "Tuinontwerp", ["tuinplan", "beplantingsplan", "materiaalkeuze", "3D-ontwerp"]),
  S("hovenier", "tuinaanleg", "Tuinaanleg", ["bestrating", "beplanting", "schutting", "verlichting"]),
  S("hovenier", "tuinonderhoud", "Tuinonderhoud", ["snoeien", "gazon", "seizoensonderhoud", "onderhoudsplan"]),
  S("hovenier", "bedrijfsgroen", "Bedrijfsgroen", ["bedrijfsterrein", "representatief groen", "onderhoud", "biodiversiteit"]),
  S("hovenier", "ecologische-tuinen", "Ecologische tuinen", ["inheemse beplanting", "wateropvang", "biodiversiteit", "bodemverbetering"]),

  S("kapper", "dames", "Dameskapper", ["knippen", "kleuren", "balayage", "styling"]),
  S("kapper", "heren", "Herenkapper", ["heren coupe", "fade", "baard", "styling"]),
  S("kapper", "krullen", "Krullenspecialist", ["krullen knippen", "curl care", "stylingadvies", "behandeling"]),
  S("kapper", "kleuren", "Kleurspecialist", ["balayage", "highlights", "kleurcorrectie", "toner"]),
  S("kapper", "bruidsstyling", "Bruidsstyling", ["proefsessie", "bruidskapsel", "op locatie", "planning"]),

  S("holistisch", "coaching", "Holistische coaching", ["balans", "persoonlijke ontwikkeling", "stress", "leefstijl"]),
  S("holistisch", "energetisch", "Energetische behandeling", ["energetisch werk", "ontspanning", "bewustwording", "nazorg"]),
  S("holistisch", "ademwerk", "Ademwerk", ["ademsessie", "ontspanning", "lichaamsbewustzijn", "begeleiding"]),
  S("holistisch", "reiki", "Reiki", ["reiki", "behandeling", "ontspanning", "persoonlijke aandacht"]),
  S("holistisch", "retreats", "Retreats", ["retreat", "dagprogramma", "rust", "groepsbegeleiding"])
]);

export function listSpecializations(vertical) {
  return SPECIALIZATIONS.filter((specialization) => specialization.vertical === vertical);
}

export function resolveSpecialization(vertical, value) {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) return null;
  return SPECIALIZATIONS.find((specialization) => specialization.vertical === vertical && (specialization.id === normalized || specialization.name.toLowerCase() === String(value).toLowerCase())) || null;
}

