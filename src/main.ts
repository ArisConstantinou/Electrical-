import RAPIER from '@dimforge/rapier3d-compat';
import GUI from 'lil-gui';
import * as THREE from 'three';
import './styles.css';

type BodyKind = 'bulldozer' | 'blade' | 'wall' | 'column' | 'deck' | 'debris';
type QualityLevel = 'Low' | 'Medium' | 'High';
type HouseBlockFace = 'front' | 'back' | 'left' | 'right' | 'roof-front' | 'roof-back';
type WallChunkSide = 'left' | 'right';

interface SettingsValues {
  bridgeCollapseThreshold: number;
  columnStageOneDamage: number;
  columnStageTwoDamage: number;
  debrisPickupRange: number;
  destructionSpeed: number;
  engineTorque: number;
  gravity: number;
  maxCarryMass: number;
  quality: QualityLevel;
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

type RigidBodyDescFactory = () => RAPIER.RigidBodyDesc;

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const statusReadout = document.querySelector<HTMLDivElement>('#status-readout');
const fpsReadout = document.querySelector<HTMLSpanElement>('#fps-readout');

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
const houseScale = 10;
const solidWallHeight = 6.1 * houseScale;
const solidWallThickness = 1.1;
const solidWallWidth = 14.4 * houseScale;
const solidWallZ = 7;
const houseDepth = 9.2 * houseScale;
const houseCenterZ = solidWallZ - houseDepth / 2;
const wallBlockColumns = 20;
const wallBlockRows = 14;
const wallSideColumns = 14;
const physicalWallRows = 4;
const masonryBrickLength = 3;
const masonryBrickHeight = 1.45;
const wallBlockBreakDamage = 10;
const wallBulgeLimit = 2.4;
const settingsStorageKey = 'bulldozer-destruction-prototype-settings-v4';
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
  debrisPickupRange: 3.2,
  destructionSpeed: 2.8,
  engineTorque: 140,
  gravity: -14.5,
  maxCarryMass: 70,
  quality: 'Low',
};

const tuning: SettingsValues = {
  ...defaultSettings,
  ...loadSavedSettings(),
};

const draftSettings = {
  ...tuning,
  apply: () => applyDraftSettings(),
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
let keys = new Set<string>();
let controlOverride: ControlOverride | null = null;
let cameraPointer: CameraPointerState | null = null;
let dozerSpeed = 0;
let dozerYaw = 0;
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
const maxLiveDynamicDebris = 150;
const dynamicDebrisMinAgeSteps = 35;
const dynamicDebrisSettleSteps = 8;
const debrisSettleDistanceFromDozer = 5.5;
const debrisReactivationDistance = 8.5;
const secondaryWallImpactCooldownSteps = 14;
const secondaryWallImpactForceThreshold = 26;
const maxVisualWallImpactsPerMover = 2;
const maxStructuralVisualReleasesPerStep = 8;
const houseUpperFacadeReleaseSupportRatio = 0.42;
const houseRoofCollapseSupportRatio = 0.36;
const debugSupportSampleInterval = 20;

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
  if (typeof raw.debrisPickupRange === 'number' && Number.isFinite(raw.debrisPickupRange)) {
    sanitized.debrisPickupRange = THREE.MathUtils.clamp(raw.debrisPickupRange, 1.2, 5.5);
  }
  if (typeof raw.destructionSpeed === 'number' && Number.isFinite(raw.destructionSpeed)) {
    sanitized.destructionSpeed = THREE.MathUtils.clamp(raw.destructionSpeed, 0.5, 3.5);
  }
  if (typeof raw.maxCarryMass === 'number' && Number.isFinite(raw.maxCarryMass)) {
    sanitized.maxCarryMass = THREE.MathUtils.clamp(raw.maxCarryMass, 20, 140);
  }
  if (raw.quality === 'Low' || raw.quality === 'Medium' || raw.quality === 'High') {
    sanitized.quality = raw.quality;
  }

  sanitized.gravity = defaultSettings.gravity;
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
  Object.assign(draftSettings, tuning);
  saveSettings();
  applyQualitySettings();
  focusGameCanvas();
}

function getDestructionSpeed(): number {
  return THREE.MathUtils.clamp(tuning.destructionSpeed, 0.5, 3.5);
}

function syncMeshFromBody(entity: PhysicsEntity): void {
  const position = entity.body.translation();
  const rotation = entity.body.rotation();

  entity.mesh.position.set(position.x, position.y, position.z);
  entity.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
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

function createStaticWallVisual(
  name: string,
  halfExtents: THREE.Vector3,
  position: THREE.Vector3,
  material: THREE.Material,
  wallInfo?: Omit<StaticWallVisualInfo, 'halfExtents'>,
): THREE.Object3D {
  const mesh = wallInfo && !isRoofFace(wallInfo.face)
    ? createIntactBrickWallVisual(
      halfExtents,
      wallInfo.row * 7919 + wallInfo.column * 104729 + hashStringSeed(wallInfo.face),
      {
        brickHeight: masonryBrickHeight,
        brickLength: masonryBrickLength,
        castShadow: false,
        face: wallInfo.face,
        maxColumns: wallInfo.face === 'front' || wallInfo.face === 'back' ? 128 : 96,
        maxRows: 6,
        worldPosition: position,
      },
    )
    : createBoxMesh(halfExtents, material);

  if (wallInfo) {
    disposeGeneratedMaterial(material);
  }

  mesh.name = name;
  mesh.position.copy(position);
  if (wallInfo) {
    mesh.userData.staticWallVisual = {
      ...wallInfo,
      halfExtents: halfExtents.clone(),
    } satisfies StaticWallVisualInfo;
  }
  scene.add(mesh);
  staticWallVisuals.push(mesh);
  return mesh;
}

function createStaticHouseRowVisual(
  face: HouseBlockFace,
  row: number,
  halfExtents: THREE.Vector3,
  position: THREE.Vector3,
): THREE.Object3D {
  return createStaticWallVisual(
    `house-${face}-visual-row-${row}`,
    halfExtents,
    position,
    createBrickMaterialForBox(halfExtents, face, position, row),
    { column: -1, face, row },
  );
}

function createPhysicalFacadeRowVisual(
  face: HouseBlockFace,
  row: number,
  halfExtents: THREE.Vector3,
  position: THREE.Vector3,
): void {
  const facade = createStaticHouseRowVisual(face, row, halfExtents, position);
  facade.name = `house-${face}-physical-facade-row-${row}`;
  facade.userData.physicalFacadeRowVisual = true;
  physicalFacadeRowVisuals.set(getPhysicalFacadeRowKey(face, row), facade);
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
  bulldozer.body.setAdditionalSolverIterations(8);

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
  blade.body.setAdditionalSolverIterations(8);
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
  };
  wallBlocks.push(entity);
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
  void column;
  return row < physicalWallRows;
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
          face,
          maxColumns: face === 'front' || face === 'back' ? 8 : 8,
          maxRows: 6,
          worldPosition: position,
        },
      ),
    );
  }

  decorateHouseBlock(entity);

  if (isLowerPhysicalFacadeBlock(face, row)) {
    entity.mesh.visible = false;
  }
}

function createInteriorPartition(
  name: string,
  halfExtents: THREE.Vector3,
  position: THREE.Vector3,
): void {
  const splitAlongX = halfExtents.x >= halfExtents.z;
  const longHalf = splitAlongX ? halfExtents.x : halfExtents.z;
  const columnCount = Math.max(3, Math.min(8, Math.ceil(longHalf * 2 / 10)));
  const rowCount = Math.max(3, Math.min(5, Math.ceil(halfExtents.y * 2 / 5)));
  const segmentHalf = new THREE.Vector3(
    splitAlongX ? halfExtents.x / columnCount : halfExtents.x,
    halfExtents.y / rowCount,
    splitAlongX ? halfExtents.z : halfExtents.z / columnCount,
  );
  const baseY = position.y - halfExtents.y;

  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const offset = (column - (columnCount - 1) / 2) * longHalf * 2 / columnCount;
      const segmentPosition = new THREE.Vector3(
        position.x + (splitAlongX ? offset : 0),
        baseY + segmentHalf.y + row * segmentHalf.y * 2,
        position.z + (splitAlongX ? 0 : offset),
      );

      const segment = createFixedBox(
        `${name}-${row}-${column}`,
        'wall',
        segmentHalf,
        segmentPosition,
        createBrickMaterialForBox(segmentHalf, 'fragment', segmentPosition, row),
        THREE.MathUtils.clamp(segmentHalf.x * segmentHalf.y * segmentHalf.z * 0.18, 3.5, 10),
        true,
      );

      replaceEntityVisual(
        segment,
        createIntactBrickWallVisual(
          segmentHalf,
          hashStringSeed(name) + row * 211 + column * 37,
          {
            brickHeight: masonryBrickHeight,
            brickLength: masonryBrickLength,
            castShadow: false,
            doubleSided: true,
            face: 'fragment',
            maxColumns: 10,
            maxRows: 5,
            worldPosition: segmentPosition,
          },
        ),
      );
    }
  }
}

function createHouseInterior(): void {
  const frontZ = solidWallZ;
  const backZ = solidWallZ - houseDepth;
  const interiorWidth = solidWallWidth - solidWallThickness * 2.6;
  const interiorDepth = houseDepth - solidWallThickness * 2.4;
  const floorY = 0.035;
  const midZ = houseCenterZ;
  const lowerFloorHeight = solidWallHeight / 2;
  const partitionHeight = lowerFloorHeight * 0.48;
  const partitionThickness = solidWallThickness * 0.36;
  const partitionY = floorY + partitionHeight;

  createInteriorPartition(
    'interior-cross-wall-left',
    new THREE.Vector3(interiorWidth * 0.28, partitionHeight, partitionThickness),
    new THREE.Vector3(-interiorWidth * 0.21, partitionY, midZ),
  );
  createInteriorPartition(
    'interior-cross-wall-right',
    new THREE.Vector3(interiorWidth * 0.24, partitionHeight, partitionThickness),
    new THREE.Vector3(interiorWidth * 0.26, partitionY, midZ),
  );
  createInteriorPartition(
    'interior-center-wall-front',
    new THREE.Vector3(partitionThickness, partitionHeight, interiorDepth * 0.18),
    new THREE.Vector3(0, partitionY, frontZ - interiorDepth * 0.23),
  );
  createInteriorPartition(
    'interior-center-wall-back',
    new THREE.Vector3(partitionThickness, partitionHeight, interiorDepth * 0.18),
    new THREE.Vector3(0, partitionY, backZ + interiorDepth * 0.23),
  );
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

  for (let row = 0; row < physicalWallRows; row += 1) {
    const y = blockHeight / 2 + row * blockHeight;

    createPhysicalFacadeRowVisual(
      'front',
      row,
      new THREE.Vector3(solidWallWidth / 2, blockHeight / 2, solidWallThickness / 2),
      new THREE.Vector3(0, y, frontZ),
    );
    createPhysicalFacadeRowVisual(
      'back',
      row,
      new THREE.Vector3(solidWallWidth / 2, blockHeight / 2, solidWallThickness / 2),
      new THREE.Vector3(0, y, backZ),
    );
  }

  for (let row = physicalWallRows; row < wallBlockRows; row += 1) {
    const y = blockHeight / 2 + row * blockHeight;

    createStaticHouseRowVisual(
      'front',
      row,
      new THREE.Vector3(solidWallWidth / 2, blockHeight / 2, solidWallThickness / 2),
      new THREE.Vector3(0, y, frontZ),
    );
    createStaticHouseRowVisual(
      'back',
      row,
      new THREE.Vector3(solidWallWidth / 2, blockHeight / 2, solidWallThickness / 2),
      new THREE.Vector3(0, y, backZ),
    );
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

  for (let row = 0; row < physicalWallRows; row += 1) {
    const y = blockHeight / 2 + row * blockHeight;

    createPhysicalFacadeRowVisual(
      'left',
      row,
      new THREE.Vector3(solidWallThickness / 2, blockHeight / 2, houseDepth / 2),
      new THREE.Vector3(leftX, y, houseCenterZ),
    );
    createPhysicalFacadeRowVisual(
      'right',
      row,
      new THREE.Vector3(solidWallThickness / 2, blockHeight / 2, houseDepth / 2),
      new THREE.Vector3(rightX, y, houseCenterZ),
    );
  }

  for (let row = physicalWallRows; row < wallBlockRows; row += 1) {
    const y = blockHeight / 2 + row * blockHeight;

    createStaticHouseRowVisual(
      'left',
      row,
      new THREE.Vector3(solidWallThickness / 2, blockHeight / 2, houseDepth / 2),
      new THREE.Vector3(leftX, y, houseCenterZ),
    );
    createStaticHouseRowVisual(
      'right',
      row,
      new THREE.Vector3(solidWallThickness / 2, blockHeight / 2, houseDepth / 2),
      new THREE.Vector3(rightX, y, houseCenterZ),
    );
  }

  createHouseInterior();

  const roofRise = 1.55 * houseScale;
  const roofRun = houseDepth / 2 + 4.8;
  const roofSlopeLength = Math.hypot(roofRun, roofRise);
  const roofAngle = Math.atan2(roofRise, roofRun);
  const roofHalf = new THREE.Vector3(solidWallWidth / 2 + 4.8, 0.85, roofSlopeLength / 2);
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
}

function createBridge(): void {
  const deckZ = solidWallZ - houseDepth - 42;
  const deckY = 5.35;
  const deckHalfExtents = new THREE.Vector3(12.35, 0.32, 3.1);
  const deckUndersideY = deckY - deckHalfExtents.y;

  const deck = createFixedBox(
    'bridge-deck-main',
    'deck',
    deckHalfExtents,
    new THREE.Vector3(0, deckY, deckZ),
    materials.deck,
    256,
    true,
  );
  bridgeDecks.push(deck);

  for (let i = 0; i < 7; i += 1) {
    const stripe = createBoxMesh(new THREE.Vector3(0.55, 0.012, 0.08), materials.stripe);
    stripe.position.set(-9 + i * 3, deckHalfExtents.y + 0.02, 0);
    deck.mesh.add(stripe);
  }

  for (let i = 0; i < 4; i += 1) {
    const x = -9 + i * 6;
    for (const side of ['left', 'right'] as const) {
      const supportHalfHeight = deckUndersideY / 2;
      const support = createFixedBox(
        `bridge-column-${i}-${side}`,
        'column',
        new THREE.Vector3(0.48, supportHalfHeight, 0.48),
        new THREE.Vector3(x, supportHalfHeight, deckZ + (side === 'left' ? -2.05 : 2.05)),
        materials.columnFresh,
        38,
        true,
      );
      bridgeSupports.push({ entity: support, side });
    }
  }
}

function resetPrototype(): void {
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
  createBridge();
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

function removeEntityFromWorld(entity: PhysicsEntity): void {
  physicsWorld.removeRigidBody(entity.body);
  scene.remove(entity.mesh);
  disposeObjectGeometry(entity.mesh);
  entities = entities.filter((candidate) => candidate !== entity);
  wallBlocks = wallBlocks.filter((candidate) => candidate !== entity);
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

    if (
      simulationStep - entity.createdStep < 45 ||
      distanceFromDozer < debrisSettleDistanceFromDozer * 0.7 ||
      !hasGroundOrBodySupport(entity)
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

    if (
      age > dynamicDebrisMinAgeSteps &&
      distanceFromDozer > debrisSettleDistanceFromDozer &&
      hasGroundOrBodySupport(entity) &&
      speedSq < 0.08 &&
      angularSq < 0.12
    ) {
      entity.settleCandidateSteps += 1;
    } else {
      entity.settleCandidateSteps = 0;
    }

    if (
      entity.settleCandidateSteps >= dynamicDebrisSettleSteps ||
      (age > 360 && distanceFromDozer > debrisSettleDistanceFromDozer * 1.4 && hasGroundOrBodySupport(entity))
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
          shouldShard ? 0.9 : 1.1,
          shouldShard ? 1.2 : 1.35,
        );
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
            y: Math.min(-0.35, chunkVelocity.y * 0.35 - (0.75 + brick.row * 0.08) * destructionSpeed) + localY * 0.04,
            z: chunkVelocity.z * 0.55 + outward.z * (0.42 + brick.row * 0.05) * destructionSpeed,
          },
          true,
        );
        brickEntity.body.setAngvel(
          {
            x: ((index % 3 - 1) * 0.28 + (yIndex - 0.5) * 0.32) * destructionSpeed,
            y: (spread * 1.8 + shardKick) * destructionSpeed,
            z: ((brick.row - 3) * 0.12 + (xIndex - 0.5) * 0.28) * destructionSpeed,
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
    const shouldFragment = simulationStep >= chunk.fragmentAfterStep || height < 1.6 || chunk.entity.damage > wallBlockBreakDamage * 2.2;

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
  const baseAmount = THREE.MathUtils.clamp(amount * 0.055, 0.18, 0.68);

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

    const target = blockInfo.home.clone().add(blockInfo.bulge);
    block.body.setTranslation({ x: target.x, y: target.y, z: target.z }, true);
    syncMeshFromBody(block);
  }
}

function fragmentRoofPanel(entity: PhysicsEntity, impulse: THREE.Vector3, detachOffset?: THREE.Vector3): void {
  const info = entity.wallBlock;

  if (!info || !isRoofFace(info.face)) {
    return;
  }

  const position = entity.body.translation();
  const rotation = entity.body.rotation();
  const center = new THREE.Vector3(position.x, position.y, position.z);
  const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
  const push = new THREE.Vector3(impulse.x, 0, impulse.z);
  const pushDirection = push.lengthSq() > 0.001 ? push.normalize() : getFaceFallDirection(info.face);
  const columns = getDynamicDebrisCount() > maxLiveDynamicDebris * 0.75 ? 4 : 5;
  const rows = 3;
  const pieceHalf = new THREE.Vector3(
    Math.max(0.8, entity.halfExtents.x / columns - 0.08),
    entity.halfExtents.y,
    Math.max(0.8, entity.halfExtents.z / rows - 0.08),
  );
  const baseVelocity = entity.body.isDynamic() ? entity.body.linvel() : { x: 0, y: 0, z: 0 };
  const destructionSpeed = getDestructionSpeed();
  const sourceName = entity.name;
  const sourceMass = entity.mass;

  removeEntityFromWorld(entity);

  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const localX = (column - (columns - 1) / 2) * entity.halfExtents.x * 2 / columns;
      const localZ = (row - (rows - 1) / 2) * entity.halfExtents.z * 2 / rows;
      const spread = (column - (columns - 1) / 2) * 0.09;
      const piecePosition = center.clone()
        .addScaledVector(right, localX)
        .addScaledVector(forward, localZ)
        .add(detachOffset ?? new THREE.Vector3());
      const roofPiece = createDynamicBox(
        `${sourceName}-piece-${row}-${column}`,
        'debris',
        pieceHalf,
        piecePosition,
        materials.roof,
        sourceMass / (columns * rows),
        quaternion,
        0.86,
        1.05,
      );

      roofPiece.body.setLinvel(
        {
          x: baseVelocity.x * 0.35 + pushDirection.x * (0.75 + row * 0.08) * destructionSpeed + spread,
          y: -1.2 * destructionSpeed - row * 0.08,
          z: baseVelocity.z * 0.35 + pushDirection.z * (0.75 + row * 0.08) * destructionSpeed,
        },
        true,
      );
      roofPiece.body.setAngvel(
        {
          x: (row - 1.5) * 0.18 * destructionSpeed,
          y: spread * 1.8 * destructionSpeed,
          z: (column - 3.5) * 0.08 * destructionSpeed,
        },
        true,
      );
    }
  }

  state.wallPiecesBroken += columns * rows;
  state.wallDeformations = state.wallPiecesBroken;
}

function breakWallBlock(entity: PhysicsEntity, impulse: THREE.Vector3, detachOffset?: THREE.Vector3): void {
  if (entity.stage >= 2) {
    return;
  }

  if (entity.wallBlock && isRoofFace(entity.wallBlock.face)) {
    entity.stage = 2;
    fragmentRoofPanel(entity, impulse, detachOffset);
    return;
  }

  if (entity.wallBlock) {
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

  removeEntityFromWorld(entity);
  state.wallDeformations = state.wallPiecesBroken;
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
  const length = entity.halfExtents[lengthAxis] * 2;
  const height = entity.halfExtents.y * 2;
  const depth = (lengthAxis === 'x' ? entity.halfExtents.z : entity.halfExtents.x) * 2;
  const rowLimit = debrisPressure > 0.65 ? 1 : debrisPressure > 0.38 ? 2 : 3;
  const columnLimit = debrisPressure > 0.65 ? 2 : debrisPressure > 0.38 ? 3 : 4;
  const rows = Math.max(1, Math.min(rowLimit, Math.round(height / masonryBrickHeight)));
  const columns = Math.max(2, Math.min(columnLimit, Math.round(length / masonryBrickLength)));
  const requestedCount = rows * columns;
  const maxExtra = Math.max(0, Math.floor(maxLiveDynamicDebris * 0.82 - dynamicDebrisCount));

  if ((!force && requestedCount > maxExtra) || (force && maxExtra <= 0)) {
    return false;
  }

  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
  const center = new THREE.Vector3(position.x, position.y, position.z).add(detachOffset ?? new THREE.Vector3());
  const push = impulse.clone();

  if (push.lengthSq() < 0.01) {
    push.copy(getFaceFallDirection(info.face));
  }
  push.normalize();

  const cellLength = length / columns;
  const cellHeight = height / rows;
  const mortarGap = 0.12;
  const baseVelocity = entity.body.isDynamic() ? entity.body.linvel() : { x: 0, y: 0, z: 0 };
  const destructionSpeed = getDestructionSpeed();
  const sourceMass = Math.max(0.2, entity.mass / requestedCount);
  const sourceName = entity.name;

  removeEntityFromWorld(entity);
  state.wallPiecesBroken += Math.max(0, requestedCount - 1);
  state.wallBreaches = 1;

  for (let row = 0; row < rows; row += 1) {
    const rowOffset = row % 2 === 0 ? 0 : cellLength * 0.5;

    for (let column = 0; column < columns; column += 1) {
      const edgeTrim = (column === 0 || column === columns - 1) && row % 2 === 1 ? 0.5 : 1;
      const brickLength = Math.max(0.18, cellLength * edgeTrim - mortarGap);
      const brickHeight = Math.max(0.14, cellHeight - mortarGap);
      const seed = info.row * 211 + info.column * 67 + row * 19 + column * 31 + simulationStep;
      const chip = 0.92 + seededNoise(seed) * 0.1;
      const brickHalf = lengthAxis === 'x'
        ? new THREE.Vector3(brickLength * 0.5 * chip, brickHeight * 0.5, depth * 0.48)
        : new THREE.Vector3(depth * 0.48, brickHeight * 0.5, brickLength * 0.5 * chip);
      const lengthCenter = -length * 0.5 + cellLength * 0.5 + column * cellLength + rowOffset;
      const wrappedLengthCenter = THREE.MathUtils.clamp(
        lengthCenter > length * 0.5 ? lengthCenter - length : lengthCenter,
        -length * 0.5 + brickLength * 0.5,
        length * 0.5 - brickLength * 0.5,
      );
      const local = lengthAxis === 'x'
        ? right.clone().multiplyScalar(wrappedLengthCenter)
        : forward.clone().multiplyScalar(wrappedLengthCenter);
      const brickPosition = center.clone()
        .add(local)
        .addScaledVector(up, -height * 0.5 + cellHeight * 0.5 + row * cellHeight);
      const brickMaterialIndex =
        (row + column + Math.floor(seededNoise(seed + 7) * rubbleBrickMaterials.length)) % rubbleBrickMaterials.length;
      const brick = createDynamicBox(
        `${sourceName}-independent-brick-${row}-${column}`,
        'debris',
        brickHalf,
        brickPosition,
        rubbleBrickMaterials[brickMaterialIndex] ?? materials.wall,
        sourceMass,
        quaternion,
        1.18,
        1.42,
      );
      const spread = (column - (columns - 1) / 2) * 0.035;

      brick.mesh.userData.visualBrickCount = 1;
      brick.body.setLinvel(
        {
          x: baseVelocity.x * 0.35 + push.x * (0.52 + row * 0.035) * destructionSpeed + right.x * spread,
          y: baseVelocity.y * 0.18 + 0.08 - row * 0.015,
          z: baseVelocity.z * 0.35 + push.z * (0.52 + row * 0.035) * destructionSpeed + right.z * spread,
        },
        true,
      );
      brick.body.setAngvel(
        {
          x: seededRange(seed + 1, -0.45, 0.45),
          y: seededRange(seed + 2, -0.4, 0.4),
          z: seededRange(seed + 3, -0.45, 0.45),
        },
        true,
      );
    }
  }

  return true;
}

function getFaceLowerSupportRatio(face: HouseBlockFace): number {
  if (isRoofFace(face)) {
    return 1;
  }

  const blocks = wallBlocks.filter((block) => {
    const info = block.wallBlock;
    return info?.face === face && info.row < physicalWallRows;
  });

  if (blocks.length === 0) {
    return 0;
  }

  const standing = blocks.filter((block) => block.stage < 2 && !block.body.isDynamic()).length;
  return standing / blocks.length;
}

function isFaceLaterallyUnstable(face: HouseBlockFace): boolean {
  if (isRoofFace(face)) {
    return false;
  }

  const wallFaces: HouseBlockFace[] = ['front', 'back', 'left', 'right'];
  const lostWalls = wallFaces.filter((candidate) => getFaceLowerSupportRatio(candidate) < 0.35).length;

  return lostWalls >= 3 && getFaceLowerSupportRatio(face) < 0.72;
}

function isHouseFaceBroadlyUndermined(face: HouseBlockFace, supportRatio = houseUpperFacadeReleaseSupportRatio): boolean {
  return !isRoofFace(face) && (getFaceLowerSupportRatio(face) < supportRatio || isFaceLaterallyUnstable(face));
}

function releaseUnsupportedWallBlocks(): void {
  const wallFaces: HouseBlockFace[] = ['front', 'back', 'left', 'right'];

  for (const face of wallFaces) {
    const columnCount = getHouseFaceColumnCount(face);
    const fallDirection = getFaceFallDirection(face);
    const faceIsLaterallyUnstable = isFaceLaterallyUnstable(face);

    for (let row = 1; row < wallBlockRows; row += 1) {
      for (let column = 0; column < columnCount; column += 1) {
        const block = getHouseBlock(face, row, column);
        const support = getHouseBlock(face, row - 1, column);
        const lacksVerticalSupport = !support || support.stage >= 2 || support.body.isDynamic();
        const lacksLateralSupport = faceIsLaterallyUnstable && row >= physicalWallRows;

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
      }
    }
  }

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
  const backTopSupports = wallBlocks.filter((block) => {
    const info = block.wallBlock;
    return info?.face === 'back' && info.row === highestBackRow && block.stage < 2;
  }).length;
  const backTopColumnCount = wallBlocks.filter((block) => {
    const info = block.wallBlock;
    return info?.face === 'back' && info.row === highestBackRow;
  }).length;

  if (
    highestFrontRow >= 0 &&
    frontTopSupports < Math.ceil(frontTopColumnCount * 0.45) &&
    isHouseFaceBroadlyUndermined('front', houseRoofCollapseSupportRatio)
  ) {
    const roof = getHouseBlock('roof-front', wallBlockRows, 0);
    if (roof && roof.stage < 2) {
      breakWallBlock(roof, new THREE.Vector3(0, 0.35, -1.5), new THREE.Vector3(0, -0.08, -0.12));
    }
  }

  if (
    highestBackRow >= 0 &&
    backTopSupports < Math.ceil(backTopColumnCount * 0.45) &&
    isHouseFaceBroadlyUndermined('back', houseRoofCollapseSupportRatio)
  ) {
    const roof = getHouseBlock('roof-back', wallBlockRows, 0);
    if (roof && roof.stage < 2) {
      breakWallBlock(roof, new THREE.Vector3(0, 0.35, 1.5), new THREE.Vector3(0, -0.08, 0.12));
    }
  }
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
    removeEntityFromWorld(entity);
  }
  state.chippedWallSlabs += 1;
  state.wallDeformations = state.wallPiecesBroken;
}

function processDynamicWallFractures(): void {
  if (getDynamicDebrisCount() > maxLiveDynamicDebris * 0.72) {
    return;
  }

  let fracturedThisStep = 0;

  for (const entity of [...wallBlocks]) {
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
    const shouldShatter =
      fallDistance > Math.max(4.5, entity.halfExtents.y * 1.65) ||
      (speedSq > 32 && Math.abs(velocity.y) > 2.1);

    if (shouldShatter) {
      shatterWallBlock(entity);
      fracturedThisStep += 1;
    }
  }
}

function damageEntity(entity: PhysicsEntity, amount: number, impulse: THREE.Vector3, _contactPosition?: THREE.Vector3): void {
  if (!entity.breakable || (entity.kind !== 'wall' && entity.stage >= 2)) {
    return;
  }

  entity.damage += amount;

  if (entity.kind === 'debris') {
    entity.body.applyImpulse({ x: impulse.x * 0.08, y: impulse.y * 0.04, z: impulse.z * 0.08 }, true);
    return;
  }

  if (entity.kind === 'wall') {
    if (entity.stage >= 2) {
      entity.body.applyImpulse({ x: impulse.x * 0.25, y: impulse.y * 0.25, z: impulse.z * 0.25 }, true);
      return;
    }

    applyWallBulge(entity, impulse, amount);

    if (entity.damage >= wallBlockBreakDamage) {
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

function getStaticWallVisual(face: HouseBlockFace, row: number, column: number): THREE.Object3D | undefined {
  return staticWallVisuals.find((object) => {
    if (object.userData.physicalFacadeRowVisual) {
      return false;
    }

    const info = getStaticWallVisualInfo(object);
    return info?.face === face && info.row === row && (info.column === column || info.column === -1);
  });
}

function isHouseColumnSupported(face: HouseBlockFace, row: number, column: number): boolean {
  if (row <= 0) {
    return true;
  }

  if (column < 0) {
    const columnCount = getHouseFaceColumnCount(face);
    let supportedColumns = 0;

    for (let sampleColumn = 0; sampleColumn < columnCount; sampleColumn += 1) {
      const physicalSupport = getHouseBlock(face, row - 1, sampleColumn);

      if (physicalSupport && physicalSupport.stage < 2 && !physicalSupport.body.isDynamic()) {
        supportedColumns += 1;
      }
    }

    if (supportedColumns / Math.max(1, columnCount) >= 0.35) {
      return true;
    }

    const lowerVisualRow = getStaticWallVisual(face, row - 1, -1);
    return Boolean(lowerVisualRow) && isHouseColumnSupported(face, row - 1, -1);
  }

  const physicalSupport = getHouseBlock(face, row - 1, column);

  if (physicalSupport && physicalSupport.stage < 2 && !physicalSupport.body.isDynamic()) {
    return true;
  }

  return row > physicalWallRows && isHouseColumnSupported(face, row - 1, -1);
}

function damageStaticWallVisual(
  object: THREE.Object3D,
  impulseDirection: THREE.Vector3,
  impactForce: number,
  eraseGroupedRow = false,
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
  disposeObjectGeometry(object);

  if (info.column < 0 && eraseGroupedRow && object.userData.physicalFacadeRowVisual) {
    state.visualWallImpacts += 1;
    state.wallPiecesBroken += 1;
    state.wallDeformations = state.wallPiecesBroken;
    state.wallBreaches = 1;
    return null;
  }

  return fragmentStaticWallVisualToIndependentBricks(object.name, info, position, rotation, impulseDirection, impactForce);
}

function fragmentStaticWallVisualToIndependentBricks(
  sourceName: string,
  info: StaticWallVisualInfo,
  position: THREE.Vector3,
  rotation: THREE.Quaternion,
  impulseDirection: THREE.Vector3,
  impactForce: number,
): PhysicsEntity | null {
  state.visualWallImpacts += 1;
  state.wallBreaches = 1;

  if (getDynamicDebrisCount() > maxLiveDynamicDebris * 0.68) {
    state.wallPiecesBroken += 1;
    state.wallDeformations = state.wallPiecesBroken;
    return null;
  }

  const lengthAxis: 'x' | 'z' = info.halfExtents.x >= info.halfExtents.z ? 'x' : 'z';
  const length = info.halfExtents[lengthAxis] * 2;
  const height = info.halfExtents.y * 2;
  const depth = (lengthAxis === 'x' ? info.halfExtents.z : info.halfExtents.x) * 2;
  const columns = info.column < 0
    ? Math.max(4, Math.min(14, Math.round(length / masonryBrickLength)))
    : Math.max(2, Math.min(4, Math.round(length / masonryBrickLength)));
  const rows = Math.max(1, Math.min(3, Math.round(height / masonryBrickHeight)));
  const requestedCount = rows * columns;
  const availableCount = Math.max(0, Math.floor(maxLiveDynamicDebris * 0.78 - getDynamicDebrisCount()));
  const countBudget = Math.min(requestedCount, availableCount);

  if (countBudget <= 0) {
    state.wallPiecesBroken += 1;
    state.wallDeformations = state.wallPiecesBroken;
    return null;
  }

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
        1.1,
        1.38,
      );
      const spread = (column - (columns - 1) / 2) * 0.025;

      debris.mesh.userData.visualBrickCount = 1;
      debris.mesh.userData.visualWallImpactCount = maxVisualWallImpactsPerMover;
      debris.body.setLinvel(
        {
          x: push.x * (0.82 + info.row * 0.028) * destructionSpeed + fallDirection.x * 0.2 + lengthDirection.x * spread,
          y: -0.42 * destructionSpeed - info.row * 0.012 + row * 0.025,
          z: push.z * (0.82 + info.row * 0.028) * destructionSpeed + fallDirection.z * 0.2 + lengthDirection.z * spread,
        },
        true,
      );
      debris.body.setAngvel(
        {
          x: seededRange(seed + 4, -0.42, 0.42) * destructionSpeed,
          y: seededRange(seed + 5, -0.35, 0.35) * destructionSpeed,
          z: seededRange(seed + 6, -0.42, 0.42) * destructionSpeed,
        },
        true,
      );

      firstDebris ??= debris;
      created += 1;
    }
  }

  state.wallPiecesBroken += created;
  state.wallDeformations = state.wallPiecesBroken;
  return firstDebris;
}

function releaseUnsupportedStaticWallVisuals(): void {
  let releasedThisStep = 0;

  const sortedVisuals = [...staticWallVisuals].sort((a, b) => {
    const first = getStaticWallVisualInfo(a);
    const second = getStaticWallVisualInfo(b);
    return (first?.row ?? 0) - (second?.row ?? 0);
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

    const lacksVerticalSupport = !isHouseColumnSupported(info.face, info.row, info.column);
    const lacksLateralSupport = isFaceLaterallyUnstable(info.face) && info.row >= physicalWallRows;

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
    const debris = damageStaticWallVisual(visualWall, releaseImpulse, secondaryWallImpactForceThreshold * 1.15, true);

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
  if (force < secondaryWallImpactForceThreshold * 1.35) {
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

    if (force < secondaryWallImpactForceThreshold) {
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

      const damage = THREE.MathUtils.clamp((force - secondaryWallImpactForceThreshold) * 0.16, 1.2, wallBlockBreakDamage + 4);
      const impulse = impulseDirection.clone().multiplyScalar(THREE.MathUtils.clamp(speed * 0.9, 1.2, 8.5));

      target.lastImpactStep = simulationStep;
      state.secondaryWallImpacts += 1;
      damageEntity(target, damage, impulse, target.mesh.position);

      const moverVelocityScale = force > secondaryWallImpactForceThreshold * 2 ? 0.72 : 0.86;
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
      const moverVelocityScale = force > secondaryWallImpactForceThreshold * 2 ? 0.48 : 0.62;

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
  const forwardKey = keys.has('KeyW') || (!cameraFpsMode && keys.has('ArrowUp'));
  const reverseKey = keys.has('KeyS') || (!cameraFpsMode && keys.has('ArrowDown'));
  const leftKey = keys.has('KeyA') || (!cameraFpsMode && keys.has('ArrowLeft'));
  const rightKey = keys.has('KeyD') || (!cameraFpsMode && keys.has('ArrowRight'));
  const throttle = controlOverride?.throttle
    ?? ((forwardKey ? 1 : 0) - (reverseKey ? 1 : 0));
  const steering = controlOverride?.steering
    ?? ((leftKey ? 1 : 0) - (rightKey ? 1 : 0));
  const lowGear = controlOverride?.lowGear ?? (keys.has('ShiftLeft') || keys.has('ShiftRight'));
  const brake = controlOverride?.brake ?? false;
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
  const lowerBlade = controlOverride?.lowerBlade ?? keys.has('KeyE');
  const raiseBlade = controlOverride?.raiseBlade ?? keys.has('KeyQ');
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
    damageEntity(entity, amount, impulse, probe.center);
    dozerSpeed *= Math.max(0.78, 1 - entity.mass * 0.0015);
  }
}

function processVehicleDamage(): void {
  const speed = Math.abs(dozerSpeed);

  if (speed < 0.15) {
    return;
  }

  const dozerPosition = bulldozer.body.translation();
  const base = tempVec3B.set(dozerPosition.x, dozerPosition.y, dozerPosition.z);
  const forward = getBodyForward(bulldozer.body, tempForward).clone();
  const right = getBodyRight(bulldozer.body, tempRight).clone();
  const movingForward = dozerSpeed >= 0;
  const bladePosition = getBladeWorldPosition(new THREE.Vector3());
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
      center: base.clone().addScaledVector(forward, -2.0),
      damageScale: movingForward ? 0.35 : 1.05,
      halfForward: 0.72,
      halfHeight: 0.88,
      halfRight: 1.22,
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

function updateCamera(_dt: number): void {
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

  hudFpsReadout.textContent = `FPS ${state.fps.toFixed(0)}`;
  hudStatusReadout.textContent = [
    `WASD drive | mouse drag rotate | wheel zoom | right/middle drag pan | R FPS view ${cameraFpsMode ? 'on' : 'off'}`,
    cameraFpsMode ? `FPS view: mouse or arrow keys look | WASD/A-D still drive` : `Orbit view: arrows also drive`,
    `Q/E blade | G pickup | X release | T reset | C recenter | H tuning`,
    `speed ${speed.toFixed(1)} | carried ${state.carriedPieces} pcs / ${state.carriedMass.toFixed(0)} mass`,
    `wall blocks broken ${state.wallPiecesBroken} | wall breached ${state.wallBreaches ? 'yes' : 'no'}`,
    `bridge supports cracked ${crackedSupports}, destroyed ${destroyedSupports}/8`,
    `bridge ${state.bridgeCollapsed ? 'collapsed' : 'standing'} | deck pieces dropped ${state.deckPiecesDropped}`,
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

    if (restingGap > -0.1 && restingGap < 0.26) {
      const velocity = entity.body.linvel();
      const settledY = topY + entity.halfExtents.y + 0.018;

      entity.body.setTranslation({ x: position.x, y: settledY, z: position.z }, true);
      entity.body.setLinvel({ x: velocity.x * 0.48, y: Math.max(0, velocity.y) * 0.18, z: velocity.z * 0.48 }, true);
      entity.body.setAngvel({ x: 0, y: entity.body.angvel().y * 0.35, z: 0 }, true);
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

  entity.body.setTranslation(
    {
      x: position.x + push.x * pushDistance,
      y: position.y,
      z: position.z + push.z * pushDistance,
    },
    true,
  );
  entity.body.setLinvel({ x: push.x * 1.4, y: Math.max(0.2, entity.body.linvel().y), z: push.z * 1.4 }, true);
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
    separateDynamicEntityFromBox(entity, chassisCenter, forward, right, bulldozer.halfExtents);
    separateDynamicEntityFromBox(entity, cabCenter, forward, right, cabHalf);
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
  physicsWorld.step();
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

  if (structuralCountAfter !== structuralCountBefore || (dynamicStructureActiveAfterVehicle && simulationStep % 4 === 0)) {
    releaseUnsupportedWallBlocks();
    releaseUnsupportedStaticWallVisuals();
  }

  resolveDebrisAgainstBulldozer();
  settleDynamicRubble();
  entities.forEach(syncMeshFromBody);
}

function simulationNeedsStep(): boolean {
  if (keys.size > 0 || controlOverride || state.carriedPieces > 0 || Math.abs(dozerSpeed) > 0.01) {
    return true;
  }

  return entities.some((entity) => entity.body.isDynamic() && !entity.carried);
}

function update(delta: number): void {
  const clampedDelta = Math.min(0.08, delta);

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
  const gui = new GUI({ title: 'Prototype Physics' });

  gui.add(draftSettings, 'engineTorque', 20, 140, 1).name('engine torque');
  gui.add(draftSettings, 'columnStageOneDamage', 6, 40, 1).name('column crack damage');
  gui.add(draftSettings, 'columnStageTwoDamage', 16, 80, 1).name('column break damage');
  gui.add(draftSettings, 'bridgeCollapseThreshold', 1, 8, 1).name('bridge collapse supports');
  gui.add(draftSettings, 'destructionSpeed', 0.5, 3.5, 0.1).name('destruction speed');
  gui.add(draftSettings, 'debrisPickupRange', 1.2, 5.5, 0.1).name('pickup range');
  gui.add(draftSettings, 'maxCarryMass', 20, 140, 1).name('carry mass');
  gui.add(draftSettings, 'quality', ['Low', 'Medium', 'High']).name('quality');
  gui.add(draftSettings, 'apply').name('Apply Settings');
  gui.domElement.style.display = 'none';
  debugGui = gui;
}

function buildDebugPayload(): string {
  const dozerPosition = bulldozer?.body.translation();
  const speed = bulldozer ? Math.abs(dozerSpeed) : 0;
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
    },
    settings: {
      applied: tuning,
      draftQuality: draftSettings.quality,
      draftDestructionSpeed: Number(draftSettings.destructionSpeed.toFixed(1)),
    },
    state,
    bulldozer: dozerPosition
      ? {
          speed: Number(speed.toFixed(2)),
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
      fracturedBlocks: fracturedWallBlockCount,
      intactBrickVisuals: getIntactBrickVisualCount(),
      independentBrickVisuals: getIndependentBrickVisualCount(),
      independentPhysicalBricks: entities.filter((entity) => entity.name.includes('-independent-brick-')).length,
      dynamicDebris: getDynamicDebrisCount(),
      settledVisualDebris: settledDebrisVisuals.length,
      reactivatableDebris: settledDebrisVisuals.filter((object) => object.userData.settledDebris).length,
      shardDebris: entities.filter((entity) => entity.name.includes('-shard-')).length,
      airborneDynamicDebris: getAirborneDynamicDebrisCount(),
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
      maxBulge: Number(
        wallBlocks.reduce((largest, block) => Math.max(largest, block.wallBlock?.bulge.length() ?? 0), 0).toFixed(3),
      ),
      cabOverlappingDynamicBlocks,
      totalBlocks: wallBlocks.length,
      unsupportedFixedBlocks: wallBlocks.filter((block) => {
        const info = block.wallBlock;

        if (!info || isRoofFace(info.face) || info.row === 0 || block.stage >= 2) {
          return false;
        }

        const support = getHouseBlock(info.face, info.row - 1, info.column);
        return !support || support.stage >= 2;
      }).length,
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

function setBulldozerPoseForTest(x: number, z: number, yaw = 0): void {
  dozerYaw = yaw;
  dozerSpeed = 0;
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

function sideDamageForTest(): unknown {
  resetPrototype();
  setBulldozerPoseForTest(solidWallWidth / 2 + 3.4, houseCenterZ, Math.PI / 2);
  return drivePrototypeForTest(130, 1, 0, false);
}

function backDamageForTest(): unknown {
  resetPrototype();
  setBulldozerPoseForTest(0, solidWallZ - houseDepth - 3.4, Math.PI);
  return drivePrototypeForTest(130, 1, 0, false);
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
        damageEntity(block, wallBlockBreakDamage + 2, new THREE.Vector3(0, 0.8, 4.8));
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
    damageEntity(target, wallBlockBreakDamage + 2, new THREE.Vector3(0.9, 0.4, -4.8));
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
      damageEntity(block, wallBlockBreakDamage + 2, new THREE.Vector3(0, 1.1, -7.5));
    }
  }
  update(fixedDt);
  render();

  return JSON.parse(buildDebugPayload()) as unknown;
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
        damageEntity(block, wallBlockBreakDamage + 2, new THREE.Vector3(0, 1.1, -7.5));
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

function undermineWallSpanForTest(): unknown {
  resetPrototype();

  for (let column = 2; column <= 5; column += 1) {
    for (let row = 0; row <= 1; row += 1) {
      const block = getWallBlock(row, column);

      if (block) {
        damageEntity(block, wallBlockBreakDamage + 2, new THREE.Vector3(0, 1.1, -7.5));
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
    damageEntity(inwardBlock, wallBlockBreakDamage * 0.45, new THREE.Vector3(0, 0, -5.2));
  }

  const inwardBulge = inwardBlock?.wallBlock?.bulge.z ?? 0;

  resetPrototype();
  const outwardBlock = getWallBlock(1, Math.floor(wallBlockColumns / 2));

  if (outwardBlock) {
    damageEntity(outwardBlock, wallBlockBreakDamage * 0.45, new THREE.Vector3(0, 0, 5.2));
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
  window.prototype_back_damage_for_test = backDamageForTest;
  window.prototype_break_wall_for_test = breakWallForTest;
  window.prototype_bulge_direction_for_test = bulgeDirectionForTest;
  window.prototype_damage_bridge_for_test = damageBridgeForTest;
  window.prototype_drive_for_test = drivePrototypeForTest;
  window.prototype_interior_wall_break_for_test = interiorWallBreakForTest;
  window.prototype_material_breakage_for_test = materialBreakageForTest;
  window.prototype_reverse_damage_for_test = reverseDamageForTest;
  window.prototype_release_for_test = releaseDebris;
  window.prototype_reactivate_rubble_for_test = reactivateRubbleForTest;
  window.prototype_reset_for_test = resetPrototype;
  window.prototype_secondary_wall_impact_for_test = secondaryWallImpactForTest;
  window.prototype_side_damage_for_test = sideDamageForTest;
  window.prototype_static_support_collapse_for_test = staticSupportCollapseForTest;
  window.prototype_support_collapse_for_test = supportCollapseForTest;
  window.prototype_broad_front_support_collapse_for_test = broadFrontSupportCollapseForTest;
  window.prototype_undermine_wall_span_for_test = undermineWallSpanForTest;
  window.prototype_visual_wall_impact_for_test = visualWallImpactForTest;
}

async function boot(): Promise<void> {
  await RAPIER.init();
  physicsWorld = new RAPIER.World({ x: 0, y: tuning.gravity, z: 0 });
  addLightsAndGround();
  createBulldozer();
  createWallBuilding();
  createBridge();
  bindInput();
  exposeTestHooks();
  createGui();
  applyQualitySettings();
  state.ready = true;
  animate();
}

void boot();

declare global {
  interface Window {
    advanceTime?: (ms: number) => void;
    prototype_airborne_settle_guard_for_test?: () => unknown;
    prototype_back_damage_for_test?: () => unknown;
    prototype_broad_front_support_collapse_for_test?: () => unknown;
    prototype_break_wall_for_test?: (count?: number) => unknown;
    prototype_bulge_direction_for_test?: () => unknown;
    prototype_damage_bridge_for_test?: (supportsToDestroy?: number) => unknown;
    prototype_drive_for_test?: (frames?: number, throttle?: number, steering?: number, lowerBlade?: boolean) => unknown;
    prototype_interior_wall_break_for_test?: () => unknown;
    prototype_material_breakage_for_test?: () => unknown;
    prototype_pickup_for_test?: () => void;
    prototype_reverse_damage_for_test?: () => unknown;
    prototype_release_for_test?: () => void;
    prototype_reactivate_rubble_for_test?: () => unknown;
    prototype_reset_for_test?: () => void;
    prototype_secondary_wall_impact_for_test?: (speed?: number, mass?: number) => unknown;
    prototype_side_damage_for_test?: () => unknown;
    prototype_static_support_collapse_for_test?: () => unknown;
    prototype_support_collapse_for_test?: () => unknown;
    prototype_undermine_wall_span_for_test?: () => unknown;
    prototype_visual_wall_impact_for_test?: (speed?: number, mass?: number) => unknown;
    render_game_to_text?: () => string;
  }
}
