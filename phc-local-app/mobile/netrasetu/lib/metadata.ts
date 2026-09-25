/** Capture-metadata draft -> contract payload (design doc §9.6). Pure, so it is unit-tested. */
import type {
  CaptureMetadataPayload, Eye, LightingEnvironment, ObservedIssue, PupilStatus, UsabilityRating,
} from '../types';

export interface MetadataDraft {
  eye: Eye | null;
  cameraDeviceId: string;
  pupilStatus: PupilStatus | null;
  lightingEnvironment: LightingEnvironment | null;
  observedIssues: ObservedIssue[];
  workerUsabilityRating: UsabilityRating | null;
}

export function metadataMissing(d: MetadataDraft): string[] {
  const m: string[] = [];
  if (!d.eye) m.push('eye');
  if (!d.pupilStatus) m.push('pupil status');
  if (!d.lightingEnvironment) m.push('lighting');
  if (!d.observedIssues.length) m.push('observed issues');
  if (!d.workerUsabilityRating) m.push('usability rating');
  return m;
}

export function toMetadataPayload(d: MetadataDraft): CaptureMetadataPayload {
  return {
    cameraDeviceReported: d.cameraDeviceId,
    pupilStatus: d.pupilStatus!,
    lightingEnvironment: d.lightingEnvironment!,
    observedIssues: d.observedIssues,
    workerUsabilityRating: d.workerUsabilityRating!,
    eyeLaterality: d.eye!,
  };
}

/** 'none_noticed' is exclusive (api-contracts.md): picking it clears the rest, and vice versa. */
export function toggleObservedIssue(current: ObservedIssue[], issue: ObservedIssue): ObservedIssue[] {
  const has = current.includes(issue);
  if (issue === 'none_noticed') return has ? [] : ['none_noticed'];
  return has ? current.filter((i) => i !== issue) : [...current.filter((i) => i !== 'none_noticed'), issue];
}
