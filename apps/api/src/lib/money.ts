import { FEE_RATE } from '@vibe/shared';

/** 平台手续费（A5：5%），向下取整到整数 CR */
export function calcFeeCr(priceCr: number): number {
  return Math.floor(priceCr * FEE_RATE);
}

export function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
