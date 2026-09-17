import {
  DETECTION_STATUS_FAILED,
  DETECTION_STATUS_IN_PROGRESS,
  STACK_DRIFT_STATUS_DRIFTED,
  hasNextPage,
  hasTagFilterValues,
  isDetectionFailed,
  isDetectionInProgress,
  isStackDrifted,
} from '../src/funcs/detector-predicates';

describe('detector predicates', () => {
  describe('hasNextPage', () => {
    it.each([
      { token: undefined, expected: false },
      { token: '', expected: false },
      { token: 'page-2', expected: true },
    ])('returns $expected when token is $token', ({ token, expected }) => {
      expect(hasNextPage(token)).toBe(expected);
    });
  });

  describe('isDetectionInProgress', () => {
    it.each([
      { detectionStatus: undefined, expected: false },
      { detectionStatus: DETECTION_STATUS_FAILED, expected: false },
      { detectionStatus: 'DETECTION_COMPLETE', expected: false },
      { detectionStatus: DETECTION_STATUS_IN_PROGRESS, expected: true },
    ])('returns $expected when status is $detectionStatus', ({ detectionStatus, expected }) => {
      expect(isDetectionInProgress(detectionStatus)).toBe(expected);
    });
  });

  describe('isDetectionFailed', () => {
    it.each([
      { detectionStatus: undefined, expected: false },
      { detectionStatus: DETECTION_STATUS_IN_PROGRESS, expected: false },
      { detectionStatus: 'DETECTION_COMPLETE', expected: false },
      { detectionStatus: DETECTION_STATUS_FAILED, expected: true },
    ])('returns $expected when status is $detectionStatus', ({ detectionStatus, expected }) => {
      expect(isDetectionFailed(detectionStatus)).toBe(expected);
    });
  });

  describe('isStackDrifted', () => {
    it.each([
      { stackDriftStatus: undefined, expected: false },
      { stackDriftStatus: 'IN_SYNC', expected: false },
      { stackDriftStatus: 'NOT_CHECKED', expected: false },
      { stackDriftStatus: STACK_DRIFT_STATUS_DRIFTED, expected: true },
    ])('returns $expected when status is $stackDriftStatus', ({ stackDriftStatus, expected }) => {
      expect(isStackDrifted(stackDriftStatus)).toBe(expected);
    });
  });

  describe('hasTagFilterValues', () => {
    it.each([
      { tagValues: undefined, expected: false },
      { tagValues: [], expected: false },
      { tagValues: ['enabled'], expected: true },
    ])('returns $expected when tagValues is $tagValues', ({ tagValues, expected }) => {
      expect(hasTagFilterValues(tagValues)).toBe(expected);
    });
  });
});
