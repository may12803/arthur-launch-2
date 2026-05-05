-- arthur_communications: unified inbound/outbound comms log for Telnyx SMS, voice, fax, email
-- across the Aspen & May portfolio. Realtime-enabled; RLS public read / service write.

CREATE TABLE IF NOT EXISTS arthur_communications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts            timestamptz NOT NULL DEFAULT now(),
  channel       text NOT NULL CHECK (channel IN ('sms','voice','fax','email')),
  direction     text NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_address  text NOT NULL,         -- E.164 or email
  to_address    text NOT NULL,
  subject       text,                   -- for fax/email; null for sms/voice
  body          text,                   -- text content (sms message, voice transcript, fax extracted text, email body)
  attachment_url text,                  -- supabase storage URL for fax PDFs / voice recordings
  status        text NOT NULL DEFAULT 'received'
                CHECK (status IN ('received','queued','sending','sent','delivered','failed','read')),
  external_id   text,                   -- Telnyx message_id / call_control_id / fax_id for status callbacks
  cost_cents    integer,                -- usage cost from Telnyx in cents
  metadata      jsonb NOT NULL DEFAULT '{}',
  entity        text,                   -- which company: dabney_co | olldae | loveleeday | aspen_may | personal
  category      text,                   -- otp | transactional | reservation | vendor | government | spam | other
  related_to    uuid,                   -- FK to legal_documents, calendar events, etc. (no FK constraint to keep flexible)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arthur_comm_ts_idx ON arthur_communications (ts DESC);
CREATE INDEX IF NOT EXISTS arthur_comm_channel_dir_idx ON arthur_communications (channel, direction, ts DESC);
CREATE INDEX IF NOT EXISTS arthur_comm_entity_idx ON arthur_communications (entity, ts DESC);
CREATE INDEX IF NOT EXISTS arthur_comm_external_id_idx ON arthur_communications (external_id);

ALTER TABLE arthur_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comm_read_public"  ON arthur_communications FOR SELECT USING (true);
CREATE POLICY "comm_write_service" ON arthur_communications FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Realtime: enable so browser can subscribe to INSERT events
ALTER PUBLICATION supabase_realtime ADD TABLE arthur_communications;
