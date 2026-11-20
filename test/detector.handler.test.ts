import { LocalDurableTestRunner, type TestResult } from '@aws/durable-execution-sdk-js-testing';
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
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import {
  cloudFormation,
  type DriftDetectionCounts,
  type DriftDetectionEvent,
  handler,
  resourceGroupsTagging,
  sns,
} from '../src/funcs/detector.lambda';
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

const operationNames = (execution: TestResult): string[] => {
  return execution.getOperations().flatMap((operation) => {
    const name = operation.getName();
    return name === undefined ? [] : [name];
  });
};

const expectSucceeded = (
  execution: TestResult<DriftDetectionCounts>,
  result: DriftDetectionCounts,
): void => {
  expect(execution.getStatus()).toBe('SUCCEEDED');
  expect(execution.getResult()).toEqual(result);
};

const expectFailed = (execution: TestResult, message: string): void => {
  expect(execution.getStatus()).toBe('FAILED');
  expect(execution.getError().errorMessage).toBe(message);
};

const expectHistoryIdentifiesStack = (execution: TestResult, stackName: string): void => {
  const history = JSON.stringify(execution.getHistoryEvents());
  expect(history).toContain(stackName);
  expect(history).not.toContain(TOPIC_ARN);
};

interface SdkClientLimits {
  readonly config: {
    readonly maxAttempts: number | (() => Promise<number>);
    readonly requestHandler: unknown;
  };
}

const expectClientLimits = async (client: SdkClientLimits): Promise<void> => {
  const maxAttempts = client.config.maxAttempts;
  const attempts = typeof maxAttempts === 'function' ? await maxAttempts() : maxAttempts;
  expect(attempts).toBe(3);

  const requestHandlerValue = client.config.requestHandler;
  const requestHandler = typeof requestHandlerValue === 'function'
    ? await (requestHandlerValue as () => Promise<unknown>)()
    : requestHandlerValue;
  expect(requestHandler).toBeInstanceOf(NodeHttpHandler);
  // httpHandlerConfigs() stays empty until the first request. The timeouts are on the private provider.
  const handlerConfig = await (requestHandler as unknown as {
    configProvider: Promise<{ connectionTimeout?: number; requestTimeout?: number }>;
  }).configProvider;
  expect(handlerConfig.connectionTimeout).toBe(5_000);
  expect(handlerConfig.requestTimeout).toBe(30_000);
};

describe('detector AWS SDK clients', () => {
  it('bounds retries and HTTP timeouts', async () => {
    await expectClientLimits(cloudFormation);
    await expectClientLimits(resourceGroupsTagging);
    await expectClientLimits(sns);
  });
});

describe('processDriftDetection', () => {
  let runner: LocalDurableTestRunner<DriftDetectionCounts>;

  beforeAll(async () => {
    await LocalDurableTestRunner.setupTestEnvironment({ skipTime: true });
    runner = new LocalDurableTestRunner({ handlerFunction: handler });
  });

  afterAll(async () => {
    await LocalDurableTestRunner.teardownTestEnvironment();
  });

  beforeEach(() => {
    runner.reset();
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

  const runDetection = async (payload?: DriftDetectionEvent): Promise<TestResult<DriftDetectionCounts>> => {
    return runner.run({ payload });
  };

  it('throws when NOTIFICATION_TOPIC_ARN is missing', async () => {
    delete process.env.NOTIFICATION_TOPIC_ARN;

    const execution = await runDetection({});

    expectFailed(execution, 'NOTIFICATION_TOPIC_ARN environment variable is not set');
  });

  it('lists all stable stacks when no tag filter is provided', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    mockInSyncDetection('det-1');

    const execution = await runDetection({});

    expectSucceeded(execution, { succeeded: 1, failed: 0 });
    expect(operationNames(execution)).toEqual([
      'get-target-stack-names',
      'detect-stack-drifts',
      'PlainStack',
      'detect-stack-drift-PlainStack',
      'describe-drift-detection-status-PlainStack-0',
    ]);
    expectHistoryIdentifiesStack(execution, 'PlainStack');
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

    const execution = await runDetection({});

    expectSucceeded(execution, { succeeded: 2, failed: 0 });
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

    const execution = await runDetection({ tagKey: 'DriftDetection', tagValues: ['enabled'] });

    expectSucceeded(execution, { succeeded: 1, failed: 0 });
    expect(operationNames(execution)).toEqual([
      'get-target-stack-names',
      'detect-stack-drifts',
      'TaggedStack',
      'detect-stack-drift-TaggedStack',
      'describe-drift-detection-status-TaggedStack-0',
      'describe-resource-drifts-TaggedStack',
      'publish-notification-TaggedStack',
    ]);
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
    const execution = await runDetection({ tagKey: 'DriftDetection' });

    expectFailed(execution, 'tagValues is required when tagKey is set');
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

    const execution = await runDetection({ tagKey: 'DriftDetection', tagValues: ['enabled'] });

    expectSucceeded(execution, { succeeded: 2, failed: 0 });
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

    const execution = await runDetection({ tagKey: 'DriftDetection', tagValues: ['enabled'] });

    expectSucceeded(execution, { succeeded: 1, failed: 0 });
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DetectStackDriftCommand, 1);
    expect(cloudFormationMock).toHaveReceivedCommandWith(DetectStackDriftCommand, {
      StackName: 'TaggedStack',
    });
  });

  it('throws when a tagged stack ARN has no stack name', async () => {
    taggingMock.on(GetResourcesCommand).resolves({
      ResourceTagMappingList: [{ ResourceARN: INVALID_STACK_ARN }],
    });

    const execution = await runDetection({ tagKey: 'DriftDetection', tagValues: ['enabled'] });

    expectFailed(execution, `Unable to get stack name from ARN: ${INVALID_STACK_ARN}`);
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

    const execution = await runDetection({});

    expectSucceeded(execution, { succeeded: 1, failed: 0 });
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

    const execution = await runDetection({});

    expectSucceeded(execution, { succeeded: 2, failed: 0 });
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

    const execution = await runDetection({});

    expectSucceeded(execution, { succeeded: 1, failed: 0 });
    expect(snsMock).not.toHaveReceivedCommand(PublishCommand);
    expect(cloudFormationMock).not.toHaveReceivedCommand(DescribeStackResourceDriftsCommand);
  });

  it('checks status before the first wait', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    mockInSyncDetection('det-wait');

    const execution = await runDetection({});

    expectSucceeded(execution, { succeeded: 1, failed: 0 });
    expect(operationNames(execution)).not.toContain('wait-drift-detection-PlainStack-0');
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DescribeStackDriftDetectionStatusCommand, 1);
    expect(runner.getOperation('detect-stack-drifts').getChildOperations()?.map((operation) => operation.getName()))
      .toEqual(['PlainStack']);
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

    const execution = await runDetection({});

    expectSucceeded(execution, { succeeded: 1, failed: 0 });
    expect(runner.getOperation('wait-drift-detection-PlainStack-0').getWaitDetails()).toEqual(
      expect.objectContaining({ waitSeconds: WAIT_INTERVAL_SECONDS }),
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

    const execution = await runDetection({});

    expectFailed(execution, 'Drift detection failed for 1 stack: FailingStack');
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

    const execution = await runDetection({});

    expectFailed(execution, 'Drift detection failed for 1 stack: PlainStack');
    expect(operationNames(execution)).toEqual([
      'get-target-stack-names',
      'detect-stack-drifts',
      'PlainStack',
      'detect-stack-drift-PlainStack',
      'describe-drift-detection-status-PlainStack-0',
      'publish-detection-failure-PlainStack',
    ]);
    expectHistoryIdentifiesStack(execution, 'PlainStack');
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

    const execution = await runDetection({});

    expectFailed(execution, 'Drift detection failed for 1 stack: PlainStack');
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
    cloudFormationMock.on(DetectStackDriftCommand).callsFake((input) => {
      if (input.StackName === 'UpdatingStack') {
        return Promise.reject(new Error('Stack UpdatingStack is in UPDATE_IN_PROGRESS'));
      }
      return Promise.resolve({
        StackDriftDetectionId: 'det-after-reject',
      });
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

    const execution = await runDetection({});

    expectFailed(execution, 'Drift detection failed for 1 stack: UpdatingStack');
    const detectedStackNames = cloudFormationMock.commandCalls(DetectStackDriftCommand).map((call) => {
      return call.args[0].input.StackName;
    });
    expect(detectedStackNames).toEqual(expect.arrayContaining(['UpdatingStack', 'DriftedStack']));
    const messages = publishedMessages();
    expect(messages.map((message) => message.stackName).sort()).toEqual(['DriftedStack', 'UpdatingStack']);
    expect(messages.find((message) => message.stackName === 'UpdatingStack')?.reason).toBe(
      'Stack UpdatingStack is in UPDATE_IN_PROGRESS',
    );
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
    snsMock.on(PublishCommand).callsFake((input) => {
      if (input.Subject?.includes('detection failed')) {
        return Promise.reject(new Error('sns unavailable'));
      }
      return Promise.resolve({});
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const execution = await runDetection({});

    expectFailed(execution, 'Drift detection failed for 1 stack: FailingStack');
    expect(errorSpy).toHaveBeenCalledWith('Failed to publish drift detection failure', {
      stackName: 'FailingStack',
      message: 'sns unavailable',
    });
    expect(publishedMessages().map((message) => message.stackName)).toContain('DriftedStack');
    errorSpy.mockRestore();
  });

  it('publishes the string form when detection throws a non-Error', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [createStackSummary('PlainStack')],
    });
    cloudFormationMock.on(DetectStackDriftCommand).rejects('plain failure');
    snsMock.on(PublishCommand).resolves({});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const execution = await runDetection({});

    expectFailed(execution, 'Drift detection failed for 1 stack: PlainStack');
    expect(publishedMessages()[0]).toEqual({
      stackName: 'PlainStack',
      reason: 'plain failure',
    });
    errorSpy.mockRestore();
  });

  it('ignores stack summaries that have no name', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [{
        CreationTime: STACK_DATE,
        StackStatus: 'CREATE_COMPLETE',
        StackName: undefined,
      }],
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const execution = await runDetection({});

    expectSucceeded(execution, { succeeded: 0, failed: 0 });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(DRIFT_DETECTION_FAILED);
    expect(cloudFormationMock).not.toHaveReceivedCommand(DetectStackDriftCommand);
    errorSpy.mockRestore();
  });

  it('treats a missing stack summary list as no stacks', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({});

    const execution = await runDetection({});

    expectSucceeded(execution, { succeeded: 0, failed: 0 });
    expect(cloudFormationMock).not.toHaveReceivedCommand(DetectStackDriftCommand);
  });

  it('ignores tagged resources that have no stack ARN', async () => {
    taggingMock.on(GetResourcesCommand).resolves({
      ResourceTagMappingList: [{}],
    });
    mockStableStacks('TaggedStack');

    const execution = await runDetection({ tagKey: 'DriftDetection', tagValues: ['enabled'] });

    expectSucceeded(execution, { succeeded: 0, failed: 0 });
    expect(cloudFormationMock).not.toHaveReceivedCommand(DetectStackDriftCommand);
  });

  it('treats a missing tag mapping list as no stacks', async () => {
    taggingMock.on(GetResourcesCommand).resolves({});
    mockStableStacks('TaggedStack');

    const execution = await runDetection({ tagKey: 'DriftDetection', tagValues: ['enabled'] });

    expectSucceeded(execution, { succeeded: 0, failed: 0 });
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

    const execution = await runDetection({});

    expectSucceeded(execution, { succeeded: 1, failed: 0 });
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

    const execution = await runDetection({});

    expectFailed(execution, 'Drift detection failed for 1 stack: PlainStack');
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

    const execution = await runDetection(undefined);

    expectSucceeded(execution, { succeeded: 1, failed: 0 });
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

    const execution = await runDetection({});

    expectSucceeded(execution, { succeeded: 1, failed: 0 });
    expect(runner.getOperation('wait-drift-detection-PlainStack-0').getWaitDetails()).toEqual(
      expect.objectContaining({ waitSeconds: 15 }),
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

    const execution = await runDetection({});

    expectSucceeded(execution, { succeeded: 1, failed: 0 });
    expect(runner.getOperation('wait-drift-detection-PlainStack-0').getWaitDetails()).toEqual(
      expect.objectContaining({ waitSeconds: WAIT_INTERVAL_SECONDS }),
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

    const execution = await runDetection({});

    expectFailed(execution, 'Drift detection failed for 1 stack: SlowStack');
    expect(runner.getOperation('wait-drift-detection-SlowStack-0').getWaitDetails()).toEqual(
      expect.objectContaining({ waitSeconds: WAIT_INTERVAL_SECONDS }),
    );
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
      const execution = await runDetection({});

      expectFailed(execution, message);
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
