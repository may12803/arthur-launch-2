// Transport interface. ONLY a dry-run implementation exists. SmtpOrProviderTransportSTUB is the clearly named
// place where real sending gets wired later; it throws unless OUTREACH_SENDING_ENABLED=1, and even then it throws
// until a provider is wired in a separate, reviewed change.
import { sendingEnabled, type Env } from './config.ts';
import type { Rendered } from './render.ts';

export interface SendResult { ok: true; providerId: string; dryRun: boolean }
export interface Transport { readonly name: string; send(m: Rendered): Promise<SendResult> }

export class DryRunTransport implements Transport {
  readonly name = 'dry-run';
  rendered: Rendered[] = [];
  async send(m: Rendered): Promise<SendResult> {
    this.rendered.push(m);
    return { ok: true, providerId: `dry-run-${this.rendered.length}`, dryRun: true };
  }
}

export class SmtpOrProviderTransportSTUB implements Transport {
  readonly name = 'smtp-or-provider-stub';
  private env: Env;
  constructor(env: Env = process.env) { this.env = env; }
  async send(_m: Rendered): Promise<SendResult> {
    if (!sendingEnabled(this.env)) throw new Error('Sending is disabled: OUTREACH_SENDING_ENABLED is not "1".');
    throw new Error('No SMTP/provider is wired. Implement this transport in a reviewed change before enabling sending.');
  }
}

// The scheduler asks for a transport here. Disabled (the default) always yields the dry-run transport.
export function getTransport(env: Env = process.env): Transport {
  return sendingEnabled(env) ? new SmtpOrProviderTransportSTUB(env) : new DryRunTransport();
}
