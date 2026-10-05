import { CONNECTOR_DEFINITIONS } from './definitions.generated.ts';
import type { ConnectorDefinition } from './types.ts';

export { CONNECTOR_DEFINITIONS };

export function getDefinition(key: string): ConnectorDefinition {
  const d = CONNECTOR_DEFINITIONS.find((x) => x.key === key);
  if (!d) throw new Error(`unknown connector: ${key}`);
  return d;
}
