import { DurableContext, withDurableExecution } from '@aws/durable-execution-sdk-js';
import {
  CloudFormationClient,
  DescribeStackDriftDetectionStatusCommand,
  DescribeStackResourceDriftsCommand,
  DetectStackDriftCommand,
  ListStacksCommand,
  StackResourceDrift,
  StackStatus,
} from '@aws-sdk/client-cloudformation';
import {
  GetResourcesCommand,
  ResourceGroupsTaggingAPIClient,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

/** Interval between DescribeStackDriftDetectionStatus polls. */
const DETECTION_POLL_INTERVAL_SECONDS = 30;
/** Environment variable that holds the SNS topic ARN for drift notifications. */
const NOTIFICATION_TOPIC_ARN_ENV = 'NOTIFICATION_TOPIC_ARN';
/** Resource Groups Tagging API type used to discover CloudFormation stacks. */
const CLOUDFORMATION_STACK_RESOURCE_TYPE = 'cloudformation:stack';
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
function getNotificationTopicArn(): string {
  const topicArn = process.env[NOTIFICATION_TOPIC_ARN_ENV];
  if (!topicArn) {
    throw new Error(`${NOTIFICATION_TOPIC_ARN_ENV} environment variable is not set`);
  }
  return topicArn;
}

/**
 * Extracts a CloudFormation stack name from a stack ARN.
 *
 * @param resourceArn - Stack ARN in `arn:...:stack/{name}/{id}` form.
 * @returns The stack name.
 * @throws When the ARN does not contain a stack name.
 */
function getStackNameFromArn(resourceArn: string): string {
  const resource = resourceArn.split(':').pop();
  const stackName = resource?.split('/')[1];
  if (!stackName) {
    throw new Error(`Unable to get stack name from ARN: ${resourceArn}`);
  }
  return stackName;
}

/**
 * Lists CloudFormation stacks that match the given tag filter.
 *
 * @param tagKey - Tag key to match.
 * @param tagValues - Optional values for `tagKey`. An empty or omitted list matches any value.
 * @returns Stack names discovered by the Resource Groups Tagging API.
 */
async function getTaggedStackNames(tagKey: string, tagValues?: string[]): Promise<string[]> {
  const stackNames: string[] = [];
  let paginationToken: string | undefined;

  do {
    const response = await resourceGroupsTagging.send(new GetResourcesCommand({
      ResourceTypeFilters: [CLOUDFORMATION_STACK_RESOURCE_TYPE],
      TagFilters: [
        {
          Key: tagKey,
          Values: tagValues && tagValues.length > 0 ? tagValues : undefined,
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
  } while (paginationToken);

  return stackNames;
}

/**
 * Lists all stable CloudFormation stacks in the current account and region.
 *
 * @returns Stack names in a complete, non-transitional status.
 */
async function getAllStackNames(): Promise<string[]> {
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
  } while (nextToken);

  return stackNames;
}

/**
 * Resolves target stack names from the detector event.
 *
 * @param event - Tag filter from EventBridge, or an empty object for all stacks.
 * @returns Stack names to inspect for drift.
 */
async function getTargetStackNames(event: DriftDetectionEvent): Promise<string[]> {
  if (event.tagKey) {
    return getTaggedStackNames(event.tagKey, event.tagValues);
  }
  return getAllStackNames();
}

/**
 * Returns modified or deleted resource drifts for a stack.
 *
 * @param stackName - Stack to describe.
 * @returns Resource drift records filtered to `MODIFIED` and `DELETED`.
 */
async function getResourceDrifts(stackName: string): Promise<StackResourceDrift[]> {
  const resourceDrifts: StackResourceDrift[] = [];
  let nextToken: string | undefined;

  do {
    const response = await cloudFormation.send(new DescribeStackResourceDriftsCommand({
      StackName: stackName,
      StackResourceDriftStatusFilters: ['MODIFIED', 'DELETED'],
      NextToken: nextToken,
    }));
    resourceDrifts.push(...(response.StackResourceDrifts ?? []));
    nextToken = response.NextToken;
  } while (nextToken);

  return resourceDrifts;
}

/**
 * Polls DescribeStackDriftDetectionStatus until detection is no longer in progress.
 *
 * @param stackName - Stack used in durable step and wait names.
 * @param detectionId - ID returned by DetectStackDrift.
 * @param context - Durable execution context.
 * @returns The completed detection status.
 */
async function getDriftDetectionStatus(
  stackName: string,
  detectionId: string,
  context: DurableContext,
): Promise<DriftDetectionStatus> {
  let attempt = 0;
  let status: DriftDetectionStatus;

  do {
    await context.wait(`wait-drift-detection-${stackName}-${attempt}`, {
      seconds: DETECTION_POLL_INTERVAL_SECONDS,
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
  } while (status.detectionStatus === 'DETECTION_IN_PROGRESS');

  return status;
}

/**
 * Detects drift for one stack and publishes an SNS notification when the stack has drifted.
 *
 * @param stackName - Stack to inspect.
 * @param topicArn - SNS topic that receives drift notifications.
 * @param context - Durable execution context.
 * @throws When DetectStackDrift returns no ID, or detection finishes with `DETECTION_FAILED`.
 */
async function processStackDrift(
  stackName: string,
  topicArn: string,
  context: DurableContext,
): Promise<void> {
  const detectionId = await context.step(`detect-stack-drift-${stackName}`, async () => {
    const response = await cloudFormation.send(new DetectStackDriftCommand({
      StackName: stackName,
    }));
    if (!response.StackDriftDetectionId) {
      throw new Error(`DetectStackDrift did not return a detection ID for stack ${stackName}`);
    }
    return response.StackDriftDetectionId;
  });

  const status = await getDriftDetectionStatus(stackName, detectionId, context);

  if (status.detectionStatus === 'DETECTION_FAILED') {
    throw new Error(
      `Drift detection failed for stack ${stackName}: ${status.detectionStatusReason ?? 'unknown reason'}`,
    );
  }

  if (status.stackDriftStatus !== 'DRIFTED') {
    return;
  }

  const resourceDrifts = await context.step(
    `describe-resource-drifts-${stackName}`,
    async () => getResourceDrifts(stackName),
  );

  await context.step(`publish-notification-${stackName}`, async () => {
    const subject = `Stack drift detected: ${stackName}`.slice(0, 100);
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
}

/**
 * Durable Lambda handler that discovers target stacks and detects drift sequentially.
 *
 * @param event - Optional tag filter used to select stacks.
 * @param context - Durable execution context for steps and waits.
 */
export const handler = withDurableExecution(async (
  event: DriftDetectionEvent,
  context: DurableContext,
): Promise<void> => {
  const topicArn = getNotificationTopicArn();
  const stackNames = await context.step('get-target-stack-names', async () => {
    return getTargetStackNames(event ?? {});
  });

  for (const stackName of stackNames) {
    await processStackDrift(stackName, topicArn, context);
  }
});
