// Shared camera state — written by CameraRail in the ground canvas,
// read by CameraReader in the bee foreground canvas to stay in sync.
export const cameraSync = {
  px: 0, py: 0, pz: 4,           // position
  qx: 0, qy: 0, qz: 0, qw: 1,   // quaternion
};
