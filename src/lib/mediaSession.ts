import { useSyncExternalStore } from 'react';

/**
 * Whether the camera currently owns the phone's media session.
 *
 * On iOS, `expo-video` re-applies the app's audio session every time any player
 * is created, released, played or muted, setting the category to `.playback`
 * (`VideoManager.swift`, `setAudioSession`), while a camera recording video
 * holds the microphone. The feed's players — poster frames cut in the
 * background, the next top story preloading — come and go on their own
 * schedule, so rather than let them change the session under a recording, every
 * player checks this flag and stays idle while the camera tab is up. Nobody is
 * watching the feed while they film, so nothing is lost.
 *
 * Module-level state rather than context, because the thumbnail queue that most
 * needs to read it is not a component.
 */

let cameraActive = false;
const listeners = new Set<() => void>();

export function isCameraActive(): boolean {
  return cameraActive;
}

export function setCameraActive(active: boolean): void {
  if (cameraActive === active) return;
  cameraActive = active;
  for (const listener of listeners) listener();
}

export function subscribeToCameraActive(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders when the camera takes or releases the media session. */
export function useCameraActive(): boolean {
  return useSyncExternalStore(subscribeToCameraActive, isCameraActive);
}
