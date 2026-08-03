const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

const COLOR = {
  navy:[0.024,0.071,0.122], navy2:[0.043,0.125,0.204], cyan:[0.098,0.761,1],
  cyanSoft:[0.918,0.976,1], white:[1,1,1], ink:[0.078,0.129,0.188],
  muted:[0.4,0.439,0.522], line:[0.851,0.89,0.925], paper:[0.961,0.973,0.984],
  green:[0.051,0.608,0.439], slate:[0.157,0.263,0.341], softText:[0.749,0.816,0.867],
};

function generateCommercialOfferPdf(input = {}) {
  const snapshot = input.snapshot || {};
  const relationship = input.relationship || {};
  const documents = Array.isArray(input.documents) ? input.documents : [];
  const checksum = String(snapshot.checksum || input.snapshotChecksum || "");
  if (snapshot.offerPurpose !== "definitive_offer" || !/^[a-f0-9]{64}$/.test(checksum)) {
    throw coded("COMMERCIAL_PDF_INVALID", 409, "Alleen een controleerbare definitieve offerte kan worden ondertekend.");
  }

  const companyName = clean(relationship.companyName) || "de opdrachtgever";
  const reference = `MWS-${String(input.versionNumber || 1).padStart(3, "0")}-${String(input.offerId || "").slice(0, 8).toUpperCase()}`;
  const lineGroups = chunks(consolidatedLines(Array.isArray(snapshot.lines) ? snapshot.lines : []), 11);
  const totalPages = lineGroups.length + 2;
  const pages = [
    coverPage({ snapshot, relationship, reference, companyName, totalPages }),
    ...lineGroups.map((rows,index)=>scopePage({ snapshot, reference, rows, continuation:index>0, includeSummary:index===lineGroups.length-1, pageNumber:index+2, totalPages })),
    signaturePage({ snapshot:{...snapshot,checksum}, relationship, documents, reference, signerName:input.signerName, signerRole:input.signerRole, pageNumber:totalPages, totalPages }),
  ];
  return { bytes:buildPdf(pages, reference, auditKeywords(snapshot, documents)), pageCount:pages.length, signaturePage:pages.length, reference };
}

function coverPage({ snapshot, relationship, reference, companyName, totalPages }) {
  const commands = [
    rect(0,0,PAGE_WIDTH,PAGE_HEIGHT,COLOR.navy),
    circle(602,786,174,COLOR.navy2), circle(548,767,62,COLOR.cyan),
    ...brand(true),
    text("DEFINITIEVE ZAKELIJKE OFFERTE",42,700,8,"F2",COLOR.cyan),
    ...paragraph(`Een digitale basis die ${companyName} laat groeien.`,42,654,430,30,35,"F2",COLOR.white,3),
    ...paragraph("Een professionele online ervaring met heldere conversie, sterke lokale vindbaarheid en betrouwbaar technisch beheer.",42,536,440,12,18,"F1",COLOR.softText,3),
    roundedRect(42,335,511,132,18,COLOR.white),
    text("VOOR",62,438,7,"F2",COLOR.muted),
    text(truncate(companyName,36),62,407,23,"F2",COLOR.navy),
    text(truncate(clean(relationship.contactName) || "Contactpersoon",48),62,380,10,"F1",COLOR.muted),
    text(truncate(clean(relationship.email) || "",55),62,362,9,"F1",COLOR.muted),
    rightText("REFERENTIE",533,438,7,"F2",COLOR.muted),
    rightText(reference,533,409,12,"F2",COLOR.navy),
    rightText(`Geldig tot ${dateLabel(snapshot.validUntil)}`,533,380,9,"F1",COLOR.muted),
    text("UW INVESTERING",42,286,7,"F2",[0.576,0.655,0.725]),
    text(money(snapshot.oneTimeExVatCents),42,244,28,"F2",COLOR.white),
    text(`eenmalig excl. btw na ${Number(snapshot.discountPercentage || 0)}% korting`,42,220,9.5,"F1",COLOR.softText),
    roundedRect(340,227,213,62,12,COLOR.slate),
    text(money(snapshot.recurringExVatCents),359,257,17,"F2",COLOR.white),
    text("per maand excl. btw",359,238,8.5,"F1",COLOR.softText),
    text("Persoonlijk samengesteld door Max Webstudio",42,80,8.5,"F1",[0.56,0.651,0.722]),
    rightText(`Pagina 1 / ${totalPages}`,553,80,8.5,"F1",[0.56,0.651,0.722]),
  ];
  return page(commands);
}

function scopePage({ snapshot, reference, rows, continuation, includeSummary, pageNumber, totalPages }) {
  const rowHeight = rows.length <= 4 ? 62 : rows.length <= 6 ? 48 : rows.length <= 8 ? 39 : 31;
  const commands = [
    ...brand(false),
    text(continuation?"01  VERVOLG VAN DE OPDRACHT":"01  DE OPDRACHT",42,700,8,"F2",COLOR.cyan),
    text(continuation?"Aanvullende onderdelen":"Van bezoeker naar resultaat",42,662,24,"F2",COLOR.navy),
    ...paragraph(continuation?"Alle aanvullende onderdelen blijven integraal onderdeel van deze definitieve offerte.":"Een overzichtelijke, professionele uitvoering met alle gekozen onderdelen transparant vastgelegd.",42,630,500,10.5,15,"F1",COLOR.muted,2),
  ];
  let y = 578;
  rows.forEach((item,index) => {
    const bottom = y-rowHeight+5;
    commands.push(roundedRect(42,bottom,511,rowHeight-6,10,COLOR.paper,COLOR.line,.7));
    commands.push(roundedRect(57,bottom+(rowHeight-34)/2,31,31,9,COLOR.navy));
    commands.push(centerText(String(index+1).padStart(2,"0"),72.5,bottom+(rowHeight-34)/2+10,8,"F2",COLOR.white));
    commands.push(text(truncate(item.productName, rowHeight >= 48 ? 54 : 64),103,y-18,9.5,"F2",COLOR.navy));
    if (rowHeight >= 48 && item.description) commands.push(text(truncate(item.description,72),103,y-34,7.2,"F1",COLOR.muted));
    commands.push(rightText(item.priceLabel,537,y-(rowHeight >= 48 ? 24 : 20),9.2,"F2",COLOR.navy));
    y -= rowHeight;
  });
  if (!includeSummary) {
    commands.push(roundedRect(42,Math.max(82,y-66),511,48,12,COLOR.cyanSoft,[0.737,0.922,0.988],.7));
    commands.push(text("De opdracht gaat verder op de volgende pagina.",62,Math.max(82,y-66)+19,8.5,"F2",COLOR.navy));
    commands.push(...footer(reference,pageNumber,totalPages,"Definitieve offerte"));
    return page(commands);
  }

  const summaryTop = Math.min(y-18,302);
  const summaryBottom = Math.max(78,summaryTop-132);
  commands.push(roundedRect(42,summaryBottom,511,summaryTop-summaryBottom,14,COLOR.navy));
  const sy = summaryTop-27;
  commands.push(text("Eenmalig voor korting",62,sy,8.5,"F1",COLOR.softText));
  commands.push(rightText(money(snapshot.oneTimeBeforeDiscountExVatCents ?? snapshot.oneTimeExVatCents),533,sy,9.5,"F2",COLOR.white));
  commands.push(text("Persoonlijke korting",62,sy-25,8.5,"F1",COLOR.softText));
  commands.push(rightText(`${Number(snapshot.discountPercentage || 0)}%  -  ${money(snapshot.discountExVatCents)}`,533,sy-25,9.5,"F2",COLOR.cyan));
  commands.push(strokeLine(62,sy-39,533,sy-39,[0.153,0.267,0.353],.7));
  commands.push(text("Eenmalig na korting",62,sy-67,10.5,"F2",COLOR.white));
  commands.push(rightText(money(snapshot.oneTimeExVatCents),533,sy-67,15,"F2",COLOR.white));
  commands.push(text(`Doorlopend ${money(snapshot.recurringExVatCents)} per maand excl. btw`,62,summaryBottom+16,7.5,"F1",COLOR.softText));
  commands.push(rightText(`Betaalkeuze: ${payment(snapshot.paymentChoice)}`,533,summaryBottom+16,7.5,"F1",COLOR.softText));
  commands.push(...footer(reference,pageNumber,totalPages,"Definitieve offerte"));
  return page(commands);
}

function signaturePage({ snapshot, relationship, documents, reference, signerName, signerRole, pageNumber, totalPages }) {
  const companyName=clean(relationship.companyName)||"de opdrachtgever";
  const commands = [
    ...brand(false),
    text("02  AKKOORD EN ONDERTEKENING",42,700,8,"F2",COLOR.cyan),
    text("Duidelijk vastgelegd",42,662,24,"F2",COLOR.navy),
    ...paragraph(`Met de digitale handtekening bevestigt de ondertekenaar namens ${companyName} akkoord te gaan met deze offerte en de hieronder gekoppelde documenten.`,42,630,500,10.5,15,"F1",COLOR.muted,3),
    roundedRect(42,410,511,178,14,COLOR.paper,COLOR.line,.7),
    text("ONDERDEEL VAN DE OVEREENKOMST",60,562,7,"F2",COLOR.muted),
  ];
  const visibleDocuments=documents.slice(0,7);
  const documentGap=visibleDocuments.length > 5 ? 19 : 24;
  visibleDocuments.forEach((doc,index)=>{
    const y=530-index*documentGap;
    commands.push(circle(62,y+3,3,COLOR.green));
    commands.push(text(truncate(label(doc.document_type||doc.documentType),34),74,y,8.2,"F2",COLOR.navy));
    commands.push(text(truncate(doc.version_code||doc.versionCode||"—",40),243,y,7,"F1",COLOR.muted));
    commands.push(rightText(shortHash(doc.checksum_sha256||doc.checksumSha256),533,y,7,"F2",COLOR.green));
  });
  commands.push(text("ZAKELIJKE BEVESTIGING",42,378,7,"F2",COLOR.muted));
  const confirmations=[
    "Deze overeenkomst wordt uitsluitend zakelijk (B2B) gesloten.",
    `De ondertekenaar verklaart bevoegd te zijn ${truncate(companyName,44)} te vertegenwoordigen.`,
    "De ondertekening, het tijdstip en het auditbewijs worden door Signhost vastgelegd.",
  ];
  confirmations.forEach((value,index)=>{
    const y=350-index*27;
    commands.push(roundedRect(42,y-6,16,16,5,COLOR.cyanSoft,[0.737,0.922,0.988],.7));
    commands.push(strokeLine(47,y+1,50,y-2,COLOR.green,1.4),strokeLine(50,y-2,55,y+5,COLOR.green,1.4));
    commands.push(text(value,70,y,8.4,"F1",COLOR.ink));
  });
  commands.push(roundedRect(42,94,511,164,16,COLOR.navy));
  commands.push(text("DIGITALE HANDTEKENING VIA SIGNHOST",62,232,7,"F2",COLOR.cyan));
  commands.push(text(truncate(clean(signerName)||clean(relationship.contactName)||"Ondertekenaar",48),62,204,13,"F2",COLOR.white));
  commands.push(text(`${truncate(clean(signerRole)||"Bevoegd vertegenwoordiger",30)}  |  ${truncate(companyName,34)}`,62,184,8.5,"F1",COLOR.softText));
  commands.push(roundedRect(70,108,455,64,9,COLOR.navy,[0.36,0.443,0.51],.8));
  commands.push(centerText("Signhost plaatst hier de digitale handtekening en het verificatiebewijs.",297.5,135,7.5,"F1",[0.62,0.698,0.757]));
  commands.push(text("Offertecontrole",42,69,7,"F1",COLOR.muted));
  commands.push(text(`SHA-256: ${shortHash(snapshot.checksum,9)}...${snapshot.checksum.slice(-8)}`,130,69,7,"F1",COLOR.muted));
  commands.push(...footer(reference,pageNumber,totalPages,"Ondertekening"));
  return page(commands);
}

function consolidatedLines(lines) {
  return lines.map((item)=>({
    productName:`${clean(item.productName)||"Onderdeel"}${item.componentType === "recurring" ? " (per maand)" : ""}`,
    description:clean(item.productDescription),
    priceLabel:item.bindingState === "binding" && Number.isInteger(item.subtotalExVatCents) ? money(item.subtotalExVatCents) : "Prijs op aanvraag",
  }));
}

function brand(dark) {
  const main=dark?COLOR.white:COLOR.navy;
  return [
    roundedRect(42,770,34,34,10,COLOR.navy2),
    centerText("M",59,780,18,"F2",COLOR.white),
    strokeLine(66,794,72,794,COLOR.cyan,2.2), strokeLine(72,794,72,788,COLOR.cyan,2.2),
    text("Max Webstudio",86,786,16,"F2",main),
    text("BUILD BETTER ONLINE",86,773,6.2,"F2",dark?COLOR.cyan:COLOR.muted),
  ];
}
function footer(reference,number,total,labelValue){return [strokeLine(42,42,553,42,COLOR.line,.6),text(`Max Webstudio  |  ${reference}`,42,27,7.5,"F1",COLOR.muted),rightText(`${labelValue}  |  ${number} / ${total}`,553,27,7.5,"F1",COLOR.muted)];}
function page(commands){return commands.flat().filter(Boolean).join("\n");}
function rect(x,y,w,h,fill){return `${fill.join(" ")} rg ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`;}
function roundedRect(x,y,w,h,r,fill,stroke=null,width=1){
  const k=.55228475, c=r*k, path=`${n(x+r)} ${n(y)} m ${n(x+w-r)} ${n(y)} l ${n(x+w-r+c)} ${n(y)} ${n(x+w)} ${n(y+r-c)} ${n(x+w)} ${n(y+r)} c ${n(x+w)} ${n(y+h-r)} l ${n(x+w)} ${n(y+h-r+c)} ${n(x+w-r+c)} ${n(y+h)} ${n(x+w-r)} ${n(y+h)} c ${n(x+r)} ${n(y+h)} l ${n(x+r-c)} ${n(y+h)} ${n(x)} ${n(y+h-r+c)} ${n(x)} ${n(y+h-r)} c ${n(x)} ${n(y+r)} l ${n(x)} ${n(y+r-c)} ${n(x+r-c)} ${n(y)} ${n(x+r)} ${n(y)} c h`;
  return `${fill.join(" ")} rg ${stroke?`${stroke.join(" ")} RG ${n(width)} w `:""}${path} ${stroke?"B":"f"}`;
}
function circle(x,y,r,fill){const c=r*.55228475;return `${fill.join(" ")} rg ${n(x+r)} ${n(y)} m ${n(x+r)} ${n(y+c)} ${n(x+c)} ${n(y+r)} ${n(x)} ${n(y+r)} c ${n(x-c)} ${n(y+r)} ${n(x-r)} ${n(y+c)} ${n(x-r)} ${n(y)} c ${n(x-r)} ${n(y-c)} ${n(x-c)} ${n(y-r)} ${n(x)} ${n(y-r)} c ${n(x+c)} ${n(y-r)} ${n(x+r)} ${n(y-c)} ${n(x+r)} ${n(y)} c f`;}
function strokeLine(x1,y1,x2,y2,color,width=1){return `${color.join(" ")} RG ${n(width)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`;}
function text(value,x,y,size,font,color){return `${color.join(" ")} rg BT /${font} ${n(size)} Tf 1 0 0 1 ${n(x)} ${n(y)} Tm (${pdfText(value)}) Tj ET`;}
function rightText(value,x,y,size,font,color){return text(value,x-estimateWidth(value,size,font),y,size,font,color);}
function centerText(value,x,y,size,font,color){return text(value,x-estimateWidth(value,size,font)/2,y,size,font,color);}
function paragraph(value,x,y,width,size,leading,font,color,maxLines){return wrap(value,Math.max(12,Math.floor(width/(size*.52))),maxLines).map((entry,index)=>text(entry,x,y-index*leading,size,font,color));}

function buildPdf(pages,reference,keywords="",metadata={}){
  const objects=[]; const pageIds=[];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>"); objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  pages.forEach((content)=>{const pageId=objects.length+1;const streamId=pageId+1;pageIds.push(pageId);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);const bytes=Buffer.from(content,"binary");objects.push(Buffer.concat([Buffer.from(`<< /Length ${bytes.length} >>\nstream\n`,"binary"),bytes,Buffer.from("\nendstream","binary")]));});
  objects[1]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const title=clean(metadata.title)||`Definitieve offerte ${reference}`;const subject=clean(metadata.subject)||"Definitieve zakelijke offerte via Signhost";
  objects.push(`<< /Title (${pdfText(title)}) /Author (Max Webstudio) /Subject (${pdfText(subject)}) /Keywords (${pdfText(keywords)}) >>`);
  const chunks=[Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n","binary")];const offsets=[0];let length=chunks[0].length;
  objects.forEach((object,index)=>{offsets.push(length);const body=Buffer.isBuffer(object)?object:Buffer.from(object,"binary");const chunk=Buffer.concat([Buffer.from(`${index+1} 0 obj\n`,"binary"),body,Buffer.from("\nendobj\n","binary")]);chunks.push(chunk);length+=chunk.length;});
  const xrefOffset=length;chunks.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,"binary"));return Buffer.concat(chunks);
}

function auditKeywords(snapshot,documents){return [`offer:${snapshot.checksum}`, ...documents.map(doc=>`${clean(doc.document_type||doc.documentType)}:${clean(doc.version_code||doc.versionCode)}:${clean(doc.checksum_sha256||doc.checksumSha256)}`)].join(" | ");}
function pdfText(value){return Array.from(String(value||"")).map(char=>{const point=char.codePointAt(0);const code=point<=255?point:char==="€"?128:char==="–"||char==="—"?45:63;if([40,41,92].includes(code))return`\\${String.fromCharCode(code)}`;return code<32||code>126?`\\${code.toString(8).padStart(3,"0")}`:String.fromCharCode(code);}).join("");}
function money(value){const cents=Number(value);return Number.isInteger(cents)&&cents>=0?new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(cents/100):"—";}
function payment(value){return value==="full"?"volledig":value==="fixed_deposit"?"vaste aanbetaling":"volgens factuur";}
function label(value){return ({offer_view:"Offerteweergave",commercial_agreement:"Overeenkomst",general_terms:"Algemene voorwaarden",hosting_maintenance_terms:"Hosting- en onderhoudsvoorwaarden",privacy_policy:"Privacyverklaring"})[value]||clean(value);}
function dateLabel(value){const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));if(!match)return clean(value)||"—";const months=["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];return`${Number(match[3])} ${months[Number(match[2])-1]} ${match[1]}`;}
function shortHash(value,length=9){const result=clean(value);return result?result.slice(0,length):"—";}
function truncate(value,max){const result=clean(value);return result.length>max?`${result.slice(0,max-3)}...`:result;}
function chunks(values,size){const source=values.length?values:[{productName:"Opdracht volgens de definitieve offerte",description:"",priceLabel:"—"}],result=[];for(let index=0;index<source.length;index+=size)result.push(source.slice(index,index+size));return result;}
function wrap(value,maxChars,maxLines){const words=clean(value).split(/\s+/).filter(Boolean),lines=[];let current="";for(const word of words){const candidate=`${current} ${word}`.trim();if(candidate.length<=maxChars||!current)current=candidate;else{lines.push(current);current=word;if(lines.length===maxLines-1)break;}}if(current&&lines.length<maxLines)lines.push(current);if(words.join(" ").length>lines.join(" ").length&&lines.length)lines[lines.length-1]=truncate(lines[lines.length-1],Math.max(6,maxChars));return lines;}
function estimateWidth(value,size,font){const factor=font==="F2"?.55:.5;return Array.from(String(value||"")).reduce((total,char)=>total+(char===" "?.45:char==="i"||char==="l"?.28:char==="W"||char==="M"?.88:factor),0)*size;}
function n(value){return Number(value).toFixed(2);}
function clean(value){return String(value??"").trim();}
function coded(code,status,message){return Object.assign(new Error(message),{code,statusCode:status,status});}

module.exports={generateCommercialOfferPdf,_test:{buildPdf,pdfText,money,dateLabel,shortHash,wrap}};
