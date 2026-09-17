import { DurableContext } from '@aws/durable-execution-sdk-js';
import {
  CloudFormationClient,
  DescribeStackDriftDetectionStatusCommand,
  DescribeStackResourceDriftsCommand,
  DetectStackDriftCommand,
  ListStacksCommand,
} from '@aws-sdk/client-cloudformation';
import {
  GetResourcesCommand,
  ResourceGroupsTaggingAPIClient,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { processDriftDetection } from '../src/funcs/detector.lambda';

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
  // DurableContext is an SDK type; tests only need step and wait.
  return {
    step: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    wait: jest.fn(async () => undefined),
  } as unknown as DurableContext;
};

const createStackSummary = (stackName: string) => ({
  StackName: stackName,
  CreationTime: STACK_DATE,
  StackStatus: 'CREATE_COMPLETE' as const,
});

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

const publishedMessage = (): Record<string, unknown> => {
  const input = snsMock.commandCalls(PublishCommand)[0].args[0].input;
  return JSON.parse(input.Message ?? '{}') as Record<string, unknown>;
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
    expect(cloudFormationMock).not.toHaveReceivedCommand(ListStacksCommand);
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

  it('omits tag values when the filter list is empty', async () => {
    taggingMock.on(GetResourcesCommand).resolves({
      ResourceTagMappingList: [{ ResourceARN: STACK_ARN }],
    });
    mockInSyncDetection('det-empty-tags');

    await processDriftDetection(
      { tagKey: 'DriftDetection', tagValues: [] },
      createFakeDurableContext(),
    );

    expect(taggingMock.commandCalls(GetResourcesCommand)[0].args[0].input.TagFilters).toEqual([
      { Key: 'DriftDetection' },
    ]);
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
    mockInSyncDetection('det-tag-pages');

    await processDriftDetection({ tagKey: 'DriftDetection' }, createFakeDurableContext());

    expect(taggingMock).toHaveReceivedCommandTimes(GetResourcesCommand, 2);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DetectStackDriftCommand, 2);
  });

  it('throws when a tagged stack ARN has no stack name', async () => {
    taggingMock.on(GetResourcesCommand).resolves({
      ResourceTagMappingList: [{ ResourceARN: INVALID_STACK_ARN }],
    });

    await expect(
      processDriftDetection({ tagKey: 'DriftDetection' }, createFakeDurableContext()),
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

    await processDriftDetection({}, createFakeDurableContext());

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

  it('waits before the first status check', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    mockInSyncDetection('det-wait');

    const context = createFakeDurableContext();
    await processDriftDetection({}, context);

    expect(context.wait).toHaveBeenCalledTimes(1);
    expect(context.wait).toHaveBeenCalledWith(
      'wait-drift-detection-PlainStack-0',
      { seconds: WAIT_INTERVAL_SECONDS },
    );
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

    expect(context.wait).toHaveBeenCalledTimes(2);
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

    await processDriftDetection({}, createFakeDurableContext());

    expect(errorSpy).toHaveBeenCalled();
    expect(snsMock).toHaveReceivedCommandTimes(PublishCommand, 1);
    expect(publishedMessage().stackName).toBe('DriftedStack');
    errorSpy.mockRestore();
  });

  it('does not throw when the only stack fails detection', async () => {
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
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(processDriftDetection({}, createFakeDurableContext())).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      'Drift detection failed for stack PlainStack',
      expect.objectContaining({
        message: 'Drift detection failed for stack PlainStack: access denied',
      }),
    );
    expect(snsMock).not.toHaveReceivedCommand(PublishCommand);
    errorSpy.mockRestore();
  });

  it('does not throw when DetectStackDrift returns no detection ID', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(processDriftDetection({}, createFakeDurableContext())).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      'Drift detection failed for stack PlainStack',
      expect.objectContaining({
        message: 'DetectStackDrift did not return a detection ID for stack PlainStack',
      }),
    );
    expect(snsMock).not.toHaveReceivedCommand(PublishCommand);
    errorSpy.mockRestore();
  });
});
