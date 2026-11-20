import { DurableContext, withDurableExecution } from '@aws/durable-execution-sdk-js';
import {
  CloudFormationClient,
  DescribeStackDriftDetectionStatusCommand,
  DescribeStackResourceDriftsCommand,
  DetectStackDriftCommand,
  ListStacksCommand,
  StackResourceDrift,
  StackResourceDriftStatus,
  StackStatus,
} from '@aws-sdk/client-cloudformation';
import {
  GetResourcesCommand,
  ResourceGroupsTaggingAPIClient,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import {
  DEFAULT_DETECTION_WAIT_INTERVAL_SECONDS,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_MAX_STATUS_CHECKS,
  DETECTION_MAX_STATUS_CHECKS_ENV,
  DETECTION_WAIT_INTERVAL_SECONDS_ENV,
  DRIFT_DETECTION_FAILED,
  STACK_DETECTION_MAX_CONCURRENCY_ENV,
} from '../settings/consts';
import {
  DETECTION_FAILURE_NAME_LIMIT,
  formatDetectionFailureMessage,
  formatDetectionTimeoutMessage,
  hasDetectionFailures,
  hasNextPage,
  isDetectionFailed,
  isDetectionInProgress,
  isStackDrifted,
  listStackNamesAtIndexes,
  listUnstartedStackNames,
  shouldWaitForDetection,
} from './core/detector-predicates';

/** Keep the remaining stacks running after one stack fails. */
const TOLERATED_STACK_FAILURE_PERCENTAGE = 100;
/** Durable map operation that detects drift for every selected stack. */
const DETECT_STACKS_MAP_NAME = 'detect-stack-drifts';
/** Environment variable that holds the SNS topic ARN for drift notifications. */
const NOTIFICATION_TOPIC_ARN_ENV = 'NOTIFICATION_TOPIC_ARN';
/** Resource Groups Tagging API type used to discover CloudFormation stacks. */
const CLOUDFORMATION_STACK_RESOURCE_TYPE = 'cloudformation:stack';
/** SNS Publish subject max length. */
const SNS_SUBJECT_MAX_LENGTH = 100;
/** Fallback reason when DetectStackDrift fails without DetectionStatusReason. */
const UNKNOWN_DETECTION_FAILURE_REASON = 'unknown reason';
/** Resource drift statuses included in SNS notifications. */
const RESOURCE_DRIFT_STATUS_FILTERS: StackResourceDriftStatus[] = [
  StackResourceDriftStatus.MODIFIED,
  StackResourceDriftStatus.DELETED,
];
/** TCP connection timeout for one AWS SDK HTTP request. */
const AWS_SDK_CONNECTION_TIMEOUT_MS = 5_000;
/** Time limit for one AWS SDK HTTP request, including the response body. */
const AWS_SDK_REQUEST_TIMEOUT_MS = 30_000;
/** Total send attempts for one AWS SDK call, including the first attempt. */
const AWS_SDK_MAX_ATTEMPTS = 3;
/** Stack statuses that are eligible for drift detection. */
const STABLE_STACK_STATUSES = [
  StackStatus.CREATE_COMPLETE,
  StackStatus.UPDATE_COMPLETE,
  StackStatus.UPDATE_ROLLBACK_COMPLETE,
  StackStatus.IMPORT_COMPLETE,
  StackStatus.IMPORT_ROLLBACK_COMPLETE,
];

/**
 * Builds retry and HTTP timeout settings for one AWS SDK client.
 * Each call creates its own request handler.
 *
 * @returns Client options with 3 attempts, a 5 second connection timeout, and a 30 second request timeout.
 */
const createAwsSdkClientConfig = () => {
  return {
    maxAttempts: AWS_SDK_MAX_ATTEMPTS,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: AWS_SDK_CONNECTION_TIMEOUT_MS,
      requestTimeout: AWS_SDK_REQUEST_TIMEOUT_MS,
    }),
  };
};

/** Shared CloudFormation client for drift detection APIs. */
const cloudFormation = new CloudFormationClient(createAwsSdkClientConfig());
/** Shared tagging client used to resolve stacks by tag. */
const resourceGroupsTagging = new ResourceGroupsTaggingAPIClient(createAwsSdkClientConfig());
/** Shared SNS client used to publish drift notifications. */
const sns = new SNSClient(createAwsSdkClientConfig());

/**
 * EventBridge input that selects stacks for drift detection.
 * With or without `tagKey`, only stacks in a stable status are inspected.
 */
export interface DriftDetectionEvent {
  /** Tag key used to discover CloudFormation stacks. */
  readonly tagKey?: string;
  /**
   * Tag values to match for {@link DriftDetectionEvent.tagKey}.
   * Required when `tagKey` is set. At least one value is required.
   */
  readonly tagValues?: string[];
}

/** Per-run limits read from the Lambda environment. */
interface DetectionRunSettings {
  /** Seconds between status checks after the first check. */
  readonly waitIntervalSeconds: number;
  /** Status checks for one stack, including the first check. */
  readonly maxStatusChecks: number;
  /** Stacks detected at the same time. */
  readonly maxConcurrency: number;
}

/** Checkpointed result of DescribeStackDriftDetectionStatus. */
interface DriftDetectionStatus {
  /** Status of the drift detection operation. */
  readonly detectionStatus: string | undefined;
  /** Drift status of the stack after detection completes. */
  readonly stackDriftStatus: string | undefined;
  /** Reason returned when detection fails. */
  readonly detectionStatusReason: string | undefined;
}

/**
 * Reads the SNS topic ARN from the Lambda environment.
 *
 * @returns The notification topic ARN.
 * @throws When {@link NOTIFICATION_TOPIC_ARN_ENV} is not set.
 */
const getNotificationTopicArn = (): string => {
  const topicArn = process.env[NOTIFICATION_TOPIC_ARN_ENV];
  if (!topicArn) {
    throw new Error(`${NOTIFICATION_TOPIC_ARN_ENV} environment variable is not set`);
  }
  return topicArn;
};

/**
 * Extracts a CloudFormation stack name from a stack ARN.
 *
 * @param resourceArn - Stack ARN in `arn:...:stack/{name}/{id}` form.
 * @returns The stack name.
 * @throws When the ARN does not contain a stack name.
 */
const getStackNameFromArn = (resourceArn: string): string => {
  const resource = resourceArn.split(':').pop();
  const stackName = resource?.split('/')[1];
  if (!stackName) {
    throw new Error(`Unable to get stack name from ARN: ${resourceArn}`);
  }
  return stackName;
};

/**
 * Lists all stable CloudFormation stacks in the current account and region.
 *
 * @returns Stack names in a complete, non-transitional status.
 */
const getAllStackNames = async (): Promise<string[]> => {
  const stackNames: string[] = [];
  let nextToken: string | undefined;

  do {
    const response = await cloudFormation.send(new ListStacksCommand({
      StackStatusFilter: STABLE_STACK_STATUSES,
      NextToken: nextToken,
    }));

    for (const summary of response.StackSummaries ?? []) {
      if (summary.StackName) {
        stackNames.push(summary.StackName);
      }
    }

    nextToken = response.NextToken;
  } while (hasNextPage(nextToken));

  return stackNames;
};

/**
 * Lists tagged CloudFormation stacks that are in a stable status.
 * The tagging API also returns stacks that are updating or deleting, so names
 * are kept only when ListStacks returns them in a stable status.
 *
 * @param tagKey - Tag key to match.
 * @param tagValues - Values for `tagKey`. At least one value is required.
 * @returns Tagged stack names in a complete, non-transitional status, in tagging API order.
 */
const getTaggedStackNames = async (tagKey: string, tagValues: string[]): Promise<string[]> => {
  const taggedStackNames: string[] = [];
  let paginationToken: string | undefined;

  do {
    const response = await resourceGroupsTagging.send(new GetResourcesCommand({
      ResourceTypeFilters: [CLOUDFORMATION_STACK_RESOURCE_TYPE],
      TagFilters: [
        {
          Key: tagKey,
          Values: tagValues,
        },
      ],
      PaginationToken: paginationToken,
    }));

    for (const mapping of response.ResourceTagMappingList ?? []) {
      if (mapping.ResourceARN) {
        taggedStackNames.push(getStackNameFromArn(mapping.ResourceARN));
      }
    }

    paginationToken = response.PaginationToken;
  } while (hasNextPage(paginationToken));

  const stableStackNames = new Set(await getAllStackNames());
  return taggedStackNames.filter((stackName) => stableStackNames.has(stackName));
};

/**
 * Resolves target stack names from the detector event.
 *
 * @param event - Tag filter from EventBridge, or an empty object for all stacks.
 * @returns Stack names to inspect for drift.
 */
const getTargetStackNames = async (event: DriftDetectionEvent): Promise<string[]> => {
  if (!event.tagKey) {
    return getAllStackNames();
  }
  if (!event.tagValues) {
    throw new Error('tagValues is required when tagKey is set');
  }
  return getTaggedStackNames(event.tagKey, event.tagValues);
};

/**
 * Returns modified or deleted resource drifts for a stack.
 *
 * @param stackName - Stack to describe.
 * @returns Resource drift records filtered to `MODIFIED` and `DELETED`.
 */
const getResourceDrifts = async (stackName: string): Promise<StackResourceDrift[]> => {
  const resourceDrifts: StackResourceDrift[] = [];
  let nextToken: string | undefined;

  do {
    const response = await cloudFormation.send(new DescribeStackResourceDriftsCommand({
      StackName: stackName,
      StackResourceDriftStatusFilters: RESOURCE_DRIFT_STATUS_FILTERS,
      NextToken: nextToken,
    }));
    resourceDrifts.push(...(response.StackResourceDrifts ?? []));
    nextToken = response.NextToken;
  } while (hasNextPage(nextToken));

  return resourceDrifts;
};

/**
 * Reads a positive integer environment variable, or returns the fallback.
 *
 * @param envName - Environment variable to read.
 * @param fallback - Value used when the variable is missing or blank.
 * @returns The parsed integer.
 * @throws When the variable is set to a value that is not an integer greater than or equal to 1.
 */
const readPositiveIntegerEnv = (envName: string, fallback: number): number => {
  const raw = process.env[envName];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${envName} must be an integer greater than or equal to 1`);
  }

  return value;
};

/**
 * Reads the wait interval, check limit, and concurrency for this invocation.
 *
 * @returns Limits for one drift-detection run.
 */
const readDetectionRunSettings = (): DetectionRunSettings => {
  return {
    waitIntervalSeconds: readPositiveIntegerEnv(
      DETECTION_WAIT_INTERVAL_SECONDS_ENV,
      DEFAULT_DETECTION_WAIT_INTERVAL_SECONDS,
    ),
    maxStatusChecks: readPositiveIntegerEnv(
      DETECTION_MAX_STATUS_CHECKS_ENV,
      DEFAULT_MAX_STATUS_CHECKS,
    ),
    maxConcurrency: readPositiveIntegerEnv(
      STACK_DETECTION_MAX_CONCURRENCY_ENV,
      DEFAULT_MAX_CONCURRENCY,
    ),
  };
};

/**
 * Waits until DescribeStackDriftDetectionStatus leaves `DETECTION_IN_PROGRESS`.
 * The first check runs immediately. Later checks wait only while detection is still running.
 *
 * @param stackName - Stack used in durable step and wait names.
 * @param detectionId - ID returned by DetectStackDrift.
 * @param context - Durable execution context.
 * @param settings - Wait interval and per-stack check limit.
 * @returns The completed detection status.
 * @throws When detection is still in progress after the check limit.
 */
const waitForDetectionStatus = async (
  stackName: string,
  detectionId: string,
  context: DurableContext,
  settings: DetectionRunSettings,
): Promise<DriftDetectionStatus> => {
  let completedChecks = 0;

  const readStatus = async (): Promise<DriftDetectionStatus> => {
    const attempt = completedChecks;
    const status = await context.step(
      `describe-drift-detection-status-${stackName}-${attempt}`,
      async () => {
        const response = await cloudFormation.send(new DescribeStackDriftDetectionStatusCommand({
          StackDriftDetectionId: detectionId,
        }));
        return {
          detectionStatus: response.DetectionStatus,
          stackDriftStatus: response.StackDriftStatus,
          detectionStatusReason: response.DetectionStatusReason,
        };
      },
    );
    completedChecks += 1;
    return status;
  };

  let status = await readStatus();

  while (shouldWaitForDetection(status.detectionStatus, completedChecks, settings.maxStatusChecks)) {
    await context.wait(`wait-drift-detection-${stackName}-${completedChecks - 1}`, {
      seconds: settings.waitIntervalSeconds,
    });
    status = await readStatus();
  }

  if (!isDetectionInProgress(status.detectionStatus)) {
    return status;
  }

  throw new Error(formatDetectionTimeoutMessage({
    stackName,
    detectionStatus: status.detectionStatus,
    completedChecks,
    maxStatusChecks: settings.maxStatusChecks,
  }));
};

/**
 * Detects drift for one stack and publishes an SNS notification when the stack has drifted.
 *
 * @param stackName - Stack to inspect.
 * @param topicArn - SNS topic that receives drift notifications.
 * @param context - Durable execution context.
 * @param settings - Wait interval and per-stack check limit.
 * @throws When DetectStackDrift returns no ID, detection finishes with `DETECTION_FAILED`, or the check limit is reached.
 */
const processStackDrift = async (
  stackName: string,
  topicArn: string,
  context: DurableContext,
  settings: DetectionRunSettings,
): Promise<void> => {
  const detectionId = await context.step(`detect-stack-drift-${stackName}`, async () => {
    const response = await cloudFormation.send(new DetectStackDriftCommand({
      StackName: stackName,
    }));
    if (!response.StackDriftDetectionId) {
      throw new Error(`DetectStackDrift did not return a detection ID for stack ${stackName}`);
    }
    return response.StackDriftDetectionId;
  });

  const status = await waitForDetectionStatus(stackName, detectionId, context, settings);

  if (isDetectionFailed(status.detectionStatus)) {
    throw new Error(
      `Drift detection failed for stack ${stackName}: ${status.detectionStatusReason ?? UNKNOWN_DETECTION_FAILURE_REASON}`,
    );
  }

  if (!isStackDrifted(status.stackDriftStatus)) {
    return;
  }

  const resourceDrifts = await context.step(
    `describe-resource-drifts-${stackName}`,
    async () => getResourceDrifts(stackName),
  );

  await context.step(`publish-notification-${stackName}`, async () => {
    const subject = `Stack drift detected: ${stackName}`.slice(0, SNS_SUBJECT_MAX_LENGTH);
    await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Subject: subject,
      Message: JSON.stringify({
        stackName,
        stackDriftStatus: status.stackDriftStatus,
        driftedResources: resourceDrifts,
      }),
    }));
  });
};

/**
 * Counts of stacks processed by one detector invocation.
 * Returned only when every stack succeeds. Any failure throws instead.
 */
export interface DriftDetectionCounts {
  /** Stacks whose drift detection finished without throwing. */
  readonly succeeded: number;
  /** Always 0. A run with failures throws before returning counts. */
  readonly failed: number;
}

/**
 * Returns a message for a caught detection failure.
 *
 * @param error - Value thrown while detecting drift for one stack.
 * @returns The error message, or its string form when it is not an Error.
 */
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

/**
 * Publishes an SNS notification when drift detection fails for one stack.
 *
 * @param stackName - Stack whose detection failed.
 * @param topicArn - SNS topic that receives failure notifications.
 * @param reason - Failure message recorded for the stack.
 * @param context - Durable execution context.
 */
const publishDetectionFailure = async (
  stackName: string,
  topicArn: string,
  reason: string,
  context: DurableContext,
): Promise<void> => {
  await context.step(`publish-detection-failure-${stackName}`, async () => {
    const subject = `Stack drift detection failed: ${stackName}`.slice(0, SNS_SUBJECT_MAX_LENGTH);
    await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Subject: subject,
      Message: JSON.stringify({
        stackName,
        reason,
      }),
    }));
  });
};

/**
 * Discovers target stacks and detects drift for several stacks at a time, up to the configured concurrency.
 * A failure for one stack does not skip the remaining stacks. Any failure fails the run after the rest finish.
 *
 * @param event - Optional tag filter used to select stacks.
 * @param context - Durable execution context for steps and waits.
 * @returns Succeeded and failed counts when every stack succeeds. `failed` is 0.
 * @throws When any stack fails. The message lists the failed stack names up to a cap.
 */
export const processDriftDetection = async (
  event: DriftDetectionEvent,
  context: DurableContext,
): Promise<DriftDetectionCounts> => {
  let failedStackNames: string[] | undefined;
  try {
    return await runDriftDetection(event, context, (stackNames) => {
      failedStackNames = stackNames;
    });
  } catch (error) {
    console.error(DRIFT_DETECTION_FAILED, {
      stackNames: failedStackNames,
      message: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Runs one drift-detection pass.
 * The caller logs {@link DRIFT_DETECTION_FAILED} when this function throws.
 *
 * @param event - Optional tag filter used to select stacks.
 * @param context - Durable execution context for steps and waits.
 * @param recordFailedStackNames - Receives the failed stack names before the aggregate error is thrown.
 * @returns Succeeded and failed counts when every stack succeeds. `failed` is 0.
 * @throws When any stack fails, or when the invocation settings are invalid.
 */
const runDriftDetection = async (
  event: DriftDetectionEvent,
  context: DurableContext,
  recordFailedStackNames: (stackNames: string[]) => void,
): Promise<DriftDetectionCounts> => {
  const topicArn = getNotificationTopicArn();
  const settings = readDetectionRunSettings();
  const stackNames = await context.step('get-target-stack-names', async () => {
    return getTargetStackNames(event ?? {});
  });

  const detectStack = async (itemContext: DurableContext, stackName: string): Promise<void> => {
    try {
      await processStackDrift(stackName, topicArn, itemContext, settings);
    } catch (error) {
      console.error('Drift detection failed for stack', {
        stackName,
        message: getErrorMessage(error),
      });

      try {
        await publishDetectionFailure(stackName, topicArn, getErrorMessage(error), itemContext);
      } catch (notifyError) {
        // A failed notification must not skip the remaining stacks.
        console.error('Failed to publish drift detection failure', {
          stackName,
          message: getErrorMessage(notifyError),
        });
      }

      throw error;
    }
  };

  // toleratedFailurePercentage 100 records each failure and still runs the other stacks.
  const batch = await context.map(
    DETECT_STACKS_MAP_NAME,
    stackNames,
    detectStack,
    {
      maxConcurrency: settings.maxConcurrency,
      completionConfig: {
        toleratedFailurePercentage: TOLERATED_STACK_FAILURE_PERCENTAGE,
      },
      itemNamer: (stackName) => stackName,
    },
  );

  const failedItems = batch.failed();
  const failedNames = listStackNamesAtIndexes(
    stackNames,
    failedItems.map((item) => item.index),
  );

  if (!hasDetectionFailures(failedNames.length)) {
    return {
      succeeded: batch.successCount,
      failed: 0,
    };
  }

  const unstartedNames = listUnstartedStackNames(stackNames, [
    ...batch.succeeded().map((item) => item.index),
    ...failedItems.map((item) => item.index),
    ...batch.started().map((item) => item.index),
  ]);

  recordFailedStackNames(failedNames);
  throw new Error(formatDetectionFailureMessage({
    failedNames,
    unstartedCount: unstartedNames.length,
    nameLimit: DETECTION_FAILURE_NAME_LIMIT,
  }));
};

/** Durable Lambda handler wrapping {@link processDriftDetection}. */
export const handler = withDurableExecution(processDriftDetection);
