export type {
  ConnectorType,
  SignalType,
  ConnectionPortDefinition,
  CableProfile,
  PortRef,
  Connection,
} from './types';

export { DEFAULT_CABLE_PROFILES } from './profiles';

export {
  routeLengthM,
  recommendStockLength,
  buildCableManifest,
  findUnmatchedRequirements,
  validateConnectionCompatibility,
} from './logic';
export type {
  PointPx,
  ManifestRow,
  CableRequirement,
  ManifestOptions,
  ConnectionEndpointInfo,
} from './logic';

export { deriveSignalFlow, detectFlowCycles } from './signalFlow';
export type { FlowNode, FlowEdge, FlowLayerEntry } from './signalFlow';
