import * as THREE from 'three';
import { TextureFactory } from './TextureFactory.js';

/**
 * マテリアルのプリセット定義。
 * tex   : TextureFactory のマテリアル名（null なら無地）
 * repeat: ワールド 1m あたりのタイル数（UV は後段でワールドスケールに合わせる）
 * params: THREE.MeshStandardMaterial / MeshPhysicalMaterial への追加パラメータ
 */
const PRESETS = {
  /* ---- 建材 ---- */
  concrete:        { tex: 'concrete',     repeat: 1.0,  params: { roughness: 1, metalness: 1 } },
  concreteFloor:   { tex: 'concrete',     repeat: 0.85, params: { roughness: 1, metalness: 1, color: 0xb8b6b0 }, seed: 88 },
  paintedWall:     { tex: 'paintedWall',  repeat: 0.9,  params: { roughness: 1, metalness: 1 } },
  paintedWallBlue: { tex: 'paintedWall',  repeat: 0.9,  params: { roughness: 1, metalness: 1, color: 0x8fa4b8 }, seed: 302 },
  plaster:         { tex: 'plaster',      repeat: 1.0, params: { roughness: 1, metalness: 1 } },
  brick:           { tex: 'brick',        repeat: 0.55, params: { roughness: 1, metalness: 1 } },
  brickPale:       { tex: 'brick',        repeat: 0.55, params: { roughness: 1, metalness: 1, color: 0xc9bda8 }, seed: 555 },
  rock:            { tex: 'rock',         repeat: 0.6, params: { roughness: 1, metalness: 1 } },
  tile:            { tex: 'tile',         repeat: 1.1, params: { roughness: 1, metalness: 1 } },
  paving:          { tex: 'paving',       repeat: 0.42,  params: { roughness: 1, metalness: 1 } },

  /* ---- 地面 ---- */
  asphalt:         { tex: 'asphalt',      repeat: 0.75, params: { roughness: 1, metalness: 1 } },
  dirt:            { tex: 'dirt',         repeat: 0.7,  params: { roughness: 1, metalness: 1 } },
  sand:            { tex: 'sand',         repeat: 0.7, params: { roughness: 1, metalness: 1 } },
  gravel:          { tex: 'gravel',       repeat: 1.1,  params: { roughness: 1, metalness: 1 } },

  /* ---- 金属 ---- */
  rustedMetal:     { tex: 'rustedMetal',  repeat: 0.9,  params: { roughness: 1, metalness: 1 } },
  paintedMetal:    { tex: 'paintedMetal', repeat: 1.0,  params: { roughness: 1, metalness: 1 } },
  paintedMetalTan: { tex: 'paintedMetal', repeat: 1.0,  params: { roughness: 1, metalness: 1, color: 0xc8b389 }, seed: 71 },
  brushedMetal:    { tex: 'brushedMetal', repeat: 0.8,  params: { roughness: 1, metalness: 1 } },
  aluminum:        { tex: 'aluminum',     repeat: 0.7,  params: { roughness: 1, metalness: 1 } },
  carbon:          { tex: 'carbon',       repeat: 2.2,  params: { roughness: 1, metalness: 1 } },
  diamondPlate:    { tex: 'diamondPlate', repeat: 0.5,  params: { roughness: 1, metalness: 1 } },
  corrugated:      { tex: 'corrugated',   repeat: 0.9, params: { roughness: 1, metalness: 1 } },
  hazardStripe:    { tex: 'hazardStripe', repeat: 0.5,  params: { roughness: 1, metalness: 1 } },
  gunMetal:        { tex: 'gunMetal',     repeat: 3.0,  params: { roughness: 1, metalness: 1 } },

  /* ---- 有機物 / 布 ---- */
  wood:            { tex: 'wood',         repeat: 0.85,  params: { roughness: 1, metalness: 1 } },
  woodDark:        { tex: 'wood',         repeat: 0.85,  params: { roughness: 1, metalness: 1, color: 0x8a6a4c }, seed: 909 },
  plywood:         { tex: 'plywood',      repeat: 0.9, params: { roughness: 1, metalness: 1 } },
  osb:             { tex: 'osb',          repeat: 0.8, params: { roughness: 1, metalness: 1 } },
  fabric:          { tex: 'fabric',       repeat: 0.8,  params: { roughness: 1, metalness: 1 } },
  camo:            { tex: 'camo',         repeat: 1.2,  params: { roughness: 1, metalness: 1 } },
  leather:         { tex: 'leather',      repeat: 1.6,  params: { roughness: 1, metalness: 1 } },
  sandbag:         { tex: 'sandbag',      repeat: 1.1,  params: { roughness: 1, metalness: 1 } },
  cardboard:       { tex: 'cardboard',    repeat: 1.0,  params: { roughness: 1, metalness: 1 } },
  rubber:          { tex: 'rubber',       repeat: 1.5,  params: { roughness: 1, metalness: 1 } },
  tireTread:       { tex: 'tireTread',    repeat: 1.2,  params: { roughness: 1, metalness: 1 } },
  polymer:         { tex: 'polymer',      repeat: 3.0,  params: { roughness: 1, metalness: 1 } },

  /* ---- 屋内の仕上げ（マンション・博物館・駅） ---- */
  marble:          { tex: 'marble',       repeat: 0.5,  params: { roughness: 1, metalness: 1 } },
  marbleDark:      { tex: 'marble',       repeat: 0.5,  params: { roughness: 1, metalness: 1, color: 0x4a4e55 }, seed: 616 },
  terrazzo:        { tex: 'terrazzo',     repeat: 2.0,  params: { roughness: 1, metalness: 1 } },
  granite:         { tex: 'granite',      repeat: 1.2,  params: { roughness: 1, metalness: 1 } },
  woodFloor:       { tex: 'woodFloor',    repeat: 0.85,  params: { roughness: 1, metalness: 1 } },
  woodFloorDark:   { tex: 'woodFloor',    repeat: 0.85,  params: { roughness: 1, metalness: 1, color: 0x9a7550 }, seed: 424 },
  carpet:          { tex: 'carpet',       repeat: 1.6,  params: { roughness: 1, metalness: 1 } },
  carpetRed:       { tex: 'carpet',       repeat: 1.6,  params: { roughness: 1, metalness: 1, color: 0xa8564a }, seed: 733 },
  wallpaper:       { tex: 'wallpaper',    repeat: 0.36, params: { roughness: 1, metalness: 1 } },
  wallpaperWarm:   { tex: 'wallpaper',    repeat: 0.36, params: { roughness: 1, metalness: 1, color: 0xd6c8ac }, seed: 191 },
  ceramicTile:     { tex: 'ceramicTile',  repeat: 0.77, params: { roughness: 1, metalness: 1 } },
  ceilingPanel:    { tex: 'ceilingPanel', repeat: 0.42, params: { roughness: 1, metalness: 1 } },
  velvet:          { tex: 'velvet',       repeat: 2.0,  params: { roughness: 1, metalness: 1 } },
  brassPolished:   { tex: 'brassPolished', repeat: 2.5, params: { roughness: 1, metalness: 1 } },

  /* ---- 街路・鉄道 ---- */
  roadMarking:     { tex: 'roadMarking',  repeat: 0.13, params: { roughness: 1, metalness: 1 } },
  tactilePaving:   { tex: 'tactilePaving', repeat: 1.0, params: { roughness: 1, metalness: 1 } },
  ballast:         { tex: 'ballast',      repeat: 1.33, params: { roughness: 1, metalness: 1 } },
  railSteel:       { tex: 'railSteel',    repeat: 6.0,  params: { roughness: 1, metalness: 1 } },
  shutter:         { tex: 'shutter',      repeat: 0.5,  params: { roughness: 1, metalness: 1 } },

  /* ---- 工事現場 ---- */
  rebar:           { tex: 'rebar',        repeat: 2.7,  params: { roughness: 1, metalness: 1 } },
  galvanized:      { tex: 'galvanized',   repeat: 2.5,  params: { roughness: 1, metalness: 1 } },
  formPly:         { tex: 'formPly',      repeat: 0.55, params: { roughness: 1, metalness: 1 } },
  tarp:            { tex: 'tarp',         repeat: 4.0,  params: { roughness: 1, metalness: 1 } },
  tarpGreen:       { tex: 'tarp',         repeat: 4.0,  params: { roughness: 1, metalness: 1, color: 0x8fb87a }, seed: 355 },

  /* ---- 武器の表面処理 ----
   * 実銃の仕上げは「黒い金属」で一括りにできない。
   * パーカーはざらついて艶が無く、アナダイズは均一で青みがあり、
   * ブルーイングは深く映り込む。分けると武器の情報量が一段上がる。 */
  parkerized:      { tex: 'parkerized',   repeat: 4.0,  params: { roughness: 1, metalness: 1 } },
  anodizedBlack:   { tex: 'anodizedBlack', repeat: 4.0, params: { roughness: 1, metalness: 1 } },
  cerakoteFDE:     { tex: 'cerakoteFDE',  repeat: 3.5,  params: { roughness: 1, metalness: 1 } },
  cerakoteOD:      { tex: 'cerakoteFDE',  repeat: 3.5,  params: { roughness: 1, metalness: 1, color: 0x6a7256 }, seed: 447 },
  cerakoteGrey:    { tex: 'cerakoteFDE',  repeat: 3.5,  params: { roughness: 1, metalness: 1, color: 0x8c8e90 }, seed: 908 },
  bluedSteel:      { tex: 'bluedSteel',   repeat: 4.0,  params: { roughness: 1, metalness: 1 } },
  nitride:         { tex: 'nitride',      repeat: 5.0,  params: { roughness: 1, metalness: 1 } },
  stampedSteel:    { tex: 'stampedSteel', repeat: 3.0,  params: { roughness: 1, metalness: 1 } },
  woodStock:       { tex: 'woodStock',    repeat: 2.5,  params: { roughness: 1, metalness: 1 } },
  woodStockDark:   { tex: 'woodStock',    repeat: 2.5,  params: { roughness: 1, metalness: 1, color: 0x8a5a3a }, seed: 271 },
  scopeLens:       { tex: 'scopeLens',    repeat: 20.0, params: { roughness: 1, metalness: 1 } },

  /* ---- 人物の被服・装備 ---- */
  camoWoodland:    { tex: 'camoWoodland', repeat: 1.7,  params: { roughness: 1, metalness: 1 } },
  camoDesert:      { tex: 'camoDesert',   repeat: 1.7,  params: { roughness: 1, metalness: 1 } },
  camoUrban:       { tex: 'camoUrban',    repeat: 1.7,  params: { roughness: 1, metalness: 1 } },
  cordura:         { tex: 'cordura',      repeat: 5.0,  params: { roughness: 1, metalness: 1 } },
  corduraTan:      { tex: 'cordura',      repeat: 5.0,  params: { roughness: 1, metalness: 1, color: 0xa89570 }, seed: 512 },
  corduraOD:       { tex: 'cordura',      repeat: 5.0,  params: { roughness: 1, metalness: 1, color: 0x6d7458 }, seed: 733 },
  kevlarWeave:     { tex: 'kevlarWeave',  repeat: 5.0,  params: { roughness: 1, metalness: 1 } },
  nomex:           { tex: 'nomex',        repeat: 4.0,  params: { roughness: 1, metalness: 1 } },
  bootLeather:     { tex: 'bootLeather',  repeat: 3.0,  params: { roughness: 1, metalness: 1 } },
  skinWeathered:   { tex: 'skinWeathered', repeat: 3.0, params: { roughness: 1, metalness: 1 } },
  skinPale:        { tex: 'skinWeathered', repeat: 3.0, params: { roughness: 1, metalness: 1, color: 0xe8c9ae }, seed: 141 },
  skinDark:        { tex: 'skinWeathered', repeat: 3.0, params: { roughness: 1, metalness: 1, color: 0x8a5f45 }, seed: 626 },

  /* ---- 建材・壁・屋根 ---- */
  concreteRaw:     { tex: 'concreteRaw',  repeat: 0.55, params: { roughness: 1, metalness: 1 } },
  concreteBlock:   { tex: 'concreteBlock', repeat: 1.0, params: { roughness: 1, metalness: 1 } },
  stuccoRough:     { tex: 'stuccoRough',  repeat: 0.9,  params: { roughness: 1, metalness: 1 } },
  stuccoWhite:     { tex: 'stuccoRough',  repeat: 0.9,  params: { roughness: 1, metalness: 1, color: 0xd8d5cd }, seed: 383 },
  plasterCracked:  { tex: 'plasterCracked', repeat: 0.7, params: { roughness: 1, metalness: 1 } },
  sandstone:       { tex: 'sandstone',    repeat: 0.6,  params: { roughness: 1, metalness: 1 } },
  adobe:           { tex: 'adobe',        repeat: 0.8,  params: { roughness: 1, metalness: 1 } },
  woodSiding:      { tex: 'woodSiding',   repeat: 0.7,  params: { roughness: 1, metalness: 1 } },
  woodSidingWhite: { tex: 'woodSiding',   repeat: 0.7,  params: { roughness: 1, metalness: 1, color: 0xcfd0c8 }, seed: 818 },
  sidingMetal:     { tex: 'sidingMetal',  repeat: 0.7,  params: { roughness: 1, metalness: 1 } },
  roofTile:        { tex: 'roofTile',     repeat: 0.45, params: { roughness: 1, metalness: 1 } },
  roofTileRed:     { tex: 'roofTile',     repeat: 0.45, params: { roughness: 1, metalness: 1, color: 0xb06a4a }, seed: 929 },
  asphaltShingle:  { tex: 'asphaltShingle', repeat: 0.8, params: { roughness: 1, metalness: 1 } },
  metalRoof:       { tex: 'metalRoof',    repeat: 0.65, params: { roughness: 1, metalness: 1 } },
  metalRoofGreen:  { tex: 'metalRoof',    repeat: 0.65, params: { roughness: 1, metalness: 1, color: 0x6d8a72 }, seed: 464 },
  brickGlazed:     { tex: 'brickGlazed',  repeat: 1.1,  params: { roughness: 1, metalness: 1 } },

  /* ---- 小物・什器 ---- */
  plasticMatte:    { tex: 'plasticMatte', repeat: 2.5,  params: { roughness: 1, metalness: 1 } },
  plasticBlack:    { tex: 'plasticMatte', repeat: 2.5,  params: { roughness: 1, metalness: 1, color: 0x3c3e42 }, seed: 202 },
  plasticYellow:   { tex: 'plasticMatte', repeat: 2.5,  params: { roughness: 1, metalness: 1, color: 0xd8a52a }, seed: 313 },
  plasticGloss:    { tex: 'plasticGloss', repeat: 2.5,  params: { roughness: 1, metalness: 1 } },
  plasticGlossRed: { tex: 'plasticGloss', repeat: 2.5,  params: { roughness: 1, metalness: 1, color: 0xa8382c }, seed: 575 },
  acrylic:         { tex: 'acrylic',      repeat: 2.0,  params: { roughness: 1, metalness: 1 } },
  stainless:       { tex: 'stainless',    repeat: 1.6,  params: { roughness: 1, metalness: 1 } },
  castIron:        { tex: 'castIron',     repeat: 1.8,  params: { roughness: 1, metalness: 1 } },
  chippedPaint:    { tex: 'chippedPaint', repeat: 1.4,  params: { roughness: 1, metalness: 1 } },
  chippedPaintRed: { tex: 'chippedPaint', repeat: 1.4,  params: { roughness: 1, metalness: 1, color: 0xc2705c }, seed: 686 },
  perforatedMetal: { tex: 'perforatedMetal', repeat: 4.5, params: { roughness: 1, metalness: 1 } },
  chainlink:       { tex: 'chainlink',    repeat: 1.8,  params: { roughness: 1, metalness: 1 } },
  expandedMetal:   { tex: 'expandedMetal', repeat: 2.4, params: { roughness: 1, metalness: 1 } },
  copperPatina:    { tex: 'copperPatina', repeat: 1.0,  params: { roughness: 1, metalness: 1 } },
  anodized:        { tex: 'anodized',     repeat: 2.0,  params: { roughness: 1, metalness: 1 } },
  paperPrint:      { tex: 'paperPrint',   repeat: 1.6,  params: { roughness: 1, metalness: 1 } },
  porcelain:       { tex: 'porcelain',    repeat: 2.0,  params: { roughness: 1, metalness: 1 } },
  screenPanel:     { tex: 'screenPanel',  repeat: 1.5,  params: { roughness: 1, metalness: 1 } },
  foam:            { tex: 'foam',         repeat: 1.6,  params: { roughness: 1, metalness: 1 } },
  burlap:          { tex: 'burlap',       repeat: 8.0,  params: { roughness: 1, metalness: 1 } },

  /* ---- 汚し（面に重ねて雰囲気を足す） ---- */
  soot:            { tex: 'soot',         repeat: 0.7,  params: { roughness: 1, metalness: 1 } },
  moss:            { tex: 'moss',         repeat: 1.4,  params: { roughness: 1, metalness: 1 } },
  mud:             { tex: 'mud',          repeat: 0.8,  params: { roughness: 1, metalness: 1 } },

  /* ---- 自然物・屋外 ---- */
  grass:           { tex: 'grass',        repeat: 1.1,  params: { roughness: 1, metalness: 1 } },
  grassDry:        { tex: 'grass',        repeat: 1.1,  params: { roughness: 1, metalness: 1, color: 0xbdb178 }, seed: 240 },
  foliage:         { tex: 'foliage',      repeat: 1.4,  params: { roughness: 1, metalness: 1 } },
  bark:            { tex: 'bark',         repeat: 1.5,  params: { roughness: 1, metalness: 1 } },
  water:           { tex: 'water',        repeat: 0.5,  params: { roughness: 1, metalness: 1 } },

  /* ---- 街路の汚れ・掲示物 ---- */
  graffiti:        { tex: 'graffiti',     repeat: 0.4,  params: { roughness: 1, metalness: 1 } },
  oilStain:        { tex: 'oilStain',     repeat: 0.55, params: { roughness: 1, metalness: 1 } },
  posterWall:      { tex: 'posterWall',   repeat: 0.45, params: { roughness: 1, metalness: 1 } },
  rustHeavy:       { tex: 'rustHeavy',    repeat: 0.9,  params: { roughness: 1, metalness: 1 } },
  brickOld:        { tex: 'brickOld',     repeat: 1.1,  params: { roughness: 1, metalness: 1 } },
  brickOldGrey:    { tex: 'brickOld',     repeat: 1.1,  params: { roughness: 1, metalness: 1, color: 0x9c9a94 }, seed: 505 },

  /* ---- 建材・什器（続き） ---- */
  meshScreen:      { tex: 'meshScreen',   repeat: 2.2,  params: { roughness: 1, metalness: 1 } },
  scaffoldPlank:   { tex: 'scaffoldPlank', repeat: 0.7, params: { roughness: 1, metalness: 1 } },
  corrugatedPlastic: { tex: 'corrugatedPlastic', repeat: 0.6, params: { roughness: 1, metalness: 1 } },
  awningFabric:    { tex: 'awningFabric', repeat: 0.55, params: { roughness: 1, metalness: 1 } },
  awningGreen:     { tex: 'awningFabric', repeat: 0.55, params: { roughness: 1, metalness: 1, color: 0x7fa06a }, seed: 616 },
  solarPanel:      { tex: 'solarPanel',   repeat: 0.55, params: { roughness: 1, metalness: 1 } },
};

/** テクスチャ無しの単色マテリアル定義 */
const SOLIDS = {
  black:      { color: 0x0a0a0b, roughness: 0.55, metalness: 0.0 },
  darkSteel:  { color: 0x1c1e22, roughness: 0.42, metalness: 1.0 },
  chrome:     { color: 0xe8eaec, roughness: 0.08, metalness: 1.0 },
  brass:      { color: 0xc9a227, roughness: 0.28, metalness: 1.0 },
  copper:     { color: 0xb87333, roughness: 0.32, metalness: 1.0 },
  lead:       { color: 0x6e7175, roughness: 0.5,  metalness: 1.0 },
  whitePaint: { color: 0xd8d6d0, roughness: 0.6,  metalness: 0.0 },
  redPaint:   { color: 0x8e2318, roughness: 0.5,  metalness: 0.0 },
  odGreen:    { color: 0x2b3020, roughness: 0.62, metalness: 0.05 },
  tan:        { color: 0x8c7a55, roughness: 0.68, metalness: 0.05 },
};

/*
 * 粗さ・金属度・遮蔽を 1 回の読み取りにまとめる差し替え。
 *
 * three の該当チャンクは、もともと ORM 統合テクスチャを想定して
 *   R = 遮蔽 / G = 粗さ / B = 金属度
 * とチャンネルを決めてある。にもかかわらず 3 つのマップを別々に
 * texture2D するので、同じ画素を 3 回取りに行っている。
 * 粗さの読み取り結果を使い回して 1 回に減らす。絵は変わらない。
 *
 * 関数はモジュールに 1 つだけ置く。マテリアルごとに別の関数を渡すと
 * three がシェーダを別物とみなし、プログラムが人数分できてしまう。
 */
const PACK_ORM = (shader) => {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <metalnessmap_fragment>', /* glsl */`
      float metalnessFactor = metalness;
      #ifdef USE_METALNESSMAP
        #ifdef USE_ROUGHNESSMAP
          metalnessFactor *= texelRoughness.b;
        #else
          metalnessFactor *= texture2D( metalnessMap, vMetalnessMapUv ).b;
        #endif
      #endif
    `)
    .replace('#include <aomap_fragment>', /* glsl */`
      #ifdef USE_AOMAP
        #ifdef USE_ROUGHNESSMAP
          float ambientOcclusion = ( texelRoughness.r - 1.0 ) * aoMapIntensity + 1.0;
        #else
          float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
        #endif
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        #if defined( USE_CLEARCOAT )
          clearcoatSpecularIndirect *= ambientOcclusion;
        #endif
        #if defined( USE_SHEEN )
          sheenSpecularIndirect *= ambientOcclusion;
        #endif
        #if defined( USE_ENVMAP ) && defined( STANDARD )
          float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
          reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
        #endif
      #endif
    `);
};
const PACK_ORM_KEY = () => 'packedORM';

/*
 * ざらついた面の「環境の映り込み」を省く差し替え。
 *
 * getIBLRadiance は粗さから mip を選び、2 段階を取って混ぜるので、
 * 1 回の呼び出しで 8 回テクスチャを読む。実測で描画時間の 4 割近い。
 *
 * ところが粗さ 0.8 を超える面 ―― 土、コンクリート、漆喰、布、木 ――
 * では、映り込みは方向を失って一様な光にならされる。
 * その一様な分は拡散側の getIBLIrradiance が既に足しているので、
 * 鏡面側を落としても、絵はほとんど動かない。
 * マップの面積の大半がこの手の材質なので、効きは大きい。
 *
 * 磨いた金属やガラスには適用しない（映り込みが形を持つため）。
 */
const dropRoughIBL = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    'radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );',
    '// ざらつきが強いので鏡面の環境光は省く（拡散側で足りている）'
  );
};
/*
 * 組み合わせは 2 通りしかないので、合成済みの関数を用意しておく。
 * マテリアルごとに新しい関数を作ると、three はシェーダを別物とみなし、
 * 同じ内容のプログラムがマテリアルの数だけ作られる。
 */
const PACK_ORM_NO_IBL = (shader) => { PACK_ORM(shader); dropRoughIBL(shader); };
const PACK_ORM_NO_IBL_KEY = () => 'packedORM|noRoughIBL';

/*
 * 影のぼかしを 5 回の取得から 1 回に減らす差し替え。
 *
 * three の PCF は Vogel ディスク上の 5 点を画素ごとに回して取る。
 * ハードウェア PCF なので 1 点が 2×2 の補間を含み、実質 20 点ぶん。
 * 柔らかい影は作れるが、内蔵 GPU では影だけで描画時間の 1 割を超える。
 *
 * 1 点に落としても、ハードウェア PCF の 2×2 補間は残るので、
 * 影の縁は 1 テクセル幅で滑らかに繋がる。
 * 影マップが 1024 で範囲 42m なら 1 テクセルは 4cm。輪郭の差は出ない。
 * 失われるのは、それより広い範囲へ滲ませる「柔らかさ」だけ。
 * 実測した絵の差は、影が出る画角でも 12/255 を超える画素が 0.19%
 * （輪郭線の上だけ）にとどまる。
 *
 * ただし、効き目は環境によって大きく違う。
 * 検証に使っているソフトウェア描画（SwiftShader）は CPU で走るため
 * テクスチャ取得が相対的に安く、5 点を 1 点にしても有意差が出ない。
 * テクスチャユニットが細い内蔵 GPU では効くと見込んで内蔵GPU設定にだけ
 * 残しているが、「低」から上では 5 点のままにしてある。
 * 効果を測れていない画質低下を、広い範囲へ入れるべきではない。
 *
 * ShaderChunk を直接差し替える。three はこのチャンクを
 * #include で展開するため、onBeforeCompile では手が届かない。
 */
const SHADOW_CHUNK_FULL = THREE.ShaderChunk.shadowmap_pars_fragment;
const SHADOW_CHUNK_CHEAP = SHADOW_CHUNK_FULL.replace(
  /shadow = \(\s*texture\( shadowMap[\s\S]*?\) \* 0\.2;/,
  'shadow = texture( shadowMap, vec3( shadowCoord.xy, shadowCoord.z ) );'
);

/**
 * この材質は環境の映り込みが形を持つか（＝省いてはいけないか）。
 *
 * 判断に使うのは ORM テクスチャの平均値。
 * マテリアルの roughness / metalness は、そこへ掛ける係数として
 * ほぼ 1 が入っているだけなので、材質の判別には使えない。
 */
function needsSpecularIBL(mat) {
  const rough = mat.userData.avgRough;
  const metal = mat.userData.avgMetal;
  if (rough === undefined) return true;      // 判らないものは残す
  // 非金属は、少しざらつけば映り込みが形を失う（漆喰・木・布・塩ビ）
  if (metal <= 0.10) return rough < 0.62;
  // 金属は環境の色を映すので粘る。それでも荒れきれば同じこと（錆・鋳鉄・鉄筋）
  return rough < 0.86;
}

export class MaterialLibrary {
  /**
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(renderer) {
    this.tf = new TextureFactory(renderer);
    this.cache = new Map();
    this.envIntensity = 1.0;
    this.envMap = null;
    this._all = [];
    /*
     * ざらついた面の鏡面 IBL を省くか。
     * 描画時間の 4 割近くを占める処理なので、内蔵 GPU では落とす。
     * Engine が画質設定から立てる。
     */
    this.dropRoughIBL = false;
    /** 影のぼかしを 1 回の取得で済ませるか（同上） */
    this.cheapShadows = false;
  }

  /**
   * 粗さ・金属度・遮蔽の 3 つを 1 回の読み取りにまとめる。
   *
   * この工房は 3 つを 1 枚の RGB（R=遮蔽 / G=粗さ / B=金属度）に詰めて
   * 同じテクスチャを roughnessMap・metalnessMap・aoMap の 3 つに渡している。
   * three はそれぞれ別に texture2D を呼ぶので、同じ画素を 3 回取りに行く。
   * 1 回に減らしても出る絵は 1 ビットも変わらない。
   *
   * 実測では、この 3 回の読み取りが描画時間の 2 割を占めていた。
   */
  _packORM(mat) {
    mat.userData.orm = true;
    // ざらついた面では、環境の映り込み（鏡面 IBL）も併せて省く
    const drop = this.dropRoughIBL && !needsSpecularIBL(mat);
    mat.onBeforeCompile = drop ? PACK_ORM_NO_IBL : PACK_ORM;
    mat.customProgramCacheKey = drop ? PACK_ORM_NO_IBL_KEY : PACK_ORM_KEY;
    return mat;
  }

  /**
   * ざらついた面の鏡面 IBL を省くかを切り替える。
   * シェーダを組み直すので、画質設定を変えたときだけ呼ぶこと。
   */
  setDropRoughIBL(on) {
    on = !!on;
    if (on === this.dropRoughIBL) return;
    this.dropRoughIBL = on;
    for (const m of this._all) {
      if (!m.userData.orm) continue;
      this._packORM(m);
      m.needsUpdate = true;
    }
  }

  /**
   * 影のぼかしを 1 回の取得に減らすかを切り替える。
   * シェーダを組み直すので、画質設定を変えたときだけ呼ぶこと。
   */
  setCheapShadows(on) {
    on = !!on;
    if (on === this.cheapShadows) return;
    this.cheapShadows = on;
    THREE.ShaderChunk.shadowmap_pars_fragment = on ? SHADOW_CHUNK_CHEAP : SHADOW_CHUNK_FULL;
    for (const m of this._all) m.needsUpdate = true;
  }

  /** 生成直後のマテリアルへ現在の環境設定を反映し、追跡リストへ登録する */
  _register(mat, key) {
    if (this.envMap) { mat.envMap = this.envMap; }
    mat.envMapIntensity = this.envIntensity;
    this.cache.set(key, mat);
    this._all.push(mat);
    return mat;
  }

  /** プリセット名一覧 */
  static get presets() { return Object.keys(PRESETS); }
  static get solids() { return Object.keys(SOLIDS); }

  /**
   * テクスチャ付きマテリアルを取得。
   * @param {string} name PRESETS のキー
   * @param {object} opt {repeat:[u,v] 上書き, size, ...MeshStandardMaterial パラメータ}
   */
  get(name, opt = {}) {
    const key = `${name}|${JSON.stringify(opt)}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const p = PRESETS[name];
    if (!p) throw new Error(`未定義のマテリアルプリセット: ${name}`);

    const set = this.tf.get(p.tex, { size: opt.size || 512, seed: p.seed ?? 1234 });
    // repeat / size は生成用パラメータなのでマテリアルには渡さない
    const { repeat, size, ...rest } = opt;

    // 同じテクスチャを別リピートで使うためにクローン
    const map = set.map.clone(); map.needsUpdate = true;
    const nrm = set.normalMap.clone(); nrm.needsUpdate = true;
    const orm = set.roughnessMap.clone(); orm.needsUpdate = true;

    const r = repeat || [1, 1];
    map.repeat.set(r[0], r[1]);
    nrm.repeat.set(r[0], r[1]);
    orm.repeat.set(r[0], r[1]);

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap: nrm,
      roughnessMap: orm,
      metalnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 1.0,
      normalScale: new THREE.Vector2(1, 1),
      envMapIntensity: this.envIntensity,
      ...p.params,
      ...rest,
    });
    mat.userData.worldRepeat = p.repeat;
    mat.userData.avgRough = set.avgRough;
    mat.userData.avgMetal = set.avgMetal;
    mat.name = name;
    this._packORM(mat);
    return this._register(mat, key);
  }

  /** 登録されているプリセット名の一覧（見本帳ツール用） */
  names() { return Object.keys(PRESETS); }

  /**
   * ワールドサイズに応じて UV リピートを自動計算したマテリアルを取得。
   * 壁や床など、寸法の異なるジオメトリで密度を揃えるために使う。
   * @param {string} name
   * @param {number} w ワールド幅 (m)
   * @param {number} h ワールド高さ (m)
   */
  scaled(name, w, h, opt = {}) {
    const p = PRESETS[name];
    if (!p) throw new Error(`未定義のマテリアルプリセット: ${name}`);
    const d = p.repeat;
    return this.get(name, { ...opt, repeat: [Math.max(0.25, w * d), Math.max(0.25, h * d)] });
  }

  /** 単色 PBR マテリアル */
  solid(name, opt = {}) {
    const key = `solid:${name}|${JSON.stringify(opt)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const s = SOLIDS[name];
    if (!s) throw new Error(`未定義の単色マテリアル: ${name}`);
    const mat = new THREE.MeshStandardMaterial({
      ...s, envMapIntensity: this.envIntensity, ...opt,
    });
    mat.name = `solid:${name}`;
    return this._register(mat, key);
  }

  /** ガラス（物理マテリアル・透過） */
  glass(opt = {}) {
    const key = `glass|${JSON.stringify(opt)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const set = this.tf.get('dirtyGlass', { size: 512, seed: 4242 });
    const nrm = set.normalMap.clone(); nrm.needsUpdate = true;
    const orm = set.roughnessMap.clone(); orm.needsUpdate = true;
    nrm.repeat.set(2, 2); orm.repeat.set(2, 2);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xdce6ea,
      metalness: 0,
      roughness: 0.06,
      roughnessMap: orm,
      normalMap: nrm,
      normalScale: new THREE.Vector2(0.28, 0.28),
      transmission: 0.94,
      thickness: 0.02,
      ior: 1.52,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      envMapIntensity: this.envIntensity,
      specularIntensity: 1,
      ...opt,
    });
    mat.name = 'glass';
    return this._register(mat, key);
  }

  /** 発光マテリアル（照明器具・モニタ等） */
  emissive(color = 0xffe6b0, intensity = 4, opt = {}) {
    const key = `emis|${color}|${intensity}|${JSON.stringify(opt)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      emissive: new THREE.Color(color),
      emissiveIntensity: intensity,
      roughness: 0.4,
      metalness: 0,
      ...opt,
    });
    mat.name = 'emissive';
    return this._register(mat, key);
  }

  /** 環境マップを全マテリアルへ適用 */
  applyEnvironment(envTexture, intensity = 1.0) {
    this.envIntensity = intensity;
    this.envMap = envTexture;
    for (const m of this._all) {
      m.envMap = envTexture;
      m.envMapIntensity = intensity;
      m.needsUpdate = true;
    }
  }

  dispose() {
    for (const m of this._all) m.dispose();
    this._all.length = 0;
    this.cache.clear();
    this.tf.dispose();
  }
}

export { PRESETS, SOLIDS };
