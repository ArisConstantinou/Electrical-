import RAPIER from '@dimforge/rapier3d-compat';
import GUI from 'lil-gui';
import * as THREE from 'three';
import './styles.css';

type BodyKind = 'bulldozer' | 'blade' | 'wall' | 'column' | 'deck' | 'debris';
type QualityLevel = 'Low' | 'Medium' | 'High';
type HouseBlockFace = 'front' | 'back' | 'left' | 'right' | 'roof-front' | 'roof-back';
type StructuralMaterialId = 'brickMasonry' | 'mortarJoint' | 'roofPanel' | 'bulldozerSteel';
type WallChunkSide = 'left' | 'right';
type DemolitionReplayEventType =
  | 'chain-reaction'
  | 'first-contact'
  | 'full-demolition'
  | 'roof-collapse'
  | 'wall-cracked'
  | 'wall-damaged'
  | 'wall-destroyed'
  | 'wall-detached';
type ReplayCameraMode = 'free' | 'follow-bulldozer' | 'follow-wall' | 'gameplay' | 'top-down' | 'cinematic';

interface SettingsValues {
  bridgeCollapseThreshold: number;
  columnStageOneDamage: number;
  columnStageTwoDamage: number;
  criticalBearingDelayFrames: number;
  criticalBearingLeanSpeed: number;
  debrisPickupRange: number;
  destructionSpeed: number;
  engineTorque: number;
  gravity: number;
  maxCarryMass: number;
  quality: QualityLevel;
  roofDropSupportRatio: number;
  secondaryImpactThreshold: number;
  supportReleaseRatio: number;
  wallBreakDamage: number;
  wallImpactDamageScale: number;
}

interface PhysicsEntity {
  body: RAPIER.RigidBody;
  breakable: boolean;
  carried: boolean;
  createdStep: number;
  damage: number;
  halfExtents: THREE.Vector3;
  kind: BodyKind;
  lastImpactStep: number;
  mass: number;
  mesh: THREE.Object3D;
  name: string;
  settleCandidateSteps: number;
  stage: 0 | 1 | 2;
  fractured?: boolean;
  wallBlock?: WallBlockInfo;
}

interface WallBlockInfo {
  bulge: THREE.Vector3;
  column: number;
  face: HouseBlockFace;
  home: THREE.Vector3;
  row: number;
  sag: THREE.Vector3;
}

interface StaticWallVisualInfo {
  column: number;
  face: HouseBlockFace;
  halfExtents: THREE.Vector3;
  row: number;
}

interface WallBrickBlueprint {
  column: number;
  halfExtents: THREE.Vector3;
  localOffset: THREE.Vector3;
  mass: number;
  name: string;
  row: number;
}

interface WallChunk {
  createdStep: number;
  entity: PhysicsEntity;
  fragmentAfterStep: number;
  fragmented: boolean;
  side: WallChunkSide;
  sourceBricks: WallBrickBlueprint[];
}

interface WallFaceStress {
  collapse: number;
  criticalBearingSteps: number;
  direction: number;
  foundationRatio: number;
  imbalance: number;
  lastBearingContactStep: number;
  lean: number;
  supportRatio: number;
}

interface MaterialProfile {
  compressiveLimit: number;
  damping: number;
  density: number;
  fractureEnergy: number;
  friction: number;
  minFragmentSize: number;
  restitution: number;
  shearLimit: number;
  stiffness: number;
  tensileLimit: number;
}

interface StructuralNode {
  active: boolean;
  centerOfMass: THREE.Vector3;
  entity: PhysicsEntity;
  fractureState: 'intact' | 'dynamic' | 'fractured';
  id: string;
  islandId: number;
  mass: number;
  material: StructuralMaterialId;
  sleepState: 'fixed' | 'dynamic';
  support: boolean;
}

interface StructuralBond {
  a: string;
  b: string;
  broken: boolean;
  compressionStrength: number;
  damageCompression: number;
  damageShear: number;
  damageTension: number;
  damping: number;
  id: string;
  kind: 'horizontal' | 'vertical' | 'corner' | 'roof-seat';
  material: StructuralMaterialId;
  randomness: number;
  shearStrength: number;
  stiffness: number;
  tensionStrength: number;
}

interface StructuralSupportSnapshot {
  brokenBonds: number;
  islandCount: number;
  nodes: number;
  unsupportedIslands: number;
  unsupportedNodes: Set<string>;
}

interface BridgeSupport {
  entity: PhysicsEntity;
  side: 'left' | 'right';
}

interface PrototypeState {
  bridgeCollapsed: boolean;
  carriedMass: number;
  carriedPieces: number;
  chippedWallSlabs: number;
  columnStageBreaks: number;
  deckPiecesDropped: number;
  doorPanelsDropped: number;
  fps: number;
  glassShatterEvents: number;
  impactEvents: number;
  ready: boolean;
  secondaryWallImpacts: number;
  structuralWallReleases: number;
  visualWallImpacts: number;
  wallBreaches: number;
  wallDeformations: number;
  wallPiecesBroken: number;
}

interface ControlOverride {
  brake?: boolean;
  lowGear?: boolean;
  lowerBlade?: boolean;
  raiseBlade?: boolean;
  steering: number;
  throttle: number;
}

interface TouchControlState {
  forward: boolean;
  lowerBlade: boolean;
  raiseBlade: boolean;
  reverse: boolean;
  steering: number;
}

interface CameraPointerState {
  lastX: number;
  lastY: number;
  mode: 'rotate' | 'pan';
  pointerId: number;
}

interface ImpactProbe {
  center: THREE.Vector3;
  damageScale: number;
  halfForward: number;
  halfHeight: number;
  halfRight: number;
  impulseDir: THREE.Vector3;
  probeForward: THREE.Vector3;
  probeRight: THREE.Vector3;
}

interface WallReplayFrameObject {
  damage: number;
  dynamic: boolean;
  face?: HouseBlockFace;
  id: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
  stage: 0 | 1 | 2;
  visible: boolean;
}

interface WallReplaySample {
  damage: number;
  destroyed: boolean;
  objects: WallReplayFrameObject[];
  timestamp: number;
}

interface DemolitionReplayEvent {
  face?: HouseBlockFace;
  label: string;
  timestamp: number;
  type: DemolitionReplayEventType;
  value?: number;
}

interface WallReplayTrack {
  destroyedTime: number | null;
  events: DemolitionReplayEvent[];
  face: HouseBlockFace;
  firstContactTime: number | null;
  firstDamageTime: number | null;
  samples: WallReplaySample[];
}

interface DemolitionReplayFrame {
  objects: WallReplayFrameObject[];
  step: number;
  timestamp: number;
}

interface DemolitionReplayObject {
  face?: HouseBlockFace;
  firstTimestamp: number;
  id: string;
  lastTimestamp: number;
  name: string;
  proxy: THREE.Object3D;
  source: THREE.Object3D;
}

interface DemolitionReplayRecording {
  complete: boolean;
  demolitionCompleteCandidateStep: number | null;
  duration: number;
  events: DemolitionReplayEvent[];
  firstWallHit: number | null;
  frames: DemolitionReplayFrame[];
  lastSampleStep: number;
  objects: Map<string, DemolitionReplayObject>;
  originalGhostGroup: THREE.Group | null;
  recording: boolean;
  startedStep: number;
  stoppedStep: number | null;
  wallTracks: Map<HouseBlockFace, WallReplayTrack>;
}

interface DemolitionReplayPlayback {
  active: boolean;
  cameraMode: ReplayCameraMode;
  currentTime: number;
  focusSelectedWall: boolean;
  isolateSelectedWall: boolean;
  lastAppliedTime: number;
  lastTick: number;
  playing: boolean;
  reverseReconstruction: boolean;
  selectedWall: HouseBlockFace | 'all';
  showGhostOriginal: boolean;
  speed: number;
}

type RigidBodyDescFactory = () => RAPIER.RigidBodyDesc;

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const statusReadout = document.querySelector<HTMLDivElement>('#status-readout');
const fpsReadout = document.querySelector<HTMLSpanElement>('#fps-readout');
const mobileControlsRoot = document.querySelector<HTMLElement>('#mobile-controls');

if (!canvas || !statusReadout || !fpsReadout) {
  throw new Error('Prototype DOM is missing required elements.');
}

const hudStatusReadout = statusReadout;
const hudFpsReadout = fpsReadout;
const fixedDt = 1 / 60;
const targetRenderHz = 240;
const targetRenderFrameMs = 1000 / targetRenderHz;
const maxPhysicsSteps = 5;
const worldBounds = 180;
const groundSize = 420;
const bulldozerScale = 2;
const carryHeight = 1.18 * bulldozerScale;
const bladeMountDistance = 3.05 * bulldozerScale;
const bladeHalf = new THREE.Vector3(2.15, 0.34, 0.34).multiplyScalar(bulldozerScale);
const cabHalf = new THREE.Vector3(0.72, 0.78, 0.74).multiplyScalar(bulldozerScale);
const cabLocalOffset = new THREE.Vector3(0, 1.35, 0.36).multiplyScalar(bulldozerScale);
const dozerGroundY = 0.82 * bulldozerScale;
const houseScale = 1.25;
const houseHeightScale = 1.65;
const solidWallHeight = 6.1 * houseScale * houseHeightScale;
const solidWallThickness = 1.1;
const solidWallWidth = 14.4 * houseScale;
const solidWallZ = 7;
const houseDepth = 9.2 * houseScale;
const houseCenterZ = solidWallZ - houseDepth / 2;
const wallBlockColumns = 8;
const wallBlockRows = 8;
const wallSideColumns = 6;
const physicalWallRows = 4;
const masonryBrickLength = 3;
const masonryBrickHeight = 1.45;
const defaultWallBreakDamage = 16;
const wallBulgeLimit = 0.78;
const settingsStorageKey = 'bulldozer-destruction-prototype-settings-v8';
const tempQuat = new THREE.Quaternion();
const tempVec3 = new THREE.Vector3();
const tempVec3B = new THREE.Vector3();
const tempForward = new THREE.Vector3();
const tempRight = new THREE.Vector3();
const cameraTarget = new THREE.Vector3(0, 1.2, 18);
const cameraPanOffset = new THREE.Vector3();
const cameraFlatForward = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);

const defaultSettings: SettingsValues = {
  bridgeCollapseThreshold: 4,
  columnStageOneDamage: 18,
  columnStageTwoDamage: 38,
  criticalBearingDelayFrames: 150,
  criticalBearingLeanSpeed: 0.14,
  debrisPickupRange: 3.2,
  destructionSpeed: 2.8,
  engineTorque: 140,
  gravity: -14.5,
  maxCarryMass: 70,
  quality: 'High',
  roofDropSupportRatio: 0.34,
  secondaryImpactThreshold: 42,
  supportReleaseRatio: 0.38,
  wallBreakDamage: defaultWallBreakDamage,
  wallImpactDamageScale: 0.72,
};

const tuning: SettingsValues = {
  ...defaultSettings,
  ...loadSavedSettings(),
};

const draftSettings = {
  ...tuning,
  apply: () => applyDraftSettings(),
  resetScene: () => {
    resetPrototype();
    focusGameCanvas();
  },
};

const gameControlCodes = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'Escape',
  'KeyA',
  'KeyC',
  'KeyD',
  'KeyE',
  'KeyG',
  'KeyH',
  'KeyQ',
  'KeyR',
  'KeyS',
  'KeyT',
  'KeyW',
  'KeyX',
  'ShiftLeft',
  'ShiftRight',
  'Space',
]);

const state: PrototypeState = {
  bridgeCollapsed: false,
  carriedMass: 0,
  carriedPieces: 0,
  chippedWallSlabs: 0,
  columnStageBreaks: 0,
  deckPiecesDropped: 0,
  doorPanelsDropped: 0,
  fps: 0,
  glassShatterEvents: 0,
  impactEvents: 0,
  ready: false,
  secondaryWallImpacts: 0,
  structuralWallReleases: 0,
  visualWallImpacts: 0,
  wallBreaches: 0,
  wallDeformations: 0,
  wallPiecesBroken: 0,
};

const scene = new THREE.Scene();
(window as Window & { __debugScene?: THREE.Scene }).__debugScene = scene;
scene.background = new THREE.Color(0xa7c5d8);
scene.fog = new THREE.Fog(0xa7c5d8, 140, 420);

const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 640);
const renderer = new THREE.WebGLRenderer({ antialias: false, canvas, powerPreference: 'high-performance' });
renderer.setPixelRatio(getPixelRatioForQuality(tuning.quality));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

function createBrickWallTexture(): THREE.CanvasTexture {
  const tile = document.createElement('canvas');
  tile.width = 512;
  tile.height = 256;
  const context = tile.getContext('2d');

  if (!context) {
    throw new Error('Unable to create brick wall texture.');
  }

  context.fillStyle = '#bd5d49';
  context.fillRect(0, 0, tile.width, tile.height);

  const brickHeight = 40;
  const brickWidth = 96;
  const mortar = 5;

  for (let row = 0; row < tile.height / brickHeight; row += 1) {
    const y = row * brickHeight;
    const offset = row % 2 === 0 ? 0 : -brickWidth / 2;

    context.fillStyle = '#9a4d41';
    context.fillRect(0, y, tile.width, mortar);

    for (let x = offset; x < tile.width; x += brickWidth) {
      context.fillRect(x, y, mortar, brickHeight);
      const shade = row % 2 === 0 ? '#bd5d49' : '#a94f3f';
      context.fillStyle = shade;
      context.fillRect(x + mortar, y + mortar, brickWidth - mortar, brickHeight - mortar);
      context.fillStyle = 'rgba(255, 218, 190, 0.12)';
      context.fillRect(x + mortar + 6, y + mortar + 5, brickWidth - mortar - 12, 4);
      context.fillStyle = '#9a4d41';
    }
  }

  const texture = new THREE.CanvasTexture(tile);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 4;
  return texture;
}

const brickWallTexture = createBrickWallTexture();
const brickTextureWorldWidth = 4.8;
const brickTextureWorldHeight = 2;

function seededNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function seededRange(seed: number, min: number, max: number): number {
  return THREE.MathUtils.lerp(min, max, seededNoise(seed));
}

function seededGridNoise(seed: number, row: number, column: number, salt = 0): number {
  let hash = Math.trunc(seed) | 0;
  hash ^= Math.imul(Math.trunc(row) | 0, 0x9e3779b1);
  hash ^= Math.imul(Math.trunc(column) | 0, 0x85ebca6b);
  hash ^= Math.imul(salt | 0, 0xc2b2ae35);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function hashStringSeed(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash);
}

function createBrickWallMaterial(
  faceWorldWidth: number,
  faceWorldHeight: number,
  worldOffsetU = 0,
  worldOffsetV = 0,
): THREE.MeshBasicMaterial {
  const texture = brickWallTexture.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    Math.max(0.08, faceWorldWidth / brickTextureWorldWidth),
    Math.max(0.08, faceWorldHeight / brickTextureWorldHeight),
  );
  texture.offset.set(worldOffsetU / brickTextureWorldWidth, worldOffsetV / brickTextureWorldHeight);
  texture.needsUpdate = true;

  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: texture,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  material.userData.generatedBrickMaterial = true;
  return material;
}

function createBrickMaterialForBox(
  halfExtents: THREE.Vector3,
  face: HouseBlockFace | 'chunk' | 'fragment',
  position = new THREE.Vector3(),
  row = 0,
): THREE.MeshBasicMaterial {
  if (face === 'left' || face === 'right') {
    return createBrickWallMaterial(
      halfExtents.z * 2,
      halfExtents.y * 2,
      position.z,
      row * halfExtents.y * 2,
    );
  }

  return createBrickWallMaterial(
    halfExtents.x * 2,
    halfExtents.y * 2,
    position.x,
    row * halfExtents.y * 2,
  );
}

function makeDisplayBrickColor(r: number, g: number, b: number): THREE.Color {
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

const sharedBrickPalette = [
  makeDisplayBrickColor(0.62, 0.27, 0.21),
  makeDisplayBrickColor(0.7, 0.34, 0.26),
  makeDisplayBrickColor(0.52, 0.21, 0.16),
  makeDisplayBrickColor(0.74, 0.39, 0.3),
  makeDisplayBrickColor(0.66, 0.3, 0.23),
  makeDisplayBrickColor(0.46, 0.17, 0.13),
];

const materials = {
  blade: new THREE.MeshStandardMaterial({ color: 0xd4a321, metalness: 0.15, roughness: 0.6 }),
  bulldozer: new THREE.MeshStandardMaterial({ color: 0xc47a2c, metalness: 0.1, roughness: 0.62 }),
  columnFresh: new THREE.MeshStandardMaterial({ color: 0x87908a, roughness: 0.74 }),
  columnCracked: new THREE.MeshStandardMaterial({ color: 0x6c6d66, roughness: 0.86 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xaab0aa, roughness: 0.78 }),
  deck: new THREE.MeshStandardMaterial({ color: 0x242827, roughness: 0.72 }),
  door: new THREE.MeshStandardMaterial({ color: 0x26373b, roughness: 0.68 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x456b78, roughness: 0.42, transparent: true, opacity: 0.72 }),
  ground: new THREE.MeshStandardMaterial({ color: 0x768d7d, roughness: 0.8 }),
  interiorFloor: new THREE.MeshStandardMaterial({ color: 0x54685f, roughness: 0.82 }),
  interiorWall: new THREE.MeshStandardMaterial({ color: 0x9caaa2, roughness: 0.88 }),
  mortar: new THREE.MeshBasicMaterial({
    color: makeDisplayBrickColor(0.38, 0.2, 0.17),
    toneMapped: false,
    side: THREE.DoubleSide,
  }),
  roof: new THREE.MeshStandardMaterial({ color: 0x6d322b, roughness: 0.86 }),
  stripe: new THREE.MeshBasicMaterial({ color: 0xe8e6c8 }),
  wall: new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: brickWallTexture,
    toneMapped: false,
    side: THREE.DoubleSide,
  }),
};

const rubbleBrickMaterials = sharedBrickPalette.map((color) => new THREE.MeshBasicMaterial({
  color: color.clone(),
  toneMapped: false,
}));
const intactBrickPalette = [
  makeDisplayBrickColor(0.62, 0.28, 0.21),
  makeDisplayBrickColor(0.67, 0.32, 0.24),
  makeDisplayBrickColor(0.7, 0.36, 0.27),
  makeDisplayBrickColor(0.58, 0.25, 0.19),
  makeDisplayBrickColor(0.65, 0.3, 0.22),
];
const intactBrickMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  toneMapped: false,
  side: THREE.DoubleSide,
});

const materialProfiles: Record<StructuralMaterialId, MaterialProfile> = {
  brickMasonry: {
    compressiveLimit: 96,
    damping: 0.74,
    density: 1.9,
    fractureEnergy: 28,
    friction: 0.94,
    minFragmentSize: 0.35,
    restitution: 0.01,
    shearLimit: 42,
    stiffness: 0.82,
    tensileLimit: 22,
  },
  mortarJoint: {
    compressiveLimit: 58,
    damping: 0.66,
    density: 1.15,
    fractureEnergy: 14,
    friction: 0.88,
    minFragmentSize: 0.18,
    restitution: 0.005,
    shearLimit: 24,
    stiffness: 0.48,
    tensileLimit: 13,
  },
  roofPanel: {
    compressiveLimit: 46,
    damping: 0.62,
    density: 0.85,
    fractureEnergy: 18,
    friction: 0.72,
    minFragmentSize: 0.65,
    restitution: 0.02,
    shearLimit: 20,
    stiffness: 0.36,
    tensileLimit: 11,
  },
  bulldozerSteel: {
    compressiveLimit: 220,
    damping: 0.9,
    density: 7.8,
    fractureEnergy: 180,
    friction: 2.6,
    minFragmentSize: 1,
    restitution: 0.02,
    shearLimit: 160,
    stiffness: 1,
    tensileLimit: 140,
  },
};

let physicsWorld: RAPIER.World;
let bulldozer: PhysicsEntity;
let blade: PhysicsEntity;
let bridgeDecks: PhysicsEntity[] = [];
let bridgeSupports: BridgeSupport[] = [];
let entities: PhysicsEntity[] = [];
let settledDebrisVisuals: THREE.Object3D[] = [];
let staticWallVisuals: THREE.Object3D[] = [];
let physicalFacadeRowVisuals = new Map<string, THREE.Object3D>();
let wallBlocks: PhysicsEntity[] = [];
let wallChunks: WallChunk[] = [];
let fracturedWallBlockCount = 0;
let wallFaceStress = new Map<HouseBlockFace, WallFaceStress>();
const replayFaces: HouseBlockFace[] = ['front', 'back', 'left', 'right', 'roof-front', 'roof-back'];
const demolitionRecorderSampleIntervalSteps = 6;
const maxDemolitionReplayFrames = 3000;
const replayLiveSourceVisibility = new Map<string, boolean>();
let selectedReplayWallHelper: THREE.Box3Helper | null = null;
let lastReplayFocusPoint = new THREE.Vector3(0, solidWallHeight * 0.45, houseCenterZ);
let lastReplayStatsText = 'Replay: no recording yet';
let lastReplayMarkerText = 'Markers: none';
let demolitionReplayRecording: DemolitionReplayRecording = createEmptyDemolitionReplayRecording();
const demolitionReplayPlayback: DemolitionReplayPlayback = {
  active: false,
  cameraMode: 'gameplay',
  currentTime: 0,
  focusSelectedWall: false,
  isolateSelectedWall: false,
  lastAppliedTime: -1,
  lastTick: performance.now(),
  playing: false,
  reverseReconstruction: false,
  selectedWall: 'all',
  showGhostOriginal: false,
  speed: 1,
};
const replayUiState = {
  cameraMode: demolitionReplayPlayback.cameraMode,
  currentTime: 0,
  eventMarkers: lastReplayMarkerText,
  focusSelectedWall: false,
  hValue: 1,
  isolateSelectedWall: false,
  pause: () => pauseDemolitionReplay(),
  play: () => playDemolitionReplay(),
  reverseReconstruction: false,
  selectedWall: 'all' as HouseBlockFace | 'all',
  showGhostOriginal: false,
  stats: lastReplayStatsText,
  stepBack: () => stepDemolitionReplay(-1),
  stepForward: () => stepDemolitionReplay(1),
  stop: () => stopDemolitionReplayPlayback(),
};
let replayScrubController: ReturnType<GUI['add']> | null = null;
let replayUiControllers: Array<ReturnType<GUI['add']>> = [];
let structuralNodes = new Map<string, StructuralNode>();
let structuralBonds: StructuralBond[] = [];
let structuralDirty = true;
let lastStructuralStats: StructuralSupportSnapshot = {
  brokenBonds: 0,
  islandCount: 0,
  nodes: 0,
  unsupportedIslands: 0,
  unsupportedNodes: new Set<string>(),
};
let keys = new Set<string>();
let controlOverride: ControlOverride | null = null;
let touchControlOverride: ControlOverride | null = null;
let cameraPointer: CameraPointerState | null = null;
let dozerSpeed = 0;
let dozerYaw = 0;
let dozerTurnSpeed = 0;
let cameraYaw = 0;
let cameraPitch = 0.48;
let cameraDistance = 64;
let cameraFpsMode = false;
let fpsCameraYawOffset = 0;
let fpsCameraPitch = 0;
let debugGui: GUI | null = null;
let accumulatedTime = 0;
let simulationStep = 0;
let environmentVisualsCreated = false;
let lastFpsUpdate = 0;
let lastTimestamp = performance.now();
let nextRenderTimestamp = lastTimestamp;
let frameCounter = 0;
let lastDebugSupportSampleStep = -20;
let cachedAirborneDynamicDebris = 0;
let lastStaticVisualSupportSampleStep = -20;
let cachedUnsupportedStaticVisualBlocks = 0;
const maxLiveDynamicDebris = 36;
const dynamicDebrisMinAgeSteps = 36;
const dynamicDebrisSettleSteps = 14;
const debrisSettleDistanceFromDozer = 4.4;
const debrisReactivationDistance = 8.5;
const secondaryWallImpactCooldownSteps = 14;
const maxVisualWallImpactsPerMover = 2;
const maxStructuralVisualReleasesPerStep = 1;
const maxUnsupportedWallBlockReleasesPerStep = 6;
const debugSupportSampleInterval = 20;
const touchControlState: TouchControlState = {
  forward: false,
  lowerBlade: false,
  raiseBlade: false,
  reverse: false,
  steering: 0,
};

function getPixelRatioForQuality(quality: QualityLevel): number {
  const dpr = window.devicePixelRatio || 1;

  if (quality === 'Low') {
    return 1;
  }
  if (quality === 'High') {
    return Math.min(dpr, 2);
  }
  return Math.min(dpr, 1.5);
}

function sanitizeSettings(raw: Partial<SettingsValues>): Partial<SettingsValues> {
  const sanitized: Partial<SettingsValues> = {};

  if (typeof raw.engineTorque === 'number' && Number.isFinite(raw.engineTorque)) {
    sanitized.engineTorque = THREE.MathUtils.clamp(raw.engineTorque, 20, 140);
  }
  if (typeof raw.columnStageOneDamage === 'number' && Number.isFinite(raw.columnStageOneDamage)) {
    sanitized.columnStageOneDamage = THREE.MathUtils.clamp(raw.columnStageOneDamage, 6, 40);
  }
  if (typeof raw.columnStageTwoDamage === 'number' && Number.isFinite(raw.columnStageTwoDamage)) {
    sanitized.columnStageTwoDamage = THREE.MathUtils.clamp(raw.columnStageTwoDamage, 16, 80);
  }
  if (typeof raw.bridgeCollapseThreshold === 'number' && Number.isFinite(raw.bridgeCollapseThreshold)) {
    sanitized.bridgeCollapseThreshold = Math.round(THREE.MathUtils.clamp(raw.bridgeCollapseThreshold, 1, 8));
  }
  if (typeof raw.criticalBearingDelayFrames === 'number' && Number.isFinite(raw.criticalBearingDelayFrames)) {
    sanitized.criticalBearingDelayFrames = Math.round(THREE.MathUtils.clamp(raw.criticalBearingDelayFrames, 30, 300));
  }
  if (typeof raw.criticalBearingLeanSpeed === 'number' && Number.isFinite(raw.criticalBearingLeanSpeed)) {
    sanitized.criticalBearingLeanSpeed = THREE.MathUtils.clamp(raw.criticalBearingLeanSpeed, 0.05, 1.45);
  }
  if (typeof raw.debrisPickupRange === 'number' && Number.isFinite(raw.debrisPickupRange)) {
    sanitized.debrisPickupRange = THREE.MathUtils.clamp(raw.debrisPickupRange, 1.2, 5.5);
  }
  if (typeof raw.destructionSpeed === 'number' && Number.isFinite(raw.destructionSpeed)) {
    sanitized.destructionSpeed = THREE.MathUtils.clamp(raw.destructionSpeed, 0.5, 3.5);
  }
  if (typeof raw.maxCarryMass === 'number' && Number.isFinite(raw.maxCarryMass)) {
    sanitized.maxCarryMass = THREE.MathUtils.clamp(raw.maxCarryMass, 20, 140);
  }
  if (typeof raw.wallBreakDamage === 'number' && Number.isFinite(raw.wallBreakDamage)) {
    sanitized.wallBreakDamage = THREE.MathUtils.clamp(raw.wallBreakDamage, 8, 36);
  }
  if (typeof raw.wallImpactDamageScale === 'number' && Number.isFinite(raw.wallImpactDamageScale)) {
    sanitized.wallImpactDamageScale = THREE.MathUtils.clamp(raw.wallImpactDamageScale, 0.35, 1.4);
  }
  if (typeof raw.secondaryImpactThreshold === 'number' && Number.isFinite(raw.secondaryImpactThreshold)) {
    sanitized.secondaryImpactThreshold = THREE.MathUtils.clamp(raw.secondaryImpactThreshold, 18, 80);
  }
  if (typeof raw.supportReleaseRatio === 'number' && Number.isFinite(raw.supportReleaseRatio)) {
    sanitized.supportReleaseRatio = THREE.MathUtils.clamp(raw.supportReleaseRatio, 0.18, 0.75);
  }
  if (typeof raw.roofDropSupportRatio === 'number' && Number.isFinite(raw.roofDropSupportRatio)) {
    sanitized.roofDropSupportRatio = THREE.MathUtils.clamp(raw.roofDropSupportRatio, 0.12, 0.7);
  }
  sanitized.gravity = defaultSettings.gravity;
  sanitized.quality = 'High';
  return sanitized;
}

function loadSavedSettings(): Partial<SettingsValues> {
  try {
    const saved = window.localStorage.getItem(settingsStorageKey);

    if (!saved) {
      return {};
    }
    return sanitizeSettings(JSON.parse(saved) as Partial<SettingsValues>);
  } catch {
    return {};
  }
}

function saveSettings(): void {
  try {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(tuning));
  } catch {
    // Persistence is best effort only; gameplay should keep working without storage.
  }
}

function applyQualitySettings(): void {
  renderer.setPixelRatio(getPixelRatioForQuality(tuning.quality));
  renderer.shadowMap.enabled = tuning.quality === 'High';
  resize();
}

function focusGameCanvas(): void {
  (canvas as HTMLCanvasElement).focus({ preventScroll: true });
}

function applyDraftSettings(): void {
  Object.assign(tuning, defaultSettings, sanitizeSettings(draftSettings));
  tuning.quality = 'High';
  Object.assign(draftSettings, tuning);
  saveSettings();
  applyQualitySettings();
  focusGameCanvas();
}

function getDestructionSpeed(): number {
  return THREE.MathUtils.clamp(tuning.destructionSpeed, 0.5, 3.5);
}

function getWallBreakDamage(): number {
  return THREE.MathUtils.clamp(tuning.wallBreakDamage, 8, 36);
}

function getWallImpactDamageScale(): number {
  return THREE.MathUtils.clamp(tuning.wallImpactDamageScale, 0.35, 1.4);
}

function getSecondaryImpactThreshold(): number {
  return THREE.MathUtils.clamp(tuning.secondaryImpactThreshold, 18, 80);
}

function getSupportReleaseRatio(): number {
  return THREE.MathUtils.clamp(tuning.supportReleaseRatio, 0.18, 0.75);
}

function getRoofDropSupportRatio(): number {
  return THREE.MathUtils.clamp(tuning.roofDropSupportRatio, 0.12, 0.7);
}

function getCriticalBearingDelayFrames(): number {
  return Math.round(THREE.MathUtils.clamp(tuning.criticalBearingDelayFrames, 30, 300));
}

function getCriticalBearingLeanSpeed(): number {
  return THREE.MathUtils.clamp(tuning.criticalBearingLeanSpeed, 0.05, 1.45);
}

function updateTouchControlOverride(): void {
  const throttle = (touchControlState.forward ? 1 : 0) - (touchControlState.reverse ? 1 : 0);
  const steering = touchControlState.steering;

  if (
    throttle === 0 &&
    steering === 0 &&
    !touchControlState.lowerBlade &&
    !touchControlState.raiseBlade
  ) {
    touchControlOverride = null;
    return;
  }

  touchControlOverride = {
    lowerBlade: touchControlState.lowerBlade,
    lowGear: true,
    raiseBlade: touchControlState.raiseBlade,
    steering,
    throttle,
  };
}

function syncMeshFromBody(entity: PhysicsEntity): void {
  const position = entity.body.translation();
  const rotation = entity.body.rotation();

  entity.mesh.position.set(position.x, position.y, position.z);
  entity.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

  if (entity.wallBlock && !isRoofFace(entity.wallBlock.face) && entity.stage < 2 && !entity.body.isDynamic()) {
    applyWallBlockVisualDeformation(entity);
  }
}

function getBodyForward(body: RAPIER.RigidBody, target = tempForward): THREE.Vector3 {
  const rotation = body.rotation();

  tempQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);
  return target.set(0, 0, -1).applyQuaternion(tempQuat).setY(0).normalize();
}

function getBodyRight(body: RAPIER.RigidBody, target = tempRight): THREE.Vector3 {
  const rotation = body.rotation();

  tempQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);
  return target.set(1, 0, 0).applyQuaternion(tempQuat).setY(0).normalize();
}

function normalizeGameCode(event: KeyboardEvent): string | null {
  if (gameControlCodes.has(event.code)) {
    return event.code;
  }

  switch (event.key.toLowerCase()) {
    case 'w':
      return 'KeyW';
    case 'a':
      return 'KeyA';
    case 's':
      return 'KeyS';
    case 'd':
      return 'KeyD';
    case 'q':
      return 'KeyQ';
    case 'r':
      return 'KeyR';
    case 'e':
      return 'KeyE';
    case 'g':
      return 'KeyG';
    case 'x':
      return 'KeyX';
    case 't':
      return 'KeyT';
    case 'c':
      return 'KeyC';
    case 'h':
      return 'KeyH';
    case 'arrowup':
      return 'ArrowUp';
    case 'arrowdown':
      return 'ArrowDown';
    case 'arrowleft':
      return 'ArrowLeft';
    case 'arrowright':
      return 'ArrowRight';
    case 'escape':
      return 'Escape';
    case 'shift':
      return event.location === KeyboardEvent.DOM_KEY_LOCATION_RIGHT ? 'ShiftRight' : 'ShiftLeft';
    case ' ':
    case 'spacebar':
      return 'Space';
    default:
      return null;
  }
}

function createBoxMesh(halfExtents: THREE.Vector3, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2),
    material,
  );

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function getBrickSurfaceSign(face?: HouseBlockFace | 'fragment'): number {
  return face === 'back' || face === 'left' ? -1 : 1;
}

function collectWorldBrickGridCells(
  halfExtents: THREE.Vector3,
  worldPosition: THREE.Vector3,
): {
  column: number;
  localLengthCenter: number;
  localY: number;
  row: number;
  scale: THREE.Vector3;
}[] {
  const lengthAxis: 'x' | 'z' = halfExtents.x >= halfExtents.z ? 'x' : 'z';
  const length = halfExtents[lengthAxis] * 2;
  const height = halfExtents.y * 2;
  const depth = (lengthAxis === 'x' ? halfExtents.z : halfExtents.x) * 2;
  const columns = Math.max(2, Math.min(8, Math.round(length / masonryBrickLength)));
  const rows = Math.max(2, Math.min(6, Math.round(height / masonryBrickHeight)));
  const mortarGap = Math.min(0.28, Math.max(0.12, Math.min(length / columns, height / rows) * 0.09));
  const cellLength = masonryBrickLength;
  const cellHeight = masonryBrickHeight;
  const brickDepth = Math.min(0.9, Math.max(0.45, depth * 0.46));
  const worldLengthCenter = lengthAxis === 'x' ? worldPosition.x : worldPosition.z;
  const worldLengthMin = worldLengthCenter - length * 0.5;
  const worldLengthMax = worldLengthCenter + length * 0.5;
  const worldYMin = worldPosition.y - height * 0.5;
  const worldYMax = worldPosition.y + height * 0.5;
  const firstRow = Math.floor(worldYMin / cellHeight) - 1;
  const lastRow = Math.ceil(worldYMax / cellHeight) + 1;
  const cells: {
    column: number;
    localLengthCenter: number;
    localY: number;
    row: number;
    scale: THREE.Vector3;
  }[] = [];

  for (let row = firstRow; row <= lastRow; row += 1) {
    const rowOffset = row % 2 === 0 ? 0 : cellLength * 0.5;
    const brickYMin = row * cellHeight + mortarGap * 0.5;
    const brickYMax = (row + 1) * cellHeight - mortarGap * 0.5;
    const clippedYMin = Math.max(brickYMin, worldYMin);
    const clippedYMax = Math.min(brickYMax, worldYMax);

    if (clippedYMax - clippedYMin < 0.08) {
      continue;
    }

    const firstColumn = Math.floor((worldLengthMin - rowOffset) / cellLength) - 1;
    const lastColumn = Math.ceil((worldLengthMax - rowOffset) / cellLength) + 1;

    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const brickLengthMin = column * cellLength + rowOffset + mortarGap * 0.5;
      const brickLengthMax = (column + 1) * cellLength + rowOffset - mortarGap * 0.5;
      const clippedLengthMin = Math.max(brickLengthMin, worldLengthMin);
      const clippedLengthMax = Math.min(brickLengthMax, worldLengthMax);

      if (clippedLengthMax - clippedLengthMin < 0.12) {
        continue;
      }

      const brickLength = clippedLengthMax - clippedLengthMin;
      const brickHeight = clippedYMax - clippedYMin;
      const localLengthCenter = (clippedLengthMin + clippedLengthMax) * 0.5 - worldLengthCenter;
      const localY = (clippedYMin + clippedYMax) * 0.5 - worldPosition.y;
      const scale = lengthAxis === 'x'
        ? new THREE.Vector3(brickLength, brickHeight, brickDepth)
        : new THREE.Vector3(brickDepth, brickHeight, brickLength);

      cells.push({ column, localLengthCenter, localY, row, scale });
    }
  }

  return cells;
}

function createIntactBrickWallVisual(
  halfExtents: THREE.Vector3,
  seed: number,
  options: {
    brickHeight?: number;
    brickLength?: number;
    castShadow?: boolean;
    doubleSided?: boolean;
    face?: HouseBlockFace | 'fragment';
    maxColumns?: number;
    maxRows?: number;
    worldPosition?: THREE.Vector3;
  } = {},
): THREE.Object3D {
  const group = new THREE.Group();
  const lengthAxis: 'x' | 'z' = halfExtents.x >= halfExtents.z ? 'x' : 'z';
  const length = halfExtents[lengthAxis] * 2;
  const height = halfExtents.y * 2;
  const depth = (lengthAxis === 'x' ? halfExtents.z : halfExtents.x) * 2;
  const targetBrickLength = options.brickLength ?? masonryBrickLength;
  const targetBrickHeight = options.brickHeight ?? masonryBrickHeight;
  const columns = Math.max(2, Math.min(options.maxColumns ?? 96, Math.round(length / targetBrickLength)));
  const rows = Math.max(2, Math.min(options.maxRows ?? 16, Math.round(height / targetBrickHeight)));
  const mortarGap = Math.min(0.28, Math.max(0.12, Math.min(length / columns, height / rows) * 0.09));
  const cellLength = options.worldPosition ? targetBrickLength : length / columns;
  const cellHeight = options.worldPosition ? targetBrickHeight : height / rows;
  const brickDepth = Math.min(0.9, Math.max(0.45, depth * 0.46));
  const preferredSurfaceSign = getBrickSurfaceSign(options.face);
  const surfaceSigns = options.doubleSided ? [preferredSurfaceSign, -preferredSurfaceSign] : [preferredSurfaceSign];
  const surfaceCenter = depth * 0.5 + brickDepth * 0.5 + 0.035;
  const patternSeed = options.worldPosition ? hashStringSeed(`brick-grid-${options.face ?? 'fragment'}`) : seed;
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const identityRotation = new THREE.Quaternion();
  const instances: {
    column: number;
    position: THREE.Vector3;
    row: number;
    scale: THREE.Vector3;
  }[] = [];

  const fillHalfExtents = lengthAxis === 'x'
    ? new THREE.Vector3(halfExtents.x * 0.998, halfExtents.y * 0.998, Math.max(0.04, halfExtents.z * 0.94))
    : new THREE.Vector3(Math.max(0.04, halfExtents.x * 0.94), halfExtents.y * 0.998, halfExtents.z * 0.998);
  const fill = createBoxMesh(fillHalfExtents, materials.mortar);
  fill.name = 'brick-mortar-core';
  fill.castShadow = Boolean(options.castShadow);
  fill.receiveShadow = true;
  group.add(fill);

  if (options.worldPosition) {
    const worldLengthCenter = lengthAxis === 'x' ? options.worldPosition.x : options.worldPosition.z;
    const worldLengthMin = worldLengthCenter - length * 0.5;
    const worldLengthMax = worldLengthCenter + length * 0.5;
    const worldYMin = options.worldPosition.y - height * 0.5;
    const worldYMax = options.worldPosition.y + height * 0.5;
    const firstRow = Math.floor(worldYMin / cellHeight) - 1;
    const lastRow = Math.ceil(worldYMax / cellHeight) + 1;

    for (let row = firstRow; row <= lastRow; row += 1) {
      const rowOffset = row % 2 === 0 ? 0 : cellLength * 0.5;
      const brickYMin = row * cellHeight + mortarGap * 0.5;
      const brickYMax = (row + 1) * cellHeight - mortarGap * 0.5;
      const clippedYMin = Math.max(brickYMin, worldYMin);
      const clippedYMax = Math.min(brickYMax, worldYMax);

      if (clippedYMax - clippedYMin < 0.08) {
        continue;
      }

      const firstColumn = Math.floor((worldLengthMin - rowOffset) / cellLength) - 1;
      const lastColumn = Math.ceil((worldLengthMax - rowOffset) / cellLength) + 1;

      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const brickLengthMin = column * cellLength + rowOffset + mortarGap * 0.5;
        const brickLengthMax = (column + 1) * cellLength + rowOffset - mortarGap * 0.5;
        const clippedLengthMin = Math.max(brickLengthMin, worldLengthMin);
        const clippedLengthMax = Math.min(brickLengthMax, worldLengthMax);

        if (clippedLengthMax - clippedLengthMin < 0.12) {
          continue;
        }

        const brickLength = clippedLengthMax - clippedLengthMin;
        const brickHeight = clippedYMax - clippedYMin;
        const localLengthCenter = (clippedLengthMin + clippedLengthMax) * 0.5 - worldLengthCenter;
        const localY = (clippedYMin + clippedYMax) * 0.5 - options.worldPosition.y;
        const scale = lengthAxis === 'x'
          ? new THREE.Vector3(brickLength, brickHeight, brickDepth)
          : new THREE.Vector3(brickDepth, brickHeight, brickLength);
        surfaceSigns.forEach((surfaceSign) => {
          const protrusion = seededRange(patternSeed + row * 47 + column * 23, -0.006, 0.026);
          const position = lengthAxis === 'x'
            ? new THREE.Vector3(localLengthCenter, localY, surfaceSign * (surfaceCenter + protrusion))
            : new THREE.Vector3(surfaceSign * (surfaceCenter + protrusion), localY, localLengthCenter);

          instances.push({ column, position, row, scale });
        });
      }
    }
  } else {
    for (let row = 0; row < rows; row += 1) {
      const rowOffset = row % 2 === 0 ? 0 : cellLength * 0.5;

      for (let column = 0; column < columns; column += 1) {
        const edgeTrim = (column === columns - 1 && row % 2 === 1) || (column === 0 && row % 2 === 1) ? 0.5 : 1;
        const lengthJitter = seededRange(seed + row * 41 + column * 17, 0.94, 1.02);
        const heightJitter = seededRange(seed + row * 29 + column * 13, 0.95, 1.01);
        const brickLength = Math.max(0.18, cellLength * edgeTrim - mortarGap) * lengthJitter;
        const brickHeight = Math.max(0.14, cellHeight - mortarGap) * heightJitter;
        const scale = lengthAxis === 'x'
          ? new THREE.Vector3(brickLength, brickHeight, brickDepth)
          : new THREE.Vector3(brickDepth, brickHeight, brickLength);
        const baseLengthCenter = -length * 0.5 + cellLength * 0.5 + column * cellLength + rowOffset;
        const wrappedLengthCenter = THREE.MathUtils.clamp(
          baseLengthCenter > length * 0.5 ? baseLengthCenter - length : baseLengthCenter,
          -length * 0.5 + brickLength * 0.5,
          length * 0.5 - brickLength * 0.5,
        );
        const y = -height * 0.5 + cellHeight * 0.5 + row * cellHeight;
        surfaceSigns.forEach((surfaceSign) => {
          const protrusion = seededRange(patternSeed + row * 47 + column * 23, -0.006, 0.026);
          const position = lengthAxis === 'x'
            ? new THREE.Vector3(wrappedLengthCenter, y, surfaceSign * (surfaceCenter + protrusion))
            : new THREE.Vector3(surfaceSign * (surfaceCenter + protrusion), y, wrappedLengthCenter);

          instances.push({ column, position, row, scale });
        });
      }
    }
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const bricks = new THREE.InstancedMesh(geometry, intactBrickMaterial, instances.length);
  bricks.name = 'intact-brick-instances';
  bricks.castShadow = false;
  bricks.receiveShadow = false;

  instances.forEach((instance, instanceIndex) => {
    const shade = THREE.MathUtils.lerp(
      0.985,
      1.025,
      seededGridNoise(patternSeed, instance.row, instance.column, 1),
    );
    const paletteIndex = Math.floor(
      seededGridNoise(patternSeed, instance.row, instance.column, 2) * intactBrickPalette.length,
    );

    matrix.compose(instance.position, identityRotation, instance.scale);
    bricks.setMatrixAt(instanceIndex, matrix);
    color.copy(intactBrickPalette[paletteIndex] ?? intactBrickPalette[0]!).multiplyScalar(shade);
    bricks.setColorAt(instanceIndex, color);
  });

  bricks.instanceMatrix.needsUpdate = true;
  if (bricks.instanceColor) {
    bricks.instanceColor.needsUpdate = true;
  }

  group.add(bricks);
  group.userData.intactBrickVisual = true;
  group.userData.intactBrickVisualCount = instances.length;
  return group;
}

function disposeObjectGeometry(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materialsToDispose = Array.isArray(child.material) ? child.material : [child.material];

      materialsToDispose.forEach((material) => {
        if (material.userData.generatedChipSideMaterial) {
          material.dispose();
          return;
        }

        if (!material.userData.generatedBrickMaterial) {
          if (material.userData.generatedGlassShardMaterial) {
            material.dispose();
          }
          return;
        }

        const mappedMaterial = material as THREE.MeshStandardMaterial;
        mappedMaterial.map?.dispose();
        material.dispose();
      });
    }
  });
}

function disposeGeneratedMaterial(material: THREE.Material): void {
  if (material.userData.generatedBrickMaterial) {
    const mappedMaterial = material as THREE.MeshStandardMaterial;
    mappedMaterial.map?.dispose();
    material.dispose();
    return;
  }

  if (material.userData.generatedChipSideMaterial || material.userData.generatedGlassShardMaterial) {
    material.dispose();
  }
}

function makeEntity(
  name: string,
  kind: BodyKind,
  halfExtents: THREE.Vector3,
  position: THREE.Vector3,
  material: THREE.Material,
  bodyDescFactory: RigidBodyDescFactory,
  mass: number,
  breakable = false,
  rotation = new THREE.Quaternion(),
): PhysicsEntity {
  const mesh = createBoxMesh(halfExtents, material);
  const body = physicsWorld.createRigidBody(
    bodyDescFactory()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }),
  );
  const collider = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
    .setFriction(kind === 'bulldozer' || kind === 'blade' ? 2.6 : 0.82)
    .setRestitution(0.02)
    .setMass(mass);

  physicsWorld.createCollider(collider, body);
  scene.add(mesh);

  const entity: PhysicsEntity = {
    body,
    breakable,
    carried: false,
    createdStep: simulationStep,
    damage: 0,
    halfExtents: halfExtents.clone(),
    kind,
    lastImpactStep: -999,
    mass,
    mesh,
    name,
    settleCandidateSteps: 0,
    stage: 0,
  };

  entities.push(entity);
  syncMeshFromBody(entity);
  return entity;
}

function createFixedBox(
  name: string,
  kind: BodyKind,
  halfExtents: THREE.Vector3,
  position: THREE.Vector3,
  material: THREE.Material,
  mass: number,
  breakable = false,
  rotation = new THREE.Quaternion(),
): PhysicsEntity {
  return makeEntity(name, kind, halfExtents, position, material, () => RAPIER.RigidBodyDesc.fixed(), mass, breakable, rotation);
}

function createDynamicBox(
  name: string,
  kind: BodyKind,
  halfExtents: THREE.Vector3,
  position: THREE.Vector3,
  material: THREE.Material,
  mass: number,
  rotation = new THREE.Quaternion(),
  linearDamping = 1.05,
  angularDamping = 1.25,
): PhysicsEntity {
  return makeEntity(
    name,
    kind,
    halfExtents,
    position,
    material,
    () => RAPIER.RigidBodyDesc.dynamic()
      .setLinearDamping(linearDamping)
      .setAngularDamping(angularDamping)
      .setCcdEnabled(true),
    mass,
    false,
    rotation,
  );
}

function createKinematicBox(
  name: string,
  kind: BodyKind,
  halfExtents: THREE.Vector3,
  position: THREE.Vector3,
  material: THREE.Material,
  mass: number,
): PhysicsEntity {
  return makeEntity(
    name,
    kind,
    halfExtents,
    position,
    material,
    () => RAPIER.RigidBodyDesc.kinematicPositionBased().setCcdEnabled(true),
    mass,
    false,
  );
}

function clearPrototype(): void {
  settledDebrisVisuals.forEach((object) => {
    scene.remove(object);
    disposeObjectGeometry(object);
  });
  settledDebrisVisuals = [];
  staticWallVisuals.forEach((object) => {
    scene.remove(object);
    disposeObjectGeometry(object);
  });
  staticWallVisuals = [];
  clearStructuralGraph();
  physicalFacadeRowVisuals.clear();
  entities.forEach((entity) => {
    scene.remove(entity.mesh);
    disposeObjectGeometry(entity.mesh);
  });
  entities = [];
  wallBlocks = [];
  wallChunks = [];
  fracturedWallBlockCount = 0;
  bridgeDecks = [];
  bridgeSupports = [];
}

function createWallReplayTracks(): Map<HouseBlockFace, WallReplayTrack> {
  return new Map(
    replayFaces.map((face) => [
      face,
      {
        destroyedTime: null,
        events: [],
        face,
        firstContactTime: null,
        firstDamageTime: null,
        samples: [],
      },
    ]),
  );
}

function createEmptyDemolitionReplayRecording(): DemolitionReplayRecording {
  return {
    complete: false,
    demolitionCompleteCandidateStep: null,
    duration: 0,
    events: [],
    firstWallHit: null,
    frames: [],
    lastSampleStep: -999,
    objects: new Map(),
    originalGhostGroup: null,
    recording: false,
    startedStep: 0,
    stoppedStep: null,
    wallTracks: createWallReplayTracks(),
  };
}

function disposeReplayProxyObject(object: THREE.Object3D): void {
  scene.remove(object);
  disposeObjectGeometry(object);
}

function resetDemolitionReplaySystem(): void {
  stopDemolitionReplayPlayback(false);
  demolitionReplayRecording.objects.forEach((object) => disposeReplayProxyObject(object.proxy));
  demolitionReplayRecording.originalGhostGroup?.children.forEach((child) => disposeObjectGeometry(child));
  if (demolitionReplayRecording.originalGhostGroup) {
    scene.remove(demolitionReplayRecording.originalGhostGroup);
  }
  demolitionReplayRecording = createEmptyDemolitionReplayRecording();
  replayLiveSourceVisibility.clear();
  lastReplayFocusPoint.set(0, solidWallHeight * 0.45, houseCenterZ);
  lastReplayStatsText = 'Replay: no recording yet';
  lastReplayMarkerText = 'Markers: none';
  updateReplayUiReadouts();
}

function cloneMaterialForReplay(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) {
    return material.map((entry) => entry.clone());
  }
  return material.clone();
}

function cloneObjectForReplay(source: THREE.Object3D): THREE.Object3D {
  const clone = source.clone(true);

  clone.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry = object.geometry.clone();
      object.material = cloneMaterialForReplay(object.material);
      object.castShadow = false;
      object.receiveShadow = true;
    }
    object.userData = { ...object.userData, replayProxy: true };
  });
  clone.visible = false;
  clone.matrixAutoUpdate = true;
  scene.add(clone);
  return clone;
}

function createOriginalGhostGroup(): THREE.Group {
  const group = new THREE.Group();

  group.name = 'replay-original-structure-ghost';
  for (const block of wallBlocks) {
    if (!block.wallBlock) {
      continue;
    }
    const ghost = cloneObjectForReplay(block.mesh);

    scene.remove(ghost);
    ghost.visible = true;
    ghost.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const materialsToGhost = Array.isArray(object.material) ? object.material : [object.material];

        materialsToGhost.forEach((material) => {
          material.transparent = true;
          material.opacity = isRoofFace(block.wallBlock?.face ?? 'front') ? 0.2 : 0.16;
          material.depthWrite = false;
        });
      }
    });
    group.add(ghost);
  }
  group.visible = false;
  scene.add(group);
  return group;
}

function getReplayFaceFromObject(object: THREE.Object3D): HouseBlockFace | undefined {
  const replayFace = object.userData.replayFace;
  const structuralFace = object.userData.structuralCollapseFace;

  if (replayFaces.includes(replayFace)) {
    return replayFace;
  }
  if (replayFaces.includes(structuralFace)) {
    return structuralFace;
  }
  if (object.userData.roofCollapseDebris && object.name.includes('roof-back')) {
    return 'roof-back';
  }
  if (object.userData.roofCollapseDebris && object.name.includes('roof-front')) {
    return 'roof-front';
  }
  return undefined;
}

function getReplayFaceForEntity(entity: PhysicsEntity): HouseBlockFace | undefined {
  return entity.wallBlock?.face ?? getReplayFaceFromObject(entity.mesh);
}

function isReplayRelevantEntity(entity: PhysicsEntity): boolean {
  return entity === bulldozer || entity === blade || Boolean(getReplayFaceForEntity(entity));
}

function captureReplayObjectFrame(entity: PhysicsEntity): WallReplayFrameObject {
  const face = getReplayFaceForEntity(entity);
  const position = entity.body.translation();
  const rotation = entity.body.rotation();

  return {
    damage: Number(entity.damage.toFixed(3)),
    dynamic: entity.body.isDynamic(),
    face,
    id: entity.mesh.uuid,
    name: entity.name,
    position: [position.x, position.y, position.z],
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    scale: [entity.mesh.scale.x, entity.mesh.scale.y, entity.mesh.scale.z],
    stage: entity.stage,
    visible: entity.mesh.visible,
  };
}

function captureReplayVisualFrame(object: THREE.Object3D): WallReplayFrameObject | null {
  const face = getReplayFaceFromObject(object);

  if (!face) {
    return null;
  }

  return {
    damage: 0,
    dynamic: false,
    face,
    id: object.uuid,
    name: object.name || 'settled-wall-visual',
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w],
    scale: [object.scale.x, object.scale.y, object.scale.z],
    stage: 2,
    visible: object.visible,
  };
}

function ensureDemolitionReplayObject(source: THREE.Object3D, face: HouseBlockFace | undefined, timestamp: number, name: string): void {
  const existing = demolitionReplayRecording.objects.get(source.uuid);

  if (existing) {
    existing.face = existing.face ?? face;
    existing.lastTimestamp = timestamp;
    return;
  }

  demolitionReplayRecording.objects.set(source.uuid, {
    face,
    firstTimestamp: timestamp,
    id: source.uuid,
    lastTimestamp: timestamp,
    name,
    proxy: cloneObjectForReplay(source),
    source,
  });
}

function getDemolitionReplayTimestamp(): number {
  if (!demolitionReplayRecording.recording && !demolitionReplayRecording.complete) {
    return 0;
  }
  return Math.max(0, (simulationStep - demolitionReplayRecording.startedStep) * fixedDt);
}

function startDemolitionRecording(face?: HouseBlockFace, force = 0): void {
  if (demolitionReplayRecording.recording || demolitionReplayRecording.complete) {
    return;
  }

  demolitionReplayRecording.recording = true;
  demolitionReplayRecording.startedStep = simulationStep;
  demolitionReplayRecording.firstWallHit = 0;
  demolitionReplayRecording.originalGhostGroup = createOriginalGhostGroup();
  addDemolitionReplayEvent('first-contact', 'first bulldozer contact', face, force);
  captureDemolitionReplayFrame(true);
}

function addDemolitionReplayEvent(
  type: DemolitionReplayEventType,
  label: string,
  face?: HouseBlockFace,
  value?: number,
): void {
  if (!demolitionReplayRecording.recording && !demolitionReplayRecording.complete) {
    return;
  }

  const timestamp = getDemolitionReplayTimestamp();
  const duplicate = demolitionReplayRecording.events.some((event) => (
    event.type === type &&
    event.face === face &&
    Math.abs(event.timestamp - timestamp) < fixedDt * 2
  ));

  if (duplicate) {
    return;
  }

  const event: DemolitionReplayEvent = {
    face,
    label,
    timestamp,
    type,
    value,
  };

  demolitionReplayRecording.events.push(event);
  if (face) {
    const track = demolitionReplayRecording.wallTracks.get(face);

    track?.events.push(event);
    if (type === 'first-contact' && track && track.firstContactTime === null) {
      track.firstContactTime = timestamp;
    }
    if (type === 'wall-damaged' && track && track.firstDamageTime === null) {
      track.firstDamageTime = timestamp;
    }
    if ((type === 'wall-destroyed' || type === 'wall-detached') && track && track.destroyedTime === null) {
      track.destroyedTime = timestamp;
    }
  }
}

function registerBulldozerWallReplayContact(entity: PhysicsEntity, force: number): void {
  const face = getReplayFaceForEntity(entity);

  if (!face || isRoofFace(face)) {
    return;
  }
  startDemolitionRecording(face, force);
  addDemolitionReplayEvent('first-contact', `${face} first contact`, face, force);
}

function registerWallReplayDamage(entity: PhysicsEntity, previousDamage: number, effectiveAmount: number): void {
  const face = getReplayFaceForEntity(entity);

  if (!face || !demolitionReplayRecording.recording) {
    return;
  }
  if (previousDamage <= 0 && entity.damage > 0) {
    addDemolitionReplayEvent('wall-damaged', `${face} damaged`, face, effectiveAmount);
  }
  if (previousDamage < getWallBreakDamage() * 0.5 && entity.damage >= getWallBreakDamage() * 0.5) {
    addDemolitionReplayEvent('wall-cracked', `${face} cracked`, face, entity.damage);
  }
}

function captureDemolitionReplayFrame(force = false): void {
  if (!demolitionReplayRecording.recording) {
    return;
  }
  if (!force && simulationStep - demolitionReplayRecording.lastSampleStep < demolitionRecorderSampleIntervalSteps) {
    return;
  }
  if (demolitionReplayRecording.frames.length >= maxDemolitionReplayFrames) {
    finishDemolitionRecording('frame budget reached');
    return;
  }

  const timestamp = getDemolitionReplayTimestamp();
  const objects: WallReplayFrameObject[] = [];

  for (const entity of entities) {
    if (!isReplayRelevantEntity(entity)) {
      continue;
    }
    const frame = captureReplayObjectFrame(entity);

    ensureDemolitionReplayObject(entity.mesh, frame.face, timestamp, entity.name);
    objects.push(frame);
  }

  for (const object of [...settledDebrisVisuals, ...staticWallVisuals]) {
    const frame = captureReplayVisualFrame(object);

    if (!frame) {
      continue;
    }
    ensureDemolitionReplayObject(object, frame.face, timestamp, frame.name);
    objects.push(frame);
  }

  demolitionReplayRecording.frames.push({ objects, step: simulationStep, timestamp });
  demolitionReplayRecording.duration = timestamp;
  demolitionReplayRecording.lastSampleStep = simulationStep;

  for (const face of replayFaces) {
    const faceObjects = objects.filter((object) => object.face === face);
    const track = demolitionReplayRecording.wallTracks.get(face);

    if (!track || faceObjects.length === 0) {
      continue;
    }

    track.samples.push({
      damage: faceObjects.reduce((total, object) => total + object.damage, 0),
      destroyed: !wallBlocks.some((block) => block.wallBlock?.face === face),
      objects: faceObjects,
      timestamp,
    });
  }
}

function getAttachedStructureBlockCount(): number {
  return wallBlocks.filter((block) => Boolean(block.wallBlock)).length;
}

function updateDemolitionRecorder(): void {
  if (!demolitionReplayRecording.recording) {
    return;
  }

  captureDemolitionReplayFrame();

  if (getAttachedStructureBlockCount() > 0) {
    demolitionReplayRecording.demolitionCompleteCandidateStep = null;
    return;
  }

  if (demolitionReplayRecording.demolitionCompleteCandidateStep === null) {
    demolitionReplayRecording.demolitionCompleteCandidateStep = simulationStep;
    addDemolitionReplayEvent('full-demolition', 'full structure demolished');
    return;
  }

  if (simulationStep - demolitionReplayRecording.demolitionCompleteCandidateStep >= 90) {
    finishDemolitionRecording('structure demolished');
  }
}

function finishDemolitionRecording(_reason: string): void {
  if (!demolitionReplayRecording.recording) {
    return;
  }

  captureDemolitionReplayFrame(true);
  demolitionReplayRecording.recording = false;
  demolitionReplayRecording.complete = true;
  demolitionReplayRecording.stoppedStep = simulationStep;
  demolitionReplayRecording.duration = demolitionReplayRecording.frames.at(-1)?.timestamp ?? 0;
  updateReplayUiReadouts();

  if (debugGui) {
    debugGui.domElement.style.display = '';
  }
}

function setReplayLiveSourcesVisible(visible: boolean): void {
  const liveObjects = [
    ...entities.map((entity) => entity.mesh),
    ...settledDebrisVisuals,
    ...staticWallVisuals,
  ];

  if (!visible) {
    for (const object of liveObjects) {
      if (!replayLiveSourceVisibility.has(object.uuid)) {
        replayLiveSourceVisibility.set(object.uuid, object.visible);
      }
      if (isReplayLiveObject(object)) {
        object.visible = false;
      }
    }
    return;
  }

  for (const object of liveObjects) {
    const original = replayLiveSourceVisibility.get(object.uuid);

    if (typeof original === 'boolean') {
      object.visible = original;
    }
  }
  replayLiveSourceVisibility.clear();
}

function isReplayLiveObject(object: THREE.Object3D): boolean {
  if (object === bulldozer?.mesh || object === blade?.mesh) {
    return true;
  }
  return Boolean(getReplayFaceFromObject(object));
}

function getReplayDisplayTime(): number {
  return demolitionReplayPlayback.reverseReconstruction
    ? Math.max(0, demolitionReplayRecording.duration - demolitionReplayPlayback.currentTime)
    : demolitionReplayPlayback.currentTime;
}

function getFrameObjectMap(frame: DemolitionReplayFrame | undefined): Map<string, WallReplayFrameObject> {
  const map = new Map<string, WallReplayFrameObject>();

  frame?.objects.forEach((object) => map.set(object.id, object));
  return map;
}

function interpolateReplayObject(
  previous: WallReplayFrameObject | undefined,
  next: WallReplayFrameObject | undefined,
  amount: number,
): WallReplayFrameObject | null {
  const source = previous ?? next;

  if (!source) {
    return null;
  }
  if (!previous || !next) {
    return source;
  }

  const position = new THREE.Vector3(...previous.position).lerp(new THREE.Vector3(...next.position), amount);
  const rotation = new THREE.Quaternion(...previous.rotation).slerp(new THREE.Quaternion(...next.rotation), amount);
  const scale = new THREE.Vector3(...previous.scale).lerp(new THREE.Vector3(...next.scale), amount);

  return {
    ...source,
    damage: THREE.MathUtils.lerp(previous.damage, next.damage, amount),
    dynamic: previous.dynamic || next.dynamic,
    position: [position.x, position.y, position.z],
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    scale: [scale.x, scale.y, scale.z],
    stage: amount < 0.5 ? previous.stage : next.stage,
    visible: previous.visible || next.visible,
  };
}

function findReplayFramePair(timestamp: number): { amount: number; next?: DemolitionReplayFrame; previous?: DemolitionReplayFrame } {
  const frames = demolitionReplayRecording.frames;

  if (frames.length === 0) {
    return { amount: 0 };
  }
  const firstFrame = frames[0];
  const lastFrame = frames[frames.length - 1];

  if (!firstFrame || !lastFrame) {
    return { amount: 0 };
  }
  if (timestamp <= firstFrame.timestamp) {
    return { amount: 0, next: firstFrame, previous: firstFrame };
  }
  if (timestamp >= lastFrame.timestamp) {
    return { amount: 0, next: lastFrame, previous: lastFrame };
  }

  for (let index = 1; index < frames.length; index += 1) {
    const next = frames[index];
    const previous = frames[index - 1];

    if (next && previous && next.timestamp >= timestamp) {
      const duration = Math.max(fixedDt, next.timestamp - previous.timestamp);
      return {
        amount: THREE.MathUtils.clamp((timestamp - previous.timestamp) / duration, 0, 1),
        next,
        previous,
      };
    }
  }

  return { amount: 0, next: lastFrame, previous: lastFrame };
}

function applyDemolitionReplayTime(timestamp: number): void {
  if (demolitionReplayRecording.frames.length === 0) {
    return;
  }

  const displayTime = THREE.MathUtils.clamp(timestamp, 0, demolitionReplayRecording.duration);
  const { amount, next, previous } = findReplayFramePair(displayTime);
  const previousObjects = getFrameObjectMap(previous);
  const nextObjects = getFrameObjectMap(next);
  const objectIds = new Set([...previousObjects.keys(), ...nextObjects.keys()]);
  const selected = demolitionReplayPlayback.selectedWall;
  const isolateFace = demolitionReplayPlayback.isolateSelectedWall && selected !== 'all' ? selected : null;
  const focusBox = new THREE.Box3();
  let hasFocusBox = false;

  demolitionReplayRecording.objects.forEach((object) => {
    object.proxy.visible = false;
  });

  for (const id of objectIds) {
    const replayObject = demolitionReplayRecording.objects.get(id);
    const sample = interpolateReplayObject(previousObjects.get(id), nextObjects.get(id), amount);

    if (!replayObject || !sample || displayTime < replayObject.firstTimestamp - fixedDt || displayTime > replayObject.lastTimestamp + fixedDt * 2) {
      continue;
    }
    if (isolateFace && sample.face !== isolateFace && sample.name !== bulldozer?.name && sample.name !== blade?.name) {
      continue;
    }

    replayObject.proxy.position.set(...sample.position);
    replayObject.proxy.quaternion.set(...sample.rotation);
    replayObject.proxy.scale.set(...sample.scale);
    replayObject.proxy.visible = sample.visible;

    if (selected !== 'all' && sample.face === selected && sample.visible) {
      focusBox.expandByObject(replayObject.proxy);
      hasFocusBox = true;
    }
  }

  if (demolitionReplayRecording.originalGhostGroup) {
    demolitionReplayRecording.originalGhostGroup.visible = demolitionReplayPlayback.showGhostOriginal;
  }
  updateSelectedReplayWallHelper(hasFocusBox ? focusBox : null);
  if (hasFocusBox) {
    focusBox.getCenter(lastReplayFocusPoint);
  } else {
    const dozerProxy = Array.from(demolitionReplayRecording.objects.values()).find((object) => object.name === bulldozer?.name);

    if (dozerProxy?.proxy.visible) {
      lastReplayFocusPoint.copy(dozerProxy.proxy.position);
    }
  }
  demolitionReplayPlayback.lastAppliedTime = displayTime;
  updateReplayUiReadouts();
}

function updateSelectedReplayWallHelper(box: THREE.Box3 | null): void {
  if (!box) {
    if (selectedReplayWallHelper) {
      selectedReplayWallHelper.visible = false;
    }
    return;
  }

  if (!selectedReplayWallHelper) {
    selectedReplayWallHelper = new THREE.Box3Helper(box.clone(), new THREE.Color(0xf8d24b));
    scene.add(selectedReplayWallHelper);
  } else {
    selectedReplayWallHelper.box.copy(box);
  }
  selectedReplayWallHelper.visible = demolitionReplayPlayback.selectedWall !== 'all';
}

function playDemolitionReplay(): void {
  if (!demolitionReplayRecording.complete || demolitionReplayRecording.frames.length === 0) {
    return;
  }
  demolitionReplayPlayback.active = true;
  demolitionReplayPlayback.playing = true;
  demolitionReplayPlayback.lastTick = performance.now();
  setReplayLiveSourcesVisible(false);
  applyDemolitionReplayTime(getReplayDisplayTime());
}

function pauseDemolitionReplay(): void {
  demolitionReplayPlayback.playing = false;
}

function stopDemolitionReplayPlayback(restoreLive = true): void {
  demolitionReplayPlayback.active = false;
  demolitionReplayPlayback.playing = false;
  demolitionReplayPlayback.currentTime = 0;
  demolitionReplayPlayback.lastAppliedTime = -1;
  demolitionReplayRecording.objects.forEach((object) => {
    object.proxy.visible = false;
  });
  if (demolitionReplayRecording.originalGhostGroup) {
    demolitionReplayRecording.originalGhostGroup.visible = false;
  }
  updateSelectedReplayWallHelper(null);
  if (restoreLive) {
    setReplayLiveSourcesVisible(true);
  }
  updateReplayUiReadouts();
}

function stepDemolitionReplay(direction: -1 | 1): void {
  if (!demolitionReplayRecording.complete) {
    return;
  }
  demolitionReplayPlayback.active = true;
  demolitionReplayPlayback.playing = false;
  setReplayLiveSourcesVisible(false);
  demolitionReplayPlayback.currentTime = THREE.MathUtils.clamp(
    demolitionReplayPlayback.currentTime + direction * Math.max(fixedDt, demolitionRecorderSampleIntervalSteps * fixedDt),
    0,
    demolitionReplayRecording.duration,
  );
  applyDemolitionReplayTime(getReplayDisplayTime());
}

function updateDemolitionReplayPlayback(): void {
  if (!demolitionReplayPlayback.active) {
    return;
  }

  const now = performance.now();
  const delta = Math.min(0.2, (now - demolitionReplayPlayback.lastTick) / 1000);

  demolitionReplayPlayback.lastTick = now;
  if (demolitionReplayPlayback.playing) {
    demolitionReplayPlayback.currentTime = THREE.MathUtils.clamp(
      demolitionReplayPlayback.currentTime + delta * demolitionReplayPlayback.speed,
      0,
      demolitionReplayRecording.duration,
    );
    if (demolitionReplayPlayback.currentTime >= demolitionReplayRecording.duration) {
      demolitionReplayPlayback.playing = false;
    }
  }

  applyDemolitionReplayTime(getReplayDisplayTime());
}

function updateReplayUiReadouts(): void {
  const selected = demolitionReplayPlayback.selectedWall;
  const selectedTrack = selected === 'all' ? null : demolitionReplayRecording.wallTracks.get(selected);
  const firstWallDestroyed = replayFaces
    .map((face) => demolitionReplayRecording.wallTracks.get(face)?.destroyedTime)
    .filter((time): time is number => typeof time === 'number')
    .sort((a, b) => a - b)[0] ?? null;
  const lastWallDestroyed = replayFaces
    .map((face) => demolitionReplayRecording.wallTracks.get(face)?.destroyedTime)
    .filter((time): time is number => typeof time === 'number')
    .sort((a, b) => b - a)[0] ?? null;

  lastReplayStatsText = [
    demolitionReplayRecording.recording ? 'Replay: recording demolition' : demolitionReplayRecording.complete ? 'Replay: ready' : 'Replay: waiting for first wall contact',
    `duration ${demolitionReplayRecording.duration.toFixed(2)}s`,
    `time ${demolitionReplayPlayback.currentTime.toFixed(2)}s`,
    `H ${demolitionReplayPlayback.speed.toFixed(2)}x`,
    `first hit ${demolitionReplayRecording.firstWallHit === null ? '-' : `${demolitionReplayRecording.firstWallHit.toFixed(2)}s`}`,
    `first destroyed ${firstWallDestroyed === null ? '-' : `${firstWallDestroyed.toFixed(2)}s`}`,
    `last destroyed ${lastWallDestroyed === null ? '-' : `${lastWallDestroyed.toFixed(2)}s`}`,
    `selected ${selected}`,
    `selected destroyed ${selectedTrack?.destroyedTime === null || !selectedTrack ? '-' : `${selectedTrack.destroyedTime.toFixed(2)}s`}`,
    `events ${selectedTrack ? selectedTrack.events.length : demolitionReplayRecording.events.length}`,
  ].join(' | ');
  lastReplayMarkerText = demolitionReplayRecording.events
    .slice(-10)
    .map((event) => `${event.timestamp.toFixed(1)} ${event.face ? `${event.face} ` : ''}${event.type}`)
    .join(' | ') || 'Markers: none';

  replayUiState.currentTime = Number(demolitionReplayPlayback.currentTime.toFixed(2));
  replayUiState.hValue = demolitionReplayPlayback.speed;
  replayUiState.selectedWall = demolitionReplayPlayback.selectedWall;
  replayUiState.focusSelectedWall = demolitionReplayPlayback.focusSelectedWall;
  replayUiState.isolateSelectedWall = demolitionReplayPlayback.isolateSelectedWall;
  replayUiState.showGhostOriginal = demolitionReplayPlayback.showGhostOriginal;
  replayUiState.reverseReconstruction = demolitionReplayPlayback.reverseReconstruction;
  replayUiState.cameraMode = demolitionReplayPlayback.cameraMode;
  replayUiState.stats = lastReplayStatsText;
  replayUiState.eventMarkers = lastReplayMarkerText;
  replayScrubController?.max(Math.max(0.1, demolitionReplayRecording.duration));
  replayUiControllers.forEach((controller) => controller.updateDisplay());
}

function addLightsAndGround(): void {
  if (!environmentVisualsCreated) {
    environmentVisualsCreated = true;
    scene.add(new THREE.HemisphereLight(0xdcecff, 0x59604d, 2.1));

    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-80, 120, 70);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -180;
    sun.shadow.camera.right = 180;
    sun.shadow.camera.top = 180;
    sun.shadow.camera.bottom = -180;
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.BoxGeometry(groundSize, 0.2, groundSize), materials.ground);
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(groundSize, 45, 0x40554e, 0x5e756a);
    grid.position.y = 0.012;
    scene.add(grid);
  }

  physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(groundSize / 2, 0.1, groundSize / 2).setFriction(1.35));
}

function createBulldozer(): void {
  bulldozer = createKinematicBox(
    'dozer-chassis',
    'bulldozer',
    new THREE.Vector3(1.45, 0.72, 2.15).multiplyScalar(bulldozerScale),
    new THREE.Vector3(0, dozerGroundY, 18),
    materials.bulldozer,
    240,
  );
  bulldozer.body.setAdditionalSolverIterations(2);

  const cab = createBoxMesh(cabHalf, materials.bulldozer);
  cab.position.copy(cabLocalOffset);
  bulldozer.mesh.add(cab);
  physicsWorld.createCollider(
    RAPIER.ColliderDesc.cuboid(cabHalf.x, cabHalf.y, cabHalf.z)
      .setTranslation(cabLocalOffset.x, cabLocalOffset.y, cabLocalOffset.z)
      .setFriction(2.6)
      .setRestitution(0.02),
    bulldozer.body,
  );

  const leftTrack = createBoxMesh(new THREE.Vector3(0.28, 0.18, 2.25).multiplyScalar(bulldozerScale), materials.deck);
  leftTrack.position.set(-1.36 * bulldozerScale, -0.55 * bulldozerScale, 0);
  bulldozer.mesh.add(leftTrack);

  const rightTrack = createBoxMesh(new THREE.Vector3(0.28, 0.18, 2.25).multiplyScalar(bulldozerScale), materials.deck);
  rightTrack.position.set(1.36 * bulldozerScale, -0.55 * bulldozerScale, 0);
  bulldozer.mesh.add(rightTrack);

  blade = createKinematicBox(
    'dozer-blade',
    'blade',
    bladeHalf,
    new THREE.Vector3(0, dozerGroundY - 0.2 * bulldozerScale, 18 - bladeMountDistance),
    materials.blade,
    88,
  );
  blade.body.setAdditionalSolverIterations(2);
}

function registerHouseBlock(
  entity: PhysicsEntity,
  face: HouseBlockFace,
  row: number,
  column: number,
  home: THREE.Vector3,
): PhysicsEntity {
  entity.wallBlock = {
    bulge: new THREE.Vector3(),
    column,
    face,
    home: home.clone(),
    row,
    sag: new THREE.Vector3(),
  };
  entity.mesh.userData.replayFace = face;
  wallBlocks.push(entity);
  registerStructuralNode(entity);
  return entity;
}

function addHouseFeature(
  entity: PhysicsEntity,
  face: HouseBlockFace,
  kind: 'door' | 'window',
): void {
  addHouseFeatureToMesh(entity.mesh, entity.halfExtents, face, kind);
}

function addHouseFeatureToMesh(
  mesh: THREE.Object3D,
  halfExtents: THREE.Vector3,
  face: HouseBlockFace,
  kind: 'door' | 'window',
): void {
  if (isRoofFace(face)) {
    return;
  }

  const onZFace = face === 'front' || face === 'back';
  const outwardSign = face === 'front' || face === 'right' ? 1 : -1;
  const maxHalfWidth = (onZFace ? halfExtents.x : halfExtents.z) * 1.28;
  const featureHalfWidth = kind === 'door'
    ? Math.min(maxHalfWidth, 5.8)
    : Math.min(maxHalfWidth * 0.72, 2.75);
  const featureHalfHeight = kind === 'door'
    ? Math.min(halfExtents.y * 2.08, 7.2)
    : Math.min(halfExtents.y * 0.58, 2.05);
  const frameHalf = onZFace
    ? new THREE.Vector3(featureHalfWidth, featureHalfHeight, 0.055)
    : new THREE.Vector3(0.055, featureHalfHeight, featureHalfWidth);
  const insetHalf = onZFace
    ? new THREE.Vector3(frameHalf.x * 0.72, frameHalf.y * (kind === 'door' ? 0.88 : 0.74), 0.062)
    : new THREE.Vector3(0.062, frameHalf.y * 0.74, frameHalf.z * 0.72);
  const frame = createBoxMesh(frameHalf, materials.concrete);
  const inset = createBoxMesh(insetHalf, kind === 'door' ? materials.door : materials.glass);
  const localY = kind === 'door' ? -halfExtents.y + featureHalfHeight + 0.12 : 0;

  frame.name = `${kind}-frame`;
  inset.name = `${kind}-inset`;
  frame.userData.houseFeature = { kind, part: 'frame' };
  inset.userData.houseFeature = { kind, part: 'inset' };

  if (onZFace) {
    const z = outwardSign * (halfExtents.z + 0.06);
    frame.position.set(0, localY, z);
    inset.position.set(0, localY, z + outwardSign * 0.056);
  } else {
    const x = outwardSign * (halfExtents.x + 0.06);
    frame.position.set(x, localY, 0);
    inset.position.set(x + outwardSign * 0.056, localY, 0);
  }

  mesh.add(frame);
  mesh.add(inset);
}

function getHouseFeatureKind(face: HouseBlockFace, row: number, column: number): 'door' | 'window' | null {
  const middleLeftColumn = Math.floor(wallBlockColumns / 2) - 1;
  const middleRightColumn = Math.floor(wallBlockColumns / 2);
  const frontBackWindowRows = new Set([1]);
  const sideWindowRows = new Set([1]);
  const frontBackDoor =
    face === 'front' &&
    row === 0 &&
    (column === middleLeftColumn || column === middleRightColumn);
  const frontBackWindow =
    (face === 'front' || face === 'back') &&
    frontBackWindowRows.has(row) &&
    column > 1 &&
    column < wallBlockColumns - 2 &&
    column % 4 === 2;
  const sideWindow =
    (face === 'left' || face === 'right') &&
    sideWindowRows.has(row) &&
    column > 0 &&
    column < wallSideColumns - 1 &&
    column % 4 === 2;

  if (frontBackDoor) {
    return 'door';
  }
  if (frontBackWindow || sideWindow) {
    return 'window';
  }
  return null;
}

function createChippedWallMesh(
  halfExtents: THREE.Vector3,
  material: THREE.Material,
  seed: number,
): THREE.Object3D {
  const group = new THREE.Group();
  const lengthAxis: 'x' | 'z' = halfExtents.x >= halfExtents.z ? 'x' : 'z';
  const length = halfExtents[lengthAxis] * 2;
  const height = halfExtents.y * 2;
  const depth = (lengthAxis === 'x' ? halfExtents.z : halfExtents.x) * 2;
  const rows = Math.max(1, Math.min(4, Math.round(height / masonryBrickHeight)));
  const columns = Math.max(2, Math.min(5, Math.round(length / masonryBrickLength)));
  const mortarGap = 0.12;
  const cellLength = length / columns;
  const cellHeight = height / rows;
  const brickDepth = Math.max(0.08, depth * 0.96);
  let visualBrickCount = 0;

  disposeGeneratedMaterial(material);

  for (let row = 0; row < rows; row += 1) {
    const rowOffset = row % 2 === 0 ? 0 : cellLength * 0.5;

    for (let column = 0; column < columns; column += 1) {
      const edgeTrim = (column === 0 || column === columns - 1) && row % 2 === 1 ? 0.5 : 1;
      const brickLength = Math.max(0.18, cellLength * edgeTrim - mortarGap);
      const brickHeight = Math.max(0.14, cellHeight - mortarGap);
      const chip = 0.93 + seededNoise(seed + row * 19 + column * 31) * 0.08;
      const brickHalf = lengthAxis === 'x'
        ? new THREE.Vector3(brickLength * 0.5 * chip, brickHeight * 0.5, brickDepth * 0.5)
        : new THREE.Vector3(brickDepth * 0.5, brickHeight * 0.5, brickLength * 0.5 * chip);
      const brickMaterialIndex =
        (row + column + Math.floor(seededNoise(seed + column * 7) * rubbleBrickMaterials.length)) % rubbleBrickMaterials.length;
      const brickMaterial = rubbleBrickMaterials[brickMaterialIndex] ?? materials.wall;
      const brick = createBoxMesh(
        brickHalf,
        brickMaterial,
      );
      const lengthCenter = -length * 0.5 + cellLength * 0.5 + column * cellLength + rowOffset;
      const wrappedLengthCenter = THREE.MathUtils.clamp(
        lengthCenter > length * 0.5 ? lengthCenter - length : lengthCenter,
        -length * 0.5 + brickLength * 0.5,
        length * 0.5 - brickLength * 0.5,
      );
      const y = -height * 0.5 + cellHeight * 0.5 + row * cellHeight;

      if (lengthAxis === 'x') {
        brick.position.set(wrappedLengthCenter, y, 0);
      } else {
        brick.position.set(0, y, wrappedLengthCenter);
      }

      brick.rotation.y = seededRange(seed + row * 43 + column * 11, -0.015, 0.015);
      brick.name = `independent-brick-${row}-${column}`;
      group.add(brick);
      visualBrickCount += 1;
    }
  }

  group.userData.independentBrickVisual = true;
  group.userData.visualBrickCount = visualBrickCount;
  group.userData.chippedWallSlab = false;
  return group;
}

function applyIrregularMasonryVisual(
  entity: PhysicsEntity,
  face: HouseBlockFace | 'fragment',
  row: number,
  seed: number,
): void {
  const position = entity.body.translation();
  const mesh = createChippedWallMesh(
    entity.halfExtents,
    createBrickMaterialForBox(entity.halfExtents, face, new THREE.Vector3(position.x, position.y, position.z), row),
    seed,
  );

  replaceEntityVisual(entity, mesh);
}

function replaceEntityVisual(entity: PhysicsEntity, mesh: THREE.Object3D): void {
  syncMeshFromBody(entity);
  const oldMesh = entity.mesh;

  mesh.name = `${entity.name}-visual`;
  mesh.position.copy(oldMesh.position);
  mesh.quaternion.copy(oldMesh.quaternion);
  mesh.scale.copy(oldMesh.scale);
  scene.remove(oldMesh);
  disposeObjectGeometry(oldMesh);
  entity.mesh = mesh;
  scene.add(mesh);
}

function spawnGlassShatter(entity: PhysicsEntity, featureKind: 'door' | 'window', impulse: THREE.Vector3): void {
  const info = entity.wallBlock;

  if (!info || featureKind !== 'window') {
    return;
  }

  const position = entity.body.translation();
  const rotation = entity.body.rotation();
  const center = new THREE.Vector3(position.x, position.y, position.z);
  const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const outward = getFaceFallDirection(info.face);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const shards = 7;
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x9bc7d3,
    opacity: 0.48,
    roughness: 0.25,
    side: THREE.DoubleSide,
    transparent: true,
  });

  glassMaterial.userData.generatedGlassShardMaterial = true;

  for (let index = 0; index < shards; index += 1) {
    const geometry = new THREE.BufferGeometry();
    const size = 0.35 + (index % 3) * 0.12;
    const vertices = new Float32Array([
      0, size, 0,
      -size * 0.65, -size * 0.45, 0,
      size * 0.72, -size * 0.3, 0,
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();

    const shard = new THREE.Mesh(geometry, glassMaterial);
    const localX = (index - (shards - 1) / 2) * 0.38;
    const localY = ((index % 3) - 1) * 0.32;

    shard.position.copy(center)
      .addScaledVector(right, localX)
      .addScaledVector(up, localY)
      .addScaledVector(outward, entity.halfExtents.z + 0.18);
    shard.quaternion.copy(quaternion);
    shard.rotation.z += (index - 3) * 0.22;
    scene.add(shard);
    settledDebrisVisuals.push(shard);
  }

  state.glassShatterEvents += 1;
  void impulse;
}

function spawnDoorPanel(entity: PhysicsEntity, impulse: THREE.Vector3): void {
  const info = entity.wallBlock;

  if (!info || getHouseFeatureKind(info.face, info.row, info.column) !== 'door') {
    return;
  }

  const position = entity.body.translation();
  const rotation = entity.body.rotation();
  const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const outward = getFaceFallDirection(info.face);
  const doorHalf = new THREE.Vector3(
    Math.max(1.1, entity.halfExtents.x * 0.42),
    Math.max(1.8, entity.halfExtents.y * 0.76),
    0.14,
  );
  const doorPosition = new THREE.Vector3(position.x, position.y - entity.halfExtents.y * 0.12, position.z)
    .addScaledVector(outward, entity.halfExtents.z + doorHalf.z + 0.12);
  const door = createDynamicBox(
    `${entity.name}-door-panel`,
    'debris',
    doorHalf,
    doorPosition,
    materials.door,
    16,
    quaternion,
    0.95,
    1.2,
  );
  const push = impulse.lengthSq() > 0.01 ? impulse.clone().normalize() : outward;

  door.body.setLinvel({ x: push.x * 3.2, y: -1.6, z: push.z * 3.2 }, true);
  door.body.setAngvel({ x: -outward.z * 1.9, y: 0.1, z: outward.x * 1.9 }, true);
  state.doorPanelsDropped += 1;
}

function decorateHouseBlock(entity: PhysicsEntity): void {
  const info = entity.wallBlock;

  if (!info || isRoofFace(info.face)) {
    return;
  }

  const featureKind = getHouseFeatureKind(info.face, info.row, info.column);

  if (featureKind) {
    addHouseFeature(entity, info.face, featureKind);
  }
}

function isPhysicalWallBlock(face: HouseBlockFace, row: number, column: number): boolean {
  if (isRoofFace(face)) {
    return true;
  }
  void row;
  void column;
  return true;
}

function isLowerPhysicalFacadeBlock(face: HouseBlockFace, row: number): boolean {
  return !isRoofFace(face) && row < physicalWallRows;
}

function getPhysicalFacadeRowKey(face: HouseBlockFace, row: number): string {
  return `${face}:${row}`;
}

function revealPhysicalFacadeRow(face: HouseBlockFace, row: number): void {
  if (!isLowerPhysicalFacadeBlock(face, row)) {
    return;
  }

  const key = getPhysicalFacadeRowKey(face, row);
  const facade = physicalFacadeRowVisuals.get(key);

  if (facade) {
    scene.remove(facade);
    disposeObjectGeometry(facade);
    staticWallVisuals = staticWallVisuals.filter((candidate) => candidate !== facade);
    physicalFacadeRowVisuals.delete(key);
  }

  for (const block of wallBlocks) {
    const info = block.wallBlock;

    if (info?.face === face && info.row === row && block.stage < 2) {
      block.mesh.visible = true;
    }
  }
}

function createPhysicalHouseBlock(
  name: string,
  face: HouseBlockFace,
  row: number,
  column: number,
  halfExtents: THREE.Vector3,
  position: THREE.Vector3,
): void {
  const entity = registerHouseBlock(
    createFixedBox(
      name,
      'wall',
      halfExtents,
      position,
      createBrickMaterialForBox(halfExtents, face, position, row),
      12,
      true,
    ),
    face,
    row,
    column,
    position,
  );

  if (!isRoofFace(face)) {
    replaceEntityVisual(
      entity,
      createIntactBrickWallVisual(
        halfExtents,
        row * 8191 + column * 131 + hashStringSeed(face),
        {
          brickHeight: masonryBrickHeight,
          brickLength: masonryBrickLength,
          castShadow: row < 2,
          doubleSided: true,
          face,
          maxColumns: face === 'front' || face === 'back' ? 8 : 8,
          maxRows: 6,
          worldPosition: position,
        },
      ),
    );
  }

  decorateHouseBlock(entity);
}

function createWallBuilding(): void {
  const blockWidth = solidWallWidth / wallBlockColumns;
  const blockHeight = solidWallHeight / wallBlockRows;
  const frontBackHalf = new THREE.Vector3(
    blockWidth / 2,
    blockHeight / 2,
    solidWallThickness / 2,
  );
  const sideBlockDepth = houseDepth / wallSideColumns;
  const sideHalf = new THREE.Vector3(solidWallThickness / 2, blockHeight / 2, sideBlockDepth / 2);
  const frontZ = solidWallZ;
  const backZ = solidWallZ - houseDepth;
  const leftX = -solidWallWidth / 2 - solidWallThickness / 2;
  const rightX = solidWallWidth / 2 + solidWallThickness / 2;
  const startX = -solidWallWidth / 2 + blockWidth / 2;
  const sideStartZ = frontZ - sideBlockDepth / 2;

  for (let row = 0; row < wallBlockRows; row += 1) {
    for (let column = 0; column < wallBlockColumns; column += 1) {
      const x = startX + column * blockWidth;
      const y = blockHeight / 2 + row * blockHeight;
      const frontPosition = new THREE.Vector3(x, y, frontZ);
      const backPosition = new THREE.Vector3(x, y, backZ);

      if (isPhysicalWallBlock('front', row, column)) {
        createPhysicalHouseBlock(
          `house-front-${row}-${column}`,
          'front',
          row,
          column,
          frontBackHalf,
          frontPosition,
        );
      }

      if (isPhysicalWallBlock('back', row, column)) {
        createPhysicalHouseBlock(
          `house-back-${row}-${column}`,
          'back',
          row,
          column,
          frontBackHalf,
          backPosition,
        );
      }
    }
  }

  for (let row = 0; row < wallBlockRows; row += 1) {
    for (let column = 0; column < wallSideColumns; column += 1) {
      const y = blockHeight / 2 + row * blockHeight;
      const z = sideStartZ - column * sideBlockDepth;
      const leftPosition = new THREE.Vector3(leftX, y, z);
      const rightPosition = new THREE.Vector3(rightX, y, z);

      if (isPhysicalWallBlock('left', row, column)) {
        createPhysicalHouseBlock(
          `house-left-${row}-${column}`,
          'left',
          row,
          column,
          sideHalf,
          leftPosition,
        );
      }
      if (isPhysicalWallBlock('right', row, column)) {
        createPhysicalHouseBlock(
          `house-right-${row}-${column}`,
          'right',
          row,
          column,
          sideHalf,
          rightPosition,
        );
      }
    }
  }

  const roofRise = 1.55 * houseScale;
  const roofOverhang = 0.48 * houseScale;
  const roofRun = houseDepth / 2 + roofOverhang;
  const roofSlopeLength = Math.hypot(roofRun, roofRise);
  const roofAngle = Math.atan2(roofRise, roofRun);
  const roofHalf = new THREE.Vector3(solidWallWidth / 2 + roofOverhang, 0.85, roofSlopeLength / 2);
  const roofY = solidWallHeight + roofRise / 2 + 0.32;
  const frontRoofPosition = new THREE.Vector3(0, roofY, houseCenterZ + roofRun / 2);
  const backRoofPosition = new THREE.Vector3(0, roofY, houseCenterZ - roofRun / 2);
  const frontRoofRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roofAngle);
  const backRoofRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -roofAngle);

  registerHouseBlock(
    createFixedBox(
      'house-roof-front',
      'wall',
      roofHalf,
      frontRoofPosition,
      materials.roof,
      36,
      true,
      frontRoofRotation,
    ),
    'roof-front',
    wallBlockRows,
    0,
    frontRoofPosition,
  );
  registerHouseBlock(
    createFixedBox(
      'house-roof-back',
      'wall',
      roofHalf,
      backRoofPosition,
      materials.roof,
      36,
      true,
      backRoofRotation,
    ),
    'roof-back',
    wallBlockRows,
    0,
    backRoofPosition,
  );
  rebuildStructuralGraph();
}

function resetPrototype(): void {
  resetDemolitionReplaySystem();
  clearPrototype();
  physicsWorld = new RAPIER.World({ x: 0, y: tuning.gravity, z: 0 });
  physicsWorld.integrationParameters.dt = fixedDt;
  physicsWorld.integrationParameters.numSolverIterations = 8;

  Object.assign(state, {
    bridgeCollapsed: false,
    carriedMass: 0,
    carriedPieces: 0,
    chippedWallSlabs: 0,
    columnStageBreaks: 0,
    deckPiecesDropped: 0,
    doorPanelsDropped: 0,
    glassShatterEvents: 0,
    impactEvents: 0,
    ready: true,
    secondaryWallImpacts: 0,
    structuralWallReleases: 0,
    visualWallImpacts: 0,
    wallBreaches: 0,
    wallDeformations: 0,
    wallPiecesBroken: 0,
  });
  dozerSpeed = 0;
  dozerYaw = 0;
  dozerTurnSpeed = 0;
  cameraPanOffset.set(0, 0, 0);
  cameraYaw = 0;
  cameraPitch = 0.48;
  cameraDistance = 64;
  fpsCameraYawOffset = 0;
  fpsCameraPitch = 0;
  setCameraFpsMode(false);
  simulationStep = 0;

  addLightsAndGround();
  createBulldozer();
  createWallBuilding();
}

function replaceFixedWithDynamic(entity: PhysicsEntity, impulse = new THREE.Vector3()): void {
  if (entity.body.isDynamic()) {
    return;
  }

  const position = entity.body.translation();
  const rotation = entity.body.rotation();

  physicsWorld.removeRigidBody(entity.body);
  entity.body = physicsWorld.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation)
      .setLinearDamping(entity.kind === 'wall' ? 1.15 : 0.42)
      .setAngularDamping(entity.kind === 'wall' ? 1.35 : 0.56)
      .setCcdEnabled(true),
  );
  physicsWorld.createCollider(
    RAPIER.ColliderDesc.cuboid(entity.halfExtents.x, entity.halfExtents.y, entity.halfExtents.z)
      .setFriction(entity.kind === 'wall' ? 0.94 : 0.76)
      .setRestitution(entity.kind === 'wall' ? 0.01 : 0.04)
      .setMass(entity.mass),
    entity.body,
  );
  const impulseScale = entity.kind === 'wall' ? 0.34 : 1;
  entity.body.applyImpulse({ x: impulse.x * impulseScale, y: impulse.y * impulseScale, z: impulse.z * impulseScale }, true);
  entity.kind = entity.kind === 'deck' ? 'deck' : 'debris';
  structuralDirty = true;
}

function isRoofFace(face: HouseBlockFace): boolean {
  return face === 'roof-front' || face === 'roof-back';
}

function getHouseFaceColumnCount(face: HouseBlockFace): number {
  return face === 'left' || face === 'right' ? wallSideColumns : wallBlockColumns;
}

function getHouseBlock(face: HouseBlockFace, row: number, column: number): PhysicsEntity | undefined {
  return wallBlocks.find((block) => {
    const info = block.wallBlock;
    return info?.face === face && info.row === row && info.column === column;
  });
}

function getStructuralNodeId(info: WallBlockInfo): string {
  return `${info.face}:${info.row}:${info.column}`;
}

function isStructuralEntityStanding(entity: PhysicsEntity): boolean {
  return entities.includes(entity) && entity.stage < 2 && !entity.body.isDynamic();
}

function registerStructuralNode(entity: PhysicsEntity): void {
  const info = entity.wallBlock;

  if (!info) {
    return;
  }

  structuralNodes.set(getStructuralNodeId(info), {
    active: true,
    centerOfMass: info.home.clone(),
    entity,
    fractureState: 'intact',
    id: getStructuralNodeId(info),
    islandId: -1,
    mass: entity.mass,
    material: isRoofFace(info.face) ? 'roofPanel' : 'brickMasonry',
    sleepState: 'fixed',
    support: !isRoofFace(info.face) && info.row === 0,
  });
  structuralDirty = true;
}

function clearStructuralGraph(): void {
  structuralNodes.clear();
  structuralBonds = [];
  wallFaceStress.clear();
  structuralDirty = true;
  lastStructuralStats = {
    brokenBonds: 0,
    islandCount: 0,
    nodes: 0,
    unsupportedIslands: 0,
    unsupportedNodes: new Set<string>(),
  };
}

function addStructuralBond(
  a: string,
  b: string,
  kind: StructuralBond['kind'],
  material: StructuralMaterialId,
  strengthScale = 1,
): void {
  if (a === b || !structuralNodes.has(a) || !structuralNodes.has(b)) {
    return;
  }

  const id = [a, b].sort().join('|');

  if (structuralBonds.some((bond) => bond.id === id)) {
    return;
  }

  const profile = materialProfiles[material];
  const randomness = seededRange(hashStringSeed(id), 0.86, 1.14);

  structuralBonds.push({
    a,
    b,
    broken: false,
    compressionStrength: profile.compressiveLimit * strengthScale * randomness,
    damageCompression: 0,
    damageShear: 0,
    damageTension: 0,
    damping: profile.damping,
    id,
    kind,
    material,
    randomness,
    shearStrength: profile.shearLimit * strengthScale * randomness,
    stiffness: profile.stiffness,
    tensionStrength: profile.tensileLimit * strengthScale * randomness,
  });
}

function rebuildStructuralGraph(): void {
  structuralBonds = [];

  const wallFaces: HouseBlockFace[] = ['front', 'back', 'left', 'right'];

  for (const face of wallFaces) {
    const columns = getHouseFaceColumnCount(face);

    for (let row = 0; row < wallBlockRows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const block = getHouseBlock(face, row, column);

        if (!block?.wallBlock) {
          continue;
        }

        const id = getStructuralNodeId(block.wallBlock);
        const right = getHouseBlock(face, row, column + 1);
        const above = getHouseBlock(face, row + 1, column);

        if (right?.wallBlock) {
          addStructuralBond(id, getStructuralNodeId(right.wallBlock), 'horizontal', 'mortarJoint', 1.08);
        }
        if (above?.wallBlock) {
          addStructuralBond(id, getStructuralNodeId(above.wallBlock), 'vertical', 'mortarJoint', 0.92);
        }
      }
    }
  }

  for (let row = 0; row < wallBlockRows; row += 1) {
    const frontLeft = getHouseBlock('front', row, 0);
    const leftFront = getHouseBlock('left', row, 0);
    const frontRight = getHouseBlock('front', row, wallBlockColumns - 1);
    const rightFront = getHouseBlock('right', row, 0);
    const backLeft = getHouseBlock('back', row, 0);
    const leftBack = getHouseBlock('left', row, wallSideColumns - 1);
    const backRight = getHouseBlock('back', row, wallBlockColumns - 1);
    const rightBack = getHouseBlock('right', row, wallSideColumns - 1);

    if (frontLeft?.wallBlock && leftFront?.wallBlock) {
      addStructuralBond(getStructuralNodeId(frontLeft.wallBlock), getStructuralNodeId(leftFront.wallBlock), 'corner', 'mortarJoint', 1.18);
    }
    if (frontRight?.wallBlock && rightFront?.wallBlock) {
      addStructuralBond(getStructuralNodeId(frontRight.wallBlock), getStructuralNodeId(rightFront.wallBlock), 'corner', 'mortarJoint', 1.18);
    }
    if (backLeft?.wallBlock && leftBack?.wallBlock) {
      addStructuralBond(getStructuralNodeId(backLeft.wallBlock), getStructuralNodeId(leftBack.wallBlock), 'corner', 'mortarJoint', 1.18);
    }
    if (backRight?.wallBlock && rightBack?.wallBlock) {
      addStructuralBond(getStructuralNodeId(backRight.wallBlock), getStructuralNodeId(rightBack.wallBlock), 'corner', 'mortarJoint', 1.18);
    }
  }

  const frontRoof = getHouseBlock('roof-front', wallBlockRows, 0);
  const backRoof = getHouseBlock('roof-back', wallBlockRows, 0);

  if (frontRoof?.wallBlock) {
    const roofId = getStructuralNodeId(frontRoof.wallBlock);

    for (let column = 0; column < wallBlockColumns; column += 1) {
      const top = getHouseBlock('front', wallBlockRows - 1, column);
      if (top?.wallBlock) {
        addStructuralBond(roofId, getStructuralNodeId(top.wallBlock), 'roof-seat', 'roofPanel', 0.74);
      }
    }
  }

  if (backRoof?.wallBlock) {
    const roofId = getStructuralNodeId(backRoof.wallBlock);

    for (let column = 0; column < wallBlockColumns; column += 1) {
      const top = getHouseBlock('back', wallBlockRows - 1, column);
      if (top?.wallBlock) {
        addStructuralBond(roofId, getStructuralNodeId(top.wallBlock), 'roof-seat', 'roofPanel', 0.74);
      }
    }
  }

  structuralDirty = true;
  updateStructuralSupportGraph();
}

function updateStructuralSupportGraph(force = false): StructuralSupportSnapshot {
  if (!force && !structuralDirty) {
    return lastStructuralStats;
  }

  const activeNodeIds = new Set<string>();

  for (const node of structuralNodes.values()) {
    node.active = isStructuralEntityStanding(node.entity);
    const bodyStillExists = entities.includes(node.entity);
    const bodyIsDynamic = bodyStillExists ? node.entity.body.isDynamic() : false;

    node.sleepState = bodyIsDynamic ? 'dynamic' : 'fixed';
    node.fractureState = node.entity.stage >= 2 || !bodyStillExists ? 'fractured' : bodyIsDynamic ? 'dynamic' : 'intact';
    node.centerOfMass.copy(node.entity.wallBlock?.home ?? node.entity.mesh.position);
    node.islandId = -1;

    if (node.active) {
      activeNodeIds.add(node.id);
    }
  }

  const adjacency = new Map<string, string[]>();

  for (const id of activeNodeIds) {
    adjacency.set(id, []);
  }

  for (const bond of structuralBonds) {
    if (bond.broken || !activeNodeIds.has(bond.a) || !activeNodeIds.has(bond.b)) {
      continue;
    }

    adjacency.get(bond.a)?.push(bond.b);
    adjacency.get(bond.b)?.push(bond.a);
  }

  const unsupportedNodes = new Set<string>();
  const visited = new Set<string>();
  let islandCount = 0;
  let unsupportedIslands = 0;

  for (const id of activeNodeIds) {
    if (visited.has(id)) {
      continue;
    }

    const stack = [id];
    const component: string[] = [];
    let hasSupport = false;

    while (stack.length > 0) {
      const current = stack.pop();

      if (!current || visited.has(current)) {
        continue;
      }

      visited.add(current);
      component.push(current);
      const node = structuralNodes.get(current);

      if (node?.support) {
        hasSupport = true;
      }

      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }

    for (const componentId of component) {
      const node = structuralNodes.get(componentId);
      if (node) {
        node.islandId = islandCount;
      }
    }

    if (!hasSupport) {
      unsupportedIslands += 1;
      component.forEach((componentId) => unsupportedNodes.add(componentId));
    }

    islandCount += 1;
  }

  lastStructuralStats = {
    brokenBonds: structuralBonds.filter((bond) => bond.broken).length,
    islandCount,
    nodes: activeNodeIds.size,
    unsupportedIslands,
    unsupportedNodes,
  };
  structuralDirty = false;
  return lastStructuralStats;
}

function isStructuralNodeUnsupported(info: WallBlockInfo, snapshot = updateStructuralSupportGraph()): boolean {
  return snapshot.unsupportedNodes.has(getStructuralNodeId(info));
}

function breakStructuralNodeBonds(info: WallBlockInfo): void {
  const id = getStructuralNodeId(info);
  let changed = false;

  for (const bond of structuralBonds) {
    if (!bond.broken && (bond.a === id || bond.b === id)) {
      bond.broken = true;
      changed = true;
    }
  }

  if (changed) {
    structuralDirty = true;
  }
}

function applyStructuralDamage(entity: PhysicsEntity, amount: number, impulse: THREE.Vector3): void {
  const info = entity.wallBlock;

  if (!info || isRoofFace(info.face) || entity.stage >= 2) {
    return;
  }

  const id = getStructuralNodeId(info);
  const speedLike = Math.min(2.4, impulse.length() * 0.18);
  const verticalLoad = Math.max(0, -impulse.y);
  let changed = false;

  for (const bond of structuralBonds) {
    if (bond.broken || (bond.a !== id && bond.b !== id)) {
      continue;
    }

    const directionScale = bond.kind === 'vertical' ? 1.12 : bond.kind === 'horizontal' ? 0.82 : 0.96;

    bond.damageShear += amount * (0.42 + speedLike) * directionScale;
    bond.damageTension += Math.max(0, amount * 0.18 + impulse.y * 0.22);
    bond.damageCompression += verticalLoad * 0.2;

    if (
      bond.damageShear >= bond.shearStrength ||
      bond.damageTension >= bond.tensionStrength ||
      bond.damageCompression >= bond.compressionStrength
    ) {
      bond.broken = true;
      changed = true;
    }
  }

  if (changed) {
    structuralDirty = true;
  }
}

function getWallBlock(row: number, column: number): PhysicsEntity | undefined {
  return getHouseBlock('front', row, column);
}

function getFaceFallDirection(face: HouseBlockFace): THREE.Vector3 {
  switch (face) {
    case 'back':
      return new THREE.Vector3(0, 0, 1);
    case 'left':
      return new THREE.Vector3(-1, 0, 0);
    case 'right':
      return new THREE.Vector3(1, 0, 0);
    case 'roof-back':
      return new THREE.Vector3(0, 0.2, 1);
    case 'roof-front':
    case 'front':
    default:
      return new THREE.Vector3(0, 0, -1);
  }
}

function getFaceLowResistanceDirection(face: HouseBlockFace): THREE.Vector3 {
  switch (face) {
    case 'back':
      return new THREE.Vector3(0, 0, -1);
    case 'left':
      return new THREE.Vector3(1, 0, 0);
    case 'right':
      return new THREE.Vector3(-1, 0, 0);
    case 'roof-back':
      return new THREE.Vector3(0, 0.2, -1);
    case 'roof-front':
    case 'front':
    default:
      return new THREE.Vector3(0, 0, 1);
  }
}

function removeEntityFromWorld(entity: PhysicsEntity): void {
  if (entity.wallBlock) {
    breakStructuralNodeBonds(entity.wallBlock);
  }
  physicsWorld.removeRigidBody(entity.body);
  scene.remove(entity.mesh);
  disposeObjectGeometry(entity.mesh);
  entities = entities.filter((candidate) => candidate !== entity);
  wallBlocks = wallBlocks.filter((candidate) => candidate !== entity);
  structuralDirty = true;
}

function getDynamicDebrisCount(): number {
  return entities.filter((entity) => entity.body.isDynamic() && entity.kind === 'debris' && !entity.carried).length;
}

function getIndependentBrickVisualCount(): number {
  let count = 0;

  for (const entity of entities) {
    count += Number(entity.mesh.userData.visualBrickCount ?? 0);
  }

  for (const object of settledDebrisVisuals) {
    count += Number(object.userData.visualBrickCount ?? 0);
  }

  return count;
}

function getIntactBrickVisualCount(): number {
  let count = 0;

  for (const entity of entities) {
    if (entity.mesh.visible) {
      count += Number(entity.mesh.userData.intactBrickVisualCount ?? 0);
    }
  }

  for (const object of staticWallVisuals) {
    if (object.visible) {
      count += Number(object.userData.intactBrickVisualCount ?? 0);
    }
  }

  return count;
}

function getAirborneDynamicDebrisCount(): number {
  if (simulationStep - lastDebugSupportSampleStep < debugSupportSampleInterval) {
    return cachedAirborneDynamicDebris;
  }

  lastDebugSupportSampleStep = simulationStep;
  cachedAirborneDynamicDebris = 0;

  for (const entity of entities) {
    if (
      entity.body.isDynamic() &&
      entity.kind === 'debris' &&
      !entity.carried &&
      entity.body.translation().y - entity.halfExtents.y > 0.45 &&
      !hasGroundOrBodySupport(entity)
    ) {
      cachedAirborneDynamicDebris += 1;
    }
  }

  return cachedAirborneDynamicDebris;
}

function getUnsupportedStaticVisualBlockCount(): number {
  if (simulationStep - lastStaticVisualSupportSampleStep < debugSupportSampleInterval) {
    return cachedUnsupportedStaticVisualBlocks;
  }

  lastStaticVisualSupportSampleStep = simulationStep;
  cachedUnsupportedStaticVisualBlocks = 0;

  for (const object of staticWallVisuals) {
    const info = getStaticWallVisualInfo(object);

    if (info && info.row >= physicalWallRows && !isHouseColumnSupported(info.face, info.row, info.column)) {
      cachedUnsupportedStaticVisualBlocks += 1;
    }
  }

  return cachedUnsupportedStaticVisualBlocks;
}

function settleEntityAsVisual(entity: PhysicsEntity): void {
  if (entity.carried || !entity.body.isDynamic()) {
    return;
  }

  syncMeshFromBody(entity);
  entity.mesh.userData.settledDebris = {
    halfExtents: entity.halfExtents.clone(),
    mass: entity.mass,
    name: entity.name,
  };
  physicsWorld.removeRigidBody(entity.body);
  entities = entities.filter((candidate) => candidate !== entity);
  wallBlocks = wallBlocks.filter((candidate) => candidate !== entity);
  entity.mesh.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = false;
      object.receiveShadow = true;
    }
  });
  settledDebrisVisuals.push(entity.mesh);
}

function hasGroundOrBodySupport(entity: PhysicsEntity): boolean {
  const position = entity.body.translation();
  const bottomY = position.y - entity.halfExtents.y;

  if (bottomY <= 0.28) {
    return true;
  }

  const entityAabb = getEntityWorldAabb(entity);

  for (const other of entities) {
    if (other === entity || other.carried) {
      continue;
    }

    if (other.body.isDynamic()) {
      const velocity = other.body.linvel();
      const speedSq = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;

      if (speedSq > 0.18) {
        continue;
      }
    }

    const otherAabb = getEntityWorldAabb(other);
    const verticalGap = bottomY - otherAabb.max.y;
    const overlapsX = entityAabb.min.x <= otherAabb.max.x + 0.12 && entityAabb.max.x >= otherAabb.min.x - 0.12;
    const overlapsZ = entityAabb.min.z <= otherAabb.max.z + 0.12 && entityAabb.max.z >= otherAabb.min.z - 0.12;

    if (verticalGap >= -0.08 && verticalGap <= 0.38 && overlapsX && overlapsZ) {
      return true;
    }
  }

  return false;
}

function hasGroundSupportForSettling(entity: PhysicsEntity): boolean {
  const position = entity.body.translation();
  return position.y - entity.halfExtents.y <= 0.34;
}

function getFloatingSettledDebrisCount(): number {
  let count = 0;

  for (const object of settledDebrisVisuals) {
    const data = object.userData.settledDebris as { halfExtents?: THREE.Vector3 } | undefined;
    const halfExtents = data?.halfExtents;

    if (halfExtents && object.position.y - halfExtents.y > 0.45) {
      count += 1;
    }
  }

  return count;
}

function reactivateSettledDebrisNearBulldozer(): void {
  if (settledDebrisVisuals.length === 0) {
    return;
  }

  const dozerPosition = bulldozer.body.translation();

  for (const object of [...settledDebrisVisuals]) {
    const data = object.userData.settledDebris as { halfExtents?: THREE.Vector3; mass?: number; name?: string } | undefined;
    const halfExtents = data?.halfExtents;

    if (!halfExtents) {
      continue;
    }

    const distance = Math.hypot(object.position.x - dozerPosition.x, object.position.z - dozerPosition.z);
    const reactivationRange = debrisReactivationDistance + Math.max(halfExtents.x, halfExtents.z);

    if (distance > reactivationRange) {
      continue;
    }

    const rotation = object.quaternion;
    const body = physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(object.position.x, object.position.y, object.position.z)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
        .setLinearDamping(1.05)
        .setAngularDamping(1.25)
        .setCcdEnabled(true),
    );

    physicsWorld.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setFriction(0.82)
        .setRestitution(0.02)
        .setMass(data.mass ?? 4),
      body,
    );

    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
      }
    });
    object.userData.settledDebris = undefined;
    settledDebrisVisuals = settledDebrisVisuals.filter((candidate) => candidate !== object);

    entities.push({
      body,
      breakable: false,
      carried: false,
      createdStep: simulationStep,
      damage: 0,
      halfExtents: halfExtents.clone(),
      kind: 'debris',
      lastImpactStep: -999,
      mass: data.mass ?? 4,
      mesh: object,
      name: data.name ?? 'reactivated-rubble',
      settleCandidateSteps: 0,
      stage: 2,
    });
  }
}

function settleDynamicRubble(): void {
  const dozerPosition = bulldozer.body.translation();
  const dynamicRubble = entities
    .filter((entity) => entity.body.isDynamic() && entity.kind === 'debris' && !entity.carried)
    .sort((a, b) => a.createdStep - b.createdStep);
  let activeCount = dynamicRubble.length;

  for (const entity of dynamicRubble) {
    if (activeCount <= maxLiveDynamicDebris) {
      break;
    }

    const position = entity.body.translation();
    const distanceFromDozer = Math.hypot(position.x - dozerPosition.x, position.z - dozerPosition.z);
    const structuralCollapseGraceSteps = entity.mesh.userData.structuralCollapseDebris
      ? distanceFromDozer < 8 ? 100 : 42
      : 18;

    if (
      simulationStep - entity.createdStep < structuralCollapseGraceSteps ||
      distanceFromDozer < 1.2 ||
      !hasGroundSupportForSettling(entity)
    ) {
      continue;
    }

    settleEntityAsVisual(entity);
    activeCount -= 1;
  }

  for (const entity of [...entities]) {
    if (!entity.body.isDynamic() || entity.kind !== 'debris' || entity.carried) {
      continue;
    }

    const age = simulationStep - entity.createdStep;
    const velocity = entity.body.linvel();
    const angularVelocity = entity.body.angvel();
    const position = entity.body.translation();
    const speedSq = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;
    const angularSq = angularVelocity.x * angularVelocity.x + angularVelocity.y * angularVelocity.y + angularVelocity.z * angularVelocity.z;
    const distanceFromDozer = Math.hypot(position.x - dozerPosition.x, position.z - dozerPosition.z);
    const isStructuralCollapseDebris = Boolean(entity.mesh.userData.structuralCollapseDebris);
    const structuralNearDozer = isStructuralCollapseDebris && distanceFromDozer < 8;
    const minSettleAge = isStructuralCollapseDebris ? (structuralNearDozer ? 150 : 64) : dynamicDebrisMinAgeSteps;
    const settleSteps = isStructuralCollapseDebris ? (structuralNearDozer ? dynamicDebrisSettleSteps * 3 : dynamicDebrisSettleSteps) : dynamicDebrisSettleSteps;
    const oldDebrisSettleAge = isStructuralCollapseDebris ? (structuralNearDozer ? 520 : 180) : 240;

    if (
      age > minSettleAge &&
      distanceFromDozer > debrisSettleDistanceFromDozer &&
      hasGroundSupportForSettling(entity) &&
      speedSq < 0.18 &&
      angularSq < 0.22
    ) {
      entity.settleCandidateSteps += 1;
    } else {
      entity.settleCandidateSteps = 0;
    }

    if (
      entity.settleCandidateSteps >= settleSteps ||
      (age > oldDebrisSettleAge && distanceFromDozer > debrisSettleDistanceFromDozer * 1.2 && hasGroundSupportForSettling(entity))
    ) {
      settleEntityAsVisual(entity);
    }
  }
}

function createFrontWallChunksFromImpact(impulse: THREE.Vector3, impactInfo?: WallBlockInfo): boolean {
  void impulse;
  void impactInfo;
  // Large temporary wall slabs looked like whole walls falling as one unit in the 10x house.
  // Keep impacts as local block deformation/fracture until a better masonry chunk solver exists.
  return false;
}

function fragmentWallChunk(chunk: WallChunk): void {
  if (chunk.fragmented) {
    return;
  }

  const position = chunk.entity.body.translation();
  const rotation = chunk.entity.body.rotation();
  const chunkCenter = new THREE.Vector3(position.x, position.y, position.z);
  const chunkRotation = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const chunkVelocity = chunk.entity.body.linvel();
  const outward = getFaceFallDirection('front');
  const destructionSpeed = getDestructionSpeed();

  removeEntityFromWorld(chunk.entity);

  let createdFragmentPieces = 0;
  chunk.sourceBricks.forEach((brick, index) => {
    const worldOffset = brick.localOffset.clone().applyQuaternion(chunkRotation);
    const columnSpread = (brick.column - (wallBlockColumns - 1) / 2) * 0.055;
    const rowDrop = Math.max(0, brick.row - 2) * 0.035;
    const brickPosition = chunkCenter.clone()
      .add(worldOffset)
      .add(new THREE.Vector3(columnSpread, -rowDrop, outward.z * (0.08 + rowDrop)));
    const spread = (brick.column - (wallBlockColumns - 1) / 2) * 0.06;
    const shouldShard = brick.row >= 3;
    const piecesX = shouldShard ? 2 : 1;
    const piecesY = shouldShard ? (brick.row >= Math.floor(wallBlockRows * 0.58) ? 3 : 2) : 1;
    const pieceHalf = shouldShard
      ? new THREE.Vector3(
        Math.max(0.16, brick.halfExtents.x / piecesX - 0.035),
        Math.max(0.14, brick.halfExtents.y / piecesY - 0.035),
        Math.max(0.08, brick.halfExtents.z * 0.92),
      )
      : brick.halfExtents;

    for (let xIndex = 0; xIndex < piecesX; xIndex += 1) {
      for (let yIndex = 0; yIndex < piecesY; yIndex += 1) {
        const localX = shouldShard ? (xIndex - (piecesX - 1) / 2) * brick.halfExtents.x : 0;
        const localY = shouldShard ? (yIndex - (piecesY - 1) / 2) * (brick.halfExtents.y * 2 / piecesY) : 0;
        const piecePosition = brickPosition.clone()
          .add(new THREE.Vector3(localX, localY, (xIndex % 2 === 0 ? -0.035 : 0.035)).applyQuaternion(chunkRotation));
        const brickEntity = createDynamicBox(
          shouldShard ? `${brick.name}-fragment-shard-${xIndex}-${yIndex}` : `${brick.name}-fragment`,
          'debris',
          pieceHalf,
          piecePosition,
          createBrickMaterialForBox(pieceHalf, 'fragment', piecePosition, brick.row),
          shouldShard ? Math.max(1.5, brick.mass / (piecesX * piecesY)) : brick.mass,
          chunkRotation,
          shouldShard ? 0.38 : 0.44,
          shouldShard ? 0.62 : 0.7,
        );
        brickEntity.body.setGravityScale(1.35, true);
        applyIrregularMasonryVisual(
          brickEntity,
          'fragment',
          brick.row,
          brick.row * 131 + brick.column * 41 + xIndex * 17 + yIndex * 23 + simulationStep,
        );
        const shardKick = shouldShard ? (xIndex - 0.5) * 0.35 * destructionSpeed : 0;

        brickEntity.body.setLinvel(
          {
            x: chunkVelocity.x * 0.55 + spread + shardKick,
            y: Math.min(-1.15, chunkVelocity.y * 0.22 - (1.15 + brick.row * 0.12) * destructionSpeed),
            z: chunkVelocity.z * 0.55 + outward.z * (0.42 + brick.row * 0.05) * destructionSpeed,
          },
          true,
        );
        brickEntity.body.setAngvel(
          {
            x: ((index % 3 - 1) * 0.16 + (yIndex - 0.5) * 0.18) * destructionSpeed,
            y: (spread * 0.9 + shardKick * 0.45) * destructionSpeed,
            z: ((brick.row - 3) * 0.06 + (xIndex - 0.5) * 0.16) * destructionSpeed,
          },
          true,
        );
        createdFragmentPieces += 1;
      }
    }
  });

  chunk.fragmented = true;
  state.wallPiecesBroken += createdFragmentPieces;
}

function processWallChunks(): void {
  for (const chunk of wallChunks) {
    if (chunk.fragmented) {
      continue;
    }

    const height = chunk.entity.body.translation().y;
    const shouldFragment = simulationStep >= chunk.fragmentAfterStep || height < 1.6 || chunk.entity.damage > getWallBreakDamage() * 2.2;

    if (shouldFragment) {
      fragmentWallChunk(chunk);
    }
  }

  wallChunks = wallChunks.filter((chunk) => !chunk.fragmented);
}

function applyWallBulge(entity: PhysicsEntity, impulse: THREE.Vector3, amount: number): void {
  const info = entity.wallBlock;

  if (!info || isRoofFace(info.face) || entity.body.isDynamic() || entity.stage >= 2) {
    return;
  }

  const push = new THREE.Vector3(impulse.x, 0, impulse.z);

  if (push.lengthSq() < 0.001) {
    return;
  }

  push.normalize();
  const baseAmount = THREE.MathUtils.clamp(amount * 0.24, 0.55, 2.35);

  for (const block of wallBlocks) {
    const blockInfo = block.wallBlock;

    if (!blockInfo || blockInfo.face !== info.face || isRoofFace(blockInfo.face) || block.stage >= 2 || block.body.isDynamic()) {
      continue;
    }

    const rowDistance = Math.abs(blockInfo.row - info.row);
    const columnDistance = Math.abs(blockInfo.column - info.column);
    const falloff = Math.max(0, 1 - rowDistance * 0.46 - columnDistance * 0.32);

    if (falloff <= 0) {
      continue;
    }

    blockInfo.bulge.addScaledVector(push, baseAmount * falloff);
    if (blockInfo.bulge.length() > wallBulgeLimit) {
      blockInfo.bulge.setLength(wallBulgeLimit);
    }

    revealPhysicalFacadeRow(blockInfo.face, blockInfo.row);
    syncMeshFromBody(block);
    applyWallBlockVisualDeformation(block);
  }
}

function fragmentRoofPanel(entity: PhysicsEntity, _impulse: THREE.Vector3, detachOffset?: THREE.Vector3): void {
  const info = entity.wallBlock;

  if (!info || !isRoofFace(info.face)) {
    return;
  }
  addDemolitionReplayEvent('roof-collapse', `${info.face} roof collapse`, info.face);

  const position = entity.body.translation();
  const rotation = entity.body.rotation();
  const center = new THREE.Vector3(position.x, position.y, position.z);
  const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const baseVelocity = entity.body.isDynamic() ? entity.body.linvel() : { x: 0, y: 0, z: 0 };
  const destructionSpeed = getDestructionSpeed();
  const sourceName = entity.name;
  const sourceMass = entity.mass;
  const slabHalf = entity.halfExtents.clone();

  slabHalf.x *= 0.96;
  slabHalf.z *= 0.96;

  removeEntityFromWorld(entity);

  const roofSlab = createDynamicBox(
    `${sourceName}-collapsed-slab`,
    'debris',
    slabHalf,
    center.clone().add(detachOffset ?? new THREE.Vector3()),
    materials.roof,
    sourceMass,
    quaternion,
    0.42,
    0.62,
  );

  roofSlab.mesh.userData.roofCollapseDebris = true;
  roofSlab.mesh.userData.maxRoofCollapseY = center.y + 0.38;
  roofSlab.mesh.userData.replayFace = info.face;
  roofSlab.body.setGravityScale(2.15, true);
  roofSlab.body.setLinearDamping(0.72);
  roofSlab.body.setAngularDamping(1.6);
  roofSlab.body.setLinvel(
    {
      x: baseVelocity.x * 0.06,
      y: Math.min(-1.65, baseVelocity.y * 0.02 - 0.85 * destructionSpeed),
      z: baseVelocity.z * 0.06,
    },
    true,
  );
  roofSlab.body.setAngvel(
    {
      x: info.face === 'roof-front' ? -0.05 * destructionSpeed : 0.05 * destructionSpeed,
      y: 0,
      z: 0,
    },
    true,
  );

  state.wallPiecesBroken += 1;
  state.wallDeformations = state.wallPiecesBroken;
}

function breakWallBlock(entity: PhysicsEntity, impulse: THREE.Vector3, detachOffset?: THREE.Vector3): void {
  if (entity.stage >= 2) {
    return;
  }

  if (entity.wallBlock && !isRoofFace(entity.wallBlock.face) && entity.wallBlock.row < physicalWallRows) {
    getWallFaceStress(entity.wallBlock.face).lastBearingContactStep = simulationStep;
  }

  if (entity.wallBlock && isRoofFace(entity.wallBlock.face)) {
    entity.stage = 2;
    breakStructuralNodeBonds(entity.wallBlock);
    fragmentRoofPanel(entity, impulse, detachOffset);
    return;
  }

  if (entity.wallBlock) {
    addDemolitionReplayEvent('wall-destroyed', `${entity.wallBlock.face} block destroyed`, entity.wallBlock.face, entity.damage);
    breakStructuralNodeBonds(entity.wallBlock);
    revealPhysicalFacadeRow(entity.wallBlock.face, entity.wallBlock.row);
  }

  const featureKind = entity.wallBlock
    ? getHouseFeatureKind(entity.wallBlock.face, entity.wallBlock.row, entity.wallBlock.column)
    : null;

  if (featureKind === 'door') {
    spawnDoorPanel(entity, impulse);
  } else if (featureKind === 'window') {
    spawnGlassShatter(entity, featureKind, impulse);
  }

  entity.stage = 2;
  state.wallPiecesBroken += 1;
  state.wallDeformations = state.wallPiecesBroken;
  state.wallBreaches = 1;
  if (entity.wallBlock) {
    fragmentBrokenWallBlock(entity, impulse, detachOffset);
    return;
  }

  replaceFixedWithDynamic(entity, impulse);
  applyIrregularMasonryVisual(entity, 'fragment', 0, hashStringSeed(entity.name) + simulationStep);

  if (detachOffset) {
    const position = entity.body.translation();

    entity.body.setTranslation(
      {
        x: position.x + detachOffset.x,
        y: Math.max(entity.halfExtents.y, position.y + detachOffset.y),
        z: position.z + detachOffset.z,
      },
      true,
    );
  }

  entity.body.setAngvel(
    {
      x: -impulse.z * 0.12,
      y: impulse.x * 0.06,
      z: impulse.x * 0.12,
    },
    true,
  );
}

function fragmentBrokenWallBlock(entity: PhysicsEntity, impulse: THREE.Vector3, detachOffset?: THREE.Vector3): void {
  const info = entity.wallBlock;

  if (!info) {
    return;
  }

  if (replaceWallBlockWithIndependentBrickBodies(entity, impulse, detachOffset, true)) {
    state.wallDeformations = state.wallPiecesBroken;
    return;
  }

  releaseWallBlockAsVisibleDebris(entity, impulse, detachOffset);
  state.wallDeformations = state.wallPiecesBroken;
}

function releaseWallBlockAsVisibleDebris(
  entity: PhysicsEntity,
  impulse: THREE.Vector3,
  detachOffset?: THREE.Vector3,
  retainWallBlockInfo = false,
): void {
  const retainedWallBlock = entity.wallBlock;

  if (entity.wallBlock) {
    breakStructuralNodeBonds(entity.wallBlock);
  }

  wallBlocks = wallBlocks.filter((candidate) => candidate !== entity);
  entity.wallBlock = retainWallBlockInfo ? retainedWallBlock : undefined;
  entity.mesh.userData.visualBrickCount = Math.max(
    1,
    Number(entity.mesh.userData.visualBrickCount ?? 0),
    Number(entity.mesh.userData.intactBrickVisualCount ?? 0),
  );
  entity.mesh.userData.intactBrickVisual = false;
  entity.mesh.userData.intactBrickVisualCount = 0;
  entity.createdStep = simulationStep;
  entity.settleCandidateSteps = 0;

  if (retainWallBlockInfo && retainedWallBlock && !entity.body.isDynamic()) {
    applyWallBlockVisualDeformation(entity);
    entity.mesh.updateMatrixWorld(true);
    const visualPosition = entity.mesh.getWorldPosition(new THREE.Vector3());
    const visualRotation = entity.mesh.getWorldQuaternion(new THREE.Quaternion());

    entity.body.setTranslation(
      {
        x: visualPosition.x,
        y: Math.max(entity.halfExtents.y, visualPosition.y),
        z: visualPosition.z,
      },
      true,
    );
    entity.body.setRotation(
      {
        w: visualRotation.w,
        x: visualRotation.x,
        y: visualRotation.y,
        z: visualRotation.z,
      },
      true,
    );
  }

  replaceFixedWithDynamic(entity, impulse);
  entity.kind = 'debris';

  if (detachOffset) {
    const position = entity.body.translation();

    entity.body.setTranslation(
      {
        x: position.x + detachOffset.x,
        y: Math.max(entity.halfExtents.y, position.y + detachOffset.y),
        z: position.z + detachOffset.z,
      },
      true,
    );
  }

  const velocity = entity.body.linvel();
  const fall = impulse.lengthSq() > 0.01 ? impulse.clone().normalize() : new THREE.Vector3(0, -1, 0);
  const structuralCollapseBoost = entity.mesh.userData.structuralCollapseDebris ? 1.55 : 1;

  entity.body.setGravityScale(1.18, true);
  entity.body.setLinvel(
    {
      x: velocity.x + fall.x * 0.65 * structuralCollapseBoost,
      y: Math.min(velocity.y, entity.mesh.userData.structuralCollapseDebris ? -0.82 : -0.55),
      z: velocity.z + fall.z * 0.65 * structuralCollapseBoost,
    },
    true,
  );
  entity.body.setAngvel(
    {
      x: -fall.z * 0.45 * structuralCollapseBoost,
      y: fall.x * 0.18,
      z: fall.x * 0.45 * structuralCollapseBoost,
    },
    true,
  );
  structuralDirty = true;
}

function releaseWallBlockForStructuralCollapse(entity: PhysicsEntity, impulse: THREE.Vector3, detachOffset?: THREE.Vector3): boolean {
  if (!entity.wallBlock || entity.stage >= 2 || entity.body.isDynamic()) {
    return false;
  }

  const info = entity.wallBlock;
  const featureKind = getHouseFeatureKind(info.face, info.row, info.column);

  revealPhysicalFacadeRow(info.face, info.row);

  if (featureKind === 'door') {
    spawnDoorPanel(entity, impulse);
  } else if (featureKind === 'window') {
    spawnGlassShatter(entity, featureKind, impulse);
  }

  entity.stage = 2;
  state.wallPiecesBroken += 1;
  state.wallDeformations = state.wallPiecesBroken;
  state.wallBreaches = 1;
  entity.mesh.userData.structuralCollapseDebris = true;
  entity.mesh.userData.structuralCollapseFace = info.face;
  entity.mesh.userData.replayFace = info.face;
  addDemolitionReplayEvent('wall-detached', `${info.face} detached`, info.face, entity.damage);
  releaseWallBlockAsVisibleDebris(entity, impulse, detachOffset, true);
  entity.body.setAngularDamping(3.4);
  entity.body.setLinearDamping(0.72);
  return true;
}

function replaceWallBlockWithIndependentBrickBodies(
  entity: PhysicsEntity,
  impulse: THREE.Vector3,
  detachOffset?: THREE.Vector3,
  force = false,
): boolean {
  const info = entity.wallBlock;

  const dynamicDebrisCount = getDynamicDebrisCount();
  const debrisPressure = dynamicDebrisCount / maxLiveDynamicDebris;

  if (!info || (!force && debrisPressure > 0.5)) {
    return false;
  }

  const position = entity.body.translation();
  const rotation = entity.body.rotation();
  const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const lengthAxis: 'x' | 'z' = entity.halfExtents.x >= entity.halfExtents.z ? 'x' : 'z';
  const sourceCenter = new THREE.Vector3(position.x, position.y, position.z);
  const brickCells = collectWorldBrickGridCells(entity.halfExtents, sourceCenter);
  const requestedCount = brickCells.length;
  const maxExtra = Math.max(0, Math.floor(maxLiveDynamicDebris * (force ? 1.1 : 0.82) - dynamicDebrisCount));
  const allowedCount = requestedCount;

  if (requestedCount <= 0 || requestedCount > maxExtra) {
    return false;
  }

  const selectedBrickCells = brickCells.slice(0, allowedCount);

  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
  const center = sourceCenter.clone().add(detachOffset ?? new THREE.Vector3());
  const push = impulse.clone();

  if (push.lengthSq() < 0.01) {
    push.copy(getFaceFallDirection(info.face));
  }
  push.normalize();

  const baseVelocity = entity.body.isDynamic() ? entity.body.linvel() : { x: 0, y: 0, z: 0 };
  const destructionSpeed = getDestructionSpeed();
  const sourceMass = Math.max(0.2, entity.mass / allowedCount);
  const sourceName = entity.name;

  removeEntityFromWorld(entity);
  state.wallPiecesBroken += Math.max(0, allowedCount - 1);
  state.wallBreaches = 1;

  selectedBrickCells.forEach((cell, index) => {
    const seed = info.row * 211 + info.column * 67 + cell.row * 19 + cell.column * 31 + simulationStep;
    const brickHalf = cell.scale.clone().multiplyScalar(0.5);
    const local = lengthAxis === 'x'
      ? right.clone().multiplyScalar(cell.localLengthCenter)
      : forward.clone().multiplyScalar(cell.localLengthCenter);
    const brickPosition = center.clone()
      .add(local)
      .addScaledVector(up, cell.localY);
    const brickMaterialIndex =
      (cell.row + cell.column + Math.floor(seededNoise(seed + 7) * rubbleBrickMaterials.length)) % rubbleBrickMaterials.length;
    const brick = createDynamicBox(
      `${sourceName}-independent-brick-${index}`,
      'debris',
      brickHalf,
      brickPosition,
      rubbleBrickMaterials[brickMaterialIndex] ?? materials.wall,
      sourceMass,
      quaternion,
      0.38,
      0.66,
    );
    const spread = cell.localLengthCenter * 0.018;

    brick.mesh.userData.visualBrickCount = 1;
    brick.mesh.userData.replayFace = info.face;
    brick.body.setGravityScale(1.35, true);
    brick.body.setLinvel(
      {
        x: baseVelocity.x * 0.28 + push.x * (0.48 + info.row * 0.025) * destructionSpeed + right.x * spread,
        y: Math.min(-0.95, baseVelocity.y * 0.12 - (0.85 + info.row * 0.05) * destructionSpeed),
        z: baseVelocity.z * 0.28 + push.z * (0.48 + info.row * 0.025) * destructionSpeed + right.z * spread,
      },
      true,
    );
    brick.body.setAngvel(
      {
        x: seededRange(seed + 1, -0.22, 0.22),
        y: seededRange(seed + 2, -0.18, 0.18),
        z: seededRange(seed + 3, -0.22, 0.22),
      },
      true,
    );
  });

  return true;
}

function getFaceLowerSupportRatio(face: HouseBlockFace): number {
  if (isRoofFace(face)) {
    return 1;
  }

  const columnCount = getHouseFaceColumnCount(face);
  let totalSlots = 0;
  let standing = 0;

  for (let row = 0; row < physicalWallRows; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      if (!isPhysicalWallBlock(face, row, column)) {
        continue;
      }

      totalSlots += 1;
      const block = getHouseBlock(face, row, column);

      if (block && block.stage < 2 && !block.body.isDynamic()) {
        standing += 1;
      }
    }
  }

  if (totalSlots === 0) {
    return 0;
  }

  return standing / totalSlots;
}

function getFaceFoundationSupportRatio(face: HouseBlockFace): number {
  if (isRoofFace(face)) {
    return 1;
  }

  const columnCount = getHouseFaceColumnCount(face);
  let totalSlots = 0;
  let standing = 0;

  for (let column = 0; column < columnCount; column += 1) {
    if (!isPhysicalWallBlock(face, 0, column)) {
      continue;
    }

    totalSlots += 1;
    const block = getHouseBlock(face, 0, column);

    if (block && block.stage < 2 && !block.body.isDynamic()) {
      standing += 1;
    }
  }

  if (totalSlots === 0) {
    return 0;
  }

  return standing / totalSlots;
}

function getFaceFoundationMissingRunRatio(face: HouseBlockFace): number {
  if (isRoofFace(face)) {
    return 0;
  }

  const columnCount = getHouseFaceColumnCount(face);
  let totalSlots = 0;
  let longestMissingRun = 0;
  let currentMissingRun = 0;

  for (let column = 0; column < columnCount; column += 1) {
    if (!isPhysicalWallBlock(face, 0, column)) {
      continue;
    }

    totalSlots += 1;
    const block = getHouseBlock(face, 0, column);
    const missing = !block || block.stage >= 2 || block.body.isDynamic();

    if (missing) {
      currentMissingRun += 1;
      longestMissingRun = Math.max(longestMissingRun, currentMissingRun);
    } else {
      currentMissingRun = 0;
    }
  }

  if (totalSlots === 0) {
    return 0;
  }

  return longestMissingRun / totalSlots;
}

function getFoundationCollapseThreshold(face: HouseBlockFace): number {
  return isRoofFace(face) ? 0 : 0.26;
}

function isFaceLaterallyUnstable(face: HouseBlockFace): boolean {
  if (isRoofFace(face)) {
    return false;
  }

  const wallFaces: HouseBlockFace[] = ['front', 'back', 'left', 'right'];
  const lostWalls = wallFaces.filter((candidate) => getFaceLowerSupportRatio(candidate) < 0.35).length;

  return lostWalls >= 3 && getFaceLowerSupportRatio(face) < 0.72;
}

function isHouseFaceBroadlyUndermined(face: HouseBlockFace, supportRatio = getSupportReleaseRatio()): boolean {
  if (isRoofFace(face)) {
    return false;
  }

  const foundationRatio = getFaceFoundationSupportRatio(face);
  const foundationThreshold = getFoundationCollapseThreshold(face);

  return (
    getFaceLowerSupportRatio(face) < supportRatio ||
    foundationRatio < foundationThreshold ||
    isFaceLaterallyUnstable(face)
  );
}

function getWallFaceStress(face: HouseBlockFace): WallFaceStress {
  const existing = wallFaceStress.get(face);

  if (existing) {
    return existing;
  }

  const created: WallFaceStress = {
    collapse: 0,
    criticalBearingSteps: 0,
    direction: 0,
    foundationRatio: 1,
    imbalance: 0,
    lastBearingContactStep: -9999,
    lean: 0,
    supportRatio: 1,
  };

  wallFaceStress.set(face, created);
  return created;
}

function getFaceLowerSupportImbalance(face: HouseBlockFace): Pick<WallFaceStress, 'direction' | 'imbalance' | 'supportRatio'> {
  if (isRoofFace(face)) {
    return { direction: 0, imbalance: 0, supportRatio: 1 };
  }

  const columnCount = getHouseFaceColumnCount(face);
  let totalSlots = 0;
  let standing = 0;
  let signedStanding = 0;

  for (let row = 0; row < physicalWallRows; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      if (!isPhysicalWallBlock(face, row, column)) {
        continue;
      }

      totalSlots += 1;
      const block = getHouseBlock(face, row, column);

      if (block && block.stage < 2 && !block.body.isDynamic()) {
        const signedColumn = columnCount <= 1 ? 0 : (column / (columnCount - 1)) * 2 - 1;

        standing += 1;
        signedStanding += signedColumn;
      }
    }
  }

  if (totalSlots === 0 || standing === 0) {
    return { direction: 0, imbalance: 0, supportRatio: 0 };
  }

  const supportRatio = standing / totalSlots;
  const supportCenter = signedStanding / standing;
  const direction = supportCenter > 0.04 ? -1 : supportCenter < -0.04 ? 1 : 0;
  const imbalance = Math.abs(supportCenter) * (1 - supportRatio);

  return { direction, imbalance, supportRatio };
}

function getFallbackLeanDirection(face: HouseBlockFace): number {
  const columnCount = getHouseFaceColumnCount(face);
  let standingSigned = 0;
  let brokenSigned = 0;

  for (let row = 0; row < physicalWallRows; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      if (!isPhysicalWallBlock(face, row, column)) {
        continue;
      }

      const signedColumn = columnCount <= 1 ? 0 : (column / (columnCount - 1)) * 2 - 1;
      const block = getHouseBlock(face, row, column);

      if (block && block.stage < 2 && !block.body.isDynamic()) {
        standingSigned += signedColumn;
      } else {
        brokenSigned += signedColumn;
      }
    }
  }

  if (Math.abs(brokenSigned) > 0.01) {
    return brokenSigned > 0 ? 1 : -1;
  }

  if (Math.abs(standingSigned) > 0.01) {
    return standingSigned > 0 ? -1 : 1;
  }

  return face === 'back' || face === 'right' ? 1 : -1;
}

function updateWallGravitySag(): void {
  const wallFaces: HouseBlockFace[] = ['front', 'back', 'left', 'right'];

  for (const face of wallFaces) {
    const stress = getWallFaceStress(face);
    const support = getFaceLowerSupportImbalance(face);
    const foundationRatio = getFaceFoundationSupportRatio(face);
    const criticalBearingFailure = isWallFaceCriticallyBearingFailed(face);
    const foundationIsCatastrophic = foundationRatio < getFoundationCollapseThreshold(face);
    const effectiveSupportRatio = foundationIsCatastrophic
      ? Math.min(support.supportRatio, foundationRatio * 1.25)
      : support.supportRatio;
    const imbalanceLean = support.supportRatio < 0.62 && support.imbalance > 0.1
      ? THREE.MathUtils.clamp((0.62 - support.supportRatio) * 1.15 + support.imbalance * 0.95, 0, 1)
      : 0;
    const foundationLean = effectiveSupportRatio < 0.62
      ? THREE.MathUtils.clamp((0.62 - effectiveSupportRatio) * 1.45 + Math.max(0, 0.34 - foundationRatio) * 1.8, 0, 1)
      : 0;
    const targetLean = criticalBearingFailure ? 1 : Math.max(imbalanceLean, foundationLean);

    if (criticalBearingFailure) {
      stress.direction = support.direction || stress.direction || getFallbackLeanDirection(face);
      const bearingContactIsQuiet = simulationStep - stress.lastBearingContactStep > 24;
      stress.criticalBearingSteps = bearingContactIsQuiet ? stress.criticalBearingSteps + 1 : 0;
    } else {
      stress.criticalBearingSteps = 0;
    }

    if (!criticalBearingFailure && imbalanceLean > 0) {
      stress.direction = support.direction || stress.direction || getFallbackLeanDirection(face);
    } else if (!criticalBearingFailure && foundationLean > 0 && stress.direction === 0) {
      stress.direction = getFallbackLeanDirection(face);
    }
    stress.foundationRatio = foundationRatio;
    stress.imbalance = support.imbalance;
    stress.supportRatio = effectiveSupportRatio;
    const criticalLeanSpeed = getCriticalBearingLeanSpeed();
    const leanDamping = criticalBearingFailure ? criticalLeanSpeed : targetLean > stress.lean ? 2.4 : 4.8;
    const collapseRate = criticalBearingFailure ? criticalLeanSpeed * 0.92 : 0.75 + (1 - effectiveSupportRatio) * 0.8;

    stress.lean = THREE.MathUtils.damp(stress.lean, targetLean, leanDamping, fixedDt);
    stress.collapse = THREE.MathUtils.clamp(
      stress.collapse + Math.max(0, stress.lean - (criticalBearingFailure ? 0.08 : 0.35)) * fixedDt * collapseRate,
      0,
      1,
    );
  }

  for (const block of wallBlocks) {
    const info = block.wallBlock;

    if (!info || isRoofFace(info.face)) {
      continue;
    }

    const stress = getWallFaceStress(info.face);
    const heightFactor = wallBlockRows <= 1 ? 0 : info.row / (wallBlockRows - 1);
    const columnCount = getHouseFaceColumnCount(info.face);
    const signedColumn = columnCount <= 1 ? 0 : (info.column / (columnCount - 1)) * 2 - 1;
    const activeDirection = stress.direction || getFallbackLeanDirection(info.face);
    const weakSideFactor = THREE.MathUtils.clamp(0.58 + -signedColumn * activeDirection * 0.22, 0.34, 0.92);
    const targetDownSag = -stress.lean * (0.035 + heightFactor * 0.34) * weakSideFactor;
    const sagDamping = stress.lean > 0.02 ? 5.2 : 8.5;

    info.sag.set(
      THREE.MathUtils.damp(info.sag.x, 0, sagDamping, fixedDt),
      THREE.MathUtils.damp(info.sag.y, targetDownSag, sagDamping, fixedDt),
      THREE.MathUtils.damp(info.sag.z, 0, sagDamping, fixedDt),
    );

    if (block.stage < 2 && !block.body.isDynamic()) {
      applyWallBlockVisualDeformation(block);
    }
  }
}

function hasActiveWallFaceStress(): boolean {
  const wallFaces: HouseBlockFace[] = ['front', 'back', 'left', 'right'];

  return wallFaces.some((face) => {
    const stress = getWallFaceStress(face);
    const support = getFaceLowerSupportImbalance(face);
    const foundationRatio = getFaceFoundationSupportRatio(face);
    const effectiveSupportRatio = foundationRatio < getFoundationCollapseThreshold(face)
      ? Math.min(support.supportRatio, foundationRatio * 1.25)
      : support.supportRatio;

    return stress.lean > 0.01 || effectiveSupportRatio < 0.62 || (support.supportRatio < 0.62 && support.imbalance > 0.1);
  });
}

function releaseFaceCollapseBand(face: HouseBlockFace, releaseBudget: number, rowSpan: number, collapsePower: number): number {
  const columnCount = getHouseFaceColumnCount(face);
  const fallDirection = getFaceLowResistanceDirection(face);
  const includeFoundationRow = rowSpan >= wallBlockRows;
  const candidates = wallBlocks
    .filter((block) => {
      const info = block.wallBlock;
      return info?.face === face && info.row >= (includeFoundationRow ? 0 : 1) && block.stage < 2 && !block.body.isDynamic();
    });

  if (candidates.length === 0) {
    return 0;
  }

  const highestRow = Math.max(...candidates.map((block) => block.wallBlock?.row ?? -1));
  const lowestReleasedRow = Math.max(includeFoundationRow ? 0 : 1, highestRow - Math.max(0, rowSpan - 1));
  const coherentBudget = Math.max(releaseBudget, columnCount * rowSpan);
  const selected = candidates
    .filter((block) => {
      const row = block.wallBlock?.row ?? -1;
      return row <= highestRow && row >= lowestReleasedRow;
    })
    .sort((a, b) => {
      const aInfo = a.wallBlock;
      const bInfo = b.wallBlock;

      if (!aInfo || !bInfo) {
        return 0;
      }

      if (aInfo.row !== bInfo.row) {
        return bInfo.row - aInfo.row;
      }

      return aInfo.column - bInfo.column;
    })
    .slice(0, coherentBudget);
  let released = 0;

  for (const block of selected) {
    const info = block.wallBlock;

    if (!info) {
      continue;
    }

    const lateralImpulse = (info.column - (columnCount - 1) / 2) * 0.012;
    const rowFactor = info.row / Math.max(1, wallBlockRows - 1);
    const impulse = fallDirection.clone().multiplyScalar(collapsePower + rowFactor * 0.72).setY(-0.58 - rowFactor * 0.22);
    const detach = fallDirection.clone().multiplyScalar(0.18 + rowFactor * 0.16).setY(-0.1);

    if (face === 'front' || face === 'back') {
      impulse.x += lateralImpulse;
      detach.x += lateralImpulse * 0.2;
    } else {
      impulse.z += lateralImpulse;
      detach.z += lateralImpulse * 0.2;
    }

    if (releaseWallBlockForStructuralCollapse(block, impulse, detach)) {
      state.structuralWallReleases += 1;
      released += 1;
    }
  }

  return released;
}

function isWallFaceFlatFallReady(face: HouseBlockFace): boolean {
  const stress = getWallFaceStress(face);
  const forwardPanelLean = Math.abs(getWallFaceForwardPanelLeanAngle(face));
  const sidePanelLean = Math.abs(getWallFacePanelLeanAngle(face));

  return (
    (forwardPanelLean > 1.48 || sidePanelLean > 1.06) &&
    stress.lean > 0.68 &&
    stress.supportRatio < 0.72
  );
}

function isWallFaceCriticallyBearingFailed(face: HouseBlockFace): boolean {
  if (isRoofFace(face)) {
    return false;
  }

  const foundationRatio = getFaceFoundationSupportRatio(face);
  const lowerSupportRatio = getFaceLowerSupportRatio(face);
  const missingRunRatio = getFaceFoundationMissingRunRatio(face);

  return (
    foundationRatio <= 0.34 ||
    missingRunRatio >= 0.62 ||
    (foundationRatio < getFoundationCollapseThreshold(face) && lowerSupportRatio < 0.32)
  );
}

function isBulldozerBlockingFallingFace(face: HouseBlockFace): boolean {
  if (!bulldozer || !blade) {
    return false;
  }

  const forwardPanelLean = Math.abs(getWallFaceForwardPanelLeanAngle(face));
  const sidePanelLean = Math.abs(getWallFacePanelLeanAngle(face));
  const panelLean = Math.max(forwardPanelLean, sidePanelLean);

  if (panelLean < 1.28) {
    return false;
  }

  const fallDirection = getFaceLowResistanceDirection(face);
  const dozerPosition = bulldozer.body.translation();
  const dozerForward = getBodyForward(bulldozer.body, new THREE.Vector3()).clone();
  const dozerRight = getBodyRight(bulldozer.body, new THREE.Vector3()).clone();
  const bladePosition = getBladeWorldPosition(new THREE.Vector3());
  const obstacles = [
    {
      center: new THREE.Vector3(dozerPosition.x, dozerPosition.y, dozerPosition.z),
      half: bulldozer.halfExtents,
    },
    {
      center: new THREE.Vector3(dozerPosition.x, dozerPosition.y, dozerPosition.z)
        .addScaledVector(dozerRight, cabLocalOffset.x)
        .addScaledVector(dozerForward, -cabLocalOffset.z)
        .setY(dozerPosition.y + cabLocalOffset.y),
      half: cabHalf,
    },
    {
      center: bladePosition,
      half: bladeHalf,
    },
  ];
  const projectedReach = Math.sin(panelLean) * solidWallHeight + 1.2;
  const faceHalfSpan = face === 'front' || face === 'back' ? solidWallWidth / 2 : houseDepth / 2;
  const facePlane = face === 'front'
    ? solidWallZ
    : face === 'back'
      ? solidWallZ - houseDepth
      : face === 'left'
        ? -solidWallWidth / 2 - solidWallThickness / 2
        : solidWallWidth / 2 + solidWallThickness / 2;

  return obstacles.some(({ center, half }) => {
    const horizontalRadius = Math.max(half.x, half.z) + 0.85;
    const verticalTop = center.y + half.y;

    if (verticalTop < 0.35) {
      return false;
    }

    if (face === 'front' || face === 'back') {
      const outwardDistance = (center.z - facePlane) * fallDirection.z;

      return (
        outwardDistance > -horizontalRadius &&
        outwardDistance < projectedReach + horizontalRadius &&
        Math.abs(center.x) < faceHalfSpan + horizontalRadius
      );
    }

    const outwardDistance = (center.x - facePlane) * fallDirection.x;

    return (
      outwardDistance > -horizontalRadius &&
      outwardDistance < projectedReach + horizontalRadius &&
      Math.abs(center.z - houseCenterZ) < faceHalfSpan + horizontalRadius
    );
  });
}

function isCriticalBearingPanelReleaseReady(face: HouseBlockFace): boolean {
  if (!isWallFaceCriticallyBearingFailed(face)) {
    return true;
  }

  const stress = getWallFaceStress(face);
  const forwardPanelLean = Math.abs(getWallFaceForwardPanelLeanAngle(face));
  const sidePanelLean = Math.abs(getWallFacePanelLeanAngle(face));
  const delayFrames = getCriticalBearingDelayFrames();
  const bulldozerIsBlockingFall = isBulldozerBlockingFallingFace(face);
  const criticalLeanVisible = stress.criticalBearingSteps > delayFrames;
  const criticalPanelNearFloor =
    forwardPanelLean > 1.48 ||
    sidePanelLean > 1.06 ||
    stress.criticalBearingSteps > delayFrames + 1000;

  return criticalLeanVisible && (bulldozerIsBlockingFall || criticalPanelNearFloor);
}

function releaseWallFaceToFallFlat(face: HouseBlockFace, collapsePower: number): number {
  const fallDirection = getFaceLowResistanceDirection(face);
  const columnCount = getHouseFaceColumnCount(face);
  const candidates = wallBlocks
    .filter((block) => {
      const info = block.wallBlock;
      return info?.face === face && block.stage < 2 && !block.body.isDynamic();
    })
    .sort((a, b) => {
      const aInfo = a.wallBlock;
      const bInfo = b.wallBlock;

      if (!aInfo || !bInfo) {
        return 0;
      }

      if (aInfo.row !== bInfo.row) {
        return bInfo.row - aInfo.row;
      }

      return aInfo.column - bInfo.column;
    });
  let released = 0;

  for (const block of candidates) {
    const info = block.wallBlock;

    if (!info) {
      continue;
    }

    const rowFactor = info.row / Math.max(1, wallBlockRows - 1);
    const lateralImpulse = (info.column - (columnCount - 1) / 2) * 0.01;
    const outwardSpeed = collapsePower + rowFactor * 1.35;
    const impulse = fallDirection.clone().multiplyScalar(outwardSpeed).setY(-2.8 - rowFactor * 1.2);
    const detach = fallDirection.clone().multiplyScalar(0.36 + rowFactor * 0.26).setY(-0.22);

    if (face === 'front' || face === 'back') {
      impulse.x += lateralImpulse;
      detach.x += lateralImpulse * 0.2;
    } else {
      impulse.z += lateralImpulse;
      detach.z += lateralImpulse * 0.2;
    }

    if (releaseWallBlockForStructuralCollapse(block, impulse, detach)) {
      const spin = 0.72 + rowFactor * 0.18;
      block.body.setGravityScale(1.55, true);
      block.body.setLinvel(
        {
          x: fallDirection.x * (2.5 + rowFactor * 1.1),
          y: -3.4 - rowFactor * 1.1,
          z: fallDirection.z * (2.5 + rowFactor * 1.1),
        },
        true,
      );
      block.body.setAngvel(
        {
          x: -fallDirection.z * spin,
          y: 0,
          z: fallDirection.x * spin,
        },
        true,
      );
      state.structuralWallReleases += 1;
      released += 1;
    }
  }

  return released;
}

function releaseLeaningWallBlocks(releaseBudget: number): number {
  if (releaseBudget <= 0) {
    return 0;
  }

  const wallFaces: HouseBlockFace[] = ['front', 'back', 'left', 'right'];
  let released = 0;

  for (const face of wallFaces) {
    if (released >= releaseBudget) {
      break;
    }

    const stress = getWallFaceStress(face);
    const forwardPanelLean = Math.abs(getWallFaceForwardPanelLeanAngle(face));
    const sidePanelLean = Math.abs(getWallFacePanelLeanAngle(face));
    const panelTipOverReady =
      (forwardPanelLean > 1.48 || sidePanelLean > 1.06) &&
      stress.lean > 0.72 &&
      stress.supportRatio < 0.56;

    if (isWallFaceFlatFallReady(face)) {
      const flatReleased = releaseWallFaceToFallFlat(face, 4.1 + Math.max(forwardPanelLean, sidePanelLean));

      if (flatReleased > 0) {
        stress.collapse = 0;
        released += flatReleased;
        continue;
      }
    }

    if (isWallFaceCriticallyBearingFailed(face) && !isCriticalBearingPanelReleaseReady(face)) {
      continue;
    }

    if (!panelTipOverReady && (stress.lean < 0.72 || stress.collapse < 0.62 || stress.supportRatio > 0.58)) {
      continue;
    }

    const rowSpan = panelTipOverReady ? wallBlockRows : stress.collapse > 0.7 ? 3 : 2;
    const bandReleased = releaseFaceCollapseBand(
      face,
      releaseBudget - released,
      rowSpan,
      panelTipOverReady ? 2.8 + Math.max(forwardPanelLean, sidePanelLean) : 1.2 + stress.collapse * 1.45,
    );

    if (bandReleased > 0) {
      stress.collapse = Math.max(0, stress.collapse - 0.06 * bandReleased);
      released += bandReleased;
    }
  }

  return released;
}

function getWallInwardSign(face: HouseBlockFace): number {
  return face === 'front' || face === 'left' ? -1 : 1;
}

function getWallFacePanelLeanAngle(face: HouseBlockFace): number {
  if (isRoofFace(face)) {
    return 0;
  }

  const stress = getWallFaceStress(face);

  if (stress.lean < 0.02) {
    return 0;
  }

  const activeDirection = stress.direction || getFallbackLeanDirection(face);
  const supportLoss = THREE.MathUtils.clamp(0.62 - stress.supportRatio, 0, 0.62);
  const angleMagnitude = THREE.MathUtils.clamp(
    stress.lean * (0.1 + supportLoss * 0.8 + stress.collapse * 0.46),
    0,
    1.08,
  );

  return face === 'front' || face === 'back'
    ? -activeDirection * angleMagnitude
    : activeDirection * angleMagnitude;
}

function getWallFaceForwardPanelLeanAngle(face: HouseBlockFace): number {
  if (isRoofFace(face)) {
    return 0;
  }

  const stress = getWallFaceStress(face);

  if (stress.lean < 0.02) {
    return 0;
  }

  const supportLoss = THREE.MathUtils.clamp(0.62 - stress.supportRatio, 0, 0.62);
  const angleMagnitude = THREE.MathUtils.clamp(
    stress.lean * (0.12 + supportLoss * 0.92 + stress.collapse * 1.08),
    0,
    1.5,
  );
  const fallDirection = getFaceLowResistanceDirection(face);

  if (face === 'front' || face === 'back') {
    return fallDirection.z * angleMagnitude;
  }

  return -fallDirection.x * angleMagnitude;
}

function getWallFaceLeanPivot(entity: PhysicsEntity, info: WallBlockInfo): THREE.Vector3 {
  const blockHeight = Math.max(0.1, entity.halfExtents.y * 2);
  const bottomY = info.home.y - info.row * blockHeight - entity.halfExtents.y;

  if (info.face === 'front' || info.face === 'back') {
    return new THREE.Vector3(0, bottomY, info.home.z);
  }

  return new THREE.Vector3(info.home.x, bottomY, houseCenterZ);
}

function applyWallBlockVisualDeformation(entity: PhysicsEntity): void {
  const info = entity.wallBlock;

  if (!info || isRoofFace(info.face)) {
    return;
  }

  const normalBulge = info.face === 'front' || info.face === 'back' ? info.bulge.z : info.bulge.x;
  const sideBulge = info.face === 'front' || info.face === 'back' ? info.bulge.x : info.bulge.z;
  const sag = Math.max(0, -info.sag.y);
  const bow = Math.min(0.18, Math.abs(normalBulge) * 0.12);
  const shear = THREE.MathUtils.clamp(sideBulge * 0.01, -0.035, 0.035);
  const sagCrush = Math.min(0.08, sag * 0.018);
  const sagBow = Math.min(0.06, sag * 0.035);
  const bodyRotation = entity.body.rotation();
  const baseRotation = new THREE.Euler().setFromQuaternion(
    tempQuat.set(bodyRotation.x, bodyRotation.y, bodyRotation.z, bodyRotation.w),
  );
  const inwardSign = getWallInwardSign(info.face);
  const inwardDent = THREE.MathUtils.clamp(normalBulge * inwardSign, 0, 0.58);
  const outwardDent = THREE.MathUtils.clamp(-normalBulge * inwardSign, 0, 0.025);
  const visualOffset = inwardSign * inwardDent - inwardSign * outwardDent;
  const panelLeanAngle = getWallFacePanelLeanAngle(info.face);
  const forwardLeanAngle = getWallFaceForwardPanelLeanAngle(info.face);
  const panelLeanAxis = info.face === 'front' || info.face === 'back'
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(1, 0, 0);
  const forwardLeanAxis = info.face === 'front' || info.face === 'back'
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 0, 1);
  const pivot = getWallFaceLeanPivot(entity, info);
  const panelPosition = info.home.clone()
    .sub(pivot)
    .applyAxisAngle(forwardLeanAxis, forwardLeanAngle)
    .applyAxisAngle(panelLeanAxis, panelLeanAngle)
    .add(pivot);

  entity.mesh.scale.set(1, 1, 1);
  entity.mesh.scale.y = 1 - sagCrush;
  entity.mesh.position.copy(panelPosition);
  entity.mesh.position.y += info.sag.y;

  if (info.face === 'front' || info.face === 'back') {
    entity.mesh.position.z += visualOffset;
    entity.mesh.scale.z = 1 + bow + sagBow + inwardDent * 0.12;
    entity.mesh.rotation.set(
      baseRotation.x + THREE.MathUtils.clamp(forwardLeanAngle, -1.5, 1.5),
      baseRotation.y + THREE.MathUtils.clamp(normalBulge * 0.055 + shear, -0.1, 0.1),
      baseRotation.z + THREE.MathUtils.clamp(panelLeanAngle + sideBulge * 0.008 - info.sag.y * 0.01, -1.08, 1.08),
    );
  } else {
    entity.mesh.position.x += visualOffset;
    entity.mesh.scale.x = 1 + bow + sagBow + inwardDent * 0.12;
    entity.mesh.rotation.set(
      baseRotation.x + THREE.MathUtils.clamp(-info.sag.y * 0.01 + panelLeanAngle, -1.08, 1.08),
      baseRotation.y,
      baseRotation.z + THREE.MathUtils.clamp(forwardLeanAngle - normalBulge * 0.055 + shear, -1.5, 1.5),
    );
  }
}

function releaseUnsupportedWallBlocks(): void {
  const wallFaces: HouseBlockFace[] = ['front', 'back', 'left', 'right'];
  const supportSnapshot = updateStructuralSupportGraph();
  let releasedThisStep = 0;

  for (const face of wallFaces) {
    if (releasedThisStep >= maxUnsupportedWallBlockReleasesPerStep) {
      break;
    }

    const columnCount = getHouseFaceColumnCount(face);
    const fallDirection = getFaceFallDirection(face);
    const faceIsLaterallyUnstable = isFaceLaterallyUnstable(face);
    const faceIsBroadlyUndermined = isHouseFaceBroadlyUndermined(face);
    const foundationRatio = getFaceFoundationSupportRatio(face);
    const faceFoundationUndermined = foundationRatio < getFoundationCollapseThreshold(face);
    const criticalBearingFailure = isWallFaceCriticallyBearingFailed(face);
    const stress = getWallFaceStress(face);
    const forwardPanelLean = Math.abs(getWallFaceForwardPanelLeanAngle(face));
    const sidePanelLean = Math.abs(getWallFacePanelLeanAngle(face));
    const panelTipOverReady =
      (forwardPanelLean > 0.34 || sidePanelLean > 0.38) &&
      stress.lean > 0.72 &&
      stress.supportRatio < 0.56;
    const panelMustFallFlat = isWallFaceFlatFallReady(face);
    const broadCollapseReady =
      !faceFoundationUndermined ||
      panelTipOverReady ||
      (stress.collapse > 0.72 && stress.lean > 0.96);

    if (criticalBearingFailure) {
      stress.foundationRatio = foundationRatio;
      stress.supportRatio = Math.min(stress.supportRatio, foundationRatio * 1.25);
      stress.direction = stress.direction || getFallbackLeanDirection(face);

      if (!isCriticalBearingPanelReleaseReady(face)) {
        continue;
      }

      stress.collapse = 1;
      stress.lean = Math.max(stress.lean, 0.9);

      const flatReleased = releaseWallFaceToFallFlat(face, 4.9);

      releasedThisStep += flatReleased;
      if (flatReleased > 0) {
        continue;
      }
    }

    if (panelMustFallFlat) {
      const flatReleased = releaseWallFaceToFallFlat(face, 4.1 + Math.max(forwardPanelLean, sidePanelLean));

      releasedThisStep += flatReleased;
      if (flatReleased > 0) {
        stress.collapse = 0;
        continue;
      }
    }

    if (panelTipOverReady || ((faceIsLaterallyUnstable || faceIsBroadlyUndermined) && broadCollapseReady)) {
      const rowSpan = panelTipOverReady ? wallBlockRows : faceFoundationUndermined || stress.collapse > 0.72 ? 3 : 2;
      const bandReleased = releaseFaceCollapseBand(
        face,
        maxUnsupportedWallBlockReleasesPerStep - releasedThisStep,
        rowSpan,
        panelTipOverReady
          ? 2.8 + Math.max(forwardPanelLean, sidePanelLean)
          : faceFoundationUndermined
            ? 2.15 + stress.collapse
            : 1.65 + stress.collapse,
      );

      releasedThisStep += bandReleased;
      if (bandReleased > 0) {
        continue;
      }
    }

    for (let row = 1; row < wallBlockRows; row += 1) {
      if (releasedThisStep >= maxUnsupportedWallBlockReleasesPerStep) {
        break;
      }

      for (let column = 0; column < columnCount; column += 1) {
        if (releasedThisStep >= maxUnsupportedWallBlockReleasesPerStep) {
          break;
        }

        const block = getHouseBlock(face, row, column);
        const support = getHouseBlock(face, row - 1, column);
        const blockInfo = block?.wallBlock;
        const graphUnsupported = blockInfo ? isStructuralNodeUnsupported(blockInfo, supportSnapshot) : false;
        const physicallyFloating = !support || support.stage >= 2 || support.body.isDynamic();
        const lacksVerticalSupport = graphUnsupported && (physicallyFloating || row >= physicalWallRows);
        const lacksLateralSupport =
          (faceIsLaterallyUnstable || faceIsBroadlyUndermined) &&
          broadCollapseReady &&
          row >= (faceFoundationUndermined ? 1 : physicalWallRows);

        if (!block || block.stage >= 2 || (!lacksVerticalSupport && !lacksLateralSupport)) {
          continue;
        }

        const lateralImpulse = (column - (columnCount - 1) / 2) * 0.035;
        const impulse = fallDirection.clone().multiplyScalar((lacksLateralSupport ? 2.2 : 1.45) + row * 0.08).setY(lacksLateralSupport ? -0.2 : 0.26);
        const detach = fallDirection.clone().multiplyScalar(0.09 + row * 0.015).setY(-0.035);

        if (face === 'front' || face === 'back') {
          impulse.x += lateralImpulse;
          detach.x += lateralImpulse * 0.25;
        } else {
          impulse.z += lateralImpulse;
          detach.z += lateralImpulse * 0.25;
        }

        breakWallBlock(block, impulse, detach);
        state.structuralWallReleases += 1;
        releasedThisStep += 1;
      }
    }
  }

  releasedThisStep += releaseLeaningWallBlocks(maxUnsupportedWallBlockReleasesPerStep - releasedThisStep);

  const activeFrontChunks = wallChunks.filter((chunk) => !chunk.fragmented).length;
  const highestFrontRow = Math.max(
    -1,
    ...wallBlocks
      .map((block) => block.wallBlock)
      .filter((info): info is WallBlockInfo => info?.face === 'front')
      .map((info) => info.row),
  );
  const highestBackRow = Math.max(
    -1,
    ...wallBlocks
      .map((block) => block.wallBlock)
      .filter((info): info is WallBlockInfo => info?.face === 'back')
      .map((info) => info.row),
  );
  const frontTopSupports = wallBlocks.filter((block) => {
    const info = block.wallBlock;
    return info?.face === 'front' && info.row === highestFrontRow && block.stage < 2;
  }).length + activeFrontChunks * Math.ceil(wallBlockColumns * 0.5);
  const frontTopColumnCount = wallBlocks.filter((block) => {
    const info = block.wallBlock;
    return info?.face === 'front' && info.row === highestFrontRow;
  }).length;
  const remainingFrontFaceBlocks = wallBlocks.filter((block) => {
    const info = block.wallBlock;
    return info?.face === 'front' && block.stage < 2;
  }).length;
  const backTopSupports = wallBlocks.filter((block) => {
    const info = block.wallBlock;
    return info?.face === 'back' && info.row === highestBackRow && block.stage < 2;
  }).length;
  const backTopColumnCount = wallBlocks.filter((block) => {
    const info = block.wallBlock;
    return info?.face === 'back' && info.row === highestBackRow;
  }).length;
  const remainingBackFaceBlocks = wallBlocks.filter((block) => {
    const info = block.wallBlock;
    return info?.face === 'back' && block.stage < 2;
  }).length;

  const shouldDropFrontRoof =
    (
      (
        highestFrontRow >= 0 &&
        frontTopColumnCount > 0 &&
        frontTopSupports < Math.ceil(frontTopColumnCount * 0.68)
      ) ||
      (
        remainingFrontFaceBlocks < Math.ceil(wallBlockColumns * 1.5) &&
        getWallFaceStress('front').collapse > 0.68
      ) ||
      (
        isHouseFaceBroadlyUndermined('front', getRoofDropSupportRatio()) &&
        getWallFaceStress('front').collapse > 0.68 &&
        wallBlocks.some((block) => block.wallBlock?.face === 'front' && block.body.isDynamic())
      )
    );
  const shouldDropBackRoof =
    (
      (
        highestBackRow >= 0 &&
        backTopColumnCount > 0 &&
        backTopSupports < Math.ceil(backTopColumnCount * 0.68)
      ) ||
      (
        remainingBackFaceBlocks < Math.ceil(wallBlockColumns * 1.5) &&
        getWallFaceStress('back').collapse > 0.68
      ) ||
      (
        isHouseFaceBroadlyUndermined('back', getRoofDropSupportRatio()) &&
        getWallFaceStress('back').collapse > 0.68 &&
        wallBlocks.some((block) => block.wallBlock?.face === 'back' && block.body.isDynamic())
      )
    );
  const shouldDropRoof = shouldDropFrontRoof || shouldDropBackRoof;

  if (shouldDropRoof) {
    const roof = getHouseBlock('roof-front', wallBlockRows, 0);
    if (roof && roof.stage < 2) {
      breakWallBlock(roof, new THREE.Vector3(0, -1.8, -1.5), new THREE.Vector3(0, -0.85, -0.12));
    }
    const backRoof = getHouseBlock('roof-back', wallBlockRows, 0);
    if (backRoof && backRoof.stage < 2) {
      breakWallBlock(backRoof, new THREE.Vector3(0, -1.8, 1.5), new THREE.Vector3(0, -0.85, 0.12));
    }
  }

  updateWallGravitySag();
}

function shatterWallBlock(entity: PhysicsEntity): void {
  const info = entity.wallBlock;

  if (!info || entity.fractured || info.row <= 1 || !entity.body.isDynamic()) {
    return;
  }

  entity.fractured = true;
  fracturedWallBlockCount += 1;
  const rotation = entity.body.rotation();
  const velocity = entity.body.linvel();
  const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const featureKind = getHouseFeatureKind(info.face, info.row, info.column);

  if (featureKind === 'window') {
    spawnGlassShatter(entity, featureKind, new THREE.Vector3(velocity.x, velocity.y, velocity.z));
  }

  const shatterImpulse = new THREE.Vector3(velocity.x, velocity.y - 0.65, velocity.z);

  if (shatterImpulse.lengthSq() < 0.04) {
    shatterImpulse.copy(getFaceFallDirection(info.face)).setY(-0.45);
  }

  entity.body.setRotation(quaternion, true);
  if (!replaceWallBlockWithIndependentBrickBodies(entity, shatterImpulse, undefined, true)) {
    releaseWallBlockAsVisibleDebris(entity, shatterImpulse);
  }
  state.chippedWallSlabs += 1;
  state.wallDeformations = state.wallPiecesBroken;
}

function processDynamicWallFractures(): void {
  const structuralCollapseCandidates = entities.filter(
    (entity) => entity.mesh.userData.structuralCollapseDebris && entity.wallBlock && entity.body.isDynamic() && !entity.fractured,
  );

  if (getDynamicDebrisCount() > maxLiveDynamicDebris * 0.72 && structuralCollapseCandidates.length === 0) {
    return;
  }

  let fracturedThisStep = 0;
  const candidates = [
    ...wallBlocks,
    ...structuralCollapseCandidates.filter((entity) => !wallBlocks.includes(entity)),
  ];

  for (const entity of candidates) {
    if (fracturedThisStep >= 2) {
      return;
    }

    const info = entity.wallBlock;

    if (!info || entity.fractured || entity.stage < 2 || !entity.body.isDynamic() || info.row <= 1) {
      continue;
    }

    const position = entity.body.translation();
    const velocity = entity.body.linvel();
    const speedSq = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;
    const fallDistance = info.home.y - position.y;
    const nearBulldozer = isEntityNearBulldozer(entity, 9.5);
    const rotation = entity.body.rotation();
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
      tempQuat.set(rotation.x, rotation.y, rotation.z, rotation.w),
    );
    const uprightness = Math.abs(localUp.y);
    const isStructuralCollapseDebris = Boolean(entity.mesh.userData.structuralCollapseDebris);
    const structuralDebrisAge = simulationStep - entity.createdStep;
    const structuralPanelIsMostlyFlat = uprightness < 0.16;
    const structuralGroundImpact =
      isStructuralCollapseDebris &&
      structuralDebrisAge > 22 &&
      structuralPanelIsMostlyFlat &&
      !nearBulldozer &&
      hasGroundSupportForSettling(entity) &&
      (speedSq > 1.2 || Math.abs(velocity.y) > 0.35 || fallDistance > entity.halfExtents.y * 0.55);
    const structuralFlatStuck =
      isStructuralCollapseDebris &&
      structuralDebrisAge > 180 &&
      structuralPanelIsMostlyFlat &&
      !nearBulldozer &&
      hasGroundSupportForSettling(entity);
    const normalWallImpactShatter =
      fallDistance > Math.max(4.5, entity.halfExtents.y * 1.65) ||
      (speedSq > 32 && Math.abs(velocity.y) > 2.1);
    const shouldShatter = isStructuralCollapseDebris
      ? structuralGroundImpact || structuralFlatStuck
      : normalWallImpactShatter ||
      structuralGroundImpact ||
      structuralFlatStuck;

    if (shouldShatter) {
      shatterWallBlock(entity);
      fracturedThisStep += 1;
    }
  }
}

function isEntityNearBulldozer(entity: PhysicsEntity, padding = 4.8): boolean {
  if (!bulldozer) {
    return false;
  }

  const entityPosition = entity.body.translation();
  const dozerPosition = bulldozer.body.translation();
  const radius = Math.max(bulldozer.halfExtents.x, bulldozer.halfExtents.z) + Math.max(entity.halfExtents.x, entity.halfExtents.z) + padding;

  return Math.hypot(entityPosition.x - dozerPosition.x, entityPosition.z - dozerPosition.z) < radius;
}

function driveStructuralWallDebrisTowardFlatFall(): void {
  for (const entity of entities) {
    const info = entity.wallBlock;
    const visualBrickCount = Number(entity.mesh.userData.visualBrickCount ?? entity.mesh.userData.intactBrickVisualCount ?? 0);
    const isReleasedStructuralDebris = Boolean(entity.mesh.userData.structuralCollapseDebris);
    const isLooseHouseWallDebris =
      entity.kind === 'debris' &&
      visualBrickCount >= 2 &&
      entity.name.startsWith('house-') &&
      !entity.name.includes('roof');

    if (
      (!isReleasedStructuralDebris && !isLooseHouseWallDebris) ||
      !entity.body.isDynamic() ||
      entity.carried ||
      (info ? isRoofFace(info.face) : false)
    ) {
      continue;
    }

    const rotation = entity.body.rotation();
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
      tempQuat.set(rotation.x, rotation.y, rotation.z, rotation.w),
    );
    const uprightness = Math.abs(localUp.y);

    if (uprightness < 0.22) {
      continue;
    }

    const position = entity.body.translation();
    const velocity = entity.body.linvel();
    const angularVelocity = entity.body.angvel();
    const fallDirection = info
      ? getFaceLowResistanceDirection(info.face)
      : getApproximateOutwardFallDirection(position.x, position.z);
    const ageFactor = THREE.MathUtils.clamp((simulationStep - entity.createdStep) / 45, 0.35, 1.4);
    const nearBulldozer = isEntityNearBulldozer(entity, 6.5);
    const panelCoherence = isReleasedStructuralDebris && (simulationStep - entity.createdStep < 180 || nearBulldozer);
    const spin = panelCoherence
      ? (0.75 + uprightness * 0.35) * ageFactor
      : (4.2 + uprightness * 3.2) * ageFactor;

    entity.body.setGravityScale(1.75, true);
    if (panelCoherence) {
      entity.body.setAngularDamping(4.2);
      entity.body.setLinearDamping(0.58);
    }
    entity.body.setLinvel(
      {
        x: velocity.x * (panelCoherence ? 0.9 : 0.72) + fallDirection.x * (panelCoherence ? 0.42 : 0.9),
        y: Math.min(velocity.y - (panelCoherence ? 0.08 : 0.18), panelCoherence ? -1.05 : -2.4),
        z: velocity.z * (panelCoherence ? 0.9 : 0.72) + fallDirection.z * (panelCoherence ? 0.42 : 0.9),
      },
      true,
    );
    entity.body.setAngvel(
      {
        x: angularVelocity.x * (panelCoherence ? 0.08 : 0.35) - fallDirection.z * spin,
        y: angularVelocity.y * (panelCoherence ? 0.02 : 0.2),
        z: angularVelocity.z * (panelCoherence ? 0.08 : 0.35) + fallDirection.x * spin,
      },
      true,
    );

    if (position.y > entity.halfExtents.y * 1.4 && simulationStep - entity.createdStep > 24) {
      entity.body.applyImpulse(
        {
          x: fallDirection.x * entity.mass * 0.16,
          y: -entity.mass * 0.12,
          z: fallDirection.z * entity.mass * 0.16,
        },
        true,
      );
    }
  }
}

function stabilizeCollapsedRoofDebris(): void {
  for (const entity of entities) {
    if (!entity.mesh.userData.roofCollapseDebris || !entity.body.isDynamic() || entity.carried) {
      continue;
    }

    const position = entity.body.translation();
    const velocity = entity.body.linvel();
    const angularVelocity = entity.body.angvel();
    const maxY = Number(entity.mesh.userData.maxRoofCollapseY ?? position.y + 0.1);
    let nextY = position.y;
    let nextVelocityY = velocity.y;

    if (position.y > maxY) {
      nextY = maxY;
      nextVelocityY = Math.min(nextVelocityY, -0.35);
    } else if (velocity.y > 0.12) {
      nextVelocityY = -0.08;
    }

    if (nextY !== position.y) {
      entity.body.setTranslation({ x: position.x, y: nextY, z: position.z }, true);
    }

    if (nextVelocityY !== velocity.y) {
      entity.body.setLinvel({ x: velocity.x * 0.82, y: nextVelocityY, z: velocity.z * 0.82 }, true);
    }

    entity.body.setGravityScale(2.15, true);
    entity.body.setAngvel(
      {
        x: THREE.MathUtils.clamp(angularVelocity.x, -0.75, 0.75),
        y: THREE.MathUtils.clamp(angularVelocity.y, -0.18, 0.18),
        z: THREE.MathUtils.clamp(angularVelocity.z, -0.75, 0.75),
      },
      true,
    );
  }
}

function getApproximateOutwardFallDirection(x: number, z: number): THREE.Vector3 {
  const dx = x;
  const dz = z - houseCenterZ;

  if (Math.abs(dx) > Math.abs(dz)) {
    return new THREE.Vector3(dx >= 0 ? 1 : -1, 0, 0);
  }

  return new THREE.Vector3(0, 0, dz >= 0 ? 1 : -1);
}

function damageEntity(entity: PhysicsEntity, amount: number, impulse: THREE.Vector3, _contactPosition?: THREE.Vector3): void {
  if (!entity.breakable || (entity.kind !== 'wall' && entity.stage >= 2)) {
    return;
  }

  const effectiveAmount = entity.kind === 'wall' && entity.stage < 2
    ? amount * getWallImpactDamageScale()
    : amount;
  const previousDamage = entity.damage;

  entity.damage += effectiveAmount;

  if (entity.kind === 'debris') {
    entity.body.applyImpulse({ x: impulse.x * 0.08, y: impulse.y * 0.04, z: impulse.z * 0.08 }, true);
    return;
  }

  if (entity.kind === 'wall') {
    if (entity.wallBlock && !isRoofFace(entity.wallBlock.face) && entity.wallBlock.row < physicalWallRows) {
      getWallFaceStress(entity.wallBlock.face).lastBearingContactStep = simulationStep;
    }
    registerWallReplayDamage(entity, previousDamage, effectiveAmount);

    if (entity.stage >= 2) {
      entity.body.applyImpulse({ x: impulse.x * 0.25, y: impulse.y * 0.25, z: impulse.z * 0.25 }, true);
      return;
    }

    applyStructuralDamage(entity, effectiveAmount, impulse);
    applyWallBulge(entity, impulse, effectiveAmount);

    if (entity.damage >= getWallBreakDamage()) {
      const blockInfo = entity.wallBlock;

      if (blockInfo?.face === 'front' && blockInfo.row >= 2 && createFrontWallChunksFromImpact(impulse, blockInfo)) {
        return;
      }

      const destructionSpeed = getDestructionSpeed();
      const flatImpulse = new THREE.Vector3(impulse.x, 0, impulse.z);
      const detach = flatImpulse.lengthSq() > 0.001
        ? flatImpulse.normalize().multiplyScalar(0.48)
        : getFaceFallDirection(entity.wallBlock?.face ?? 'front').multiplyScalar(0.48);
      const breakImpulse = impulse.clone().multiplyScalar(0.52 * destructionSpeed);

      detach.y = -0.04;
      breakWallBlock(entity, breakImpulse.setY(0.5 * destructionSpeed), detach);
      if (blockInfo?.face === 'front' && blockInfo.row <= 1) {
        createFrontWallChunksFromImpact(impulse, blockInfo);
      }
      releaseUnsupportedWallBlocks();
    }
    return;
  }

  if (entity.kind === 'column') {
    if (entity.stage === 0 && entity.damage >= tuning.columnStageOneDamage) {
      entity.stage = 1;
      entity.mesh.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.material = materials.columnCracked;
        }
      });
      entity.mesh.scale.x = 0.86;
      entity.mesh.scale.z = 0.86;
      state.columnStageBreaks += 1;
    }

    if (entity.damage >= tuning.columnStageTwoDamage) {
      entity.stage = 2;
      state.columnStageBreaks += 1;
      replaceFixedWithDynamic(entity, impulse.multiplyScalar(0.75).setY(3.2));
      maybeDropBridgeDecks();
    }
  }
}

function getEntityWorldAabb(entity: PhysicsEntity): { max: THREE.Vector3; min: THREE.Vector3 } {
  const position = entity.body.translation();
  const rotation = entity.body.rotation();
  const quaternion = tempQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);
  const matrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
  const elements = matrix.elements;
  const half = entity.halfExtents;
  const extentX = Math.abs(elements[0]) * half.x + Math.abs(elements[4]) * half.y + Math.abs(elements[8]) * half.z;
  const extentY = Math.abs(elements[1]) * half.x + Math.abs(elements[5]) * half.y + Math.abs(elements[9]) * half.z;
  const extentZ = Math.abs(elements[2]) * half.x + Math.abs(elements[6]) * half.y + Math.abs(elements[10]) * half.z;
  const center = tempVec3.set(position.x, position.y, position.z);

  return {
    max: new THREE.Vector3(center.x + extentX, center.y + extentY, center.z + extentZ),
    min: new THREE.Vector3(center.x - extentX, center.y - extentY, center.z - extentZ),
  };
}

function getObjectWorldAabb(
  object: THREE.Object3D,
  halfExtents: THREE.Vector3,
): { max: THREE.Vector3; min: THREE.Vector3 } {
  object.updateWorldMatrix(true, false);
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();

  object.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);

  const matrix = new THREE.Matrix4().makeRotationFromQuaternion(worldQuaternion);
  const elements = matrix.elements;
  const scaledHalf = tempVec3B.set(
    Math.abs(halfExtents.x * worldScale.x),
    Math.abs(halfExtents.y * worldScale.y),
    Math.abs(halfExtents.z * worldScale.z),
  );
  const extentX = Math.abs(elements[0]) * scaledHalf.x + Math.abs(elements[4]) * scaledHalf.y + Math.abs(elements[8]) * scaledHalf.z;
  const extentY = Math.abs(elements[1]) * scaledHalf.x + Math.abs(elements[5]) * scaledHalf.y + Math.abs(elements[9]) * scaledHalf.z;
  const extentZ = Math.abs(elements[2]) * scaledHalf.x + Math.abs(elements[6]) * scaledHalf.y + Math.abs(elements[10]) * scaledHalf.z;

  return {
    max: new THREE.Vector3(worldPosition.x + extentX, worldPosition.y + extentY, worldPosition.z + extentZ),
    min: new THREE.Vector3(worldPosition.x - extentX, worldPosition.y - extentY, worldPosition.z - extentZ),
  };
}

function aabbOverlaps(
  first: { max: THREE.Vector3; min: THREE.Vector3 },
  second: { max: THREE.Vector3; min: THREE.Vector3 },
  padding: number,
): boolean {
  return (
    first.min.x <= second.max.x + padding &&
    first.max.x >= second.min.x - padding &&
    first.min.y <= second.max.y + padding &&
    first.max.y >= second.min.y - padding &&
    first.min.z <= second.max.z + padding &&
    first.max.z >= second.min.z - padding
  );
}

function getStaticWallVisualInfo(object: THREE.Object3D): StaticWallVisualInfo | undefined {
  return object.userData.staticWallVisual as StaticWallVisualInfo | undefined;
}

function isHouseColumnSupported(face: HouseBlockFace, row: number, column: number): boolean {
  if (row <= 0) {
    return true;
  }

  const faceSupportRatio = getFaceLowerSupportRatio(face);
  const faceIsBroadlyUndermined = isHouseFaceBroadlyUndermined(face);

  if (column < 0) {
    return !faceIsBroadlyUndermined && faceSupportRatio >= getSupportReleaseRatio();
  }

  const physicalSupport = getHouseBlock(face, row - 1, column);

  if (physicalSupport && physicalSupport.stage < 2 && !physicalSupport.body.isDynamic()) {
    return true;
  }

  return row > physicalWallRows && !faceIsBroadlyUndermined && faceSupportRatio >= getSupportReleaseRatio();
}

function damageStaticWallVisual(
  object: THREE.Object3D,
  impulseDirection: THREE.Vector3,
  impactForce: number,
  eraseGroupedRow = false,
  preferGroupedBlockRelease = false,
): PhysicsEntity | null {
  const info = getStaticWallVisualInfo(object);

  if (!info) {
    return null;
  }

  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  object.updateWorldMatrix(true, false);
  object.matrixWorld.decompose(position, rotation, scale);
  scene.remove(object);
  staticWallVisuals = staticWallVisuals.filter((candidate) => candidate !== object);

  if (info.column < 0 && eraseGroupedRow && object.userData.physicalFacadeRowVisual) {
    disposeObjectGeometry(object);
    state.visualWallImpacts += 1;
    state.wallPiecesBroken += 1;
    state.wallDeformations = state.wallPiecesBroken;
    state.wallBreaches = 1;
    return null;
  }

  const debris = fragmentStaticWallVisualToIndependentBricks(
    object.name,
    info,
    position,
    rotation,
    impulseDirection,
    impactForce,
    preferGroupedBlockRelease,
  );

  if (debris) {
    disposeObjectGeometry(object);
    return debris;
  }

  if (preferGroupedBlockRelease && info.column < 0) {
    scene.add(object);
    staticWallVisuals.push(object);
    return null;
  }

  return createReleasedStaticWallVisualDebris(object, info, position, rotation, impulseDirection, impactForce);
}

function fragmentStaticWallVisualToIndependentBricks(
  sourceName: string,
  info: StaticWallVisualInfo,
  position: THREE.Vector3,
  rotation: THREE.Quaternion,
  impulseDirection: THREE.Vector3,
  impactForce: number,
  preferGroupedBlockRelease = false,
): PhysicsEntity | null {
  const dynamicDebrisCount = getDynamicDebrisCount();
  const groupedRowRelease = preferGroupedBlockRelease && info.column < 0;

  if (dynamicDebrisCount > maxLiveDynamicDebris * (groupedRowRelease ? 0.92 : 0.68)) {
    return null;
  }

  const lengthAxis: 'x' | 'z' = info.halfExtents.x >= info.halfExtents.z ? 'x' : 'z';
  const length = info.halfExtents[lengthAxis] * 2;
  const height = info.halfExtents.y * 2;
  const depth = (lengthAxis === 'x' ? info.halfExtents.z : info.halfExtents.x) * 2;
  const requestedColumns = groupedRowRelease
    ? Math.max(2, Math.round(length / masonryBrickLength))
    : info.column < 0
      ? Math.max(4, Math.min(14, Math.round(length / masonryBrickLength)))
      : Math.max(2, Math.min(4, Math.round(length / masonryBrickLength)));
  const requestedRows = groupedRowRelease
    ? Math.max(1, Math.round(height / masonryBrickHeight))
    : Math.max(1, Math.min(3, Math.round(height / masonryBrickHeight)));
  let columns = requestedColumns;
  let rows = requestedRows;
  const requestedCount = rows * columns;
  const availableCount = Math.max(
    0,
    Math.floor(maxLiveDynamicDebris * (groupedRowRelease ? 0.98 : 0.78) - dynamicDebrisCount),
  );
  const countBudget = Math.min(requestedCount, availableCount);

  if (countBudget <= 0 || (groupedRowRelease && countBudget < requestedCount)) {
    return null;
  }

  state.visualWallImpacts += 1;
  state.wallBreaches = 1;

  const lengthDirection = lengthAxis === 'x'
    ? new THREE.Vector3(1, 0, 0).applyQuaternion(rotation)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
  const fallDirection = getFaceFallDirection(info.face);
  const push = impulseDirection.lengthSq() > 0.01 ? impulseDirection.clone().normalize() : fallDirection;
  const destructionSpeed = getDestructionSpeed();
  let firstDebris: PhysicsEntity | null = null;
  let created = 0;

  for (let row = 0; row < rows; row += 1) {
    const rowOffset = row % 2 === 0 ? 0 : length / columns * 0.5;

    for (let column = 0; column < columns; column += 1) {
      if (created >= countBudget) {
        break;
      }

      const seed = info.row * 181 + column * 37 + row * 53 + simulationStep;
      const cellLength = length / columns;
      const cellHeight = height / rows;
      const edgeTrim = (column === 0 || column === columns - 1) && row % 2 === 1 ? 0.5 : 1;
      const brickLength = Math.max(0.24, cellLength * edgeTrim - 0.12) * seededRange(seed + 1, 0.9, 1.04);
      const brickHeight = Math.max(0.18, cellHeight - 0.12) * seededRange(seed + 2, 0.92, 1.04);
      const brickHalf = lengthAxis === 'x'
        ? new THREE.Vector3(brickLength * 0.5, brickHeight * 0.5, depth * 0.48)
        : new THREE.Vector3(depth * 0.48, brickHeight * 0.5, brickLength * 0.5);
      const lengthCenter = -length * 0.5 + cellLength * 0.5 + column * cellLength + rowOffset;
      const wrappedLengthCenter = THREE.MathUtils.clamp(
        lengthCenter > length * 0.5 ? lengthCenter - length : lengthCenter,
        -length * 0.5 + brickLength * 0.5,
        length * 0.5 - brickLength * 0.5,
      );
      const brickPosition = position.clone()
        .addScaledVector(lengthDirection, wrappedLengthCenter)
        .addScaledVector(up, -height * 0.5 + cellHeight * 0.5 + row * cellHeight)
        .addScaledVector(fallDirection, seededRange(seed + 3, -0.04, 0.09));
      const materialIndex = Math.abs(info.row * 5 + row * 3 + column) % rubbleBrickMaterials.length;
      const debris = createDynamicBox(
        `${sourceName}-independent-brick-${row}-${column}`,
        'debris',
        brickHalf,
        brickPosition,
        rubbleBrickMaterials[materialIndex] ?? materials.wall,
        THREE.MathUtils.clamp(0.7 + impactForce * 0.002 + info.row * 0.04, 0.8, 3.6),
        rotation,
        0.42,
        0.72,
      );
      const spread = (column - (columns - 1) / 2) * 0.025;

      debris.mesh.userData.visualBrickCount = Number(debris.mesh.userData.visualBrickCount ?? 1);
      debris.mesh.userData.visualWallImpactCount = maxVisualWallImpactsPerMover;
      debris.body.setGravityScale(1.35, true);
      debris.body.setLinvel(
        {
          x: push.x * (0.82 + info.row * 0.028) * destructionSpeed + fallDirection.x * 0.2 + lengthDirection.x * spread,
          y: -1.05 * destructionSpeed - info.row * 0.035 - row * 0.015,
          z: push.z * (0.82 + info.row * 0.028) * destructionSpeed + fallDirection.z * 0.2 + lengthDirection.z * spread,
        },
        true,
      );
      debris.body.setAngvel(
        {
          x: seededRange(seed + 4, -0.22, 0.22) * destructionSpeed,
          y: seededRange(seed + 5, -0.18, 0.18) * destructionSpeed,
          z: seededRange(seed + 6, -0.22, 0.22) * destructionSpeed,
        },
        true,
      );
      if (groupedRowRelease) {
        debris.body.setLinearDamping(0.56);
        debris.body.setAngularDamping(0.82);
      }

      firstDebris ??= debris;
      created += 1;
    }
  }

  state.wallPiecesBroken += created;
  state.wallDeformations = state.wallPiecesBroken;
  return firstDebris;
}

function createReleasedStaticWallVisualDebris(
  object: THREE.Object3D,
  info: StaticWallVisualInfo,
  position: THREE.Vector3,
  rotation: THREE.Quaternion,
  impulseDirection: THREE.Vector3,
  impactForce: number,
): PhysicsEntity {
  const fallDirection = getFaceFallDirection(info.face);
  const push = impulseDirection.lengthSq() > 0.01 ? impulseDirection.clone().normalize() : fallDirection.clone();
  const destructionSpeed = getDestructionSpeed();
  const slabMass = THREE.MathUtils.clamp(
    info.halfExtents.x * info.halfExtents.y * info.halfExtents.z * 0.14 + impactForce * 0.01,
    6,
    22,
  );
  const slab = createDynamicBox(
    `${object.name}-released-slab`,
    'debris',
    info.halfExtents,
    position,
    materials.wall,
    slabMass,
    rotation,
    1.12,
    1.28,
  );

  delete object.userData.staticWallVisual;
  delete object.userData.physicalFacadeRowVisual;
  object.userData.intactBrickVisual = false;
  object.userData.intactBrickVisualCount = 0;
  object.userData.visualBrickCount = Number(object.userData.visualBrickCount ?? 0);
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  replaceEntityVisual(slab, object);

  const sideBias = info.column < 0
    ? 0
    : (info.column - (getHouseFaceColumnCount(info.face) - 1) / 2) / Math.max(1, getHouseFaceColumnCount(info.face));

  slab.body.setLinvel(
    {
      x: push.x * 0.9 * destructionSpeed + fallDirection.x * 0.42,
      y: -0.55 - info.row * 0.04 + Math.min(0.18, impactForce * 0.002),
      z: push.z * 0.9 * destructionSpeed + fallDirection.z * 0.42,
    },
    true,
  );
  slab.body.setAngvel(
    {
      x: -fallDirection.z * (0.55 + info.row * 0.03),
      y: sideBias * 0.28,
      z: fallDirection.x * (0.55 + info.row * 0.03),
    },
    true,
  );
  state.visualWallImpacts += 1;
  state.wallPiecesBroken += 1;
  state.wallDeformations = state.wallPiecesBroken;
  state.wallBreaches = 1;
  return slab;
}

function releaseUnsupportedStaticWallVisuals(): void {
  let releasedThisStep = 0;

  const sortedVisuals = [...staticWallVisuals].sort((a, b) => {
    const first = getStaticWallVisualInfo(a);
    const second = getStaticWallVisualInfo(b);
    return (second?.row ?? 0) - (first?.row ?? 0);
  });

  for (const visualWall of sortedVisuals) {
    if (releasedThisStep >= maxStructuralVisualReleasesPerStep) {
      break;
    }

    const info = getStaticWallVisualInfo(visualWall);

    if (!info || info.row < physicalWallRows) {
      continue;
    }

    if (getDynamicDebrisCount() > maxLiveDynamicDebris * 1.08 && info.column >= 0) {
      break;
    }

    const faceIsBroadlyUndermined = isHouseFaceBroadlyUndermined(info.face);
    const lacksVerticalSupport = !isHouseColumnSupported(info.face, info.row, info.column);
    const lacksLateralSupport =
      (isFaceLaterallyUnstable(info.face) || faceIsBroadlyUndermined) &&
      info.row >= physicalWallRows;

    if (!lacksVerticalSupport && !lacksLateralSupport) {
      continue;
    }

    const columnCount = getHouseFaceColumnCount(info.face);
    const fallDirection = getFaceFallDirection(info.face);
    const sideBias = info.column < 0 ? 0 : (info.column - (columnCount - 1) / 2) / Math.max(1, columnCount);
    const releaseImpulse = fallDirection
      .clone()
      .multiplyScalar((lacksLateralSupport ? 1.9 : 1.1) + info.row * 0.08)
      .setY(lacksLateralSupport ? -0.22 : -0.45 - info.row * 0.02);

    if (info.face === 'front' || info.face === 'back') {
      releaseImpulse.x += sideBias * 1.2;
    } else {
      releaseImpulse.z += sideBias * 1.2;
    }

    const beforeVisualImpactCount = state.visualWallImpacts;
    const debris = damageStaticWallVisual(
      visualWall,
      releaseImpulse,
      getSecondaryImpactThreshold() * 1.15,
      true,
      true,
    );

    if (state.visualWallImpacts > beforeVisualImpactCount) {
      releasedThisStep += 1;
    }

    if (debris) {
      debris.body.setAngvel(
        {
          x: -fallDirection.z * (0.65 + info.row * 0.04),
          y: sideBias * 0.25,
          z: fallDirection.x * (0.65 + info.row * 0.04),
        },
        true,
      );
      state.structuralWallReleases += 1;
    }
  }
}

function canDynamicBodyDamageStaticVisualWall(moving: PhysicsEntity, force: number): boolean {
  if (force < getSecondaryImpactThreshold() * 1.35) {
    return false;
  }

  if (moving.name.includes('door-panel')) {
    return false;
  }

  const info = moving.wallBlock;

  if (info && !isRoofFace(info.face) && info.row < physicalWallRows) {
    return false;
  }

  const position = moving.body.translation();
  const largestHorizontalExtent = Math.max(moving.halfExtents.x, moving.halfExtents.z);
  const isRoofDebris = moving.name.includes('roof');
  const isLargePanel = largestHorizontalExtent >= 5.5 || moving.mass >= 22;
  const isUpperImpact = position.y > solidWallHeight * 0.32;

  return isRoofDebris || (isLargePanel && isUpperImpact);
}

function processSecondaryWallImpacts(): void {
  const movingWalls = entities.filter((entity) => {
    if (!entity.body.isDynamic() || entity.carried || entity.mass <= 0) {
      return false;
    }

    const velocity = entity.body.linvel();
    const speedSq = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;
    return speedSq > 1.2 && (entity.kind === 'debris' || entity.kind === 'wall' || entity.name.includes('house-') || entity.name.includes('interior-'));
  });

  if (movingWalls.length === 0) {
    return;
  }

  const fixedWalls = entities.filter((entity) => (
    entity.breakable &&
    entity.kind === 'wall' &&
    !entity.body.isDynamic() &&
    entity.stage < 2
  ));

  for (const moving of movingWalls) {
    if (!entities.includes(moving) || !moving.body.isDynamic()) {
      continue;
    }

    const velocity = moving.body.linvel();
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const force = speed * Math.max(1, moving.mass);

    if (force < getSecondaryImpactThreshold()) {
      continue;
    }

    const movingAabb = getEntityWorldAabb(moving);
    const impulseDirection = new THREE.Vector3(velocity.x, velocity.y * 0.25, velocity.z);

    if (impulseDirection.lengthSq() < 0.01) {
      continue;
    }
    impulseDirection.normalize();

    for (const target of fixedWalls) {
      if (!entities.includes(target)) {
        continue;
      }

      if (target === moving || simulationStep - target.lastImpactStep < secondaryWallImpactCooldownSteps) {
        continue;
      }

      const targetAabb = getEntityWorldAabb(target);

      if (!aabbOverlaps(movingAabb, targetAabb, 0.18)) {
        continue;
      }

      const secondaryThreshold = getSecondaryImpactThreshold();
      const damage = THREE.MathUtils.clamp((force - secondaryThreshold) * 0.16, 1.2, getWallBreakDamage() + 4);
      const impulse = impulseDirection.clone().multiplyScalar(THREE.MathUtils.clamp(speed * 0.9, 1.2, 8.5));

      target.lastImpactStep = simulationStep;
      state.secondaryWallImpacts += 1;
      damageEntity(target, damage, impulse, target.mesh.position);

      const moverVelocityScale = force > secondaryThreshold * 2 ? 0.72 : 0.86;
      moving.body.setLinvel(
        {
          x: velocity.x * moverVelocityScale,
          y: velocity.y * 0.82,
          z: velocity.z * moverVelocityScale,
        },
        true,
      );
      break;
    }

    if (!canDynamicBodyDamageStaticVisualWall(moving, force)) {
      continue;
    }

    const visualImpactCount = Number(moving.mesh.userData.visualWallImpactCount ?? 0);

    if (visualImpactCount >= maxVisualWallImpactsPerMover) {
      continue;
    }

    for (const visualWall of [...staticWallVisuals]) {
      const info = getStaticWallVisualInfo(visualWall);

      if (!info || info.row < physicalWallRows) {
        continue;
      }

      const visualAabb = getObjectWorldAabb(visualWall, info.halfExtents);

      if (!aabbOverlaps(movingAabb, visualAabb, 0.28)) {
        continue;
      }

      if (info.column < 0 && !isHouseFaceBroadlyUndermined(info.face)) {
        continue;
      }

      damageStaticWallVisual(visualWall, impulseDirection, force);
      moving.mesh.userData.visualWallImpactCount = visualImpactCount + 1;
      moving.lastImpactStep = simulationStep;
      const moverVelocityScale = force > getSecondaryImpactThreshold() * 2 ? 0.48 : 0.62;

      moving.body.setLinvel(
        {
          x: velocity.x * moverVelocityScale,
          y: Math.min(velocity.y * 0.36, -0.75),
          z: velocity.z * moverVelocityScale,
        },
        true,
      );
      moving.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      break;
    }
  }
}

function maybeDropBridgeDecks(): void {
  if (state.bridgeCollapsed) {
    return;
  }

  const destroyedSupports = bridgeSupports.filter((support) => support.entity.stage >= 2).length;

  if (destroyedSupports < tuning.bridgeCollapseThreshold) {
    return;
  }

  state.bridgeCollapsed = true;
  bridgeDecks.forEach((deck, index) => {
    if (!deck.body.isDynamic()) {
      replaceFixedWithDynamic(deck, new THREE.Vector3((index - 1.5) * 0.8, -0.6, 0));
      state.deckPiecesDropped += 1;
    }
  });
}

function updateBulldozerControls(dt: number): void {
  const current = bulldozer.body.translation();
  const previousYaw = dozerYaw;
  const activeOverride = controlOverride ?? touchControlOverride;
  const forwardKey = keys.has('KeyW') || (!cameraFpsMode && keys.has('ArrowUp'));
  const reverseKey = keys.has('KeyS') || (!cameraFpsMode && keys.has('ArrowDown'));
  const leftKey = keys.has('KeyA') || (!cameraFpsMode && keys.has('ArrowLeft'));
  const rightKey = keys.has('KeyD') || (!cameraFpsMode && keys.has('ArrowRight'));
  const throttle = activeOverride?.throttle
    ?? ((forwardKey ? 1 : 0) - (reverseKey ? 1 : 0));
  const steering = activeOverride?.steering
    ?? ((leftKey ? 1 : 0) - (rightKey ? 1 : 0));
  const lowGear = activeOverride?.lowGear ?? (keys.has('ShiftLeft') || keys.has('ShiftRight'));
  const brake = activeOverride?.brake ?? false;
  const targetSpeed = throttle * (lowGear ? 8.4 : 10.8);
  const acceleration = throttle === 0 ? 3.2 : tuning.engineTorque * 0.055;

  dozerSpeed = THREE.MathUtils.damp(dozerSpeed, targetSpeed, acceleration, dt);

  if (brake) {
    dozerSpeed *= Math.pow(0.18, dt);
  }

  if (Math.abs(steering) > 0.01) {
    const stationaryTurnRate = throttle === 0 ? 1.55 : 0;
    const movingTurnRate = 0.92 + Math.min(0.7, Math.abs(dozerSpeed) * 0.08);

    dozerYaw += steering * Math.max(stationaryTurnRate, movingTurnRate) * dt;
  }
  dozerTurnSpeed = dt > 0 ? (dozerYaw - previousYaw) / dt : 0;

  tempQuat.setFromAxisAngle(yAxis, dozerYaw);
  const forward = tempForward.set(0, 0, -1).applyQuaternion(tempQuat).setY(0).normalize();
  const right = tempRight.set(1, 0, 0).applyQuaternion(tempQuat).setY(0).normalize();
  const nextPosition = tempVec3B
    .set(current.x, dozerGroundY, current.z)
    .addScaledVector(forward, dozerSpeed * dt);

  if (Math.abs(current.x) > worldBounds || Math.abs(current.z) > worldBounds) {
    nextPosition.x = THREE.MathUtils.clamp(nextPosition.x, -worldBounds, worldBounds);
    nextPosition.z = THREE.MathUtils.clamp(nextPosition.z, -worldBounds, worldBounds);
    dozerSpeed *= 0.62;
  }

  bulldozer.body.setNextKinematicTranslation({ x: nextPosition.x, y: nextPosition.y, z: nextPosition.z });
  bulldozer.body.setNextKinematicRotation(tempQuat);

  const bladeTarget = tempVec3
    .set(nextPosition.x, nextPosition.y, nextPosition.z)
    .addScaledVector(forward, bladeMountDistance)
    .addScaledVector(right, 0);
  const lowerBlade = activeOverride?.lowerBlade ?? keys.has('KeyE');
  const raiseBlade = activeOverride?.raiseBlade ?? keys.has('KeyQ');
  const targetY = nextPosition.y + (raiseBlade ? 0.52 : lowerBlade ? -0.2 : -0.06) * bulldozerScale;
  const bladePos = blade.body.translation();

  bladeTarget.y = THREE.MathUtils.lerp(bladePos.y, targetY, 0.36);
  blade.body.setNextKinematicTranslation({ x: bladeTarget.x, y: bladeTarget.y, z: bladeTarget.z });
  blade.body.setNextKinematicRotation(tempQuat);
}

function getBladeWorldPosition(target = tempVec3): THREE.Vector3 {
  const position = blade.body.translation();

  return target.set(position.x, position.y, position.z);
}

function damageEntitiesInProbe(probe: ImpactProbe, speed: number): void {
  for (const entity of [...entities]) {
    if (!entities.includes(entity)) {
      continue;
    }

    if (!entity.breakable || entity === blade || entity === bulldozer || entity.carried) {
      continue;
    }

    if (simulationStep - entity.lastImpactStep < 5) {
      continue;
    }

    const position = entity.body.translation();
    const dx = position.x - probe.center.x;
    const dy = position.y - probe.center.y;
    const dz = position.z - probe.center.z;
    const localRight = dx * probe.probeRight.x + dz * probe.probeRight.z;
    const localForward = dx * probe.probeForward.x + dz * probe.probeForward.z;

    if (Math.abs(localRight) > probe.halfRight + entity.halfExtents.x) {
      continue;
    }
    if (Math.abs(localForward) > probe.halfForward + entity.halfExtents.z) {
      continue;
    }
    if (Math.abs(dy) > probe.halfHeight + entity.halfExtents.y) {
      continue;
    }

    const isFixedWallBlock = entity.kind === 'wall' && !entity.body.isDynamic();
    const columnScale = entity.kind === 'column' ? 1.35 : 1;
    const amount = (speed + 2.2) * probe.damageScale * columnScale;
    const impulseStrength = isFixedWallBlock ? 1.15 + speed * 0.18 : 3.2 + speed * 0.72;
    const impulse = probe.impulseDir.clone().multiplyScalar(impulseStrength).setY(entity.kind === 'column' ? 1.4 : isFixedWallBlock ? 0.24 : 0.9);

    entity.lastImpactStep = simulationStep;
    state.impactEvents += 1;
    if (entity.kind === 'wall') {
      registerBulldozerWallReplayContact(entity, amount);
    }
    damageEntity(entity, amount, impulse, probe.center);
    dozerSpeed *= Math.max(0.78, 1 - entity.mass * 0.0015);
  }
}

function processVehicleDamage(): void {
  const linearSpeed = Math.abs(dozerSpeed);
  const rotationalContactSpeed = Math.abs(dozerTurnSpeed) * Math.max(bulldozer.halfExtents.x, bulldozer.halfExtents.z);
  const speed = Math.max(linearSpeed, Math.min(7.5, rotationalContactSpeed));

  if (speed < 0.15) {
    return;
  }

  const dozerPosition = bulldozer.body.translation();
  const base = tempVec3B.set(dozerPosition.x, dozerPosition.y, dozerPosition.z);
  const forward = getBodyForward(bulldozer.body, tempForward).clone();
  const right = getBodyRight(bulldozer.body, tempRight).clone();
  const movingForward = dozerSpeed >= 0;
  const turning = Math.abs(dozerTurnSpeed) > 0.05;
  const turnSign = Math.sign(dozerTurnSpeed) || 1;
  const bladePosition = getBladeWorldPosition(new THREE.Vector3());
  const rearBumperCenter = base.clone().addScaledVector(forward, -Math.max(2.0, bulldozer.halfExtents.z - 0.35));
  const rearDamageHalfRight = bulldozer.halfExtents.x + 0.5;
  const cabCenter = base.clone()
    .addScaledVector(right, cabLocalOffset.x)
    .addScaledVector(forward, -cabLocalOffset.z)
    .setY(base.y + cabLocalOffset.y);
  const probes: ImpactProbe[] = [
    {
      center: bladePosition,
      damageScale: 1.35,
      halfForward: 0.7,
      halfHeight: 0.72,
      halfRight: bladeHalf.x,
      impulseDir: movingForward ? forward.clone() : forward.clone().multiplyScalar(-1),
      probeForward: forward,
      probeRight: right,
    },
    {
      center: base.clone().addScaledVector(forward, 2.04),
      damageScale: movingForward ? 1 : 0.45,
      halfForward: 0.62,
      halfHeight: 0.96,
      halfRight: 1.35,
      impulseDir: forward.clone(),
      probeForward: forward,
      probeRight: right,
    },
    {
      center: cabCenter,
      damageScale: movingForward ? 0.95 : 0.62,
      halfForward: cabHalf.z,
      halfHeight: cabHalf.y,
      halfRight: cabHalf.x,
      impulseDir: movingForward ? forward.clone() : forward.clone().multiplyScalar(-1),
      probeForward: forward,
      probeRight: right,
    },
    {
      center: rearBumperCenter,
      damageScale: movingForward ? 0.35 : 1.28,
      halfForward: 1.18,
      halfHeight: 1.05,
      halfRight: rearDamageHalfRight,
      impulseDir: forward.clone().multiplyScalar(-1),
      probeForward: forward,
      probeRight: right,
    },
    {
      center: base.clone().addScaledVector(right, 1.34),
      damageScale: 0.72,
      halfForward: 1.92,
      halfHeight: 0.82,
      halfRight: 0.4,
      impulseDir: right.clone(),
      probeForward: forward,
      probeRight: right,
    },
    {
      center: base.clone().addScaledVector(right, -1.34),
      damageScale: 0.72,
      halfForward: 1.92,
      halfHeight: 0.82,
      halfRight: 0.4,
      impulseDir: right.clone().multiplyScalar(-1),
      probeForward: forward,
      probeRight: right,
    },
  ];

  if (turning) {
    const frontTangential = right.clone().multiplyScalar(-turnSign);
    const rearTangential = right.clone().multiplyScalar(turnSign);
    const rightTangential = forward.clone().multiplyScalar(turnSign);
    const leftTangential = forward.clone().multiplyScalar(-turnSign);

    probes.push(
      {
        center: bladePosition,
        damageScale: 1.18,
        halfForward: 0.92,
        halfHeight: 0.82,
        halfRight: bladeHalf.x + 0.25,
        impulseDir: frontTangential,
        probeForward: forward,
        probeRight: right,
      },
      {
        center: base.clone().addScaledVector(forward, 2.05),
        damageScale: 1.05,
        halfForward: 0.9,
        halfHeight: 1.05,
        halfRight: 1.58,
        impulseDir: frontTangential,
        probeForward: forward,
        probeRight: right,
      },
      {
        center: rearBumperCenter.clone(),
        damageScale: 1.02,
        halfForward: 1.18,
        halfHeight: 1.05,
        halfRight: rearDamageHalfRight + 0.18,
        impulseDir: rearTangential,
        probeForward: forward,
        probeRight: right,
      },
      {
        center: base.clone().addScaledVector(right, 1.45),
        damageScale: 1.06,
        halfForward: 2.25,
        halfHeight: 0.92,
        halfRight: 0.62,
        impulseDir: rightTangential,
        probeForward: forward,
        probeRight: right,
      },
      {
        center: base.clone().addScaledVector(right, -1.45),
        damageScale: 1.06,
        halfForward: 2.25,
        halfHeight: 0.92,
        halfRight: 0.62,
        impulseDir: leftTangential,
        probeForward: forward,
        probeRight: right,
      },
    );
  }

  probes.forEach((probe) => damageEntitiesInProbe(probe, speed));
}

function pickupDebris(): void {
  const bladePosition = getBladeWorldPosition(tempVec3);
  const candidates = entities
    .filter((entity) => (
      (entity.kind === 'debris' || entity.kind === 'wall' || entity.kind === 'column') &&
      entity.body.isDynamic() &&
      !entity.carried &&
      entity.mass <= 22
    ))
    .map((entity) => {
      const position = entity.body.translation();
      return {
        distance: Math.hypot(position.x - bladePosition.x, position.y - bladePosition.y, position.z - bladePosition.z),
        entity,
      };
    })
    .filter((candidate) => candidate.distance <= tuning.debrisPickupRange)
    .sort((a, b) => a.distance - b.distance);

  for (const candidate of candidates) {
    if (state.carriedMass + candidate.entity.mass > tuning.maxCarryMass) {
      break;
    }
    candidate.entity.carried = true;
    candidate.entity.body.setGravityScale(0, true);
    state.carriedMass += candidate.entity.mass;
    state.carriedPieces += 1;
  }
}

function releaseDebris(): void {
  const forward = getBodyForward(bulldozer.body, tempForward);

  entities.forEach((entity) => {
    if (!entity.carried) {
      return;
    }
    entity.carried = false;
    entity.body.setGravityScale(1, true);
    entity.body.applyImpulse({ x: forward.x * 1.8, y: 0.8, z: forward.z * 1.8 }, true);
  });
  state.carriedMass = 0;
  state.carriedPieces = 0;
}

function updateCarriedDebris(): void {
  const forward = getBodyForward(bulldozer.body, tempForward);
  const right = getBodyRight(bulldozer.body, tempRight);
  const bladePosition = getBladeWorldPosition(tempVec3);
  let slot = 0;
  let mass = 0;
  let pieces = 0;

  entities.forEach((entity) => {
    if (!entity.carried) {
      return;
    }

    const row = Math.floor(slot / 4);
    const column = slot % 4;
    const target = tempVec3B
      .copy(bladePosition)
      .addScaledVector(right, (column - 1.5) * 0.72)
      .addScaledVector(forward, 0.45 + row * 0.42)
      .setY(bladePosition.y + carryHeight + row * 0.16);

    const position = entity.body.translation();
    const velocity = {
      x: (target.x - position.x) * 9,
      y: (target.y - position.y) * 9,
      z: (target.z - position.z) * 9,
    };

    entity.body.setLinvel(velocity, true);
    mass += entity.mass;
    pieces += 1;
    slot += 1;
  });

  state.carriedMass = Number(mass.toFixed(1));
  state.carriedPieces = pieces;
}

function recenterCamera(): void {
  cameraPanOffset.set(0, 0, 0);
  cameraYaw = dozerYaw;
}

function rotateCameraByMouse(dx: number, dy: number): void {
  if (cameraFpsMode) {
    fpsCameraYawOffset -= dx * 0.0035;
    fpsCameraPitch = THREE.MathUtils.clamp(fpsCameraPitch - dy * 0.003, -0.72, 0.62);
    return;
  }

  cameraYaw -= dx * 0.006;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.0045, 0.16, 1.28);
}

function setCameraFpsMode(enabled: boolean): void {
  cameraFpsMode = enabled;
  cameraPanOffset.set(0, 0, 0);
  canvas?.classList.toggle('camera-fps-active', cameraFpsMode);

  if (cameraFpsMode) {
    const inputCanvas = canvas as HTMLCanvasElement;

    fpsCameraYawOffset = 0;
    fpsCameraPitch = 0;
    inputCanvas.focus({ preventScroll: true });
    inputCanvas.requestPointerLock?.();
  } else if (document.pointerLockElement === canvas) {
    document.exitPointerLock?.();
  }
}

function panCamera(dx: number, dy: number): void {
  const panScale = cameraDistance * 0.0022;
  const right = tempRight.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw)).normalize();
  const flatForward = cameraFlatForward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)).normalize();

  cameraPanOffset
    .addScaledVector(right, -dx * panScale)
    .addScaledVector(flatForward, dy * panScale);

  if (cameraPanOffset.lengthSq() > 900) {
    cameraPanOffset.setLength(30);
  }
}

function getReplayBulldozerProxyPosition(): THREE.Vector3 {
  const dozerProxy = Array.from(demolitionReplayRecording.objects.values()).find((object) => object.name === bulldozer?.name);

  return dozerProxy?.proxy.visible ? dozerProxy.proxy.position.clone() : lastReplayFocusPoint.clone();
}

function updateReplayCamera(dt: number): void {
  const mode = demolitionReplayPlayback.cameraMode;
  const dozerPosition = getReplayBulldozerProxyPosition();
  const followTarget = demolitionReplayPlayback.focusSelectedWall || mode === 'follow-wall'
    ? lastReplayFocusPoint
    : dozerPosition;

  if (mode === 'free') {
    return;
  }

  if (mode === 'top-down') {
    cameraTarget.copy(followTarget);
    camera.position.set(followTarget.x, followTarget.y + 48, followTarget.z + 0.01);
    camera.lookAt(cameraTarget);
    return;
  }

  if (mode === 'cinematic') {
    const orbit = demolitionReplayPlayback.lastAppliedTime * 0.28;
    const radius = 38;

    cameraTarget.copy(followTarget);
    camera.position.set(
      followTarget.x + Math.sin(orbit) * radius,
      followTarget.y + 20,
      followTarget.z + Math.cos(orbit) * radius,
    );
    camera.lookAt(cameraTarget);
    return;
  }

  if (mode === 'follow-bulldozer' || mode === 'gameplay') {
    cameraTarget.set(dozerPosition.x, dozerPosition.y + 1.25, dozerPosition.z);
  } else {
    cameraTarget.copy(followTarget);
  }

  const replayPitch = mode === 'follow-wall' ? 0.58 : cameraPitch;
  const replayDistance = mode === 'follow-wall' ? Math.min(cameraDistance, 38) : cameraDistance;
  const cosPitch = Math.cos(replayPitch);
  const yaw = mode === 'gameplay' ? cameraYaw : cameraYaw + dt * 0.08;
  const desired = tempVec3.set(
    Math.sin(yaw) * cosPitch * replayDistance,
    Math.sin(replayPitch) * replayDistance,
    Math.cos(yaw) * cosPitch * replayDistance,
  );

  camera.position.copy(cameraTarget).add(desired);
  camera.lookAt(cameraTarget);
}

function updateCamera(_dt: number): void {
  if (demolitionReplayPlayback.active) {
    updateReplayCamera(_dt);
    return;
  }

  const position = bulldozer.body.translation();

  if (cameraFpsMode) {
    const bodyPosition = new THREE.Vector3(position.x, position.y, position.z);
    const bodyForward = getBodyForward(bulldozer.body, tempForward).clone();
    const bodyRight = getBodyRight(bulldozer.body, tempRight).clone();
    const keyLookYaw = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0);
    const keyLookPitch = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);

    if (keyLookYaw !== 0) {
      fpsCameraYawOffset += keyLookYaw * 1.75 * _dt;
    }
    if (keyLookPitch !== 0) {
      fpsCameraPitch = THREE.MathUtils.clamp(fpsCameraPitch + keyLookPitch * 1.25 * _dt, -0.72, 0.62);
    }

    const lookYaw = dozerYaw + fpsCameraYawOffset;
    const cosPitch = Math.cos(fpsCameraPitch);
    const lookDirection = tempVec3B.set(
      -Math.sin(lookYaw) * cosPitch,
      Math.sin(fpsCameraPitch),
      -Math.cos(lookYaw) * cosPitch,
    );

    camera.position
      .copy(bodyPosition)
      .addScaledVector(bodyRight, cabLocalOffset.x)
      .addScaledVector(bodyForward, -cabLocalOffset.z + 0.16 * bulldozerScale)
      .setY(position.y + cabLocalOffset.y + cabHalf.y + 0.16 * bulldozerScale);
    cameraTarget.copy(camera.position).add(lookDirection);
    camera.lookAt(cameraTarget);
    return;
  }

  const cosPitch = Math.cos(cameraPitch);
  const desired = tempVec3.set(
    Math.sin(cameraYaw) * cosPitch * cameraDistance,
    Math.sin(cameraPitch) * cameraDistance,
    Math.cos(cameraYaw) * cosPitch * cameraDistance,
  );

  cameraTarget
    .set(position.x, position.y + 1.25, position.z)
    .add(cameraPanOffset);

  desired.add(cameraTarget);
  camera.position.copy(desired);
  camera.lookAt(cameraTarget);
}

function updateHud(): void {
  const destroyedSupports = bridgeSupports.filter((support) => support.entity.stage >= 2).length;
  const crackedSupports = bridgeSupports.filter((support) => support.entity.stage === 1).length;
  const speed = Math.abs(dozerSpeed);
  const bridgeHudLines = bridgeSupports.length > 0 || bridgeDecks.length > 0
    ? [
      `bridge supports cracked ${crackedSupports}, destroyed ${destroyedSupports}/8`,
      `bridge ${state.bridgeCollapsed ? 'collapsed' : 'standing'} | deck pieces dropped ${state.deckPiecesDropped}`,
    ]
    : [];

  hudFpsReadout.textContent = `FPS ${state.fps.toFixed(0)}`;
  hudStatusReadout.textContent = [
    `WASD drive | mouse drag rotate | wheel zoom | right/middle drag pan | R FPS view ${cameraFpsMode ? 'on' : 'off'}`,
    cameraFpsMode ? `FPS view: mouse or arrow keys look | WASD/A-D still drive` : `Orbit view: arrows also drive`,
    `Q/E blade | G pickup | X release | T reset | C recenter | H tuning`,
    `speed ${speed.toFixed(1)} | carried ${state.carriedPieces} pcs / ${state.carriedMass.toFixed(0)} mass`,
    `wall blocks broken ${state.wallPiecesBroken} | wall breached ${state.wallBreaches ? 'yes' : 'no'}`,
    ...bridgeHudLines,
  ].join('\n');
}

function separateDynamicEntityFromBox(
  entity: PhysicsEntity,
  center: THREE.Vector3,
  forward: THREE.Vector3,
  right: THREE.Vector3,
  half: THREE.Vector3,
  allowTopRest = false,
): void {
  if (!entity.body.isDynamic() || entity.carried) {
    return;
  }

  const position = entity.body.translation();
  const dx = position.x - center.x;
  const dy = position.y - center.y;
  const dz = position.z - center.z;
  const localRight = dx * right.x + dz * right.z;
  const localForward = dx * forward.x + dz * forward.z;
  const horizontalOverlapRight = half.x + entity.halfExtents.x + 0.08 - Math.abs(localRight);
  const horizontalOverlapForward = half.z + entity.halfExtents.z + 0.08 - Math.abs(localForward);
  const verticalOverlap = half.y + entity.halfExtents.y + 0.08 - Math.abs(dy);

  if (allowTopRest && horizontalOverlapRight > 0 && horizontalOverlapForward > 0) {
    const topY = center.y + half.y;
    const bottomY = position.y - entity.halfExtents.y;
    const restingGap = bottomY - topY;
    const isStructuralWallDebris = Boolean(entity.mesh.userData.structuralCollapseDebris);
    const minRestingGap = isStructuralWallDebris ? -0.16 : -0.1;
    const maxRestingGap = isStructuralWallDebris ? 0.34 : 0.26;

    if (position.y > center.y && restingGap > minRestingGap && restingGap < maxRestingGap) {
      const velocity = entity.body.linvel();
      const settledY = topY + entity.halfExtents.y + (isStructuralWallDebris ? 0.045 : 0.018);
      const horizontalDamping = isStructuralWallDebris ? 0.82 : 0.38;
      const verticalVelocity = isStructuralWallDebris
        ? Math.min(Math.max(-0.18, velocity.y), 0.08)
        : Math.max(0, velocity.y) * 0.12;
      const angularDamping = isStructuralWallDebris ? 0.72 : 0.28;
      const angularVelocity = entity.body.angvel();

      entity.body.setTranslation({ x: position.x, y: settledY, z: position.z }, true);
      entity.body.setLinvel({ x: velocity.x * horizontalDamping, y: verticalVelocity, z: velocity.z * horizontalDamping }, true);
      entity.body.setAngvel(
        {
          x: isStructuralWallDebris ? angularVelocity.x * angularDamping : 0,
          y: angularVelocity.y * angularDamping,
          z: isStructuralWallDebris ? angularVelocity.z * angularDamping : 0,
        },
        true,
      );
      return;
    }
  }

  if (horizontalOverlapRight <= 0 || horizontalOverlapForward <= 0 || verticalOverlap <= 0) {
    return;
  }

  const pushAlongRight = horizontalOverlapRight < horizontalOverlapForward;
  const sign = pushAlongRight
    ? (localRight >= 0 ? 1 : -1)
    : (localForward >= 0 ? 1 : -1);
  const push = pushAlongRight ? right.clone().multiplyScalar(sign) : forward.clone().multiplyScalar(sign);
  const pushDistance = (pushAlongRight ? horizontalOverlapRight : horizontalOverlapForward) + 0.06;
  const isRoofCollapseDebris = Boolean(entity.mesh.userData.roofCollapseDebris);
  const isStructuralWallDebris = Boolean(entity.mesh.userData.structuralCollapseDebris);
  const currentVelocity = entity.body.linvel();

  entity.body.setTranslation(
    {
      x: position.x + push.x * pushDistance,
      y: position.y,
      z: position.z + push.z * pushDistance,
    },
    true,
  );
  entity.body.setLinvel(
    {
      x: push.x * (isRoofCollapseDebris ? 0.55 : isStructuralWallDebris ? 0.42 : 1.4),
      y: isRoofCollapseDebris
        ? Math.min(currentVelocity.y, -0.08)
        : isStructuralWallDebris
          ? Math.min(currentVelocity.y, -0.18)
          : Math.max(0.2, currentVelocity.y),
      z: push.z * (isRoofCollapseDebris ? 0.55 : isStructuralWallDebris ? 0.42 : 1.4),
    },
    true,
  );
}

function countDynamicEntitiesOverlappingBox(
  center: THREE.Vector3,
  forward: THREE.Vector3,
  right: THREE.Vector3,
  half: THREE.Vector3,
): number {
  return entities.filter((entity) => {
    if (!entity.body.isDynamic() || entity.carried) {
      return false;
    }

    const position = entity.body.translation();
    const dx = position.x - center.x;
    const dy = position.y - center.y;
    const dz = position.z - center.z;
    const localRight = dx * right.x + dz * right.z;
    const localForward = dx * forward.x + dz * forward.z;

    return (
      Math.abs(localRight) < half.x + entity.halfExtents.x &&
      Math.abs(localForward) < half.z + entity.halfExtents.z &&
      Math.abs(dy) < half.y + entity.halfExtents.y
    );
  }).length;
}

function countDynamicEntitiesRestingOnBoxTop(
  center: THREE.Vector3,
  forward: THREE.Vector3,
  right: THREE.Vector3,
  half: THREE.Vector3,
): number {
  return entities.filter((entity) => {
    if (!entity.body.isDynamic() || entity.carried) {
      return false;
    }

    const position = entity.body.translation();
    const dx = position.x - center.x;
    const dy = position.y - center.y;
    const dz = position.z - center.z;
    const localRight = dx * right.x + dz * right.z;
    const localForward = dx * forward.x + dz * forward.z;
    const bottomY = position.y - entity.halfExtents.y;
    const topGap = bottomY - (center.y + half.y);

    return (
      Math.abs(localRight) < half.x + entity.halfExtents.x &&
      Math.abs(localForward) < half.z + entity.halfExtents.z &&
      topGap > -0.12 &&
      topGap < 0.3 &&
      dy > 0
    );
  }).length;
}

function resolveDebrisAgainstBulldozer(): void {
  const dozerPosition = bulldozer.body.translation();
  const forward = getBodyForward(bulldozer.body, tempForward).clone();
  const right = getBodyRight(bulldozer.body, tempRight).clone();
  const chassisCenter = tempVec3.set(dozerPosition.x, dozerPosition.y, dozerPosition.z);
  const bladePosition = getBladeWorldPosition(tempVec3B);
  const cabCenter = new THREE.Vector3(dozerPosition.x, dozerPosition.y, dozerPosition.z)
    .addScaledVector(right, cabLocalOffset.x)
    .addScaledVector(forward, -cabLocalOffset.z)
    .setY(dozerPosition.y + cabLocalOffset.y);

  for (const entity of entities) {
    if (entity.kind !== 'debris' && entity.kind !== 'column' && entity.kind !== 'deck') {
      continue;
    }
    if (!entity.body.isDynamic() || entity.carried) {
      continue;
    }

    if (!isEntityNearBulldozer(entity, 4.8)) {
      continue;
    }

    separateDynamicEntityFromBox(entity, chassisCenter, forward, right, bulldozer.halfExtents, true);
    separateDynamicEntityFromBox(entity, cabCenter, forward, right, cabHalf, true);
    separateDynamicEntityFromBox(entity, bladePosition, forward, right, bladeHalf, true);
  }
}

function stepSimulation(dt: number): void {
  simulationStep += 1;
  const structuralCountBefore = state.wallPiecesBroken + state.visualWallImpacts + state.secondaryWallImpacts;
  const dynamicStructureActiveBefore = entities.some((entity) => (
    entity.body.isDynamic() &&
    (entity.kind === 'debris' || entity.kind === 'wall' || entity.kind === 'deck')
  ));
  updateBulldozerControls(dt);
  updateCarriedDebris();
  reactivateSettledDebrisNearBulldozer();
  driveStructuralWallDebrisTowardFlatFall();
  stabilizeCollapsedRoofDebris();
  physicsWorld.step();
  stabilizeCollapsedRoofDebris();
  processVehicleDamage();
  const dynamicStructureActiveAfterVehicle = dynamicStructureActiveBefore || entities.some((entity) => (
    entity.body.isDynamic() &&
    (entity.kind === 'debris' || entity.kind === 'wall' || entity.kind === 'deck')
  ));

  if (dynamicStructureActiveAfterVehicle || wallChunks.some((chunk) => !chunk.fragmented)) {
    processSecondaryWallImpacts();
    processWallChunks();
    processDynamicWallFractures();
  }

  const structuralCountAfter = state.wallPiecesBroken + state.visualWallImpacts + state.secondaryWallImpacts;

  if (structuralCountAfter !== structuralCountBefore || dynamicStructureActiveAfterVehicle || hasActiveWallFaceStress()) {
    releaseUnsupportedWallBlocks();
    releaseUnsupportedStaticWallVisuals();
    updateWallGravitySag();
    driveStructuralWallDebrisTowardFlatFall();
  }

  resolveDebrisAgainstBulldozer();
  stabilizeCollapsedRoofDebris();
  settleDynamicRubble();
  entities.forEach(syncMeshFromBody);
  updateDemolitionRecorder();
}

function simulationNeedsStep(): boolean {
  if (
    keys.size > 0 ||
    controlOverride ||
    touchControlOverride ||
    demolitionReplayRecording.recording ||
    state.carriedPieces > 0 ||
    Math.abs(dozerSpeed) > 0.01 ||
    hasActiveWallFaceStress()
  ) {
    return true;
  }

  return entities.some((entity) => entity.body.isDynamic() && !entity.carried);
}

function update(delta: number): void {
  const clampedDelta = Math.min(0.08, delta);

  if (demolitionReplayPlayback.active) {
    updateDemolitionReplayPlayback();
    updateCamera(clampedDelta);
    updateHud();
    return;
  }

  if (!simulationNeedsStep()) {
    accumulatedTime = 0;
    updateCamera(clampedDelta);
    updateHud();
    return;
  }

  accumulatedTime += clampedDelta;
  let steps = 0;

  while (accumulatedTime >= fixedDt && steps < maxPhysicsSteps) {
    stepSimulation(fixedDt);
    accumulatedTime -= fixedDt;
    steps += 1;
  }

  updateCamera(clampedDelta);
  updateHud();
}

function render(): void {
  renderer.render(scene, camera);
}

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate(): void {
  const now = performance.now();
  const delta = (now - lastTimestamp) / 1000;

  lastTimestamp = now;

  frameCounter += 1;
  lastFpsUpdate += delta;
  if (lastFpsUpdate >= 0.5) {
    state.fps = frameCounter / lastFpsUpdate;
    frameCounter = 0;
    lastFpsUpdate = 0;
  }

  update(delta);
  render();
  nextRenderTimestamp += targetRenderFrameMs;
  if (nextRenderTimestamp < now) {
    nextRenderTimestamp = now + targetRenderFrameMs;
  }
  window.setTimeout(animate, Math.max(0, nextRenderTimestamp - performance.now()));
}

function createGui(): void {
  const gui = new GUI({ title: 'House Destruction Tuning' });
  const wallFolder = gui.addFolder('Wall response');
  const supportFolder = gui.addFolder('Support and roof');
  const dozerFolder = gui.addFolder('Bulldozer');
  const replayFolder = gui.addFolder('Demolition Replay');

  gui.add(draftSettings, 'resetScene').name('Reset Scene');
  wallFolder.add(draftSettings, 'wallBreakDamage', 8, 36, 1).name('brick toughness');
  wallFolder.add(draftSettings, 'wallImpactDamageScale', 0.35, 1.4, 0.05).name('blade damage scale');
  wallFolder.add(draftSettings, 'secondaryImpactThreshold', 18, 80, 1).name('rubble hit threshold');
  wallFolder.add(draftSettings, 'destructionSpeed', 0.5, 3.5, 0.1).name('debris throw speed');
  supportFolder.add(draftSettings, 'supportReleaseRatio', 0.18, 0.75, 0.01).name('wall support loss');
  supportFolder.add(draftSettings, 'roofDropSupportRatio', 0.12, 0.7, 0.01).name('roof drop support');
  supportFolder
    .add(draftSettings, 'criticalBearingDelayFrames', 30, 300, 5)
    .name('lean delay frames')
    .onChange((value: number) => {
      const delayFrames = Math.round(THREE.MathUtils.clamp(value, 30, 300));

      draftSettings.criticalBearingDelayFrames = delayFrames;
      tuning.criticalBearingDelayFrames = delayFrames;
      saveSettings();
    });
  supportFolder
    .add(draftSettings, 'criticalBearingLeanSpeed', 0.05, 1.45, 0.05)
    .name('lean speed')
    .onChange((value: number) => {
      const leanSpeed = THREE.MathUtils.clamp(value, 0.05, 1.45);

      draftSettings.criticalBearingLeanSpeed = leanSpeed;
      tuning.criticalBearingLeanSpeed = leanSpeed;
      saveSettings();
    });
  dozerFolder.add(draftSettings, 'engineTorque', 20, 140, 1).name('engine torque');
  dozerFolder.add(draftSettings, 'debrisPickupRange', 1.2, 5.5, 0.1).name('pickup range');
  dozerFolder.add(draftSettings, 'maxCarryMass', 20, 140, 1).name('carry mass');
  replayFolder.add(replayUiState, 'play').name('Replay / Play');
  replayFolder.add(replayUiState, 'pause').name('Pause');
  replayFolder.add(replayUiState, 'stop').name('Stop');
  replayFolder.add(replayUiState, 'stepBack').name('Back');
  replayFolder.add(replayUiState, 'stepForward').name('Forward');
  replayScrubController = replayFolder
    .add(replayUiState, 'currentTime', 0, 0.1, 0.01)
    .name('timeline')
    .onChange((value: number) => {
      if (!demolitionReplayRecording.complete) {
        return;
      }
      demolitionReplayPlayback.active = true;
      demolitionReplayPlayback.playing = false;
      demolitionReplayPlayback.currentTime = THREE.MathUtils.clamp(Number(value), 0, demolitionReplayRecording.duration);
      setReplayLiveSourcesVisible(false);
      applyDemolitionReplayTime(getReplayDisplayTime());
    });
  replayFolder
    .add(replayUiState, 'hValue', 0.1, 4, 0.05)
    .name('H Value')
    .onChange((value: number) => {
      demolitionReplayPlayback.speed = THREE.MathUtils.clamp(Number(value), 0.1, 4);
      updateReplayUiReadouts();
    });
  replayFolder
    .add(replayUiState, 'selectedWall', ['all', ...replayFaces])
    .name('wall selector')
    .onChange((value: HouseBlockFace | 'all') => {
      demolitionReplayPlayback.selectedWall = value;
      applyDemolitionReplayTime(getReplayDisplayTime());
    });
  replayFolder
    .add(replayUiState, 'focusSelectedWall')
    .name('focus selected wall')
    .onChange((value: boolean) => {
      demolitionReplayPlayback.focusSelectedWall = value;
    });
  replayFolder
    .add(replayUiState, 'isolateSelectedWall')
    .name('isolate selected wall')
    .onChange((value: boolean) => {
      demolitionReplayPlayback.isolateSelectedWall = value;
      applyDemolitionReplayTime(getReplayDisplayTime());
    });
  replayFolder
    .add(replayUiState, 'showGhostOriginal')
    .name('ghost original structure')
    .onChange((value: boolean) => {
      demolitionReplayPlayback.showGhostOriginal = value;
      applyDemolitionReplayTime(getReplayDisplayTime());
    });
  replayFolder
    .add(replayUiState, 'reverseReconstruction')
    .name('reverse reconstruction')
    .onChange((value: boolean) => {
      demolitionReplayPlayback.reverseReconstruction = value;
      applyDemolitionReplayTime(getReplayDisplayTime());
    });
  replayFolder
    .add(replayUiState, 'cameraMode', ['free', 'follow-bulldozer', 'follow-wall', 'gameplay', 'top-down', 'cinematic'])
    .name('camera mode')
    .onChange((value: ReplayCameraMode) => {
      demolitionReplayPlayback.cameraMode = value;
    });
  replayFolder.add(replayUiState, 'stats').name('stats').listen();
  replayFolder.add(replayUiState, 'eventMarkers').name('markers').listen();
  gui.add(draftSettings, 'apply').name('Apply Settings');
  wallFolder.open();
  supportFolder.open();
  replayFolder.open();
  gui.domElement.style.display = 'none';
  debugGui = gui;
  replayUiControllers = [
    ...((replayFolder as unknown as { controllers?: Array<ReturnType<GUI['add']>> }).controllers ?? []),
  ];
  updateReplayUiReadouts();
}

function buildDebugPayload(): string {
  const dozerPosition = bulldozer?.body.translation();
  const speed = bulldozer ? Math.abs(dozerSpeed) : 0;
  const structuralStats = updateStructuralSupportGraph();
  const roofCollapseDebris = entities.filter((entity) => entity.mesh.userData.roofCollapseDebris && entity.body.isDynamic());
  const roofCollapseMaxY = roofCollapseDebris.reduce((maxY, entity) => Math.max(maxY, entity.body.translation().y), 0);
  const roofCollapseMaxUpVelocity = roofCollapseDebris.reduce((maxVelocity, entity) => Math.max(maxVelocity, entity.body.linvel().y), -Infinity);
  let chassisOverlappingDynamicBlocks = 0;
  let chassisRestingDynamicBlocks = 0;
  let structuralDebrisNearDozer = 0;
  let bladeRestingDynamicBlocks = 0;
  let cabOverlappingDynamicBlocks = 0;

  if (dozerPosition) {
    const forward = getBodyForward(bulldozer.body, tempForward).clone();
    const right = getBodyRight(bulldozer.body, tempRight).clone();
    const cabCenter = new THREE.Vector3(dozerPosition.x, dozerPosition.y, dozerPosition.z)
      .addScaledVector(right, cabLocalOffset.x)
      .addScaledVector(forward, -cabLocalOffset.z)
      .setY(dozerPosition.y + cabLocalOffset.y);
    const bladeCenter = getBladeWorldPosition(new THREE.Vector3());

    chassisOverlappingDynamicBlocks = countDynamicEntitiesOverlappingBox(new THREE.Vector3(dozerPosition.x, dozerPosition.y, dozerPosition.z), forward, right, bulldozer.halfExtents);
    chassisRestingDynamicBlocks = countDynamicEntitiesRestingOnBoxTop(new THREE.Vector3(dozerPosition.x, dozerPosition.y, dozerPosition.z), forward, right, bulldozer.halfExtents);
    structuralDebrisNearDozer = entities.filter((entity) => {
      if (!entity.mesh.userData.structuralCollapseDebris || !entity.body.isDynamic()) {
        return false;
      }
      const position = entity.body.translation();
      return Math.hypot(position.x - dozerPosition.x, position.z - dozerPosition.z) < 9;
    }).length;
    bladeRestingDynamicBlocks = countDynamicEntitiesRestingOnBoxTop(bladeCenter, forward, right, bladeHalf);
    cabOverlappingDynamicBlocks = countDynamicEntitiesOverlappingBox(cabCenter, forward, right, cabHalf);
  }

  return JSON.stringify({
    controls: {
      camera: {
        distance: Number(cameraDistance.toFixed(2)),
        mode: cameraFpsMode ? 'fps' : 'orbit',
        panX: Number(cameraPanOffset.x.toFixed(2)),
        panZ: Number(cameraPanOffset.z.toFixed(2)),
        pitch: Number(cameraPitch.toFixed(3)),
        fpsPitch: Number(fpsCameraPitch.toFixed(3)),
        fpsYawOffset: Number(fpsCameraYawOffset.toFixed(3)),
        yaw: Number(cameraYaw.toFixed(3)),
      },
      keys: Array.from(keys).sort(),
    },
    coordinateSystem: 'Three.js world, +Y up, bulldozer starts at z=18 facing negative Z',
    physics: {
      activeDynamicBodies: entities.filter((entity) => entity.body.isDynamic()).length,
      bodyCount: entities.length,
      fixedDt,
      gravity: tuning.gravity,
      kinematicBodies: entities.filter((entity) => entity.body.isKinematic()).length,
      maxCarryMass: tuning.maxCarryMass,
      vehicleMotion: 'kinematic-position-target',
    },
    settings: {
      applied: tuning,
      draftCriticalBearingDelayFrames: Number(draftSettings.criticalBearingDelayFrames.toFixed(0)),
      draftCriticalBearingLeanSpeed: Number(draftSettings.criticalBearingLeanSpeed.toFixed(2)),
      draftDestructionSpeed: Number(draftSettings.destructionSpeed.toFixed(1)),
      draftRoofDropSupportRatio: Number(draftSettings.roofDropSupportRatio.toFixed(2)),
      draftSecondaryImpactThreshold: Number(draftSettings.secondaryImpactThreshold.toFixed(0)),
      draftSupportReleaseRatio: Number(draftSettings.supportReleaseRatio.toFixed(2)),
      draftWallBreakDamage: Number(draftSettings.wallBreakDamage.toFixed(0)),
      draftWallImpactDamageScale: Number(draftSettings.wallImpactDamageScale.toFixed(2)),
    },
    state,
    bulldozer: dozerPosition
      ? {
          speed: Number(speed.toFixed(2)),
          turnSpeed: Number(dozerTurnSpeed.toFixed(3)),
          x: Number(dozerPosition.x.toFixed(2)),
          y: Number(dozerPosition.y.toFixed(2)),
          yaw: Number(dozerYaw.toFixed(3)),
          z: Number(dozerPosition.z.toFixed(2)),
        }
      : null,
    bridge: {
      collapsed: state.bridgeCollapsed,
      destroyedSupports: bridgeSupports.filter((support) => support.entity.stage >= 2).length,
      crackedSupports: bridgeSupports.filter((support) => support.entity.stage === 1).length,
      droppedDecks: state.deckPiecesDropped,
    },
    wall: {
      brokenBlocks: wallBlocks.filter((block) => block.stage >= 2).length,
      secondaryWallImpacts: state.secondaryWallImpacts,
      structuralWallReleases: state.structuralWallReleases,
      visualWallImpacts: state.visualWallImpacts,
      dynamicBlocks: wallBlocks.filter((block) => block.body.isDynamic()).length,
      fixedBlocks: wallBlocks.filter((block) => !block.body.isDynamic()).length,
      activeChunks: wallChunks.filter((chunk) => !chunk.fragmented).length,
      chunkSourceBricks: wallChunks.reduce((total, chunk) => total + chunk.sourceBricks.length, 0),
      chippedWallSlabs: state.chippedWallSlabs,
      decoratedBlocks: wallBlocks.filter((block) => block.mesh.children.length > 0).length,
      doorPanelsDropped: state.doorPanelsDropped,
      glassShatterEvents: state.glassShatterEvents,
      roomFloors: entities.filter((entity) => entity.name.includes('room-floor')).length,
      roomPartitions: entities.filter((entity) => entity.name.includes('interior-')).length,
      roofCollapseDebris: roofCollapseDebris.length,
      roofCollapseMaxUpVelocity: Number((roofCollapseDebris.length > 0 ? roofCollapseMaxUpVelocity : 0).toFixed(3)),
      roofCollapseMaxY: Number(roofCollapseMaxY.toFixed(2)),
      fracturedBlocks: fracturedWallBlockCount,
      intactBrickVisuals: getIntactBrickVisualCount(),
      independentBrickVisuals: getIndependentBrickVisualCount(),
      independentPhysicalBricks: entities.filter((entity) => entity.name.includes('-independent-brick-')).length,
      dynamicDebris: getDynamicDebrisCount(),
      structural: {
        bonds: structuralBonds.length,
        brokenBonds: structuralStats.brokenBonds,
        islands: structuralStats.islandCount,
        nodes: structuralStats.nodes,
        unsupportedIslands: structuralStats.unsupportedIslands,
        unsupportedNodes: structuralStats.unsupportedNodes.size,
      },
      settledVisualDebris: settledDebrisVisuals.length,
      floatingSettledDebris: getFloatingSettledDebrisCount(),
      reactivatableDebris: settledDebrisVisuals.filter((object) => object.userData.settledDebris).length,
      shardDebris: entities.filter((entity) => entity.name.includes('-shard-')).length,
      airborneDynamicDebris: getAirborneDynamicDebrisCount(),
      chassisOverlappingDynamicBlocks,
      chassisRestingDynamicBlocks,
      structuralDebrisNearDozer,
      bladeRestingDynamicBlocks,
      staticVisualBlocks: staticWallVisuals.length,
      taggedStaticVisualBlocks: staticWallVisuals.filter((object) => getStaticWallVisualInfo(object)).length,
      unsupportedStaticVisualBlocks: getUnsupportedStaticVisualBlockCount(),
      rowsBroken: Array.from({ length: wallBlockRows }, (_, row) =>
        wallBlocks.filter((block) => block.wallBlock?.face === 'front' && block.wallBlock.row === row && block.stage >= 2).length,
      ),
      faceBlocks: {
        back: wallBlocks.filter((block) => block.wallBlock?.face === 'back').length,
        front: wallBlocks.filter((block) => block.wallBlock?.face === 'front').length,
        left: wallBlocks.filter((block) => block.wallBlock?.face === 'left').length,
        right: wallBlocks.filter((block) => block.wallBlock?.face === 'right').length,
        roof: wallBlocks.filter((block) => block.wallBlock && isRoofFace(block.wallBlock.face)).length,
      },
      faceStress: Object.fromEntries(
        (['front', 'back', 'left', 'right'] as HouseBlockFace[]).map((face) => {
          const stress = getWallFaceStress(face);
          return [face, {
            collapse: Number(stress.collapse.toFixed(3)),
            criticalBearingSteps: stress.criticalBearingSteps,
            direction: stress.direction,
            foundationRatio: Number(stress.foundationRatio.toFixed(3)),
            imbalance: Number(stress.imbalance.toFixed(3)),
            lastBearingContactStep: stress.lastBearingContactStep,
            lean: Number(stress.lean.toFixed(3)),
            supportRatio: Number(stress.supportRatio.toFixed(3)),
          }];
        }),
      ),
      facePanelLeanAngles: Object.fromEntries(
        (['front', 'back', 'left', 'right'] as HouseBlockFace[]).map((face) => [
          face,
          Number(getWallFacePanelLeanAngle(face).toFixed(3)),
        ]),
      ),
      faceForwardLeanAngles: Object.fromEntries(
        (['front', 'back', 'left', 'right'] as HouseBlockFace[]).map((face) => [
          face,
          Number(getWallFaceForwardPanelLeanAngle(face).toFixed(3)),
        ]),
      ),
      maxBulge: Number(
        wallBlocks.reduce((largest, block) => Math.max(largest, block.wallBlock?.bulge.length() ?? 0), 0).toFixed(3),
      ),
      maxGravitySag: Number(
        wallBlocks.reduce((largest, block) => Math.max(largest, Math.max(0, -(block.wallBlock?.sag.y ?? 0))), 0).toFixed(3),
      ),
      saggingBlocks: wallBlocks.filter((block) => Math.max(0, -(block.wallBlock?.sag.y ?? 0)) > 0.05).length,
      cabOverlappingDynamicBlocks,
      totalBlocks: wallBlocks.length,
      directVerticalSupportGaps: wallBlocks.filter((block) => {
        const info = block.wallBlock;

        if (!info || isRoofFace(info.face) || info.row === 0 || block.stage >= 2) {
          return false;
        }

        const support = getHouseBlock(info.face, info.row - 1, info.column);
        return !support || support.stage >= 2;
      }).length,
      unsupportedFixedBlocks: wallBlocks.filter((block) => {
        const info = block.wallBlock;

        if (!info || isRoofFace(info.face) || info.row === 0 || block.stage >= 2) {
          return false;
        }

        return isStructuralNodeUnsupported(info, structuralStats);
      }).length,
    },
    replay: {
      active: demolitionReplayPlayback.active,
      cameraMode: demolitionReplayPlayback.cameraMode,
      complete: demolitionReplayRecording.complete,
      currentTime: Number(demolitionReplayPlayback.currentTime.toFixed(2)),
      displayTime: Number(getReplayDisplayTime().toFixed(2)),
      duration: Number(demolitionReplayRecording.duration.toFixed(2)),
      events: demolitionReplayRecording.events.length,
      frames: demolitionReplayRecording.frames.length,
      hValue: Number(demolitionReplayPlayback.speed.toFixed(2)),
      markers: demolitionReplayRecording.events.slice(-6).map((event) => ({
        face: event.face ?? 'global',
        time: Number(event.timestamp.toFixed(2)),
        type: event.type,
      })),
      playing: demolitionReplayPlayback.playing,
      proxyObjects: demolitionReplayRecording.objects.size,
      proxiesVisible: Array.from(demolitionReplayRecording.objects.values()).filter((object) => object.proxy.visible).length,
      recording: demolitionReplayRecording.recording,
      reverseReconstruction: demolitionReplayPlayback.reverseReconstruction,
      selectedWall: demolitionReplayPlayback.selectedWall,
      wallTracks: Object.fromEntries(
        replayFaces.map((face) => {
          const track = demolitionReplayRecording.wallTracks.get(face);

          return [face, {
            destroyedTime: track?.destroyedTime === null || !track ? null : Number(track.destroyedTime.toFixed(2)),
            events: track?.events.length ?? 0,
            firstContactTime: track?.firstContactTime === null || !track ? null : Number(track.firstContactTime.toFixed(2)),
            firstDamageTime: track?.firstDamageTime === null || !track ? null : Number(track.firstDamageTime.toFixed(2)),
            samples: track?.samples.length ?? 0,
          }];
        }),
      ),
    },
  });
}

function drivePrototypeForTest(frames = 120, throttle = 1, steering = 0, lowerBlade = true): unknown {
  controlOverride = {
    lowGear: true,
    lowerBlade,
    steering: THREE.MathUtils.clamp(Number(steering), -1, 1),
    throttle: THREE.MathUtils.clamp(Number(throttle), -1, 1),
  };

  const steps = Math.max(1, Math.min(600, Math.floor(Number(frames))));

  for (let index = 0; index < steps; index += 1) {
    update(fixedDt);
  }

  controlOverride = null;
  render();

  return JSON.parse(buildDebugPayload()) as unknown;
}

function touchSteeringWheelForTest(steering = -1, frames = 90): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as unknown;
  touchControlState.steering = THREE.MathUtils.clamp(Number(steering), -1, 1);
  updateTouchControlOverride();

  const steps = Math.max(1, Math.min(240, Math.floor(Number(frames))));

  for (let index = 0; index < steps; index += 1) {
    update(fixedDt);
  }

  touchControlState.steering = 0;
  updateTouchControlOverride();
  render();

  return {
    after: JSON.parse(buildDebugPayload()) as unknown,
    before,
  };
}

function setBulldozerPoseForTest(x: number, z: number, yaw = 0): void {
  dozerYaw = yaw;
  dozerSpeed = 0;
  dozerTurnSpeed = 0;
  tempQuat.setFromAxisAngle(yAxis, dozerYaw);
  const position = new THREE.Vector3(x, dozerGroundY, z);
  const forward = tempForward.set(0, 0, -1).applyQuaternion(tempQuat).setY(0).normalize();

  bulldozer.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
  bulldozer.body.setNextKinematicTranslation({ x: position.x, y: position.y, z: position.z });
  bulldozer.body.setRotation(tempQuat, true);
  bulldozer.body.setNextKinematicRotation(tempQuat);

  const bladePosition = position.clone().addScaledVector(forward, bladeMountDistance);
  blade.body.setTranslation({ x: bladePosition.x, y: position.y - 0.06, z: bladePosition.z }, true);
  blade.body.setNextKinematicTranslation({ x: bladePosition.x, y: position.y - 0.06, z: bladePosition.z });
  blade.body.setRotation(tempQuat, true);
  blade.body.setNextKinematicRotation(tempQuat);
  entities.forEach(syncMeshFromBody);
  updateCamera(fixedDt);
  render();
}

function reverseDamageForTest(): unknown {
  resetPrototype();
  setBulldozerPoseForTest(0, houseCenterZ, 0);
  return drivePrototypeForTest(140, -1, 0, false);
}

function rearReverseWallContactForTest(): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  // Face away from the front wall, then reverse so the chassis rear hits first.
  setBulldozerPoseForTest(0, solidWallZ + bulldozer.halfExtents.z + solidWallThickness + 0.28, Math.PI);
  const after = drivePrototypeForTest(90, -1, 0, false) as Record<string, unknown>;

  return {
    after,
    before,
    rearReverseContact: {
      impactEventsDelta: Number((after.state as PrototypeState).impactEvents) - Number((before.state as PrototypeState).impactEvents),
      wallPiecesDelta: Number((after.state as PrototypeState).wallPiecesBroken) - Number((before.state as PrototypeState).wallPiecesBroken),
    },
  };
}

function sideRearReverseWallContactForTest(): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as Record<string, unknown>;
  const rightWallX = solidWallWidth / 2 + solidWallThickness / 2;
  const rearOffset = Math.max(2.0, bulldozer.halfExtents.z - 0.35);

  // Match the side-wall screenshot: blade points away from the house, rear backs into the right wall.
  setBulldozerPoseForTest(rightWallX + rearOffset + solidWallThickness + 0.42, houseCenterZ, -Math.PI / 2);
  const after = drivePrototypeForTest(100, -1, 0, false) as Record<string, unknown>;

  return {
    after,
    before,
    sideRearReverseContact: {
      impactEventsDelta: Number((after.state as PrototypeState).impactEvents) - Number((before.state as PrototypeState).impactEvents),
      rightFaceRemaining: Number((after.wall as { faceBlocks?: { right?: number } }).faceBlocks?.right ?? 0),
      wallPiecesDelta: Number((after.state as PrototypeState).wallPiecesBroken) - Number((before.state as PrototypeState).wallPiecesBroken),
    },
  };
}

function sideDamageForTest(): unknown {
  resetPrototype();
  setBulldozerPoseForTest(solidWallWidth / 2 + 3.4, houseCenterZ, Math.PI / 2);
  return drivePrototypeForTest(130, 1, 0, false);
}

function sideWallBumpResilienceForTest(): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as unknown;
  const startColumn = Math.max(1, Math.floor(wallSideColumns * 0.3));
  const endColumn = Math.min(wallSideColumns - 2, startColumn + 2);

  for (let column = startColumn; column <= endColumn; column += 1) {
    const block = getHouseBlock('right', 0, column);

    if (block) {
      breakWallBlock(block, new THREE.Vector3(5.2, 0.45, 0), new THREE.Vector3(0.32, -0.04, 0));
    }
  }

  releaseUnsupportedWallBlocks();
  updateWallGravitySag();

  for (let index = 0; index < 220; index += 1) {
    update(fixedDt);
  }

  cameraPanOffset.set(solidWallWidth * 0.16, 0, -houseDepth * 0.05);
  cameraYaw = -0.92;
  cameraPitch = 0.3;
  cameraDistance = 38;
  updateCamera(fixedDt);
  render();

  const after = JSON.parse(buildDebugPayload()) as unknown;

  return { after, before };
}

function backDamageForTest(): unknown {
  resetPrototype();
  setBulldozerPoseForTest(0, solidWallZ - houseDepth - 3.4, Math.PI);
  return drivePrototypeForTest(130, 1, 0, false);
}

function stationaryTurnWallDamageForTest(frames = 120, steering = 1): unknown {
  resetPrototype();
  setBulldozerPoseForTest(solidWallWidth / 2 + 0.95, houseCenterZ, 0);
  const before = JSON.parse(buildDebugPayload()) as Record<string, unknown>;
  const after = drivePrototypeForTest(frames, 0, steering, false) as Record<string, unknown>;

  cameraPanOffset.set(-solidWallWidth * 0.18, 0, -houseDepth * 0.12);
  cameraYaw = -0.72;
  cameraPitch = 0.32;
  cameraDistance = 42;
  updateCamera(fixedDt);
  render();

  return {
    after,
    before,
    stationaryTurnTest: {
      impactEventsDelta: Number((after.state as PrototypeState).impactEvents) - Number((before.state as PrototypeState).impactEvents),
      steering,
      wallPiecesDelta: Number((after.state as PrototypeState).wallPiecesBroken) - Number((before.state as PrototypeState).wallPiecesBroken),
    },
  };
}

function reactivateRubbleForTest(): unknown {
  resetPrototype();
  breakWallForTest(190);
  for (let index = 0; index < 480; index += 1) {
    update(fixedDt);
  }

  const before = JSON.parse(buildDebugPayload()) as Record<string, unknown>;
  const target = settledDebrisVisuals[0];

  if (target) {
    setBulldozerPoseForTest(target.position.x, target.position.z + 2.2, 0);
    for (let index = 0; index < 30; index += 1) {
      update(fixedDt);
    }
  }

  const after = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  return { before, after };
}

function secondaryWallImpactForTest(speed = 18, mass = 18): unknown {
  resetPrototype();

  const blockHeight = solidWallHeight / wallBlockRows;
  const movingHalf = new THREE.Vector3(2.2, blockHeight * 0.34, 0.55);
  const movingPosition = new THREE.Vector3(-solidWallWidth * 0.25, movingHalf.y + 0.2, solidWallZ + 5.5);
  const movingWall = createDynamicBox(
    'test-moving-wall-impact-block',
    'wall',
    movingHalf,
    movingPosition,
    createBrickMaterialForBox(movingHalf, 'fragment', movingPosition, 0),
    Math.max(1, Number(mass)),
    new THREE.Quaternion(),
    0.35,
    0.55,
  );

  movingWall.body.setLinvel({ x: 0, y: 0, z: -Math.max(0, Number(speed)) }, true);
  const before = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  for (let index = 0; index < 120; index += 1) {
    update(fixedDt);
  }

  const after = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  return { before, after };
}

function visualWallImpactForTest(speed = 24, mass = 24): unknown {
  resetPrototype();
  const targetRow = Math.min(wallBlockRows - 1, physicalWallRows + 2);

  const target = staticWallVisuals.find((object) => {
    const info = getStaticWallVisualInfo(object);
    return info?.face === 'back' && info.row === targetRow;
  }) ?? staticWallVisuals.find((object) => getStaticWallVisualInfo(object)?.row === targetRow);
  const info = target ? getStaticWallVisualInfo(target) : undefined;

  if (!target || !info) {
    return {
      before: JSON.parse(buildDebugPayload()) as Record<string, unknown>,
      error: 'no tagged visual wall target found',
    };
  }

  const movingHalf = new THREE.Vector3(info.halfExtents.x * 1.35, 0.42, info.halfExtents.z * 1.65);
  const movingPosition = target.position.clone().add(new THREE.Vector3(0, info.halfExtents.y * 0.15, -6.2));
  const roofPiece = createDynamicBox(
    'test-falling-roof-into-visual-wall',
    'debris',
    movingHalf,
    movingPosition,
    materials.roof,
    Math.max(1, Number(mass)),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.18),
    0.28,
    0.42,
  );

  roofPiece.body.setLinvel({ x: 0, y: -1.2, z: Math.max(0, Number(speed)) }, true);
  const before = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  for (let index = 0; index < 150; index += 1) {
    update(fixedDt);
  }

  const after = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  return { before, after };
}

function staticSupportCollapseForTest(): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as Record<string, unknown>;
  const middle = Math.floor(wallBlockColumns / 2);

  for (let column = middle - 2; column <= middle + 2; column += 1) {
    for (let row = 0; row < physicalWallRows; row += 1) {
      const block = getHouseBlock('back', row, column);

      if (block) {
        damageEntity(block, getWallBreakDamage() + 2, new THREE.Vector3(0, 0.8, 4.8));
      }
    }
  }

  for (let index = 0; index < 180; index += 1) {
    update(fixedDt);
  }
  render();

  const after = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  return { before, after };
}

function airborneSettleGuardForTest(): unknown {
  resetPrototype();
  const halfExtents = new THREE.Vector3(2.4, 1.1, 0.5);
  const debris = createDynamicBox(
    'test-slow-airborne-debris',
    'debris',
    halfExtents,
    new THREE.Vector3(-22, 22, houseCenterZ),
    createBrickMaterialForBox(halfExtents, 'fragment', new THREE.Vector3(-22, 22, houseCenterZ), 8),
    12,
    new THREE.Quaternion(),
    8.5,
    8.5,
  );

  debris.body.setLinvel({ x: 0, y: -0.02, z: 0 }, true);
  debris.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  const before = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  for (let index = 0; index < 420; index += 1) {
    update(fixedDt);
  }

  const after = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  return {
    before,
    after,
    stillDynamic: entities.includes(debris),
    settledVisuals: settledDebrisVisuals.length,
  };
}

function materialBreakageForTest(): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as Record<string, unknown>;
  const middleLeftColumn = Math.floor(wallBlockColumns / 2) - 1;
  const middleRightColumn = Math.floor(wallBlockColumns / 2);
  const leftDoor = getHouseBlock('front', 0, middleLeftColumn);
  const rightDoor = getHouseBlock('front', 0, middleRightColumn);
  const windowBlock = getHouseBlock('front', Math.min(3, physicalWallRows - 1), 4);
  const highWallBlock = getHouseBlock('front', Math.min(physicalWallRows - 1, 3), Math.floor(wallBlockColumns / 2) + 3);

  if (leftDoor) {
    breakWallBlock(leftDoor, new THREE.Vector3(0, -0.2, -5.5), new THREE.Vector3(0, -0.05, -0.42));
  }
  if (rightDoor) {
    breakWallBlock(rightDoor, new THREE.Vector3(0, -0.2, -5.5), new THREE.Vector3(0, -0.05, -0.42));
  }
  if (windowBlock) {
    breakWallBlock(windowBlock, new THREE.Vector3(0, -0.4, -3.8), new THREE.Vector3(0, -0.04, -0.34));
  }
  if (highWallBlock) {
    breakWallBlock(highWallBlock, new THREE.Vector3(0, -2.2, -2.2), new THREE.Vector3(0, -0.12, -0.24));
    shatterWallBlock(highWallBlock);
  }

  for (let index = 0; index < 90; index += 1) {
    update(fixedDt);
  }
  render();

  const after = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  return { before, after };
}

function interiorWallBreakForTest(): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as Record<string, unknown>;
  const target = entities.find((entity) => (
    entity.name.startsWith('interior-') &&
    entity.breakable &&
    entity.kind === 'wall' &&
    !entity.body.isDynamic()
  ));

  if (target) {
    damageEntity(target, getWallBreakDamage() + 2, new THREE.Vector3(0.9, 0.4, -4.8));
  }

  for (let index = 0; index < 80; index += 1) {
    update(fixedDt);
  }
  const brokenInterior = entities
    .filter((entity) => entity.name.startsWith('interior-') && entity.body.isDynamic())
    .map((entity) => ({
      name: entity.name,
      halfExtents: {
        x: Number(entity.halfExtents.x.toFixed(2)),
        y: Number(entity.halfExtents.y.toFixed(2)),
        z: Number(entity.halfExtents.z.toFixed(2)),
      },
      visualChildren: entity.mesh.children.length,
    }));

  const focusEntity = target && entities.includes(target)
    ? target
    : entities.find((entity) => entity.name.startsWith('interior-') && entity.body.isDynamic());

  if (focusEntity) {
    const focusPosition = focusEntity.body.translation();
    const bulldozerPosition = bulldozer.body.translation();

    cameraPanOffset.set(
      focusPosition.x - bulldozerPosition.x,
      0,
      focusPosition.z - bulldozerPosition.z,
    );
    cameraYaw = 1.15;
    cameraPitch = 0.38;
    cameraDistance = 24;
  }

  render();

  const after = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  return { before, after, brokenInterior };
}

function breakWallForTest(count = 8): unknown {
  const hits = Math.max(1, Math.min(wallBlocks.length, Math.floor(Number(count))));

  for (let index = 0; index < hits; index += 1) {
    const row = index % wallBlockRows;
    const column = Math.floor(wallBlockColumns / 2) + Math.floor(index / wallBlockRows) - 1;
    const block = getWallBlock(row, column);

    if (block) {
      damageEntity(block, getWallBreakDamage() + 2, new THREE.Vector3(0, 1.1, -7.5));
    }
  }
  update(fixedDt);
  render();

  return JSON.parse(buildDebugPayload()) as unknown;
}

function brickSizeMatchForTest(): unknown {
  resetPrototype();
  const block = getHouseBlock('front', 1, Math.floor(wallBlockColumns / 2));

  if (!block?.wallBlock) {
    return { error: 'front wall block not found' };
  }

  const sourceName = block.name;
  const expectedCells = collectWorldBrickGridCells(block.halfExtents, block.wallBlock.home);
  const expectedSizes = expectedCells.map((cell) => ({
    x: Number(cell.scale.x.toFixed(3)),
    y: Number(cell.scale.y.toFixed(3)),
    z: Number(cell.scale.z.toFixed(3)),
  }));

  breakWallBlock(block, new THREE.Vector3(0, 1.1, -7.5));

  const actualSizes = entities
    .filter((entity) => entity.name.startsWith(`${sourceName}-independent-brick-`))
    .map((entity) => ({
      x: Number((entity.halfExtents.x * 2).toFixed(3)),
      y: Number((entity.halfExtents.y * 2).toFixed(3)),
      z: Number((entity.halfExtents.z * 2).toFixed(3)),
    }));
  const matches =
    expectedSizes.length === actualSizes.length &&
    expectedSizes.every((expected, index) => {
      const actual = actualSizes[index];

      return Boolean(
        actual &&
        Math.abs(actual.x - expected.x) < 0.001 &&
        Math.abs(actual.y - expected.y) < 0.001 &&
        Math.abs(actual.z - expected.z) < 0.001,
      );
    });

  render();

  return {
    actualCount: actualSizes.length,
    actualSizes,
    expectedCount: expectedSizes.length,
    expectedSizes,
    matches,
  };
}

function supportCollapseForTest(): unknown {
  resetPrototype();
  breakWallForTest(6);
  for (let index = 0; index < 90; index += 1) {
    update(fixedDt);
  }
  render();

  return JSON.parse(buildDebugPayload()) as unknown;
}

function broadFrontSupportCollapseForTest(): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as unknown;

  for (let column = 0; column < wallBlockColumns; column += 1) {
    for (let row = 0; row < physicalWallRows; row += 1) {
      const block = getHouseBlock('front', row, column);

      if (block) {
        damageEntity(block, getWallBreakDamage() + 2, new THREE.Vector3(0, 1.1, -7.5));
      }
    }
  }

  releaseUnsupportedWallBlocks();
  releaseUnsupportedStaticWallVisuals();

  for (let index = 0; index < 260; index += 1) {
    update(fixedDt);
  }
  render();

  const after = JSON.parse(buildDebugPayload()) as unknown;

  return { before, after };
}

function bottomFoundationCollapseForTest(frames = 320): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as unknown;

  for (let column = 0; column < wallBlockColumns; column += 1) {
    const block = getHouseBlock('front', 0, column);

    if (block) {
      breakWallBlock(block, new THREE.Vector3(0, 0.55, -5.2), new THREE.Vector3(0, -0.04, -0.32));
    }
  }

  releaseUnsupportedWallBlocks();
  updateWallGravitySag();

  const steps = Math.max(1, Math.min(420, Math.floor(Number(frames))));

  for (let index = 0; index < steps; index += 1) {
    update(fixedDt);
  }

  cameraPanOffset.set(0, 0, -houseDepth * 0.12);
  cameraYaw = 0;
  cameraPitch = 0.24;
  cameraDistance = 42;
  updateCamera(fixedDt);
  render();

  const after = JSON.parse(buildDebugPayload()) as unknown;

  return { before, after };
}

function partialFrontSupportCollapseForTest(): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as unknown;

  for (let column = 0; column < wallBlockColumns; column += 1) {
    if (column % 4 === 1) {
      continue;
    }

    for (let row = 0; row < physicalWallRows; row += 1) {
      const block = getHouseBlock('front', row, column);

      if (block) {
        damageEntity(block, getWallBreakDamage() + 2, new THREE.Vector3(0, 1.1, -7.5));
      }
    }
  }

  releaseUnsupportedWallBlocks();
  releaseUnsupportedStaticWallVisuals();

  for (let index = 0; index < 220; index += 1) {
    update(fixedDt);
  }
  render();

  const after = JSON.parse(buildDebugPayload()) as unknown;

  return { before, after };
}

function largeGapSagForTest(): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as unknown;
  const startColumn = Math.max(1, Math.floor(wallBlockColumns * 0.18));
  const endColumn = Math.min(wallBlockColumns - 2, Math.ceil(wallBlockColumns * 0.78));

  for (let column = startColumn; column <= endColumn; column += 1) {
    for (let row = 0; row < physicalWallRows; row += 1) {
      const block = getHouseBlock('front', row, column);

      if (block) {
        breakWallBlock(block, new THREE.Vector3(0, 0.65, -5.8), new THREE.Vector3(0, -0.04, -0.36));
      }
    }
  }

  releaseUnsupportedWallBlocks();
  updateWallGravitySag();

  for (let index = 0; index < 150; index += 1) {
    update(fixedDt);
  }

  cameraPanOffset.set(0, 0, -houseDepth * 0.16);
  cameraYaw = 0;
  cameraPitch = 0.28;
  cameraDistance = 46;
  updateCamera(fixedDt);
  render();

  const after = JSON.parse(buildDebugPayload()) as unknown;

  return { before, after };
}

function undermineWallSpanForTest(): unknown {
  resetPrototype();

  for (let column = 2; column <= 5; column += 1) {
    for (let row = 0; row <= 1; row += 1) {
      const block = getWallBlock(row, column);

      if (block) {
        damageEntity(block, getWallBreakDamage() + 2, new THREE.Vector3(0, 1.1, -7.5));
      }
    }
  }

  releaseUnsupportedWallBlocks();

  for (let index = 0; index < 120; index += 1) {
    update(fixedDt);
  }
  render();

  return JSON.parse(buildDebugPayload()) as unknown;
}

function bulgeDirectionForTest(): unknown {
  resetPrototype();
  const inwardBlock = getWallBlock(1, Math.floor(wallBlockColumns / 2));

  if (inwardBlock) {
    damageEntity(inwardBlock, getWallBreakDamage() * 0.45, new THREE.Vector3(0, 0, -5.2));
  }

  const inwardBulge = inwardBlock?.wallBlock?.bulge.z ?? 0;

  resetPrototype();
  const outwardBlock = getWallBlock(1, Math.floor(wallBlockColumns / 2));

  if (outwardBlock) {
    damageEntity(outwardBlock, getWallBreakDamage() * 0.45, new THREE.Vector3(0, 0, 5.2));
  }

  const outwardBulge = outwardBlock?.wallBlock?.bulge.z ?? 0;
  const payload = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  payload.bulgeTest = {
    houseBackZ: Number((solidWallZ - houseDepth).toFixed(2)),
    houseFrontZ: Number(solidWallZ.toFixed(2)),
    inwardBulge: Number(inwardBulge.toFixed(3)),
    outwardBulge: Number(outwardBulge.toFixed(3)),
  };
  render();
  return payload;
}

function damageBridgeForTest(supportsToDestroy = 4): unknown {
  const forward = getBodyForward(bulldozer.body, tempForward);
  const impulse = forward.clone().multiplyScalar(10).setY(2.8);

  bridgeSupports
    .slice(0, Math.max(1, Math.min(8, Math.floor(Number(supportsToDestroy)))))
    .forEach((support) => {
      damageEntity(support.entity, tuning.columnStageOneDamage + 1, impulse.clone());
      damageEntity(support.entity, tuning.columnStageTwoDamage + 1, impulse.clone());
    });

  for (let index = 0; index < 120; index += 1) {
    update(fixedDt);
  }
  render();

  return JSON.parse(buildDebugPayload()) as unknown;
}

function roofCollapseForTest(frames = 120): unknown {
  resetPrototype();

  const frontRoof = getHouseBlock('roof-front', wallBlockRows, 0);
  const backRoof = getHouseBlock('roof-back', wallBlockRows, 0);

  if (frontRoof) {
    breakWallBlock(frontRoof, new THREE.Vector3(0, -2.4, -0.25), new THREE.Vector3(0, -0.65, -0.04));
  }
  if (backRoof) {
    breakWallBlock(backRoof, new THREE.Vector3(0, -2.4, 0.25), new THREE.Vector3(0, -0.65, 0.04));
  }

  const steps = Math.max(1, Math.min(300, Math.floor(Number(frames))));

  for (let index = 0; index < steps; index += 1) {
    update(fixedDt);
  }

  cameraPanOffset.set(0, 0, -houseDepth * 0.18);
  cameraYaw = 0;
  cameraPitch = 0.34;
  cameraDistance = 48;
  updateCamera(fixedDt);
  render();

  const roofPieces = entities.filter((entity) => entity.name.includes('house-roof-') && entity.kind === 'debris');
  const payload = JSON.parse(buildDebugPayload()) as Record<string, unknown>;
  const distances = roofPieces.map((piece) => {
    const position = piece.body.translation();
    return {
      horizontal: Math.hypot(position.x, position.z - houseCenterZ),
      y: position.y,
    };
  });

  payload.roofCollapseTest = {
    maxHorizontalDistance: Number(Math.max(0, ...distances.map((distance) => distance.horizontal)).toFixed(2)),
    maxY: Number(Math.max(0, ...distances.map((distance) => distance.y)).toFixed(2)),
    minY: Number(Math.min(0, ...distances.map((distance) => distance.y)).toFixed(2)),
    roofPieces: roofPieces.length,
  };

  return payload;
}

function demolitionReplayForTest(frames = 260): unknown {
  resetPrototype();
  setBulldozerPoseForTest(0, solidWallZ + bulldozer.halfExtents.z + solidWallThickness + 0.16, 0);
  drivePrototypeForTest(80, 1, 0, true);

  if (!demolitionReplayRecording.recording && !demolitionReplayRecording.complete) {
    startDemolitionRecording('front', 1);
  }

  for (let pass = 0; pass < 4 && wallBlocks.length > 0; pass += 1) {
    for (const block of [...wallBlocks]) {
      const face = block.wallBlock?.face ?? 'front';
      const impulse = getFaceLowResistanceDirection(face).multiplyScalar(8).setY(isRoofFace(face) ? -2.2 : 0.8);

      damageEntity(block, getWallBreakDamage() + 12, impulse);
    }
    update(fixedDt);
  }

  const steps = Math.max(1, Math.min(900, Math.floor(Number(frames))));

  for (let index = 0; index < steps; index += 1) {
    update(fixedDt);
  }

  if (demolitionReplayRecording.recording && getAttachedStructureBlockCount() === 0) {
    finishDemolitionRecording('test forced completion');
  }

  playDemolitionReplay();
  demolitionReplayPlayback.currentTime = demolitionReplayRecording.duration * 0.5;
  demolitionReplayPlayback.selectedWall = 'front';
  demolitionReplayPlayback.focusSelectedWall = true;
  demolitionReplayPlayback.isolateSelectedWall = false;
  demolitionReplayPlayback.showGhostOriginal = true;
  demolitionReplayPlayback.cameraMode = 'follow-wall';
  applyDemolitionReplayTime(getReplayDisplayTime());
  pauseDemolitionReplay();
  render();

  const payload = JSON.parse(buildDebugPayload()) as Record<string, unknown>;

  payload.demolitionReplayTest = {
    complete: demolitionReplayRecording.complete,
    duration: Number(demolitionReplayRecording.duration.toFixed(2)),
    events: demolitionReplayRecording.events.length,
    frames: demolitionReplayRecording.frames.length,
    frontSamples: demolitionReplayRecording.wallTracks.get('front')?.samples.length ?? 0,
    proxyObjects: demolitionReplayRecording.objects.size,
    proxiesVisible: Array.from(demolitionReplayRecording.objects.values()).filter((object) => object.proxy.visible).length,
    selectedWall: demolitionReplayPlayback.selectedWall,
  };
  return payload;
}

function asymmetricFrontSupportLeanForTest(frames = 240): unknown {
  resetPrototype();

  for (let row = 0; row < physicalWallRows; row += 1) {
    for (let column = 0; column <= Math.floor(wallBlockColumns * 0.72); column += 1) {
      const block = getHouseBlock('front', row, column);

      if (block) {
        breakWallBlock(block, new THREE.Vector3(-0.8, -0.45, -0.35), new THREE.Vector3(-0.08, -0.08, -0.04));
      }
    }
  }

  const steps = Math.max(1, Math.min(420, Math.floor(Number(frames))));

  for (let index = 0; index < steps; index += 1) {
    update(fixedDt);
  }

  cameraPanOffset.set(0, 0, -houseDepth * 0.18);
  cameraYaw = 0;
  cameraPitch = 0.32;
  cameraDistance = 46;
  updateCamera(fixedDt);
  render();

  return JSON.parse(buildDebugPayload()) as unknown;
}

function flatPanelFallForTest(frames = 280): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as unknown;

  for (let row = 0; row < physicalWallRows; row += 1) {
    for (let column = 0; column <= Math.floor(wallBlockColumns * 0.72); column += 1) {
      const block = getHouseBlock('front', row, column);

      if (block) {
        breakWallBlock(block, new THREE.Vector3(-0.8, -0.55, 1.8), new THREE.Vector3(-0.08, -0.1, 0.16));
      }
    }
  }

  const steps = Math.max(1, Math.min(900, Math.floor(Number(frames))));

  for (let index = 0; index < steps; index += 1) {
    update(fixedDt);
  }

  cameraPanOffset.set(0, 0, -houseDepth * 0.12);
  cameraYaw = -0.48;
  cameraPitch = 0.44;
  cameraDistance = 50;
  updateCamera(fixedDt);
  render();

  const after = JSON.parse(buildDebugPayload()) as Record<string, unknown>;
  const wall = after.wall as Record<string, unknown> | undefined;
  const faceBlocks = wall?.faceBlocks as Record<string, number> | undefined;

  return {
    after,
    before,
    flatPanelFallTest: {
      dynamicDebris: wall?.dynamicDebris,
      faceForwardLeanFront: (wall?.faceForwardLeanAngles as Record<string, number> | undefined)?.front,
      frontBlocks: faceBlocks?.front,
      structuralWallReleases: wall?.structuralWallReleases,
    },
  };
}

function criticalBottomBearingFallForTest(frames = 360): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as unknown;
  const leaveColumn = wallBlockColumns - 1;

  for (let column = 0; column < wallBlockColumns; column += 1) {
    if (column === leaveColumn) {
      continue;
    }

    const block = getHouseBlock('front', 0, column);

    if (block) {
      breakWallBlock(block, new THREE.Vector3(0, -0.35, 2.2), new THREE.Vector3(0, -0.08, 0.18));
    }
  }

  releaseUnsupportedWallBlocks();
  drivePrototypeForTest(80, -1, 0, false);

  const steps = Math.max(1, Math.min(900, Math.floor(Number(frames))));

  for (let index = 0; index < steps; index += 1) {
    update(fixedDt);
  }

  cameraPanOffset.set(0, 0, -houseDepth * 0.1);
  cameraYaw = -0.35;
  cameraPitch = 0.42;
  cameraDistance = 48;
  updateCamera(fixedDt);
  render();

  const after = JSON.parse(buildDebugPayload()) as Record<string, unknown>;
  const wall = after.wall as Record<string, unknown> | undefined;
  const faceBlocks = wall?.faceBlocks as Record<string, number> | undefined;
  const faceStress = wall?.faceStress as Record<string, Record<string, number>> | undefined;

  return {
    after,
    before,
    criticalBottomBearingFallTest: {
      foundationRatio: faceStress?.front?.foundationRatio,
      frontBlocks: faceBlocks?.front,
      leftStandingBottomColumn: leaveColumn,
      structuralWallReleases: wall?.structuralWallReleases,
    },
  };
}

function criticalSideBearingFallForTest(frames = 360): unknown {
  resetPrototype();
  const before = JSON.parse(buildDebugPayload()) as unknown;
  const leaveColumn = wallSideColumns - 1;

  for (let column = 0; column < wallSideColumns; column += 1) {
    if (column === leaveColumn) {
      continue;
    }

    const block = getHouseBlock('left', 0, column);

    if (block) {
      breakWallBlock(block, new THREE.Vector3(-2.4, -0.35, 0), new THREE.Vector3(-0.2, -0.08, 0));
    }
  }

  releaseUnsupportedWallBlocks();
  drivePrototypeForTest(80, -1, 0, false);

  const steps = Math.max(1, Math.min(900, Math.floor(Number(frames))));

  for (let index = 0; index < steps; index += 1) {
    update(fixedDt);
  }

  cameraPanOffset.set(-houseDepth * 0.12, 0, -houseDepth * 0.04);
  cameraYaw = -0.98;
  cameraPitch = 0.4;
  cameraDistance = 50;
  updateCamera(fixedDt);
  render();

  const after = JSON.parse(buildDebugPayload()) as Record<string, unknown>;
  const wall = after.wall as Record<string, unknown> | undefined;
  const faceBlocks = wall?.faceBlocks as Record<string, number> | undefined;
  const faceStress = wall?.faceStress as Record<string, Record<string, number>> | undefined;

  return {
    after,
    before,
    criticalSideBearingFallTest: {
      foundationRatio: faceStress?.left?.foundationRatio,
      leftBlocks: faceBlocks?.left,
      leftStandingBottomColumn: leaveColumn,
      structuralWallReleases: wall?.structuralWallReleases,
    },
  };
}

function bulldozerBlockedWallFallForTest(frames = 520): unknown {
  resetPrototype();
  setBulldozerPoseForTest(0, solidWallZ + bulldozer.halfExtents.z * 0.62, 0);
  const before = JSON.parse(buildDebugPayload()) as unknown;
  const leaveColumn = wallBlockColumns - 1;

  for (let column = 0; column < wallBlockColumns; column += 1) {
    if (column === leaveColumn) {
      continue;
    }

    const block = getHouseBlock('front', 0, column);

    if (block) {
      breakWallBlock(block, new THREE.Vector3(0, -0.35, 2.2), new THREE.Vector3(0, -0.08, 0.18));
    }
  }

  releaseUnsupportedWallBlocks();

  const steps = Math.max(1, Math.min(900, Math.floor(Number(frames))));

  for (let index = 0; index < steps; index += 1) {
    update(fixedDt);
  }

  cameraPanOffset.set(0, 0, -houseDepth * 0.02);
  cameraYaw = -0.28;
  cameraPitch = 0.5;
  cameraDistance = 38;
  updateCamera(fixedDt);
  render();

  const after = JSON.parse(buildDebugPayload()) as Record<string, unknown>;
  const wall = after.wall as Record<string, unknown> | undefined;

  return {
    after,
    before,
    bulldozerBlockedWallFallTest: {
      bladeRestingDynamicBlocks: wall?.bladeRestingDynamicBlocks,
      cabOverlappingDynamicBlocks: wall?.cabOverlappingDynamicBlocks,
      chassisOverlappingDynamicBlocks: wall?.chassisOverlappingDynamicBlocks,
      chassisRestingDynamicBlocks: wall?.chassisRestingDynamicBlocks,
      structuralWallReleases: wall?.structuralWallReleases,
    },
  };
}

function criticalSideLeanPhaseForTest(frames = 8): unknown {
  resetPrototype();
  const leaveColumn = wallSideColumns - 1;

  for (let column = 0; column < wallSideColumns; column += 1) {
    if (column === leaveColumn) {
      continue;
    }

    const block = getHouseBlock('left', 0, column);

    if (block) {
      breakWallBlock(block, new THREE.Vector3(-2.4, -0.35, 0), new THREE.Vector3(-0.2, -0.08, 0));
    }
  }

  releaseUnsupportedWallBlocks();

  const steps = Math.max(1, Math.min(900, Math.floor(Number(frames))));

  for (let index = 0; index < steps; index += 1) {
    update(fixedDt);
  }

  cameraPanOffset.set(-houseDepth * 0.12, 0, -houseDepth * 0.04);
  cameraYaw = -0.98;
  cameraPitch = 0.4;
  cameraDistance = 50;
  updateCamera(fixedDt);
  render();

  return JSON.parse(buildDebugPayload()) as unknown;
}

function bindInput(): void {
  const inputCanvas = canvas as HTMLCanvasElement;

  inputCanvas.tabIndex = 0;

  inputCanvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  inputCanvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) {
      return;
    }

    if (cameraFpsMode) {
      inputCanvas.focus({ preventScroll: true });
      inputCanvas.requestPointerLock?.();
      event.preventDefault();
      return;
    }

    cameraPointer = {
      lastX: event.clientX,
      lastY: event.clientY,
      mode: event.button === 0 && !event.shiftKey ? 'rotate' : 'pan',
      pointerId: event.pointerId,
    };
    inputCanvas.focus({ preventScroll: true });
    inputCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  inputCanvas.addEventListener('pointermove', (event) => {
    if (!cameraPointer || cameraPointer.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - cameraPointer.lastX;
    const dy = event.clientY - cameraPointer.lastY;

    cameraPointer.lastX = event.clientX;
    cameraPointer.lastY = event.clientY;

    if (cameraPointer.mode === 'rotate') {
      rotateCameraByMouse(dx, dy);
    } else {
      panCamera(dx, dy);
    }
    event.preventDefault();
  });

  const endPointer = (event: PointerEvent) => {
    if (!cameraPointer || cameraPointer.pointerId !== event.pointerId) {
      return;
    }
    if (inputCanvas.hasPointerCapture(event.pointerId)) {
      inputCanvas.releasePointerCapture(event.pointerId);
    }
    cameraPointer = null;
    event.preventDefault();
  };

  inputCanvas.addEventListener('pointerup', endPointer);
  inputCanvas.addEventListener('pointercancel', endPointer);

  inputCanvas.addEventListener(
    'wheel',
    (event) => {
      cameraDistance = THREE.MathUtils.clamp(cameraDistance * Math.exp(event.deltaY * 0.001), 8, 180);
      event.preventDefault();
    },
    { passive: false },
  );

  window.addEventListener('mousemove', (event) => {
    if (!cameraFpsMode || cameraPointer) {
      return;
    }

    rotateCameraByMouse(event.movementX, event.movementY);
    event.preventDefault();
  }, true);

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== inputCanvas && cameraFpsMode) {
      cameraFpsMode = false;
      inputCanvas.classList.remove('camera-fps-active');
    }
  });

  mobileControlsRoot?.querySelectorAll<HTMLButtonElement>('[data-touch-control]').forEach((button) => {
    const action = button.dataset.touchControl;

    const updateHeldControl = (pressed: boolean) => {
      if (action === 'forward') {
        touchControlState.forward = pressed;
      } else if (action === 'reverse') {
        touchControlState.reverse = pressed;
      } else if (action === 'blade-up') {
        touchControlState.raiseBlade = pressed;
      } else if (action === 'blade-down') {
        touchControlState.lowerBlade = pressed;
      } else {
        return;
      }

      button.classList.toggle('is-pressed', pressed);
      updateTouchControlOverride();
    };

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.setPointerCapture(event.pointerId);

      if (action === 'pickup') {
        pickupDebris();
        return;
      }
      if (action === 'release') {
        releaseDebris();
        return;
      }
      if (action === 'recenter') {
        recenterCamera();
        return;
      }
      if (action === 'reset') {
        resetPrototype();
        return;
      }

      updateHeldControl(true);
    });

    const endTouchControl = (event: PointerEvent) => {
      if (button.hasPointerCapture(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
      updateHeldControl(false);
    };

    button.addEventListener('pointerup', endTouchControl);
    button.addEventListener('pointercancel', endTouchControl);
    button.addEventListener('lostpointercapture', () => {
      updateHeldControl(false);
    });
  });

  mobileControlsRoot?.querySelectorAll<HTMLElement>('[data-touch-wheel]').forEach((wheel) => {
    const setSteeringFromClientX = (clientX: number) => {
      const rect = wheel.getBoundingClientRect();
      const centerX = rect.left + rect.width * 0.5;
      const normalized = THREE.MathUtils.clamp((clientX - centerX) / (rect.width * 0.38), -1, 1);

      touchControlState.steering = -normalized;
      wheel.style.setProperty('--wheel-rotation', `${normalized * 132}deg`);
      wheel.setAttribute('aria-valuenow', String(Math.round(touchControlState.steering * 100)));
      updateTouchControlOverride();
    };

    const resetSteeringWheel = () => {
      touchControlState.steering = 0;
      wheel.classList.remove('is-pressed');
      wheel.style.setProperty('--wheel-rotation', '0deg');
      wheel.setAttribute('aria-valuenow', '0');
      updateTouchControlOverride();
    };

    wheel.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      wheel.setPointerCapture(event.pointerId);
      wheel.classList.add('is-pressed');
      setSteeringFromClientX(event.clientX);
    });
    wheel.addEventListener('pointermove', (event) => {
      if (wheel.hasPointerCapture(event.pointerId)) {
        event.preventDefault();
        event.stopPropagation();
        setSteeringFromClientX(event.clientX);
      }
    });
    wheel.addEventListener('pointerup', (event) => {
      if (wheel.hasPointerCapture(event.pointerId)) {
        wheel.releasePointerCapture(event.pointerId);
      }
      resetSteeringWheel();
    });
    wheel.addEventListener('pointercancel', resetSteeringWheel);
    wheel.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches[0];

      if (!touch) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      wheel.classList.add('is-pressed');
      setSteeringFromClientX(touch.clientX);
    }, { passive: false });
    wheel.addEventListener('touchmove', (event) => {
      const touch = event.changedTouches[0];

      if (!touch) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSteeringFromClientX(touch.clientX);
    }, { passive: false });
    wheel.addEventListener('touchend', resetSteeringWheel);
    wheel.addEventListener('touchcancel', resetSteeringWheel);
    wheel.addEventListener('keydown', (event) => {
      if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight' && event.code !== 'Home') {
        return;
      }

      event.preventDefault();
      if (event.code === 'Home') {
        touchControlState.steering = 0;
      } else {
        touchControlState.steering = THREE.MathUtils.clamp(
          touchControlState.steering + (event.code === 'ArrowLeft' ? 0.16 : -0.16),
          -1,
          1,
        );
      }

      wheel.style.setProperty('--wheel-rotation', `${-touchControlState.steering * 132}deg`);
      wheel.setAttribute('aria-valuenow', String(Math.round(touchControlState.steering * 100)));
      updateTouchControlOverride();
    });
  });

  window.addEventListener('keydown', (event) => {
    const code = normalizeGameCode(event);

    if (!code) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (code === 'Escape') {
      setCameraFpsMode(false);
      keys.delete(code);
      return;
    }

    if (code === 'Space') {
      return;
    }

    if (event.repeat) {
      return;
    }

    keys.add(code);

    if (code === 'KeyG') {
      pickupDebris();
    } else if (code === 'KeyX') {
      releaseDebris();
    } else if (code === 'KeyT') {
      resetPrototype();
    } else if (code === 'KeyC') {
      recenterCamera();
    } else if (code === 'KeyR') {
      setCameraFpsMode(!cameraFpsMode);
    } else if (code === 'KeyH') {
      if (debugGui) {
        debugGui.domElement.style.display = debugGui.domElement.style.display === 'none' ? '' : 'none';
      }
    }
  }, true);

  window.addEventListener('keyup', (event) => {
    const code = normalizeGameCode(event);

    if (!code) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    keys.delete(code);
    keys.delete(event.code);
  }, true);

  window.addEventListener('resize', resize);
}

function exposeTestHooks(): void {
  window.render_game_to_text = buildDebugPayload;
  window.advanceTime = (ms: number) => {
    const steps = Math.max(1, Math.min(300, Math.round(ms / (1000 / 60))));

    for (let i = 0; i < steps; i += 1) {
      update(fixedDt);
    }
    render();
  };
  window.prototype_pickup_for_test = pickupDebris;
  window.prototype_airborne_settle_guard_for_test = airborneSettleGuardForTest;
  window.prototype_asymmetric_front_support_lean_for_test = asymmetricFrontSupportLeanForTest;
  window.prototype_back_damage_for_test = backDamageForTest;
  window.prototype_break_wall_for_test = breakWallForTest;
  window.prototype_bottom_foundation_collapse_for_test = bottomFoundationCollapseForTest;
  window.prototype_brick_size_match_for_test = brickSizeMatchForTest;
  window.prototype_bulldozer_blocked_wall_fall_for_test = bulldozerBlockedWallFallForTest;
  window.prototype_bulge_direction_for_test = bulgeDirectionForTest;
  window.prototype_damage_bridge_for_test = damageBridgeForTest;
  window.prototype_drive_for_test = drivePrototypeForTest;
  window.prototype_critical_bottom_bearing_fall_for_test = criticalBottomBearingFallForTest;
  window.prototype_critical_side_lean_phase_for_test = criticalSideLeanPhaseForTest;
  window.prototype_critical_side_bearing_fall_for_test = criticalSideBearingFallForTest;
  window.prototype_demolition_replay_for_test = demolitionReplayForTest;
  window.prototype_flat_panel_fall_for_test = flatPanelFallForTest;
  window.prototype_interior_wall_break_for_test = interiorWallBreakForTest;
  window.prototype_large_gap_sag_for_test = largeGapSagForTest;
  window.prototype_material_breakage_for_test = materialBreakageForTest;
  window.prototype_reverse_damage_for_test = reverseDamageForTest;
  window.prototype_rear_reverse_wall_contact_for_test = rearReverseWallContactForTest;
  window.prototype_roof_collapse_for_test = roofCollapseForTest;
  window.prototype_release_for_test = releaseDebris;
  window.prototype_reactivate_rubble_for_test = reactivateRubbleForTest;
  window.prototype_reset_for_test = resetPrototype;
  window.prototype_secondary_wall_impact_for_test = secondaryWallImpactForTest;
  window.prototype_side_damage_for_test = sideDamageForTest;
  window.prototype_side_rear_reverse_wall_contact_for_test = sideRearReverseWallContactForTest;
  window.prototype_side_wall_bump_resilience_for_test = sideWallBumpResilienceForTest;
  window.prototype_stationary_turn_wall_damage_for_test = stationaryTurnWallDamageForTest;
  window.prototype_static_support_collapse_for_test = staticSupportCollapseForTest;
  window.prototype_support_collapse_for_test = supportCollapseForTest;
  window.prototype_touch_steering_wheel_for_test = touchSteeringWheelForTest;
  window.prototype_broad_front_support_collapse_for_test = broadFrontSupportCollapseForTest;
  window.prototype_partial_front_support_collapse_for_test = partialFrontSupportCollapseForTest;
  window.prototype_undermine_wall_span_for_test = undermineWallSpanForTest;
  window.prototype_visual_wall_impact_for_test = visualWallImpactForTest;
}

async function boot(): Promise<void> {
  await RAPIER.init();
  physicsWorld = new RAPIER.World({ x: 0, y: tuning.gravity, z: 0 });
  addLightsAndGround();
  createBulldozer();
  createWallBuilding();
  bindInput();
  exposeTestHooks();
  createGui();
  applyQualitySettings();
  state.ready = true;
  animate();

  const query = new URLSearchParams(window.location.search);

  if (query.has('roofCollapseTest')) {
    window.setTimeout(() => {
      roofCollapseForTest(150);
    }, 80);
  } else if (query.has('replayTest')) {
    window.setTimeout(() => {
      demolitionReplayForTest(Number(query.get('replayTest') ?? 260));
    }, 80);
  } else if (query.has('flatPanelFallTest')) {
    window.setTimeout(() => {
      flatPanelFallForTest(Number(query.get('flatPanelFallTest') ?? 280));
    }, 80);
  } else if (query.has('criticalBottomTest')) {
    window.setTimeout(() => {
      criticalBottomBearingFallForTest(Number(query.get('criticalBottomTest') ?? 360));
    }, 80);
  } else if (query.has('criticalSideTest')) {
    window.setTimeout(() => {
      criticalSideBearingFallForTest(Number(query.get('criticalSideTest') ?? 360));
    }, 80);
  } else if (query.has('criticalSideLeanTest')) {
    window.setTimeout(() => {
      criticalSideLeanPhaseForTest(Number(query.get('criticalSideLeanTest') ?? 8));
    }, 80);
  } else if (query.has('bulldozerBlockedFallTest')) {
    window.setTimeout(() => {
      bulldozerBlockedWallFallForTest(Number(query.get('bulldozerBlockedFallTest') ?? 520));
    }, 80);
  } else if (query.has('angleLeanTest')) {
    window.setTimeout(() => {
      asymmetricFrontSupportLeanForTest(Number(query.get('angleLeanTest') ?? 12));
    }, 80);
  } else if (query.has('asymmetricLeanTest')) {
    window.setTimeout(() => {
      asymmetricFrontSupportLeanForTest(260);
    }, 80);
  } else if (query.has('bottomSupportTest')) {
    window.setTimeout(() => {
      bottomFoundationCollapseForTest();
    }, 80);
  } else if (query.has('broadSupportTest')) {
    window.setTimeout(() => {
      broadFrontSupportCollapseForTest();
    }, 80);
  } else if (query.has('sideResilienceTest')) {
    window.setTimeout(() => {
      sideWallBumpResilienceForTest();
    }, 80);
  } else if (query.has('stationaryTurnTest')) {
    window.setTimeout(() => {
      stationaryTurnWallDamageForTest(140, 1);
    }, 80);
  }
}

void boot();

declare global {
  interface Window {
    advanceTime?: (ms: number) => void;
    prototype_airborne_settle_guard_for_test?: () => unknown;
    prototype_asymmetric_front_support_lean_for_test?: (frames?: number) => unknown;
    prototype_back_damage_for_test?: () => unknown;
    prototype_bottom_foundation_collapse_for_test?: (frames?: number) => unknown;
    prototype_broad_front_support_collapse_for_test?: () => unknown;
    prototype_brick_size_match_for_test?: () => unknown;
    prototype_bulldozer_blocked_wall_fall_for_test?: (frames?: number) => unknown;
    prototype_partial_front_support_collapse_for_test?: () => unknown;
    prototype_break_wall_for_test?: (count?: number) => unknown;
    prototype_bulge_direction_for_test?: () => unknown;
    prototype_damage_bridge_for_test?: (supportsToDestroy?: number) => unknown;
    prototype_critical_bottom_bearing_fall_for_test?: (frames?: number) => unknown;
    prototype_critical_side_lean_phase_for_test?: (frames?: number) => unknown;
    prototype_critical_side_bearing_fall_for_test?: (frames?: number) => unknown;
    prototype_demolition_replay_for_test?: (frames?: number) => unknown;
    prototype_drive_for_test?: (frames?: number, throttle?: number, steering?: number, lowerBlade?: boolean) => unknown;
    prototype_flat_panel_fall_for_test?: (frames?: number) => unknown;
    prototype_interior_wall_break_for_test?: () => unknown;
    prototype_large_gap_sag_for_test?: () => unknown;
    prototype_material_breakage_for_test?: () => unknown;
    prototype_pickup_for_test?: () => void;
    prototype_rear_reverse_wall_contact_for_test?: () => unknown;
    prototype_reverse_damage_for_test?: () => unknown;
    prototype_roof_collapse_for_test?: (frames?: number) => unknown;
    prototype_release_for_test?: () => void;
    prototype_reactivate_rubble_for_test?: () => unknown;
    prototype_reset_for_test?: () => void;
    prototype_secondary_wall_impact_for_test?: (speed?: number, mass?: number) => unknown;
    prototype_side_damage_for_test?: () => unknown;
    prototype_side_rear_reverse_wall_contact_for_test?: () => unknown;
    prototype_side_wall_bump_resilience_for_test?: () => unknown;
    prototype_stationary_turn_wall_damage_for_test?: (frames?: number, steering?: number) => unknown;
    prototype_static_support_collapse_for_test?: () => unknown;
    prototype_support_collapse_for_test?: () => unknown;
    prototype_touch_steering_wheel_for_test?: (steering?: number, frames?: number) => unknown;
    prototype_undermine_wall_span_for_test?: () => unknown;
    prototype_visual_wall_impact_for_test?: (speed?: number, mass?: number) => unknown;
    render_game_to_text?: () => string;
  }
}
