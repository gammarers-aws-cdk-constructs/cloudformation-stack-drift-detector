import {
  DETECTION_FAILURE_NAME_LIMIT,
  DETECTION_STATUS_FAILED,
  DETECTION_STATUS_IN_PROGRESS,
  formatDetectionFailureMessage,
  formatDetectionTimeoutMessage,
  hasDetectionFailures,
  hasRemainingStatusChecks,
  listStackNamesAtIndexes,
  listUnstartedStackNames,
  shouldWaitForDetection,
} from '../src/funcs/core/detector-predicates';

const STACK_NAMES = ['Alpha', 'Beta', 'Gamma'];

describe('drift detection wait predicates', () => {
  it.each([
    { completedChecks: 0, maxStatusChecks: 20, expected: true },
    { completedChecks: 19, maxStatusChecks: 20, expected: true },
    { completedChecks: 20, maxStatusChecks: 20, expected: false },
    { completedChecks: 21, maxStatusChecks: 20, expected: false },
  ])(
    'hasRemainingStatusChecks returns $expected after $completedChecks of $maxStatusChecks checks',
    ({ completedChecks, maxStatusChecks, expected }) => {
      expect(hasRemainingStatusChecks(completedChecks, maxStatusChecks)).toBe(expected);
    },
  );

  it.each([
    {
      detectionStatus: DETECTION_STATUS_IN_PROGRESS,
      completedChecks: 1,
      maxStatusChecks: 20,
      expected: true,
    },
    {
      detectionStatus: DETECTION_STATUS_IN_PROGRESS,
      completedChecks: 20,
      maxStatusChecks: 20,
      expected: false,
    },
    {
      detectionStatus: 'DETECTION_COMPLETE',
      completedChecks: 1,
      maxStatusChecks: 20,
      expected: false,
    },
    {
      detectionStatus: DETECTION_STATUS_FAILED,
      completedChecks: 1,
      maxStatusChecks: 20,
      expected: false,
    },
    {
      detectionStatus: undefined,
      completedChecks: 1,
      maxStatusChecks: 20,
      expected: false,
    },
  ])(
    'shouldWaitForDetection returns $expected for $detectionStatus after $completedChecks checks',
    ({ detectionStatus, completedChecks, maxStatusChecks, expected }) => {
      expect(shouldWaitForDetection(detectionStatus, completedChecks, maxStatusChecks)).toBe(expected);
    },
  );

  it.each([
    { failedCount: 0, expected: false },
    { failedCount: 1, expected: true },
  ])('hasDetectionFailures returns $expected when failedCount is $failedCount', ({ failedCount, expected }) => {
    expect(hasDetectionFailures(failedCount)).toBe(expected);
  });

  it.each([
    { indexes: [0, 2], expected: ['Alpha', 'Gamma'] },
    { indexes: [], expected: [] },
  ])('listStackNamesAtIndexes returns $expected for $indexes', ({ indexes, expected }) => {
    expect(listStackNamesAtIndexes(STACK_NAMES, indexes)).toEqual(expected);
  });

  it.each([
    { finishedIndexes: [0, 2], expected: ['Beta'] },
    { finishedIndexes: [0, 1, 2], expected: [] },
    { finishedIndexes: [], expected: ['Alpha', 'Beta', 'Gamma'] },
  ])('listUnstartedStackNames returns $expected when finished indexes are $finishedIndexes', ({
    finishedIndexes,
    expected,
  }) => {
    expect(listUnstartedStackNames(STACK_NAMES, finishedIndexes)).toEqual(expected);
  });

  it.each([
    {
      label: 'one failed stack',
      report: { failedNames: ['Alpha'], unstartedCount: 0, nameLimit: DETECTION_FAILURE_NAME_LIMIT },
      expected: 'Drift detection failed for 1 stack: Alpha',
    },
    {
      label: 'two failed stacks',
      report: { failedNames: ['Alpha', 'Beta'], unstartedCount: 0, nameLimit: DETECTION_FAILURE_NAME_LIMIT },
      expected: 'Drift detection failed for 2 stacks: Alpha, Beta',
    },
    {
      label: 'names past the cap',
      report: { failedNames: ['Alpha', 'Beta', 'Gamma'], unstartedCount: 0, nameLimit: 2 },
      expected: 'Drift detection failed for 3 stacks: Alpha, Beta, and 1 more',
    },
    {
      label: 'one stack that never started',
      report: { failedNames: ['Alpha'], unstartedCount: 1, nameLimit: DETECTION_FAILURE_NAME_LIMIT },
      expected: 'Drift detection failed for 1 stack: Alpha. Did not start 1 stack',
    },
    {
      label: 'several stacks that never started',
      report: { failedNames: ['Alpha', 'Beta'], unstartedCount: 4, nameLimit: DETECTION_FAILURE_NAME_LIMIT },
      expected: 'Drift detection failed for 2 stacks: Alpha, Beta. Did not start 4 stacks',
    },
  ])('formatDetectionFailureMessage lists $label', ({ report, expected }) => {
    expect(formatDetectionFailureMessage(report)).toBe(expected);
  });

  it('formatDetectionTimeoutMessage includes the stack, status, and check limit', () => {
    expect(formatDetectionTimeoutMessage({
      stackName: 'SlowStack',
      detectionStatus: DETECTION_STATUS_IN_PROGRESS,
      completedChecks: 2,
      maxStatusChecks: 2,
    })).toBe(
      'Drift detection timed out for stack SlowStack: status is DETECTION_IN_PROGRESS, checked 2 times, expected completion within 2 checks',
    );
  });
});
