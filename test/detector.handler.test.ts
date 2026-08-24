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

const createFakeDurableContext = (): DurableContext => {
  return {
    step: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    wait: jest.fn(async () => undefined),
  } as unknown as DurableContext;
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
      StackSummaries: [{
        StackName: 'PlainStack',
        CreationTime: new Date('2026-01-01T00:00:00.000Z'),
        StackStatus: 'CREATE_COMPLETE',
      }],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-1',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand).resolves({
      DetectionStatus: 'DETECTION_COMPLETE',
      StackDriftStatus: 'IN_SYNC',
    });

    await processDriftDetection({}, createFakeDurableContext());

    expect(cloudFormationMock).toHaveReceivedCommand(ListStacksCommand);
    expect(taggingMock).not.toHaveReceivedCommand(GetResourcesCommand);
    expect(snsMock).not.toHaveReceivedCommand(PublishCommand);
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
      StackResourceDrifts: [{
        LogicalResourceId: 'Bucket',
        StackResourceDriftStatus: 'MODIFIED',
        StackId: STACK_ARN,
        ResourceType: 'AWS::S3::Bucket',
        Timestamp: new Date('2026-01-01T00:00:00.000Z'),
      }],
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
  });

  it('polls until detection completes', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [{
        StackName: 'PlainStack',
        CreationTime: new Date('2026-01-01T00:00:00.000Z'),
        StackStatus: 'CREATE_COMPLETE',
      }],
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

  it('throws when drift detection fails', async () => {
    cloudFormationMock.on(ListStacksCommand).resolves({
      StackSummaries: [{
        StackName: 'PlainStack',
        CreationTime: new Date('2026-01-01T00:00:00.000Z'),
        StackStatus: 'CREATE_COMPLETE',
      }],
    });
    cloudFormationMock.on(DetectStackDriftCommand).resolves({
      StackDriftDetectionId: 'det-4',
    });
    cloudFormationMock.on(DescribeStackDriftDetectionStatusCommand).resolves({
      DetectionStatus: 'DETECTION_FAILED',
      DetectionStatusReason: 'access denied',
    });

    await expect(processDriftDetection({}, createFakeDurableContext())).rejects.toThrow(
      'Drift detection failed for stack PlainStack: access denied',
    );
  });
});
