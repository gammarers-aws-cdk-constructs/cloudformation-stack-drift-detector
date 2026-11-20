/**
 * Continue/stop predicates for CloudFormation drift detection loops.
 * These checks do not call AWS APIs.
 */

/** DetectStackDrift is still running. */
export const DETECTION_STATUS_IN_PROGRESS = 'DETECTION_IN_PROGRESS';
/** DetectStackDrift finished with an error. */
export const DETECTION_STATUS_FAILED = 'DETECTION_FAILED';
/** At least one resource differs from the template. */
export const STACK_DRIFT_STATUS_DRIFTED = 'DRIFTED';

/**
 * Returns whether a pagination token means another page should be fetched.
 *
 * @param token - Next-page token from a list API. Empty or omitted means stop.
 * @returns True when `token` is a non-empty string.
 */
export const hasNextPage = (token: string | undefined): boolean => {
  return Boolean(token);
};

/**
 * Returns whether drift detection is still running.
 *
 * @param detectionStatus - Status from DescribeStackDriftDetectionStatus.
 * @returns True when status is {@link DETECTION_STATUS_IN_PROGRESS}.
 */
export const isDetectionInProgress = (detectionStatus: string | undefined): boolean => {
  return detectionStatus === DETECTION_STATUS_IN_PROGRESS;
};

/**
 * Returns whether drift detection failed.
 *
 * @param detectionStatus - Status from DescribeStackDriftDetectionStatus.
 * @returns True when status is {@link DETECTION_STATUS_FAILED}.
 */
export const isDetectionFailed = (detectionStatus: string | undefined): boolean => {
  return detectionStatus === DETECTION_STATUS_FAILED;
};

/**
 * Returns whether a stack has drifted from its template.
 *
 * @param stackDriftStatus - Drift status after detection completes.
 * @returns True when status is {@link STACK_DRIFT_STATUS_DRIFTED}.
 */
export const isStackDrifted = (stackDriftStatus: string | undefined): boolean => {
  return stackDriftStatus === STACK_DRIFT_STATUS_DRIFTED;
};

/**
 * Returns whether another status check is allowed after the checks already made.
 *
 * @param completedChecks - Status checks already performed for the stack.
 * @param maxStatusChecks - Maximum checks for one stack, including the first.
 * @returns True when `completedChecks` is still below `maxStatusChecks`.
 */
export const hasRemainingStatusChecks = (
  completedChecks: number,
  maxStatusChecks: number,
): boolean => {
  return completedChecks < maxStatusChecks;
};

/**
 * Returns whether detection should wait before the next status check.
 * The first check is not covered here; call this only after a check has completed.
 *
 * @param detectionStatus - Status from the check that just finished.
 * @param completedChecks - Status checks already performed for the stack.
 * @param maxStatusChecks - Maximum checks for one stack, including the first.
 * @returns True when detection is still running and another check is allowed.
 */
export const shouldWaitForDetection = (
  detectionStatus: string | undefined,
  completedChecks: number,
  maxStatusChecks: number,
): boolean => {
  return isDetectionInProgress(detectionStatus)
    && hasRemainingStatusChecks(completedChecks, maxStatusChecks);
};

/**
 * Returns whether at least one stack failed drift detection.
 *
 * @param failedCount - Number of stacks whose detection failed.
 * @returns True when `failedCount` is greater than zero.
 */
export const hasDetectionFailures = (failedCount: number): boolean => {
  return failedCount > 0;
};

/** Failed stack names included in the thrown error. The rest are counted. */
export const DETECTION_FAILURE_NAME_LIMIT = 10;

/** Names and counts used to describe a drift-detection run that had failures. */
export interface DetectionFailureReport {
  /** Stacks whose detection failed, in map order. */
  readonly failedNames: readonly string[];
  /** Stacks that never started because the run stopped early. */
  readonly unstartedCount: number;
  /** Maximum failed stack names to include before summarizing the rest. */
  readonly nameLimit: number;
}

/** Stack, status, and check counts for a detection that stayed in progress. */
export interface DetectionTimeoutState {
  /** Stack that did not finish within the check limit. */
  readonly stackName: string;
  /** Status from the last check. */
  readonly detectionStatus: string | undefined;
  /** Status checks performed for the stack. */
  readonly completedChecks: number;
  /** Maximum checks allowed for the stack. */
  readonly maxStatusChecks: number;
}

/**
 * Returns stack names at the given indexes.
 *
 * @param stackNames - Stacks in map order.
 * @param indexes - Indexes into `stackNames`.
 * @returns Names at `indexes`, in the same order.
 */
export const listStackNamesAtIndexes = (
  stackNames: readonly string[],
  indexes: readonly number[],
): string[] => {
  return indexes.map((index) => stackNames[index]);
};

/**
 * Returns stacks whose map index is not in `finishedIndexes`.
 *
 * @param stackNames - Stacks in map order.
 * @param finishedIndexes - Indexes that succeeded, failed, or were still running.
 * @returns Names that never started.
 */
export const listUnstartedStackNames = (
  stackNames: readonly string[],
  finishedIndexes: readonly number[],
): string[] => {
  const finished = new Set(finishedIndexes);
  return stackNames.filter((_stackName, index) => !finished.has(index));
};

const pluralizeStacks = (count: number): string => {
  if (count === 1) {
    return '1 stack';
  }
  return `${count} stacks`;
};

const listFailedStackNames = (failedNames: readonly string[], nameLimit: number): string => {
  const shownNames = failedNames.slice(0, nameLimit);
  const omittedCount = failedNames.length - shownNames.length;
  if (omittedCount <= 0) {
    return shownNames.join(', ');
  }
  return `${shownNames.join(', ')}, and ${omittedCount} more`;
};

/**
 * Builds the error text for a run that failed one or more stacks.
 *
 * @param report - Failed names, how many stacks never started, and the name cap.
 * @returns A message that lists failed stacks up to the cap.
 */
export const formatDetectionFailureMessage = (report: DetectionFailureReport): string => {
  const listedNames = listFailedStackNames(report.failedNames, report.nameLimit);
  const failureText = `Drift detection failed for ${pluralizeStacks(report.failedNames.length)}: ${listedNames}`;
  if (report.unstartedCount === 0) {
    return failureText;
  }
  return `${failureText}. Did not start ${pluralizeStacks(report.unstartedCount)}`;
};

/**
 * Builds the error text for a stack that stayed in progress until the check limit.
 *
 * @param state - Stack name, last status, and check counts.
 * @returns A message with the stack, the actual status, and the check limit.
 */
export const formatDetectionTimeoutMessage = (state: DetectionTimeoutState): string => {
  const statusText = `status is ${state.detectionStatus}`;
  const checkedText = `checked ${state.completedChecks} times`;
  const expectedText = `expected completion within ${state.maxStatusChecks} checks`;
  return `Drift detection timed out for stack ${state.stackName}: ${statusText}, ${checkedText}, ${expectedText}`;
};
