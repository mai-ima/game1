import { buildCompound, MAP_INFO as COMPOUND } from './Map_Compound.js';
import { buildTestbed, MAP_INFO as TESTBED } from './Map_Testbed.js';

/**
 * 遊べるレベルの一覧。
 *
 * 各項目は { build, MAP_INFO } の組で、Game.loadMap がそのまま受け取れる。
 * ここに足せばメニューの選択肢にも並ぶ。
 */
export const MAPS = {
  compound: { build: buildCompound, MAP_INFO: COMPOUND },
  testbed: { build: buildTestbed, MAP_INFO: TESTBED },
};

export const MAP_LIST = Object.values(MAPS).map((m) => m.MAP_INFO);

/** 既定のレベル */
export const DEFAULT_MAP = 'compound';

export function getMap(id) {
  return MAPS[id] || MAPS[DEFAULT_MAP];
}
