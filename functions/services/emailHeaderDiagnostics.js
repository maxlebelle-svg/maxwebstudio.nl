function analyzeReceivedHeaders(raw = "") {
  const text = String(raw || "");
  const fromDomain = domainFromHeader(headerValue(text, "from"));
  const returnPathDomain = domainFromHeader(headerValue(text, "return-path"));
  const dkimDomain = capture(text, /\bdkim=(pass|fail|none|neutral|temperror|permerror)\b[\s\S]*?\bheader\.d=([^;\s]+)/i, 2);
  const spfDomain = capture(text, /\bspf=(pass|fail|softfail|neutral|none|temperror|permerror)\b[\s\S]*?\bsmtp\.mailfrom=([^;\s]+)/i, 2);
  return {
    spf: capture(text, /\bspf=(pass|fail|softfail|neutral|none|temperror|permerror)\b/i),
    dkim: capture(text, /\bdkim=(pass|fail|none|neutral|temperror|permerror)\b/i),
    dmarc: capture(text, /\bdmarc=(pass|fail|bestguesspass|none|temperror|permerror)\b/i),
    fromDomain,
    returnPathDomain,
    dkimDomain: domainOnly(dkimDomain),
    spfDomain: domainOnly(spfDomain),
    returnPathAligned: relaxedAligned(fromDomain, returnPathDomain),
    dkimAligned: relaxedAligned(fromDomain, domainOnly(dkimDomain)),
    spfAligned: relaxedAligned(fromDomain, domainOnly(spfDomain)),
    scl: capture(text, /\bSCL[:=]\s*(-?\d+)/i),
  };
}

function headerValue(raw, name) {
  const unfolded = String(raw || "").replace(/\r?\n[ \t]+/g, " ");
  return capture(unfolded, new RegExp(`^${name}:\\s*([^\\r\\n]+)`, "im"));
}
function domainFromHeader(value) {
  const match = String(value || "").match(/@([^>\s]+)/);
  return domainOnly(match?.[1]);
}
function domainOnly(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[>;]$/, "");
  return text.includes("@") ? text.split("@").pop() : text;
}
function relaxedAligned(first, second) {
  if (!first || !second) return false;
  return first === second || first.endsWith(`.${second}`) || second.endsWith(`.${first}`);
}
function capture(value, pattern, group = 1) { return String(value || "").match(pattern)?.[group]?.toLowerCase() || ""; }

module.exports = { analyzeReceivedHeaders, _private: { domainFromHeader, relaxedAligned } };
