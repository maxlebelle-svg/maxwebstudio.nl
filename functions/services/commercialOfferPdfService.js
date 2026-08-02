const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

function generateCommercialOfferPdf(input = {}) {
  const snapshot = input.snapshot || {};
  const relationship = input.relationship || {};
  const documents = Array.isArray(input.documents) ? input.documents : [];
  if (snapshot.offerPurpose !== "definitive_offer" || !/^[a-f0-9]{64}$/.test(String(snapshot.checksum || input.snapshotChecksum || ""))) {
    throw coded("COMMERCIAL_PDF_INVALID", 409, "Alleen een controleerbare definitieve offerte kan worden ondertekend.");
  }
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  const reference = `MWS-${String(input.versionNumber || 1).padStart(3, "0")}-${String(input.offerId || "").slice(0, 8).toUpperCase()}`;
  const pages = [
    page([
      title("MAX WEBSTUDIO", 790, 18, [0.12,0.65,0.86]),
      title("Definitieve zakelijke offerte", 752, 25, [0.04,0.12,0.2]),
      line(`Referentie: ${reference}`, 720, 10, true),
      line(`Voor: ${clean(relationship.companyName) || "—"}`, 690, 13, true),
      line(`Contactpersoon: ${clean(relationship.contactName) || "—"}`, 670),
      line(`E-mail: ${clean(relationship.email) || "—"}`, 652),
      rule(630),
      line("Opdracht en prijsopbouw", 604, 15, true),
      ...offerLines(lines, 578),
      rule(326),
      line(`Eenmalig voor korting excl. btw: ${money(snapshot.oneTimeBeforeDiscountExVatCents ?? snapshot.oneTimeExVatCents)}`, 302),
      line(`Korting: ${Number(snapshot.discountPercentage || 0)}% (-${money(snapshot.discountExVatCents)})`, 284),
      line(`Eenmalig na korting excl. btw: ${money(snapshot.oneTimeExVatCents)}`, 266, 11, true),
      line(`Doorlopend per maand excl. btw: ${money(snapshot.recurringExVatCents)}`, 248, 11, true),
      line(`Betaalkeuze: ${payment(snapshot.paymentChoice)}`, 222),
      line(`Geldig tot en met: ${clean(snapshot.validUntil)}`, 204),
      line("Alle bedragen zijn exclusief btw, tenzij uitdrukkelijk anders vermeld.", 176, 9),
      line("Betaling en abonnementen starten niet automatisch door ondertekening.", 158, 9),
      footer(reference, 34),
    ]),
    page([
      title("Voorwaarden en ondertekening", 790, 22, [0.04,0.12,0.2]),
      line("Deze overeenkomst wordt uitsluitend zakelijk (B2B) gesloten.", 750, 11, true),
      line("De ondertekenaar verklaart bevoegd te zijn de genoemde onderneming te vertegenwoordigen.", 730, 9),
      line("Het consumentenherroepingsrecht is niet van toepassing.", 712, 9),
      rule(690),
      line("Gekoppelde documenten", 666, 14, true),
      ...documentLines(documents, 640),
      rule(482),
      line("Documentintegriteit", 458, 14, true),
      line(`Offertechecksum: ${snapshot.checksum}`, 432, 8),
      ...documents.slice(0,5).map((doc,index) => line(`${doc.document_type || doc.documentType}: ${doc.version_code || doc.versionCode} / ${doc.checksum_sha256 || doc.checksumSha256}`, 412-index*18, 7)),
      rule(304),
      line(`Ondertekenaar: ${clean(input.signerName)}`, 276, 10, true),
      line(`Functie: ${clean(input.signerRole)}`, 256, 10),
      line(`Bedrijf: ${clean(relationship.companyName)}`, 236, 10),
      line("Digitale handtekening via Signhost:", 196, 10, true),
      "0.16 0.75 0.62 RG 1.5 w 70 94 455 78 re S",
      line("Ondertekening, tijdstip en auditbewijs worden door Signhost vastgelegd.", 70, 8),
      footer(reference, 34),
    ]),
  ];
  return { bytes:buildPdf(pages, reference), pageCount:2, signaturePage:2, reference };
}

function offerLines(lines, startY) {
  return lines.slice(0,11).flatMap((item,index) => {
    const y=startY-index*22;
    return [line(`${index+1}. ${truncate(item.productName,48)}${item.componentType === "recurring" ? " (per maand)" : ""}`,y,9),right(money(item.subtotalExVatCents),y,9,true)];
  });
}
function documentLines(documents,startY){return documents.slice(0,7).flatMap((doc,index)=>{const y=startY-index*24;return [line(`${index+1}. ${label(doc.document_type||doc.documentType)}`,y,9,true),line(`Versie ${doc.version_code||doc.versionCode||"—"}`,y-12,7)];});}
function page(commands){return commands.join("\n");}
function line(value,y,size=9,bold=false){return text(value,54,y,size,bold?"F2":"F1",[0.08,0.14,0.2]);}
function right(value,y,size=9,bold=false){const width=printable(value)*size*.5;return text(value,Math.max(380,535-width),y,size,bold?"F2":"F1",[0.08,0.14,0.2]);}
function title(value,y,size,color){return text(value,54,y,size,"F2",color);}
function footer(reference,y){return text(`Max Webstudio | ${reference} | Pagina wordt integraal onderdeel van de ondertekende PDF`,54,y,7,"F1",[0.36,0.43,0.5]);}
function rule(y){return `0.77 0.84 0.9 RG .7 w 54 ${y} 487 0 re S`;}
function text(value,x,y,size,font,color){return `${color.join(" ")} rg BT /${font} ${size} Tf 1 0 0 1 ${Number(x).toFixed(2)} ${y} Tm (${pdfText(value)}) Tj ET`;}

function buildPdf(pages,reference){
  const objects=[]; const pageIds=[];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>"); objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  pages.forEach((content)=>{const pageId=objects.length+1;const streamId=pageId+1;pageIds.push(pageId);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);const bytes=Buffer.from(content,"binary");objects.push(Buffer.concat([Buffer.from(`<< /Length ${bytes.length} >>\nstream\n`,"binary"),bytes,Buffer.from("\nendstream","binary")]));});
  objects[1]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects.push(`<< /Title (${pdfText(`Definitieve offerte ${reference}`)}) /Author (Max Webstudio) >>`);
  const chunks=[Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n","binary")];const offsets=[0];let length=chunks[0].length;
  objects.forEach((object,index)=>{offsets.push(length);const body=Buffer.isBuffer(object)?object:Buffer.from(object,"binary");const chunk=Buffer.concat([Buffer.from(`${index+1} 0 obj\n`,"binary"),body,Buffer.from("\nendobj\n","binary")]);chunks.push(chunk);length+=chunk.length;});
  const xrefOffset=length;chunks.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,"binary"));return Buffer.concat(chunks);
}
function pdfText(value){return Array.from(String(value||"")).map(char=>{const code=char.codePointAt(0)<=255?char.codePointAt(0):char==="€"?128:63;if([40,41,92].includes(code))return`\\${String.fromCharCode(code)}`;return code<32||code>126?`\\${code.toString(8).padStart(3,"0")}`:String.fromCharCode(code);}).join("");}
function money(value){const cents=Number(value);return Number.isInteger(cents)&&cents>=0?new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(cents/100):"—";}
function payment(value){return value==="full"?"volledig eenmalig bedrag":value==="fixed_deposit"?"vaste aanbetaling":"volgens factuurafspraak";}
function label(value){return ({offer_view:"Offerteweergave",commercial_agreement:"Overeenkomst",general_terms:"Algemene voorwaarden",hosting_maintenance_terms:"Hosting- en onderhoudsvoorwaarden",privacy_policy:"Privacyverklaring"})[value]||clean(value);}
function truncate(value,max){const result=clean(value);return result.length>max?`${result.slice(0,max-1)}…`:result;}
function printable(value){return Array.from(String(value||"")).length;}
function clean(value){return String(value||"").trim();}
function coded(code,status,message){return Object.assign(new Error(message),{code,statusCode:status,status});}

module.exports={generateCommercialOfferPdf,_test:{buildPdf,pdfText,money}};
