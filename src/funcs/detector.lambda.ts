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
import {
  hasNextPage,
  hasTagFilterValues,
  isDetectionFailed,
  isDetectionInProgress,
  isStackDrifted,
} from './core/detector-predicates';

/** Interval between DescribeStackDriftDetectionStatus waits. */
const DETECTION_WAIT_INTERVAL_SECONDS = 30;
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
/** Stack statuses that are eligible for drift detection. */
const STABLE_STACK_STATUSES = [
  StackStatus.CREATE_COMPLETE,
  StackStatus.UPDATE_COMPLETE,
  StackStatus.UPDATE_ROLLBACK_COMPLETE,
  StackStatus.IMPORT_COMPLETE,
  StackStatus.IMPORT_ROLLBACK_COMPLETE,
];

/** Shared CloudFormation client for drift detection APIs. */
const cloudFormation = new CloudFormationClient({});
/** Shared tagging client used to resolve stacks by tag. */
const resourceGroupsTagging = new ResourceGroupsTaggingAPIClient({});
/** Shared SNS client used to publish drift notifications. */
const sns = new SNSClient({});

/**
 * EventBridge input that selects stacks for drift detection.
 * When `tagKey` is omitted, all stable stacks are inspected.
 */
export interface DriftDetectionEvent {
  /** Tag key used to discover CloudFormation stacks. */
  readonly tagKey?: string;
  /**
   * Tag values to match for {@link DriftDetectionEvent.tagKey}.
   * If omitted, any value for the key is accepted.
   */
  readonly tagValues?: string[];
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
 * Lists CloudFormation stacks that match the given tag filter.
 *
 * @param tagKey - Tag key to match.
 * @param tagValues - Optional values for `tagKey`. An empty or omitted list matches any value.
 * @returns Stack names discovered by the Resource Groups Tagging API.
 */
const getTaggedStackNames = async (tagKey: string, tagValues?: string[]): Promise<string[]> => {
  const stackNames: string[] = [];
  let paginationToken: string | undefined;

  do {
    const response = await resourceGroupsTagging.send(new GetResourcesCommand({
      ResourceTypeFilters: [CLOUDFORMATION_STACK_RESOURCE_TYPE],
      TagFilters: [
        {
          Key: tagKey,
          Values: hasTagFilterValues(tagValues) ? tagValues : undefined,
        },
      ],
      PaginationToken: paginationToken,
    }));

    for (const mapping of response.ResourceTagMappingList ?? []) {
      if (mapping.ResourceARN) {
        stackNames.push(getStackNameFromArn(mapping.ResourceARN));
      }
    }

    paginationToken = response.PaginationToken;
  } while (hasNextPage(paginationToken));

  return stackNames;
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
 * Resolves target stack names from the detector event.
 *
 * @param event - Tag filter from EventBridge, or an empty object for all stacks.
 * @returns Stack names to inspect for drift.
 */
const getTargetStackNames = async (event: DriftDetectionEvent): Promise<string[]> => {
  if (event.tagKey) {
    return getTaggedStackNames(event.tagKey, event.tagValues);
  }
  return getAllStackNames();
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
 * Waits until DescribeStackDriftDetectionStatus is no longer in progress.
 *
 * @param stackName - Stack used in durable step and wait names.
 * @param detectionId - ID returned by DetectStackDrift.
 * @param context - Durable execution context.
 * @returns The completed detection status.
 */
const waitForDetectionStatus = async (
  stackName: string,
  detectionId: string,
  context: DurableContext,
): Promise<DriftDetectionStatus> => {
  let attempt = 0;
  let status: DriftDetectionStatus;

  do {
    await context.wait(`wait-drift-detection-${stackName}-${attempt}`, {
      seconds: DETECTION_WAIT_INTERVAL_SECONDS,
    });

    status = await context.step(
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

    attempt += 1;
  } while (isDetectionInProgress(status.detectionStatus));

  return status;
};

/**
 * Detects drift for one stack and publishes an SNS notification when the stack has drifted.
 *
 * @param stackName - Stack to inspect.
 * @param topicArn - SNS topic that receives drift notifications.
 * @param context - Durable execution context.
 * @throws When DetectStackDrift returns no ID, or detection finishes with `DETECTION_FAILED`.
 */
const processStackDrift = async (
  stackName: string,
  topicArn: string,
  context: DurableContext,
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

  const status = await waitForDetectionStatus(stackName, detectionId, context);

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

/** Counts of stacks processed by one detector invocation. */
export interface DriftDetectionCounts {
  /** Stacks whose drift detection finished without throwing. */
  readonly succeeded: number;
  /** Stacks whose drift detection threw. */
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
 * Discovers target stacks and detects drift sequentially.
 * A failure for one stack does not skip the remaining stacks.
 *
 * @param event - Optional tag filter used to select stacks.
 * @param context - Durable execution context for steps and waits.
 * @returns How many stacks succeeded and how many failed.
 */
export const processDriftDetection = async (
  event: DriftDetectionEvent,
  context: DurableContext,
): Promise<DriftDetectionCounts> => {
  const topicArn = getNotificationTopicArn();
  const stackNames = await context.step('get-target-stack-names', async () => {
    return getTargetStackNames(event ?? {});
  });

  let succeeded = 0;
  let failed = 0;

  for (const stackName of stackNames) {
    try {
      await processStackDrift(stackName, topicArn, context);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      console.error(`Drift detection failed for stack ${stackName}`, error);

      try {
        await publishDetectionFailure(stackName, topicArn, getErrorMessage(error), context);
      } catch (notifyError) {
        // A failed notification must not skip the remaining stacks.
        console.error(`Failed to publish drift detection failure for stack ${stackName}`, notifyError);
      }
    }
  }

  return { succeeded, failed };
};

/** Durable Lambda handler wrapping {@link processDriftDetection}. */
export const handler = withDurableExecution(processDriftDetection);
