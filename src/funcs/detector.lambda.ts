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

const DETECTION_POLL_INTERVAL_SECONDS = 30;
const NOTIFICATION_TOPIC_ARN_ENV = 'NOTIFICATION_TOPIC_ARN';
const CLOUDFORMATION_STACK_RESOURCE_TYPE = 'cloudformation:stack';
const STABLE_STACK_STATUSES = [
  StackStatus.CREATE_COMPLETE,
  StackStatus.UPDATE_COMPLETE,
  StackStatus.UPDATE_ROLLBACK_COMPLETE,
  StackStatus.IMPORT_COMPLETE,
  StackStatus.IMPORT_ROLLBACK_COMPLETE,
];

const cloudFormation = new CloudFormationClient({});
const resourceGroupsTagging = new ResourceGroupsTaggingAPIClient({});
const sns = new SNSClient({});

export interface DriftDetectionEvent {
  readonly tagKey?: string;
  readonly tagValues?: string[];
}

interface DriftDetectionStatus {
  readonly detectionStatus: string | undefined;
  readonly stackDriftStatus: string | undefined;
  readonly detectionStatusReason: string | undefined;
}

function getNotificationTopicArn(): string {
  const topicArn = process.env[NOTIFICATION_TOPIC_ARN_ENV];
  if (!topicArn) {
    throw new Error(`${NOTIFICATION_TOPIC_ARN_ENV} environment variable is not set`);
  }
  return topicArn;
}

function getStackNameFromArn(resourceArn: string): string {
  const resource = resourceArn.split(':').pop();
  const stackName = resource?.split('/')[1];
  if (!stackName) {
    throw new Error(`Unable to get stack name from ARN: ${resourceArn}`);
  }
  return stackName;
}

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

async function getTargetStackNames(event: DriftDetectionEvent): Promise<string[]> {
  if (event.tagKey) {
    return getTaggedStackNames(event.tagKey, event.tagValues);
  }
  return getAllStackNames();
}

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
