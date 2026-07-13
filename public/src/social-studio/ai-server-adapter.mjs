import { SocialStudioAIAdapter, validateAIOutput } from "./ai-contracts.mjs";

export class SocialStudioServerAIAdapter extends SocialStudioAIAdapter {
  constructor({ endpoint = "", enabled = false, fetchImpl = fetch, tokenProvider = () => "" } = {}) {
    super({ id: "provider-neutral-server", mode: "server" });
    this.endpoint = endpoint;
    this.enabled = Boolean(enabled && endpoint);
    this.fetchImpl = fetchImpl;
    this.tokenProvider = tokenProvider;
  }
  isAvailable() { return this.enabled; }
  async generate(request) {
    if (!this.isAvailable()) throw new Error("Server-AI is niet geactiveerd. Gebruik de lokale previewmodus.");
    const token = await this.tokenProvider();
    if (!token) throw new Error("Een geldige adminsessie is vereist.");
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ contractVersion: request.contractVersion, request }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || "AI-aanvraag is mislukt.");
    const validation = validateAIOutput(data.output, request);
    if (!validation.valid) throw Object.assign(new Error("Server gaf ongeldige AI-output terug."), { validation });
    return validation.output;
  }
}
