import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTUATOR, WORLD, actuatorZ, rearReefHeight, validateModel } from '../src/model.js';

test('the complete piston remains underwater at maximum excursion', () => {
  const highestCenter = actuatorZ(1 / (4 * ACTUATOR.defaultFrequency));
  assert.ok(highestCenter + ACTUATOR.height / 2 < WORLD.waterLevel);
  const maximumUiAmplitude = 0.140;
  assert.ok(ACTUATOR.restZ + maximumUiAmplitude + ACTUATOR.height / 2 < WORLD.waterLevel);
});

test('annular source dimensions match the brief', () => {
  assert.equal(ACTUATOR.outerRadius, 0.1);
  assert.equal(ACTUATOR.innerRadius, 0.06);
  assert.equal(ACTUATOR.height, 0.1);
});

test('rear reef gets higher toward negative y and emerges', () => {
  assert.ok(rearReefHeight(0, -0.95) > rearReefHeight(0, -0.55));
  assert.ok(rearReefHeight(0, -0.95) > 0);
});

test('model invariants are all satisfied', () => {
  assert.deepEqual(validateModel(), {
    actuatorSubmerged: true,
    kneesEmerge: true,
    rearRisesSeaward: true,
  });
});
