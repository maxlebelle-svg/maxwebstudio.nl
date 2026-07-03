from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


OUTPUT = "output/pdf/max-webstudio-zzp-sales-partner-hr-pakket.pdf"
LOGO_MARK = "max-webstudio-logo-mollie-512.png"

NAVY = colors.HexColor("#111936")
BLUE = colors.HexColor("#253B80")
INK = colors.HexColor("#171923")
MUTED = colors.HexColor("#5E6677")
LINE = colors.HexColor("#D8DDE8")
LIGHT = colors.HexColor("#F5F7FB")
PALE_BLUE = colors.HexColor("#EAF0FF")
GREEN = colors.HexColor("#39A36A")


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverTitle",
    fontName="Helvetica-Bold",
    fontSize=30,
    leading=34,
    textColor=colors.white,
    alignment=TA_LEFT,
    spaceAfter=16,
))
styles.add(ParagraphStyle(
    name="CoverSub",
    fontName="Helvetica",
    fontSize=12,
    leading=17,
    textColor=colors.HexColor("#DCE5FF"),
    alignment=TA_LEFT,
))
styles.add(ParagraphStyle(
    name="H1Custom",
    fontName="Helvetica-Bold",
    fontSize=20,
    leading=25,
    textColor=NAVY,
    spaceBefore=10,
    spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="H2Custom",
    fontName="Helvetica-Bold",
    fontSize=12,
    leading=16,
    textColor=BLUE,
    spaceBefore=12,
    spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="BodyCustom",
    fontName="Helvetica",
    fontSize=9.5,
    leading=14,
    textColor=INK,
    spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="Small",
    fontName="Helvetica",
    fontSize=8.2,
    leading=11.5,
    textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="Label",
    fontName="Helvetica-Bold",
    fontSize=8.5,
    leading=11,
    textColor=BLUE,
    spaceAfter=2,
))
styles.add(ParagraphStyle(
    name="TableText",
    fontName="Helvetica",
    fontSize=8.4,
    leading=11,
    textColor=INK,
))
styles.add(ParagraphStyle(
    name="TableHead",
    fontName="Helvetica-Bold",
    fontSize=8.6,
    leading=11,
    textColor=colors.white,
))
styles.add(ParagraphStyle(
    name="Callout",
    fontName="Helvetica",
    fontSize=10.2,
    leading=15,
    textColor=INK,
    backColor=PALE_BLUE,
    borderColor=colors.HexColor("#C9D6FF"),
    borderWidth=0.7,
    borderPadding=8,
    spaceAfter=10,
))
styles.add(ParagraphStyle(
    name="Signature",
    fontName="Helvetica",
    fontSize=9,
    leading=13,
    textColor=INK,
    spaceAfter=22,
))


def p(text, style="BodyCustom"):
    return Paragraph(text, styles[style])


def bullet(items):
    return ListFlowable(
        [ListItem(p(item), bulletColor=BLUE, leftIndent=8) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=16,
        bulletFontName="Helvetica",
        bulletFontSize=7,
    )


def table(data, widths, header=True):
    converted = []
    for row_index, row in enumerate(data):
        converted_row = []
        for cell in row:
            if hasattr(cell, "wrap"):
                converted_row.append(cell)
            elif header and row_index == 0:
                converted_row.append(Paragraph(f'<font color="#FFFFFF">{cell}</font>', styles["TableHead"]))
            else:
                converted_row.append(Paragraph(str(cell), styles["TableText"]))
        converted.append(converted_row)
    t = Table(converted, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]
    if header:
        commands += [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ]
    else:
        commands += [("BACKGROUND", (0, 0), (-1, -1), LIGHT)]
    for row_index in range(1 if header else 0, len(data)):
        if row_index % 2 == 0:
            commands.append(("BACKGROUND", (0, row_index), (-1, row_index), colors.HexColor("#FAFBFE")))
    t.setStyle(TableStyle(commands))
    return t


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(2 * cm, 1.1 * cm, "Max Webstudio - ZZP Sales Partner HR-pakket")
    canvas.drawRightString(A4[0] - 2 * cm, 1.1 * cm, f"Pagina {doc.page}")
    canvas.setStrokeColor(LINE)
    canvas.line(2 * cm, 1.55 * cm, A4[0] - 2 * cm, 1.55 * cm)
    canvas.restoreState()


def cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setFillColor(BLUE)
    canvas.rect(0, 0, A4[0], 4.8 * cm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#1B2550"))
    canvas.circle(A4[0] - 3 * cm, A4[1] - 3 * cm, 5 * cm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 14)
    canvas.drawString(2.2 * cm, A4[1] - 2.3 * cm, "Max Webstudio")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#DCE5FF"))
    canvas.drawString(2.2 * cm, A4[1] - 2.8 * cm, "Conceptdocument - versie juli 2026")
    canvas.restoreState()


class HandbookDoc(BaseDocTemplate):
    pass


def build():
    doc = HandbookDoc(
        OUTPUT,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=frame, onPage=cover, autoNextPageTemplate="body"),
        PageTemplate(id="body", frames=frame, onPage=footer),
    ])

    story = []
    story.append(Spacer(1, 7.2 * cm))
    story.append(p("MAX WEBSTUDIO", "CoverSub"))
    story.append(p("ZZP Sales Partner HR-pakket", "CoverTitle"))
    story.append(p(
        "Overeenkomst van opdracht, sales handbook, commissiebeleid, NDA, gedragscode, CRM/AI policy, AVG, onboarding, offboarding en huisstijlregels.",
        "CoverSub",
    ))
    story.append(Spacer(1, 8.6 * cm))
    story.append(p("Wij helpen ondernemers groeien.", "CoverSub"))
    story.append(PageBreak())
    story.append(p("Inhoud en status", "H1Custom"))
    story.append(p(
        "Dit document is opgesteld als professioneel HR-pakket voor zelfstandige salespartners. Het combineert een Sales Partner Handbook met een Overeenkomst van Opdracht. Het is nadrukkelijk geen arbeidsovereenkomst. Laat de juridische bepalingen altijd controleren voordat het document definitief wordt gebruikt.",
        "Callout",
    ))
    story.append(table([
        ["Onderdeel", "Inhoud"],
        ["Documenttype", "ZZP Sales Partner HR-pakket en Overeenkomst van Opdracht"],
        ["Partij 1", "Max Webstudio, handelsnaam van lebellebox"],
        ["Partij 2", "Sales Partner, nader in te vullen op de ondertekenpagina"],
        ["Looptijd", "12 maanden, daarna verlenging of beeindiging volgens de afspraken in dit document"],
        ["Opzegtermijn", "30 dagen voor beide partijen, tenzij directe beeindiging gerechtvaardigd is"],
        ["Status", "Concept - niet bedoeld als definitief juridisch advies"],
    ], [4.2 * cm, 11 * cm]))
    story.append(p("Waarom geen arbeidsovereenkomst?", "H2Custom"))
    story.append(p(
        "Een ZZP-salespartner werkt zelfstandig, bepaalt zelf werktijden, gebruikt eigen acquisitiekanalen en ontvangt geen loon maar commissie of vergoeding volgens afspraak. Daarom hoort de basis juridisch een Overeenkomst van Opdracht te zijn. Woorden zoals werknemer, salaris, ontslag en werkgever worden in dit document vermeden waar het om de zelfstandige relatie gaat.",
    ))
    story.append(PageBreak())

    story.append(p("1. Welkom bij Max Webstudio", "H1Custom"))
    story.append(p(
        "Welkom. Leuk dat je onderdeel wilt worden van Max Webstudio. Wij zijn geen traditioneel webdesignbureau. Wij geloven dat iedere ondernemer recht heeft op een professionele online uitstraling.",
    ))
    story.append(p(
        "Daarom bouwen wij niet alleen websites. Wij helpen ondernemers groeien. Iedere website die wij bouwen heeft een duidelijk doel: meer klanten voor onze klant.",
    ))
    story.append(p(
        "Als Sales Partner ben jij vaak het eerste gezicht van Max Webstudio. Je verkoopt geen losse website. Je verkoopt duidelijkheid, vertrouwen en groei.",
        "Callout",
    ))
    story.append(p("Onze belofte", "H2Custom"))
    story.append(bullet([
        "We werken eerlijk en transparant.",
        "We spreken ondernemers persoonlijk en respectvol aan.",
        "We leveren kwaliteit die past bij de belofte die we verkopen.",
        "We denken in groei, conversie en duurzame klantrelaties.",
        "We gebruiken moderne tools en werken AI-first waar dat waarde toevoegt.",
    ]))

    story.append(p("2. Missie, visie en kernwaarden", "H1Custom"))
    story.append(table([
        ["Thema", "Uitleg"],
        ["Missie", "Ondernemers helpen aan een professionele website die vertrouwen wekt, aanvragen oplevert en groei mogelijk maakt."],
        ["Visie", "Een goede online uitstraling mag niet alleen bereikbaar zijn voor grote bedrijven. Ook lokale ondernemers verdienen een website die serieus voelt en resultaat oplevert."],
        ["Kernwaarden", "Eerlijk, persoonlijk, kwaliteit, groei, innovatie en AI-first."],
    ], [3.6 * cm, 11.6 * cm]))
    story.append(PageBreak())

    story.append(p("3. Bedrijfsgegevens", "H1Custom"))
    story.append(p("De onderstaande gegevens zijn overgenomen uit de aangeleverde KvK-afbeelding.", "Small"))
    story.append(table([
        ["Gegeven", "Informatie"],
        ["Handelsnaam", "Max Webstudio"],
        ["Onderneming", "lebellebox"],
        ["KvK-nummer", "73275786"],
        ["Vestigingsnummer", "000041331192"],
        ["Startdatum vestiging", "06-12-2018"],
        ["Adres", "Kompas 32, 1319DJ Almere"],
        ["Telefoon", "0611621859 / 0616217771"],
        ["E-mail", "max@maxwebstudio.nl"],
        ["Domeinen", "wittetandjes.nl, imperiumbands.com, www.lebellebox.com"],
        ["Toegevoegde handelsnaam", "Vanaf 24-06-2026 wordt handelsnaam Max Webstudio gevoerd."],
    ], [4.2 * cm, 11 * cm]))

    story.append(p("4. Producten en pakketten", "H1Custom"))
    story.append(p("De Sales Partner verkoopt de producten en diensten die door Max Webstudio zijn goedgekeurd. Prijzen kunnen door Max Webstudio worden aangepast.", "BodyCustom"))
    story.append(table([
        ["Pakket", "Prijs ex. btw", "Aanbetaling ex. btw", "Restbedrag ex. btw"],
        ["Starter Site", "EUR 495", "EUR 150", "EUR 345"],
        ["Business Website", "EUR 995", "EUR 300", "EUR 695"],
        ["Premium Growth", "EUR 1.750", "EUR 500", "EUR 1.250"],
    ], [4.2 * cm, 3.3 * cm, 3.8 * cm, 3.9 * cm]))
    story.append(Spacer(1, 8))
    story.append(table([
        ["Onderhoud", "Prijs ex. btw", "Inhoud"],
        ["Geen onderhoud", "EUR 0 p/m", "Alleen websitepakket en aanbetaling."],
        ["Care Basic", "EUR 19,95 p/m", "Hosting, SSL, back-up en technische monitoring."],
        ["Care Plus", "EUR 49 p/m", "Alles uit Basic plus 15 minuten kleine wijzigingen per maand."],
        ["Care Growth", "EUR 99 p/m", "Alles uit Plus plus maandelijkse check en conversieadvies."],
    ], [4.1 * cm, 3.3 * cm, 7.8 * cm]))
    story.append(PageBreak())

    story.append(p("5. Salesflow", "H1Custom"))
    story.append(p("De standaardwerkwijze van Max Webstudio is bedoeld om elke klant professioneel en controleerbaar door het traject te begeleiden.", "BodyCustom"))
    story.append(table([
        ["Stap", "Actie", "Verantwoordelijkheid"],
        ["1", "Lead verzamelen via eigen acquisitie, cold calling of eigen netwerk.", "Sales Partner"],
        ["2", "Bellen, behoefte ophalen en uitkomst vastleggen.", "Sales Partner"],
        ["3", "Demo, scan of voorstel voorbereiden volgens Max Webstudio-format.", "Sales Partner / Max Webstudio"],
        ["4", "Offerte in CRM registreren en laten volgen door akkoord.", "Sales Partner"],
        ["5", "Aanbetaling laten voldoen voordat productie start.", "Klant / Max Webstudio"],
        ["6", "Planning, bouw, feedback en livegang uitvoeren.", "Max Webstudio"],
        ["7", "Onderhoud, hosting of aanvullende diensten aanbieden.", "Sales Partner / Max Webstudio"],
    ], [1.2 * cm, 9.2 * cm, 4.8 * cm]))

    story.append(p("6. Sales rules", "H1Custom"))
    story.append(bullet([
        "Iedere belpoging wordt geregistreerd met datum, uitkomst en eventuele vervolgstap.",
        "Iedere offerte en ieder akkoord loopt via het CRM of via een door Max Webstudio goedgekeurde werkwijze.",
        "Er worden geen prive-offertes, eigen betaalverzoeken of afwijkende prijsafspraken gemaakt.",
        "Korting boven een door Max Webstudio vastgesteld percentage mag alleen met voorafgaande toestemming.",
        "De Sales Partner verkoopt geen websites of vergelijkbare diensten naast Max Webstudio zolang deze overeenkomst loopt.",
        "Bij twijfel, klacht of afwijkende klantafspraak wordt Max Webstudio direct geinformeerd.",
    ]))
    story.append(PageBreak())

    story.append(p("7. Positie van de Sales Partner", "H1Custom"))
    story.append(p("De Sales Partner bepaalt zelf zijn of haar werktijden. Er is geen verplicht rooster en geen gezagsverhouding zoals bij een arbeidsovereenkomst.", "BodyCustom"))
    story.append(table([
        ["Onderwerp", "Afspraak"],
        ["Vrijheid", "De Sales Partner bepaalt zelfstandig werktijden, planning en acquisitie-aanpak binnen de merk- en salesregels."],
        ["Acquisitie", "Eigen acquisitie, cold calling en het eigen netwerk zijn toegestaan en gewenst."],
        ["Middelen", "Max Webstudio kan een e-mailadres, CRM-toegang, bedrijfslogo, visitekaartjes en templates beschikbaar stellen."],
        ["Geen dienstverband", "Partijen beogen geen arbeidsovereenkomst. De Sales Partner is zelf verantwoordelijk voor belasting, verzekeringen en administratie, tenzij schriftelijk anders afgesproken."],
        ["Geen vertegenwoordigingsbevoegdheid", "De Sales Partner mag Max Webstudio niet juridisch binden buiten goedgekeurde offertes en afspraken."],
    ], [4.2 * cm, 11 * cm]))

    story.append(p("8. Commissie", "H1Custom"))
    story.append(p(
        "De commissieafspraken worden later volledig uitgewerkt in een aparte bijlage. Totdat die bijlage door beide partijen is bevestigd, geldt alleen de schriftelijk overeengekomen commissie per verkoop.",
        "Callout",
    ))
    story.append(table([
        ["Situatie", "Gevolg voor commissie"],
        ["Klant betaalt correct", "Commissie wordt uitgekeerd volgens de afgesproken commissie-bijlage."],
        ["Factuur wordt gecrediteerd", "Geen commissie of terugboeking voor het gecrediteerde deel."],
        ["Klant betaalt niet", "Geen commissie zolang betaling uitblijft."],
        ["Fraude, misleiding of valse informatie", "Geen commissie en mogelijke directe beeindiging."],
        ["Ongeoorloofde korting", "Commissie kan worden aangepast of geweigerd."],
    ], [5.2 * cm, 10 * cm]))
    story.append(PageBreak())

    story.append(p("9. CRM en administratie", "H1Custom"))
    story.append(p("Het CRM is leidend voor leadregistratie, opvolging, offertes en status. Mondelinge afspraken zijn pas geldig wanneer ze correct zijn vastgelegd.", "BodyCustom"))
    story.append(bullet([
        "Registreer elke lead voordat er een offerte wordt uitgebracht.",
        "Gebruik duidelijke leadstatussen zoals nieuw, gebeld, afspraak, offerte, akkoord, verloren en opvolgen.",
        "Leg bij elke belpoging de uitkomst vast.",
        "Gebruik geen privekanalen voor formele klantafspraken wanneer Max Webstudio daar geen zicht op heeft.",
        "Klantinformatie blijft vertrouwelijk en mag niet voor andere doeleinden worden gebruikt.",
    ]))

    story.append(p("10. Merk, AI en communicatie", "H1Custom"))
    story.append(table([
        ["Onderwerp", "Richtlijn"],
        ["Logo en huisstijl", "Alleen gebruiken volgens instructies van Max Webstudio. Geen eigen varianten zonder toestemming."],
        ["E-mailadres", "Zakelijke communicatie verloopt bij voorkeur via een Max Webstudio e-mailadres."],
        ["Visitekaartjes", "Alleen gebruiken met goedgekeurde naam, rol, logo en contactgegevens."],
        ["AI", "AI mag worden gebruikt voor voorbereiding, scripts, scans en conceptteksten, maar klantbeloftes moeten altijd kloppen."],
        ["Social media", "Geen claims, garanties of prijzen publiceren die niet door Max Webstudio zijn goedgekeurd."],
    ], [4.3 * cm, 10.9 * cm]))

    story.append(p("11. Road to Success", "H1Custom"))
    story.append(p("Max Webstudio kan salespartners erkennen op basis van prestaties. Awards en voordelen worden later uitgewerkt.", "BodyCustom"))
    story.append(table([
        ["Mijlpaal", "Betekenis"],
        ["Eerste sale", "De Sales Partner heeft de onboarding in de praktijk afgerond."],
        ["10 websites", "Sterke start en aantoonbare discipline in opvolging."],
        ["25 websites", "Ervaren partner met structurele bijdrage."],
        ["50 websites", "Toppartner met bewezen marktimpact."],
        ["100 websites", "Strategische groeipartner voor Max Webstudio."],
    ], [4.2 * cm, 11 * cm]))
    story.append(PageBreak())

    story.append(p("12. Looptijd, opzegging en beeindiging", "H1Custom"))
    story.append(table([
        ["Artikel", "Afspraak"],
        ["Looptijd", "De overeenkomst wordt aangegaan voor 12 maanden vanaf de ingangsdatum."],
        ["Opzegging", "Beide partijen kunnen opzeggen met een termijn van 30 dagen."],
        ["Directe beeindiging", "Max Webstudio mag direct beeindigen bij fraude, diefstal, misleiding, ernstig schenden van afspraken, klantbenadeling of ongeoorloofd concurrerend handelen."],
        ["Na beeindiging", "De Sales Partner stopt met gebruik van logo, e-mailadres, CRM, klantdata en Max Webstudio-materialen."],
        ["Melding", "Problemen, klachten of belangenconflicten worden direct gemeld."],
    ], [4.2 * cm, 11 * cm]))

    story.append(p("13. Vertrouwelijkheid en klantbescherming", "H1Custom"))
    story.append(bullet([
        "Alle klantgegevens, leads, offertes, prijzen, scripts, templates en interne werkwijzen zijn vertrouwelijk.",
        "De Sales Partner gebruikt klantdata alleen voor werkzaamheden voor Max Webstudio.",
        "Na einde samenwerking worden klantgegevens niet meegenomen, gekopieerd of benaderd voor concurrerende diensten.",
        "De Sales Partner handelt zorgvuldig en professioneel richting klanten, prospects en medewerkers van Max Webstudio.",
    ]))
    story.append(p("14. Onboarding checklist", "H1Custom"))
    story.append(table([
        ["Onderdeel", "Status"],
        ["Max Webstudio e-mailadres aangemaakt", "Nog in te vullen"],
        ["CRM-toegang ontvangen", "Nog in te vullen"],
        ["Logo en huisstijl ontvangen", "Nog in te vullen"],
        ["Visitekaartjes / materialen ontvangen", "Nog in te vullen"],
        ["Sales scripts en werkwijze doorgenomen", "Nog in te vullen"],
        ["Commissie-bijlage bevestigd", "Nog in te vullen"],
    ], [8 * cm, 7.2 * cm]))
    story.append(PageBreak())

    story.append(p("Module 01 - Sales Partner Agreement", "H1Custom"))
    story.append(p("Deze module vormt de kern van de overeenkomst van opdracht tussen Max Webstudio en de Sales Partner.", "BodyCustom"))
    story.append(table([
        ["Artikel", "Bepaling"],
        ["Opdracht", "De Sales Partner werft, benadert en begeleidt prospects voor producten en diensten van Max Webstudio."],
        ["Zelfstandigheid", "De Sales Partner is vrij in de uitvoering, zolang de salesregels, merkregels, privacyregels en klantafspraken worden nageleefd."],
        ["Geen loon", "De Sales Partner ontvangt geen salaris, vakantiegeld, pensioen, doorbetaling bij ziekte of andere werknemersrechten."],
        ["Kosten", "Eigen kosten zijn voor rekening van de Sales Partner, tenzij vooraf schriftelijk anders afgesproken."],
        ["Belasting", "De Sales Partner is zelf verantwoordelijk voor aangiften, facturen, verzekeringen en eventuele ondernemersrisico's."],
    ], [3.7 * cm, 11.5 * cm]))
    story.append(p("Schijnzelfstandigheid voorkomen", "H2Custom"))
    story.append(bullet([
        "Geen verplicht rooster of vaste werkplek.",
        "Geen dagelijkse gezagsinstructies alsof sprake is van dienstverband.",
        "Wel duidelijke merk-, kwaliteits- en compliance-afspraken.",
        "Afspraken over resultaat, klantbescherming en processen zijn toegestaan en nodig.",
    ]))
    story.append(PageBreak())

    story.append(p("Module 02 - Commissie- en Bonusreglement", "H1Custom"))
    story.append(p("De exacte percentages worden in een aparte commissie-bijlage ingevuld. Onderstaande regels bepalen alvast wanneer commissie ontstaat, vervalt of wordt aangepast.", "BodyCustom"))
    story.append(table([
        ["Product", "Commissie", "Opmerking"],
        ["Starter Site / One Pager", "Nog vaststellen", "Bijlage invullen voordat iemand start."],
        ["Business Website", "Nog vaststellen", "Bijlage invullen voordat iemand start."],
        ["Premium Growth", "Nog vaststellen", "Bijlage invullen voordat iemand start."],
        ["Hosting / onderhoud", "Nog vaststellen", "Eenmalig, recurrent of geen commissie bepalen."],
        ["Logo / SEO / Google Bedrijfsprofiel", "Nog vaststellen", "Toekomstige uitbreidingen mogelijk."],
        ["AI Chatbot / AI Voice", "Nog vaststellen", "Apart productbeleid toevoegen zodra live."],
        ["Domeinnamen", "Nog vaststellen", "Vaak lage marge; apart bepalen."],
    ], [5.4 * cm, 3.5 * cm, 6.3 * cm]))
    story.append(p("Commissie ontstaat pas wanneer", "H2Custom"))
    story.append(bullet([
        "de klant schriftelijk akkoord heeft gegeven;",
        "de lead correct in het CRM staat;",
        "de aanbetaling of relevante factuur door Max Webstudio is ontvangen;",
        "er geen sprake is van fraude, misleiding of ongeoorloofde korting;",
        "de verkoop binnen de goedgekeurde pakketten en prijzen valt.",
    ]))
    story.append(PageBreak())

    story.append(p("Wanneer commissie vervalt", "H1Custom"))
    story.append(table([
        ["Situatie", "Gevolg"],
        ["Klant betaalt niet", "Geen commissie zolang betaling uitblijft."],
        ["Factuur wordt gecrediteerd", "Commissie vervalt voor het gecrediteerde bedrag."],
        ["Refund of annulering", "Commissie kan worden teruggeboekt of verrekend."],
        ["Fraude of misleiding", "Geen commissie en mogelijk directe beeindiging."],
        ["Eigen aankoop", "Geen commissie, tenzij vooraf schriftelijk goedgekeurd."],
        ["Familie of nauwe relatie", "Alleen commissie na voorafgaande goedkeuring."],
        ["Korting zonder toestemming", "Commissie kan worden geweigerd of aangepast."],
    ], [5.2 * cm, 10 * cm]))
    story.append(p("Bonusregeling", "H2Custom"))
    story.append(p("Max Webstudio kan tijdelijke of structurele bonussen instellen voor volumes, upsells, klanttevredenheid of strategische producten. Een bonus is pas afdwingbaar wanneer deze schriftelijk is bevestigd.", "BodyCustom"))
    story.append(PageBreak())

    story.append(p("Module 03 - Sales Playbook", "H1Custom"))
    story.append(p("Het Sales Playbook beschrijft hoe Max Webstudio verkoopt: persoonlijk, duidelijk, betrouwbaar en gericht op groei.", "BodyCustom"))
    story.append(table([
        ["Fase", "Doel", "Voorbeeldactie"],
        ["Voorbereiding", "Relevantie vinden", "Bekijk website, Google-profiel, reviews en branche."],
        ["Opening", "Aandacht en vertrouwen", "Kort voorstellen en reden van contact noemen."],
        ["Behoefte", "Pijnpunt vinden", "Vragen naar aanvragen, uitstraling, vindbaarheid en conversie."],
        ["Voorstel", "Waarde koppelen", "Pakket adviseren op basis van doel en budget."],
        ["Afsluiting", "Volgende stap", "Aanbetaling, planning en intake bevestigen."],
        ["Follow-up", "Momentum houden", "Binnen 24 uur opvolgen met samenvatting en concrete actie."],
    ], [3.2 * cm, 4.2 * cm, 7.8 * cm]))
    story.append(p("Basisbelofte", "H2Custom"))
    story.append(p("Wij verkopen geen losse pagina's. Wij helpen ondernemers professioneler overkomen, meer vertrouwen opbouwen en meer aanvragen krijgen.", "Callout"))
    story.append(PageBreak())

    story.append(p("Bel- en WhatsApp-scripts", "H1Custom"))
    story.append(p("Opening cold call", "H2Custom"))
    story.append(p("Hoi, je spreekt met [naam] van Max Webstudio. Ik bel kort omdat ik zag dat jullie online uitstraling nog kansen heeft om meer aanvragen binnen te halen. Ik wilde even checken of jullie daar dit jaar mee bezig zijn.", "BodyCustom"))
    story.append(p("Bezwaar: we hebben al een website", "H2Custom"))
    story.append(p("Snap ik. Veel ondernemers hebben al een website, maar halen er nog niet uit wat erin zit. Ik kijk vooral naar vertrouwen, vindbaarheid en conversie. Als ik vrijblijvend 2 of 3 verbeterpunten stuur, is dat interessant?", "BodyCustom"))
    story.append(p("WhatsApp follow-up", "H2Custom"))
    story.append(p("Hoi [naam], zoals besproken stuur ik hierbij kort de opties van Max Webstudio. Mijn advies is [pakket], omdat [reden]. Als je akkoord bent, plannen we de intake en kan de bouw starten na de aanbetaling.", "BodyCustom"))
    story.append(PageBreak())

    story.append(p("Module 04 - Geheimhoudingsverklaring (NDA)", "H1Custom"))
    story.append(p("De Sales Partner krijgt toegang tot klantgegevens, prijzen, scripts, interne processen, templates en mogelijk CRM-data. Die informatie is vertrouwelijk.", "BodyCustom"))
    story.append(bullet([
        "Vertrouwelijke informatie wordt niet gedeeld met derden.",
        "Informatie wordt alleen gebruikt voor werkzaamheden voor Max Webstudio.",
        "Na einde samenwerking worden documenten, logins en bestanden teruggegeven of verwijderd.",
        "De geheimhouding blijft ook na het einde van de samenwerking bestaan.",
        "Bij datalek, verkeerd verzonden informatie of verlies van toegangsmiddelen wordt Max Webstudio direct geinformeerd.",
    ]))
    story.append(p("Boeteclausule", "H2Custom"))
    story.append(p("Een concrete boete kan later worden toegevoegd na juridisch advies. Tot die tijd blijft Max Webstudio gerechtigd schade te verhalen wanneer vertrouwelijke informatie wordt misbruikt.", "BodyCustom"))
    story.append(PageBreak())

    story.append(p("Module 05 - Gedragscode", "H1Custom"))
    story.append(table([
        ["Regel", "Wat dit betekent"],
        ["Eerlijk verkopen", "Geen garanties beloven die Max Webstudio niet kan waarmaken."],
        ["Geen druk of misleiding", "Geen nep-schaarste, valse resultaten of agressieve verkoop."],
        ["Professionele toon", "Respectvol communiceren via telefoon, e-mail, WhatsApp en social media."],
        ["Prijsdiscipline", "Geen eigen prijzen, kortingen of betalingsafspraken buiten toestemming."],
        ["Klachtmelding", "Klachten of ontevreden klanten direct melden."],
        ["Representatie", "De Sales Partner beseft dat hij of zij Max Webstudio vertegenwoordigt in de markt."],
    ], [4.2 * cm, 11 * cm]))
    story.append(p("Direct melden", "H2Custom"))
    story.append(bullet([
        "klant dreigt met klacht of chargeback;",
        "verkeerde prijs of belofte is gecommuniceerd;",
        "lead of klant vraagt om uitzondering;",
        "mogelijke belangenverstrengeling;",
        "vermoeden van fraude of misbruik.",
    ]))
    story.append(PageBreak())

    story.append(p("Module 06 - CRM & AI Policy", "H1Custom"))
    story.append(p("CRM-regels", "H2Custom"))
    story.append(bullet([
        "Elke lead wordt geregistreerd voordat er een offerte wordt gestuurd.",
        "Elke belpoging krijgt een uitkomst.",
        "Elke offerte, korting, statuswijziging en afspraak wordt vastgelegd.",
        "Geen losse schaduwadminstratie naast het CRM.",
        "Klantgegevens blijven eigendom van Max Webstudio of de klant, niet van de Sales Partner.",
    ]))
    story.append(p("AI-regels", "H2Custom"))
    story.append(bullet([
        "AI mag helpen met research, scripts, samenvattingen en conceptteksten.",
        "AI-output wordt gecontroleerd voordat deze naar klanten gaat.",
        "Geen gevoelige klantdata invoeren in externe AI-tools zonder toestemming.",
        "AI mag geen garanties, juridische adviezen of harde omzetbeloftes verzinnen.",
        "Bij twijfel geldt: eerst checken, dan sturen.",
    ]))
    story.append(PageBreak())

    story.append(p("Module 07 - AVG / Privacy", "H1Custom"))
    story.append(p("De Sales Partner verwerkt persoonsgegevens zoals namen, telefoonnummers, e-mailadressen, bedrijfsgegevens en gespreksnotities. Dat moet zorgvuldig gebeuren.", "BodyCustom"))
    story.append(table([
        ["Privacyregel", "Toepassing"],
        ["Dataminimalisatie", "Leg alleen vast wat nodig is voor verkoop en opvolging."],
        ["Beveiliging", "Gebruik sterke wachtwoorden en deel geen logins."],
        ["Doelbinding", "Gebruik klantdata niet voor eigen projecten of concurrenten."],
        ["Bewaartermijn", "Verwijder of archiveer data volgens instructie van Max Webstudio."],
        ["Datalek", "Meld verlies, verkeerde verzending of onbevoegde toegang direct."],
    ], [4.4 * cm, 10.8 * cm]))
    story.append(p("Verwerkersafspraken", "H2Custom"))
    story.append(p("Wanneer de Sales Partner structureel persoonsgegevens verwerkt namens Max Webstudio, kan een aparte verwerkersovereenkomst nodig zijn. Dit moet juridisch worden beoordeeld.", "BodyCustom"))
    story.append(PageBreak())

    story.append(p("Module 08 - Onboarding", "H1Custom"))
    story.append(p("Doel: een nieuwe Sales Partner moet binnen korte tijd professioneel kunnen starten zonder afhankelijk te zijn van mondelinge uitleg.", "BodyCustom"))
    story.append(table([
        ["Dag", "Actie"],
        ["Dag 1", "Overeenkomst tekenen, e-mailadres aanmaken, CRM-toegang activeren."],
        ["Dag 2", "Pakketten, prijzen, salesflow en merkbelofte doornemen."],
        ["Dag 3", "Scripts oefenen en eerste leadlijst voorbereiden."],
        ["Week 1", "Eerste belpogingen registreren en samen evalueren."],
        ["Week 2", "Demo/offerteproces oefenen en eerste targets afspreken."],
        ["Maand 1", "Performance, kwaliteit, CRM-discipline en commissie-afspraken checken."],
    ], [3.2 * cm, 12 * cm]))
    story.append(p("Benodigdheden", "H2Custom"))
    story.append(bullet([
        "Max Webstudio e-mailadres;",
        "CRM-login;",
        "logo en huisstijlbestanden;",
        "sales scripts;",
        "pakketten- en prijsoverzicht;",
        "commissie-bijlage;",
        "contactpersoon voor vragen.",
    ]))
    story.append(PageBreak())

    story.append(p("Module 09 - Offboarding", "H1Custom"))
    story.append(p("Offboarding moet rustig, professioneel en controleerbaar verlopen, zeker wanneer de Sales Partner klantcontact heeft gehad.", "BodyCustom"))
    story.append(table([
        ["Moment", "Actie"],
        ["Opzegging", "Einddatum bevestigen en openstaande leads inventariseren."],
        ["Laatste werkdag", "CRM bijwerken, lopende afspraken overdragen, klantcommunicatie afronden."],
        ["Toegang", "E-mail, CRM, bestanden en andere accounts intrekken."],
        ["Materialen", "Logo's, visitekaartjes, templates en interne documenten niet meer gebruiken."],
        ["Commissie", "Openstaande commissie beoordelen volgens commissie-reglement."],
        ["Na vertrek", "Relatiebeding, geheimhouding en privacyregels blijven gelden."],
    ], [4 * cm, 11.2 * cm]))
    story.append(p("Relatiebeding", "H2Custom"))
    story.append(p("Gedurende 12 maanden na einde samenwerking benadert de Sales Partner geen klanten of actieve leads van Max Webstudio voor concurrerende websites, hosting, marketing, AI of aanverwante diensten, tenzij Max Webstudio vooraf schriftelijk toestemming geeft.", "Callout"))
    story.append(PageBreak())

    story.append(p("Module 10 - Huisstijlhandboek voor sales", "H1Custom"))
    story.append(p("De huisstijl zorgt dat elke salespartner hetzelfde merkgevoel uitstraalt: strak, betrouwbaar, persoonlijk en groei gericht.", "BodyCustom"))
    story.append(table([
        ["Onderdeel", "Regel"],
        ["Logo", "Alleen goedgekeurde logo's gebruiken. Niet uitrekken, recoloren of combineren met eigen logo's."],
        ["Kleur", "Donkerblauw als primaire zakelijke kleur, met rustige lichte achtergronden."],
        ["Taal", "Duidelijk, professioneel, menselijk. Geen overdreven marketingclaims."],
        ["E-mail", "Gebruik zakelijke handtekening met naam, rol, Max Webstudio en contactgegevens."],
        ["Social", "Geen posts met ongekeurde prijzen, garanties of klantcases."],
        ["Kleding", "Alleen bedrijfskleding gebruiken wanneer Max Webstudio dit goedkeurt."],
    ], [4.2 * cm, 11 * cm]))
    story.append(p("Kernzin", "H2Custom"))
    story.append(p("Wij helpen ondernemers groeien.", "Callout"))
    story.append(PageBreak())

    story.append(p("Bijlage A - Begrippenlijst", "H1Custom"))
    story.append(table([
        ["Begrip", "Betekenis"],
        ["Sales Partner", "De zelfstandige opdrachtnemer die leads werft en salesactiviteiten uitvoert voor Max Webstudio."],
        ["Lead", "Een potentiele klant die nog geen definitief akkoord heeft gegeven."],
        ["Prospect", "Een lead waarmee inhoudelijk contact is geweest over een mogelijke opdracht."],
        ["Klant", "Een partij die akkoord heeft gegeven en waarvoor Max Webstudio werkzaamheden uitvoert."],
        ["CRM", "Het systeem waarin leads, contactmomenten, offertes, statussen en afspraken worden geregistreerd."],
        ["Goedgekeurde offerte", "Een offerte die volgens de Max Webstudio-werkwijze is opgesteld en door de klant is geaccepteerd."],
        ["Commissie", "De vergoeding waarop de Sales Partner recht kan hebben volgens de commissie-bijlage."],
    ], [4.1 * cm, 11.1 * cm]))
    story.append(PageBreak())

    story.append(p("Bijlage B - Commissieblad invullen", "H1Custom"))
    story.append(p("Gebruik deze pagina als invulblad voordat een Sales Partner start. Vul percentages en uitzonderingen volledig in en laat beide partijen paraferen.", "BodyCustom"))
    story.append(table([
        ["Product", "Percentage / bedrag", "Moment van uitbetaling", "Uitzonderingen"],
        ["Starter Site", "", "", ""],
        ["Business Website", "", "", ""],
        ["Premium Growth", "", "", ""],
        ["Care Basic", "", "", ""],
        ["Care Plus", "", "", ""],
        ["Care Growth", "", "", ""],
        ["Logo", "", "", ""],
        ["SEO", "", "", ""],
        ["AI Chatbot", "", "", ""],
        ["AI Voice", "", "", ""],
    ], [4.0 * cm, 3.6 * cm, 4.1 * cm, 3.5 * cm]))
    story.append(PageBreak())

    story.append(p("Bijlage C - Digitale ondertekening", "H1Custom"))
    story.append(p("Dit document is geschikt om digitaal te laten ondertekenen via een betrouwbare ondertekenoplossing. Zorg dat de definitieve PDF niet meer inhoudelijk wordt aangepast nadat deze ter ondertekening is aangeboden.", "BodyCustom"))
    story.append(table([
        ["Controlepunt", "Akkoord"],
        ["Naam Sales Partner volledig ingevuld", ""],
        ["Bedrijfsnaam en KvK Sales Partner ingevuld", ""],
        ["Commissie-bijlage ingevuld en toegevoegd", ""],
        ["Ingangsdatum ingevuld", ""],
        ["Relatiebeding gecontroleerd", ""],
        ["AVG/privacy-afspraken gecontroleerd", ""],
        ["Juridische eindcontrole uitgevoerd", ""],
    ], [9.5 * cm, 5.7 * cm]))
    story.append(PageBreak())

    story.append(p("Bijlage D - Juridische eindcheck", "H1Custom"))
    story.append(p("Deze lijst is bedoeld voor de laatste controle met een jurist of arbeidsrechtspecialist, vooral omdat ZZP-relaties in Nederland zorgvuldig moeten worden ingericht.", "BodyCustom"))
    story.append(bullet([
        "Controleer of de overeenkomst geen arbeidsovereenkomst suggereert.",
        "Controleer of zelfstandigheid, vrije werktijden en ondernemersrisico duidelijk genoeg zijn.",
        "Controleer relatiebeding, concurrentie-afspraken en geheimhouding op redelijkheid en afdwingbaarheid.",
        "Controleer of commissie-afspraken concreet genoeg zijn.",
        "Controleer AVG/verwerking van persoonsgegevens en eventuele verwerkersovereenkomst.",
        "Controleer of opzegging, directe beeindiging en terugboeking van commissie juridisch juist zijn.",
        "Controleer of de salespartner eigen belastingen, verzekeringen en administratie zelf draagt.",
    ]))
    story.append(p("Advies", "H2Custom"))
    story.append(p("Gebruik dit document als professionele basis, maar laat de definitieve versie toetsen voordat Max Webstudio met meerdere salespartners werkt.", "Callout"))
    story.append(PageBreak())

    story.append(p("Ondertekening", "H1Custom"))
    story.append(p("Door ondertekening bevestigen partijen dat zij dit Sales Partner Handbook & Overeenkomst hebben gelezen, begrepen en akkoord zijn met de gemaakte afspraken.", "BodyCustom"))
    story.append(Spacer(1, 18))
    sign_data = [
        [p("<b>Max Webstudio</b><br/>Handelsnaam van lebellebox<br/>KvK 73275786", "TableText"), p("<b>Sales Partner</b><br/>Naam: ______________________________<br/>Bedrijf: _____________________________", "TableText")],
        [p("Naam tekenbevoegde:<br/><br/>______________________________", "Signature"), p("Adres:<br/><br/>______________________________", "Signature")],
        [p("Datum:<br/><br/>______________________________", "Signature"), p("Datum:<br/><br/>______________________________", "Signature")],
        [p("Plaats:<br/><br/>______________________________", "Signature"), p("Plaats:<br/><br/>______________________________", "Signature")],
        [p("Handtekening:<br/><br/><br/>______________________________", "Signature"), p("Handtekening:<br/><br/><br/>______________________________", "Signature")],
    ]
    story.append(table(sign_data, [7.5 * cm, 7.5 * cm], header=False))
    story.append(Spacer(1, 18))
    story.append(p("Bijlagen die later kunnen worden toegevoegd", "H2Custom"))
    story.append(bullet([
        "Bijlage 1 - Commissiepercentages en uitbetalingsmomenten.",
        "Bijlage 2 - Sales scripts en bezwaarafhandeling.",
        "Bijlage 3 - CRM-handleiding.",
        "Bijlage 4 - Brandbook en communicatievoorbeelden.",
        "Bijlage 5 - AI-richtlijnen en voorbeeldprompts.",
    ]))

    doc.build(story)


if __name__ == "__main__":
    build()
