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
 * Returns whether tag filter values should be sent to the tagging API.
 *
 * @param tagValues - Optional values for a tag key.
 * @returns True when the list has at least one value.
 */
export const hasTagFilterValues = (tagValues?: string[]): boolean => {
  return Boolean(tagValues && tagValues.length > 0);
};
