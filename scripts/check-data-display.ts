import assert from 'node:assert/strict'
import { buildColorScale, NO_DATA_COLOR } from '../src/core/scales'
import { valueDomain } from '../src/core/join'

const stats = {
  AAA: { name: 'Zero', area_km2: 1, population: { 2020: 0 }, energy: { 2020: 0 } },
  BBB: { name: 'Ten', area_km2: 1, population: { 2020: 10 }, energy: { 2020: 10 } },
}
assert.deepEqual(valueDomain(stats, 'energy', 2020, 'density'), [0, 10])
assert.deepEqual(valueDomain(stats, 'population', 2020, 'logTotal'), [10, 10])
const linear = buildColorScale([0, 10], 'energy', 'density')
assert.notEqual(linear.color(0), NO_DATA_COLOR)
assert.equal(linear.color(null), NO_DATA_COLOR)
assert.equal(linear.color(NaN), NO_DATA_COLOR)
assert.equal(buildColorScale([1, 10], 'population', 'logTotal').color(0), NO_DATA_COLOR)
console.log('Data display checks passed: zero, missing values, and log-scale domain.')
