/** Default maximum duration of a durable execution, in hours. */
export const DEFAULT_EXECUTION_TIMEOUT_HOURS = 12;
/** Default seconds between drift detection status checks. */
export const DEFAULT_DETECTION_WAIT_INTERVAL_SECONDS = 30;
/** Default status checks for one stack, including the first check. */
export const DEFAULT_MAX_STATUS_CHECKS = 20;
/** Default number of stacks detected at the same time. */
export const DEFAULT_MAX_CONCURRENCY = 5;

/** Lambda environment variable for the wait interval in seconds. */
export const DETECTION_WAIT_INTERVAL_SECONDS_ENV = 'DETECTION_WAIT_INTERVAL_SECONDS';
/** Lambda environment variable for the per-stack status check limit. */
export const DETECTION_MAX_STATUS_CHECKS_ENV = 'DETECTION_MAX_STATUS_CHECKS';
/** Lambda environment variable for how many stacks are detected at once. */
export const STACK_DETECTION_MAX_CONCURRENCY_ENV = 'STACK_DETECTION_MAX_CONCURRENCY';
