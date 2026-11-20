import { DurableContext } from '@aws/durable-execution-sdk-js';
import {
  CloudFormationClient,
  DescribeStackDriftDetectionStatusCommand,
  DescribeStackResourceDriftsCommand,
  DetectStackDriftCommand,
  ListStacksCommand,
  StackStatus,
} from '@aws-sdk/client-cloudformation';
import {
  GetResourcesCommand,
  ResourceGroupsTaggingAPIClient,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { processDriftDetection, DriftDetectionEvent } from '../src/funcs/detector.lambda';
import { DRIFT_DETECTION_FAILED } from '../src/settings/consts';

const cloudFormationMock = mockClient(CloudFormationClient);
const taggingMock = mockClient(ResourceGroupsTaggingAPIClient);
const snsMock = mockClient(SNSClient);

const TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:drift-topic';
const STACK_ARN = 'arn:aws:cloudformation:us-east-1:123456789012:stack/TaggedStack/abc-123';
const OTHER_STACK_ARN = 'arn:aws:cloudformation:us-east-1:123456789012:stack/OtherStack/def-456';
const INVALID_STACK_ARN = 'arn:aws:cloudformation:us-east-1:123456789012:stack';
const STACK_DATE = new Date('2026-01-01T00:00:00.000Z');
const WAIT_INTERVAL_SECONDS = 30;

const createFakeDurableContext = (): DurableContext => {
  // DurableContext is an SDK type. Tests run steps immediately and map stacks in order.
  const context = {
    step: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    wait: jest.fn(async () => undefined),
    map: jest.fn(async (
      _name: string,
      items: readonly string[],
      fn: (itemContext: DurableContext, item: string, index: number) => Promise<unknown>,
    ) => {
      const all: Array<{ result?: unknown; error?: unknown; index: number; status: 'SUCCEEDED' | 'FAILED' }> = [];

      for (let index = 0; index < items.length; index += 1) {
        try {
          const result = await fn(context as unknown as DurableContext, items[index], index);
          all.push({ result, index, status: 'SUCCEEDED' });
        } catch (error) {
          all.push({ error, index, status: 'FAILED' });
        }
      }

      const succeeded = all.filter((entry) => entry.status === 'SUCCEEDED');
      const failed = all.filter((entry) => entry.status === 'FAILED');

      return {
        all,
        succeeded: () => succeeded,
        failed: () => failed,
        started: () => [],
        successCount: succeeded.length,
        failureCount: failed.length,
        startedCount: 0,
        totalCount: items.length,
        hasFailure: failed.length > 0,
      };
    }),
  };

  return context as unknown as DurableContext;
};

const STABLE_STACK_STATUSES = [
  StackStatus.CREATE_COMPLETE,
  StackStatus.UPDATE_COMPLETE,
  StackStatus.UPDATE_ROLLBACK_COMPLETE,
  StackStatus.IMPORT_COMPLETE,
  StackStatus.IMPORT_ROLLBACK_COMPLETE,
];

const createStackSummary = (stackName: string) => ({
  StackName: stackName,
  CreationTime: STACK_DATE,
  StackStatus: 'CREATE_COMPLETE' as const,
});

const mockStableStacks = (...stackNames: string[]): void => {
  cloudFormationMock.on(ListStacksCommand).resolves({
    StackSummaries: stackNames.map((stackName) => createStackSummary(stackName)),
  });
};

const createResourceDrift = (logicalResourceId: string) => ({
  LogicalResourceId: logicalResourceId,
  StackResourceDriftStatus: 'MODIFIED' as const,
  StackId: STACK_ARN,
  ResourceType: 'AWS::S3::Bucket',
  Timestamp: STACK_DATE,
});

const mockInSyncDetection = (detectionId: string): void => {
  cloudFormationMock.on(DetectStackDriftCommand).resolves({
    StackDriftDetectionId: detectionId,
  });
  cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand).resolves({
    DetectionStatus: 'DETECTION_COMPLETE',
    StackDriftStatus: 'IN_SYNC',
  });
};

const publishedMessages = (): Array<Record<string, unknown>> => {
  return snsMock.commandCalls(PublishCommand).map((call) => {
    return JSON.parse(call.args[0].input.Message ?? '{}') as Record<string, unknown>;
  });
};

const publishedMessage = (): Record<string, unknown> => {
  return publishedMessages()[0];
};

describe('processDriftDetection', () => {
  beforeEach(() => {
    cloudFormationMock.reset();
    taggingMock.reset();
    snsMock.reset();
    process.env.NOTIFICATION_TOPIC_ARN = TOPIC_ARN;
  });

  afterEach(() => {
    delete process.env.NOTIFICATION_TOPIC_ARN;
    delete process.env.DETECTION_WAIT_INTERVAL_SECONDS;
    delete process.env.DETECTION_MAX_STATUS_CHECKS;
    delete process.env.STACK_DETECTION_MAX_CONCURRENCY;
  });

  it('throws when NOTIFICATION_TOPIC_ARN is missing', async () => {
    delete process.env.NOTIFICATION_TOPIC_ARN;

    await expect(processDriftDetection({}, createFakeDurableContext())).rejects.toThrow(
      'NOTIFICATION_TOPIC_ARN environment variable is not set',
    );
  });

  it('lists all stable stacks when no tag filter is provided', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    mockInSyncDetection('det-1');

    await processDriftDetection({}, createFakeDurableContext());

    expect(cloudFormationMock).toHaveReceivedCommand(ListStacksCommand);
    expect(taggingMock).not.toHaveReceivedCommand(GetResourcesCommand);
    expect(snsMock).not.toHaveReceivedCommand(PublishCommand);
  });

  it('pages through ListStacks results', async () => {
    cloudFormationMock.on(ListStacksCommand)
      .resolvesOnce({
        StackSummaries: [createStackSummary('FirstStack')],
        NextToken: 'page-2',
      })
      .resolvesOnce({
        StackSummaries: [createStackSummary('SecondStack')],
      });
    mockInSyncDetection('det-list-pages');

    await processDriftDetection({}, createFakeDurableContext());

    expect(cloudFormationMock).toHaveReceivedCommandTimes(ListStacksCommand, 2);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DetectStackDriftCommand, 2);
  });

  it('discovers stacks by tag and publishes when a stack has drifted', async () => {
    taggingMock.on(GetResourcesCommand).resolves({
      ResourceTagMappingList: [{ ResourceARN: STACK_ARN }],
    });
    mockStableStacks('TaggedStack');
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-2',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand).resolves({
      DetectionStatus: 'DETECTION_COMPLETE',
      StackDriftStatus: 'DRIFTED',
    });
    cloudFormationMock.on(DescribeStackResourceDriftsCommand).resolves({
      StackResourceDrifts: [createResourceDrift('Bucket')],
    });
    snsMock.on(PublishCommand).resolves({});

    await processDriftDetection(
      { tagKey: 'DriftDetection', tagValues: ['enabled'] },
      createFakeDurableContext(),
    );

    expect(taggingMock).toHaveReceivedCommandWith(GetResourcesCommand, {
      ResourceTypeFilters: ['cloudformation:stack'],
      TagFilters: [{ Key: 'DriftDetection', Values: ['enabled'] }],
    });
    expect(cloudFormationMock).toHaveReceivedCommandWith(ListStacksCommand, {
      StackStatusFilter: STABLE_STACK_STATUSES,
    });
    expect(snsMock).toHaveReceivedCommand(PublishCommand);
    expect(snsMock.commandCalls(PublishCommand)[0].args[0].input).toEqual(
      expect.objectContaining({
        TopicArn: TOPIC_ARN,
        Subject: 'Stack drift detected: TaggedStack',
      }),
    );
    expect(publishedMessage()).toEqual({
      stackName: 'TaggedStack',
      stackDriftStatus: 'DRIFTED',
      driftedResources: [
        expect.objectContaining({
          LogicalResourceId: 'Bucket',
          StackResourceDriftStatus: 'MODIFIED',
        }),
      ],
    });
  });

  it('throws when tagKey is set without tagValues', async () => {
    await expect(
      processDriftDetection({ tagKey: 'DriftDetection' }, createFakeDurableContext()),
    ).rejects.toThrow('tagValues is required when tagKey is set');

    expect(taggingMock).not.toHaveReceivedCommand(GetResourcesCommand);
  });

  it('pages through tagged stack results', async () => {
    taggingMock.on(GetResourcesCommand)
      .resolvesOnce({
        ResourceTagMappingList: [{ ResourceARN: STACK_ARN }],
        PaginationToken: 'page-2',
      })
      .resolvesOnce({
        ResourceTagMappingList: [{ ResourceARN: OTHER_STACK_ARN }],
      });
    mockStableStacks('TaggedStack', 'OtherStack');
    mockInSyncDetection('det-tag-pages');

    await processDriftDetection(
      { tagKey: 'DriftDetection', tagValues: ['enabled'] },
      createFakeDurableContext(),
    );

    expect(taggingMock).toHaveReceivedCommandTimes(GetResourcesCommand, 2);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DetectStackDriftCommand, 2);
  });

  it('skips tagged stacks that are not in a stable status', async () => {
    taggingMock.on(GetResourcesCommand).resolves({
      ResourceTagMappingList: [
        { ResourceARN: STACK_ARN },
        { ResourceARN: OTHER_STACK_ARN },
      ],
    });
    mockStableStacks('TaggedStack');
    mockInSyncDetection('det-stable-only');

    await processDriftDetection(
      { tagKey: 'DriftDetection', tagValues: ['enabled'] },
      createFakeDurableContext(),
    );

    expect(cloudFormationMock).toHaveReceivedCommandTimes(DetectStackDriftCommand, 1);
    expect(cloudFormationMock).toHaveReceivedCommandWith(DetectStackDriftCommand, {
      StackName: 'TaggedStack',
    });
  });

  it('throws when a tagged stack ARN has no stack name', async () => {
    taggingMock.on(GetResourcesCommand).resolves({
      ResourceTagMappingList: [{ ResourceARN: INVALID_STACK_ARN }],
    });

    await expect(
      processDriftDetection(
        { tagKey: 'DriftDetection', tagValues: ['enabled'] },
        createFakeDurableContext(),
      ),
    ).rejects.toThrow(`Unable to get stack name from ARN: ${INVALID_STACK_ARN}`);
  });

  it('pages through resource drift results', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-drifts',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand).resolves({
      DetectionStatus: 'DETECTION_COMPLETE',
      StackDriftStatus: 'DRIFTED',
    });
    cloudFormationMock.on(DescribeStackResourceDriftsCommand)
      .resolvesOnce({
        StackResourceDrifts: [createResourceDrift('Bucket')],
        NextToken: 'page-2',
      })
      .resolvesOnce({
        StackResourceDrifts: [createResourceDrift('Queue')],
      });
    snsMock.on(PublishCommand).resolves({});

    await processDriftDetection({}, createFakeDurableContext());

    expect(cloudFormationMock).toHaveReceivedCommandTimes(DescribeStackResourceDriftsCommand, 2);
    expect(publishedMessage().driftedResources).toEqual([
      expect.objectContaining({ LogicalResourceId: 'Bucket' }),
      expect.objectContaining({ LogicalResourceId: 'Queue' }),
    ]);
  });

  it('processes multiple stacks and publishes only drifted ones', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [
        createStackSummary('InSyncStack'),
        createStackSummary('DriftedStack'),
      ],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-multi',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand)
      .resolvesOnce({
        DetectionStatus: 'DETECTION_COMPLETE',
        StackDriftStatus: 'IN_SYNC',
      })
      .resolvesOnce({
        DetectionStatus: 'DETECTION_COMPLETE',
        StackDriftStatus: 'DRIFTED',
      });
    cloudFormationMock.on(DescribeStackResourceDriftsCommand).resolves({
      StackResourceDrifts: [createResourceDrift('Bucket')],
    });
    snsMock.on(PublishCommand).resolves({});

    await expect(processDriftDetection({}, createFakeDurableContext())).resolves.toEqual({
      succeeded: 2,
      failed: 0,
    });

    expect(cloudFormationMock).toHaveReceivedCommandTimes(DetectStackDriftCommand, 2);
    expect(snsMock).toHaveReceivedCommandTimes(PublishCommand, 1);
    expect(publishedMessage().stackName).toBe('DriftedStack');
  });

  it('does not publish when a stack is NOT_CHECKED', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('UncheckedStack')],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-not-checked',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand).resolves({
      DetectionStatus: 'DETECTION_COMPLETE',
      StackDriftStatus: 'NOT_CHECKED',
    });

    await processDriftDetection({}, createFakeDurableContext());

    expect(snsMock).not.toHaveReceivedCommand(PublishCommand);
    expect(cloudFormationMock).not.toHaveReceivedCommand(DescribeStackResourceDriftsCommand);
  });

  it('checks status before the first wait', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    mockInSyncDetection('det-wait');

    const context = createFakeDurableContext();
    await processDriftDetection({}, context);

    expect(context.wait).not.toHaveBeenCalled();
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DescribeStackDriftDetectionStatusCommand, 1);
    expect(context.map).toHaveBeenCalledWith(
      'detect-stack-drifts',
      ['PlainStack'],
      expect.any(Function),
      expect.objectContaining({
        maxConcurrency: 5,
        completionConfig: { toleratedFailurePercentage: 100 },
      }),
    );
    const mapMock = context.map as jest.Mock;
    const itemNamer = mapMock.mock.calls[0][3].itemNamer as (stackName: string) => string;
    expect(itemNamer('PlainStack')).toBe('PlainStack');
  });

  it('waits until detection completes', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-3',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand)
      .resolvesOnce({ DetectionStatus: 'DETECTION_IN_PROGRESS' })
      .resolvesOnce({
        DetectionStatus: 'DETECTION_COMPLETE',
        StackDriftStatus: 'IN_SYNC',
      });

    const context = createFakeDurableContext();
    await processDriftDetection({}, context);

    expect(context.wait).toHaveBeenCalledTimes(1);
    expect(context.wait).toHaveBeenCalledWith(
      'wait-drift-detection-PlainStack-0',
      { seconds: WAIT_INTERVAL_SECONDS },
    );
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DescribeStackDriftDetectionStatusCommand, 2);
    expect(snsMock).not.toHaveReceivedCommand(PublishCommand);
  });

  it('continues when drift detection fails for one stack', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [
        createStackSummary('FailingStack'),
        createStackSummary('DriftedStack'),
      ],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-continue',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand)
      .resolvesOnce({
        DetectionStatus: 'DETECTION_FAILED',
        DetectionStatusReason: 'access denied',
      })
      .resolvesOnce({
        DetectionStatus: 'DETECTION_COMPLETE',
        StackDriftStatus: 'DRIFTED',
      });
    cloudFormationMock.on(DescribeStackResourceDriftsCommand).resolves({
      StackResourceDrifts: [createResourceDrift('Bucket')],
    });
    snsMock.on(PublishCommand).resolves({});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(processDriftDetection({}, createFakeDurableContext())).rejects.toThrow(
      'Drift detection failed for 1 stack: FailingStack',
    );

    expect(errorSpy).toHaveBeenCalled();
    expect(snsMock).toHaveReceivedCommandTimes(PublishCommand, 2);
    expect(snsMock.commandCalls(PublishCommand)[0].args[0].input).toEqual(
      expect.objectContaining({
        TopicArn: TOPIC_ARN,
        Subject: 'Stack drift detection failed: FailingStack',
      }),
    );
    expect(publishedMessages()[0]).toEqual({
      stackName: 'FailingStack',
      reason: 'Drift detection failed for stack FailingStack: access denied',
    });
    expect(publishedMessages()[1].stackName).toBe('DriftedStack');
    errorSpy.mockRestore();
  });

  it('throws after publishing when the only stack fails detection', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-4',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand).resolves({
      DetectionStatus: 'DETECTION_FAILED',
      DetectionStatusReason: 'access denied',
    });
    snsMock.on(PublishCommand).resolves({});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(processDriftDetection({}, createFakeDurableContext())).rejects.toThrow(
      'Drift detection failed for 1 stack: PlainStack',
    );

    expect(errorSpy).toHaveBeenCalledWith('Drift detection failed for stack', {
      stackName: 'PlainStack',
      message: 'Drift detection failed for stack PlainStack: access denied',
    });
    expect(errorSpy).toHaveBeenCalledWith(DRIFT_DETECTION_FAILED, {
      stackNames: ['PlainStack'],
      message: 'Drift detection failed for 1 stack: PlainStack',
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOPIC_ARN);
    expect(snsMock).toHaveReceivedCommandTimes(PublishCommand, 1);
    expect(publishedMessages()[0]).toEqual({
      stackName: 'PlainStack',
      reason: 'Drift detection failed for stack PlainStack: access denied',
    });
    errorSpy.mockRestore();
  });

  it('throws after publishing when DetectStackDrift returns no detection ID', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(processDriftDetection({}, createFakeDurableContext())).rejects.toThrow(
      'Drift detection failed for 1 stack: PlainStack',
    );

    expect(errorSpy).toHaveBeenCalledWith('Drift detection failed for stack', {
      stackName: 'PlainStack',
      message: 'DetectStackDrift did not return a detection ID for stack PlainStack',
    });
    expect(snsMock).toHaveReceivedCommandTimes(PublishCommand, 1);
    expect(publishedMessages()[0]).toEqual({
      stackName: 'PlainStack',
      reason: 'DetectStackDrift did not return a detection ID for stack PlainStack',
    });
    errorSpy.mockRestore();
  });

  it('continues when DetectStackDrift rejects for one stack', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [
        createStackSummary('UpdatingStack'),
        createStackSummary('DriftedStack'),
      ],
    });
    cloudFormationMock.on(DetectStackDriftCommand)
      .rejectsOnce(new Error('Stack UpdatingStack is in UPDATE_IN_PROGRESS'))
      .resolves({
        StackDriftDetectionId: 'det-after-reject',
      });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand).resolves({
      DetectionStatus: 'DETECTION_COMPLETE',
      StackDriftStatus: 'DRIFTED',
    });
    cloudFormationMock.on(DescribeStackResourceDriftsCommand).resolves({
      StackResourceDrifts: [createResourceDrift('Bucket')],
    });
    snsMock.on(PublishCommand).resolves({});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(processDriftDetection({}, createFakeDurableContext())).rejects.toThrow(
      'Drift detection failed for 1 stack: UpdatingStack',
    );

    expect(cloudFormationMock).toHaveReceivedCommandTimes(DetectStackDriftCommand, 2);
    expect(publishedMessages().map((message) => message.stackName)).toEqual([
      'UpdatingStack',
      'DriftedStack',
    ]);
    expect(publishedMessages()[0].reason).toBe('Stack UpdatingStack is in UPDATE_IN_PROGRESS');
    errorSpy.mockRestore();
  });

  it('continues when the failure notification cannot be published', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [
        createStackSummary('FailingStack'),
        createStackSummary('DriftedStack'),
      ],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-notify-fail',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand)
      .resolvesOnce({
        DetectionStatus: 'DETECTION_FAILED',
        DetectionStatusReason: 'access denied',
      })
      .resolvesOnce({
        DetectionStatus: 'DETECTION_COMPLETE',
        StackDriftStatus: 'DRIFTED',
      });
    cloudFormationMock.on(DescribeStackResourceDriftsCommand).resolves({
      StackResourceDrifts: [createResourceDrift('Bucket')],
    });
    snsMock.on(PublishCommand)
      .rejectsOnce(new Error('sns unavailable'))
      .resolves({});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(processDriftDetection({}, createFakeDurableContext())).rejects.toThrow(
      'Drift detection failed for 1 stack: FailingStack',
    );

    expect(errorSpy).toHaveBeenCalledWith('Failed to publish drift detection failure', {
      stackName: 'FailingStack',
      message: 'sns unavailable',
    });
    expect(snsMock).toHaveReceivedCommandTimes(PublishCommand, 2);
    expect(publishedMessages()[1].stackName).toBe('DriftedStack');
    errorSpy.mockRestore();
  });

  it('publishes the string form when detection throws a non-Error', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    snsMock.on(PublishCommand).resolves({});
    const context = createFakeDurableContext();
    const step = context.step as jest.Mock;
    step.mockImplementation(async (name: string, fn: () => Promise<unknown>) => {
      if (name === 'detect-stack-drift-PlainStack') {
        throw 'plain failure';
      }
      return fn();
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(processDriftDetection({}, context)).rejects.toThrow(
      'Drift detection failed for 1 stack: PlainStack',
    );

    expect(publishedMessages()[0]).toEqual({
      stackName: 'PlainStack',
      reason: 'plain failure',
    });
    errorSpy.mockRestore();
  });

  it('ignores stack summaries that have no name', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [{ CreationTime: STACK_DATE, StackStatus: 'CREATE_COMPLETE' }],
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(processDriftDetection({}, createFakeDurableContext())).resolves.toEqual({
      succeeded: 0,
      failed: 0,
    });

    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(DRIFT_DETECTION_FAILED);
    expect(cloudFormationMock).not.toHaveReceivedCommand(DetectStackDriftCommand);
    errorSpy.mockRestore();
  });

  it('treats a missing stack summary list as no stacks', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({});

    await expect(processDriftDetection({}, createFakeDurableContext())).resolves.toEqual({
      succeeded: 0,
      failed: 0,
    });

    expect(cloudFormationMock).not.toHaveReceivedCommand(DetectStackDriftCommand);
  });

  it('ignores tagged resources that have no stack ARN', async () => {
    taggingMock.on(GetResourcesCommand).resolves({
      ResourceTagMappingList: [{}],
    });
    mockStableStacks('TaggedStack');

    await expect(processDriftDetection(
      { tagKey: 'DriftDetection', tagValues: ['enabled'] },
      createFakeDurableContext(),
    )).resolves.toEqual({
      succeeded: 0,
      failed: 0,
    });

    expect(cloudFormationMock).not.toHaveReceivedCommand(DetectStackDriftCommand);
  });

  it('treats a missing tag mapping list as no stacks', async () => {
    taggingMock.on(GetResourcesCommand).resolves({});
    mockStableStacks('TaggedStack');

    await expect(processDriftDetection(
      { tagKey: 'DriftDetection', tagValues: ['enabled'] },
      createFakeDurableContext(),
    )).resolves.toEqual({
      succeeded: 0,
      failed: 0,
    });

    expect(cloudFormationMock).not.toHaveReceivedCommand(DetectStackDriftCommand);
  });

  it('publishes an empty drift list when resource drifts are omitted', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-empty-drifts',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand).resolves({
      DetectionStatus: 'DETECTION_COMPLETE',
      StackDriftStatus: 'DRIFTED',
    });
    cloudFormationMock.on(DescribeStackResourceDriftsCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    await processDriftDetection({}, createFakeDurableContext());

    expect(publishedMessage()).toEqual({
      stackName: 'PlainStack',
      stackDriftStatus: 'DRIFTED',
      driftedResources: [],
    });
  });

  it('uses an unknown reason when detection fails without a reason', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-no-reason',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand).resolves({
      DetectionStatus: 'DETECTION_FAILED',
    });
    snsMock.on(PublishCommand).resolves({});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(processDriftDetection({}, createFakeDurableContext())).rejects.toThrow(
      'Drift detection failed for 1 stack: PlainStack',
    );

    expect(publishedMessages()[0]).toEqual({
      stackName: 'PlainStack',
      reason: 'Drift detection failed for stack PlainStack: unknown reason',
    });
    errorSpy.mockRestore();
  });

  it('lists every stable stack when the event is omitted', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    mockInSyncDetection('det-omitted-event');

    await processDriftDetection(undefined as unknown as DriftDetectionEvent, createFakeDurableContext());

    expect(cloudFormationMock).toHaveReceivedCommand(ListStacksCommand);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DetectStackDriftCommand, 1);
  });

  it('uses the wait interval and concurrency from the environment', async () => {
    process.env.DETECTION_WAIT_INTERVAL_SECONDS = '15';
    process.env.STACK_DETECTION_MAX_CONCURRENCY = '2';
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-custom-wait',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand)
      .resolvesOnce({ DetectionStatus: 'DETECTION_IN_PROGRESS' })
      .resolvesOnce({
        DetectionStatus: 'DETECTION_COMPLETE',
        StackDriftStatus: 'IN_SYNC',
      });

    const context = createFakeDurableContext();
    await processDriftDetection({}, context);

    expect(context.wait).toHaveBeenCalledTimes(1);
    expect(context.wait).toHaveBeenCalledWith(
      'wait-drift-detection-PlainStack-0',
      { seconds: 15 },
    );
    expect(context.map).toHaveBeenCalledWith(
      'detect-stack-drifts',
      ['PlainStack'],
      expect.any(Function),
      expect.objectContaining({ maxConcurrency: 2 }),
    );
  });

  it('uses the default wait interval when the environment value is blank', async () => {
    process.env.DETECTION_WAIT_INTERVAL_SECONDS = '   ';
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-blank-wait',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand)
      .resolvesOnce({ DetectionStatus: 'DETECTION_IN_PROGRESS' })
      .resolvesOnce({
        DetectionStatus: 'DETECTION_COMPLETE',
        StackDriftStatus: 'IN_SYNC',
      });

    const context = createFakeDurableContext();
    await processDriftDetection({}, context);

    expect(context.wait).toHaveBeenCalledWith(
      'wait-drift-detection-PlainStack-0',
      { seconds: WAIT_INTERVAL_SECONDS },
    );
  });

  it('fails a stack that stays in progress until the check limit', async () => {
    process.env.DETECTION_MAX_STATUS_CHECKS = '2';
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('SlowStack')],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-slow',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand).resolves({
      DetectionStatus: 'DETECTION_IN_PROGRESS',
    });
    snsMock.on(PublishCommand).resolves({});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const context = createFakeDurableContext();
    await expect(processDriftDetection({}, context)).rejects.toThrow(
      'Drift detection failed for 1 stack: SlowStack',
    );

    expect(context.wait).toHaveBeenCalledTimes(1);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DescribeStackDriftDetectionStatusCommand, 2);
    expect(publishedMessages()[0]).toEqual({
      stackName: 'SlowStack',
      reason: 'Drift detection timed out for stack SlowStack: status is DETECTION_IN_PROGRESS, checked 2 times, expected completion within 2 checks',
    });
    expect(errorSpy).toHaveBeenCalledWith(DRIFT_DETECTION_FAILED, {
      stackNames: ['SlowStack'],
      message: 'Drift detection failed for 1 stack: SlowStack',
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOPIC_ARN);
    errorSpy.mockRestore();
  });

  it.each(['0', 'abc'])(
    'throws when a detection limit environment variable is %s',
    async (value) => {
      process.env.DETECTION_MAX_STATUS_CHECKS = value;

      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const message = `DETECTION_MAX_STATUS_CHECKS is ${value}, expected an integer greater than or equal to 1`;

      await expect(processDriftDetection({}, createFakeDurableContext())).rejects.toThrow(message);

      expect(errorSpy).toHaveBeenCalledWith(DRIFT_DETECTION_FAILED, {
        stackNames: undefined,
        message,
      });
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOPIC_ARN);
      expect(cloudFormationMock).not.toHaveReceivedCommand(ListStacksCommand);
      errorSpy.mockRestore();
    },
  );
});
