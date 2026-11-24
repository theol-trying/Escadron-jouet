import type * as THREE from 'three';

export interface MapSceneHandles {
  cameraColliders: THREE.Object3D[];
  destructibleGroups: Map<string, THREE.Object3D>;
  powerUpZoneRings: THREE.Mesh[];
  updateAnimations: (elapsedTime: number, dt: number) => void;
  dispose: () => void;
}
