import { App, Duration, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Topic, type ITopic } from 'aws-cdk-lib/aws-sns';
import { CloudFormationStackDriftDetector } from '../src';

const NOTIFICATION_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:existing-topic';

const getNotificationTopic = (stack: Stack): ITopic => {
  return Topic.fromTopicArn(stack, 'NotificationTopic', NOTIFICATION_TOPIC_ARN);
};

const createTestStack = (): Stack => {
  const app = new App();
  return new Stack(app, 'TestStack', {
    env: {
      account: '123456789012',
      region: 'us-east-1',
    },
  });
};

describe('default', () => {
  const app = new App();
  const stack = new Stack(app, 'TestStack', {
    env: {
      account: '123456789012',
      region: 'us-east-1',
    },
  });
  new CloudFormationStackDriftDetector(stack, 'Detector', {
    notificationTopic: getNotificationTopic(stack),
  });
  const template = Template.fromStack(stack);

  it('should not create an SNS topic', () => {
    template.resourceCountIs('AWS::SNS::Topic', 0);
  });

  it('should have a durable lambda function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      Description: 'src/funcs/detector.lambda.ts',
      Runtime: 'nodejs24.x',
      Handler: 'index.handler',
      Timeout: 900,
      DurableConfig: {
        ExecutionTimeout: 43200,
        RetentionPeriodInDays: 30,
      },
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
          NOTIFICATION_TOPIC_ARN,
          DETECTION_WAIT_INTERVAL_SECONDS: '30',
          DETECTION_MAX_STATUS_CHECKS: '20',
          STACK_DETECTION_MAX_CONCURRENCY: '5',
        }),
      }),
    }));
  });

  it('should attach the durable execution managed policy', () => {
    template.hasResourceProperties('AWS::IAM::Role', Match.objectLike({
      ManagedPolicyArns: Match.arrayWith([
        {
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':iam::aws:policy/service-role/AWSLambdaBasicDurableExecutionRolePolicy',
            ],
          ],
        },
      ]),
    }));
  });

  it('should allow CloudFormation drift APIs and stack listing', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              'cloudformation:DetectStackDrift',
              'cloudformation:DetectStackResourceDrift',
              'cloudformation:DescribeStackResourceDrifts',
            ],
            Resource: Match.anyValue(),
          }),
          Match.objectLike({
            Action: [
              'cloudformation:DescribeStackDriftDetectionStatus',
              'cloudformation:ListStacks',
              'cloudformation:BatchDescribeTypeConfigurations',
            ],
            Resource: '*',
          }),
          Match.objectLike({
            Action: 'tag:GetResources',
            Resource: '*',
          }),
        ]),
      },
    });
  });

  it('should schedule daily detection at 09:12 UTC with an empty tag filter', () => {
    template.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'cron(12 9 * * ? *)',
      ScheduleExpressionTimezone: 'Etc/UTC',
      State: 'ENABLED',
      FlexibleTimeWindow: { Mode: 'OFF' },
      Target: Match.objectLike({
        Arn: { Ref: Match.stringLikeRegexp('Live') },
        Input: '{}',
      }),
    });
    template.hasResourceProperties('AWS::Lambda::Alias', {
      Name: 'live',
    });
    template.resourceCountIs('AWS::Scheduler::Schedule', 1);
    template.resourceCountIs('AWS::Events::Rule', 0);
    template.resourceCountIs('AWS::Lambda::Alias', 1);
  });

  it('should not create failure alarms', () => {
    template.resourceCountIs('AWS::Logs::LogGroup', 0);
    template.resourceCountIs('AWS::CloudWatch::Alarm', 0);
  });

  it('should attach the AWS managed ReadOnlyAccess policy', () => {
    template.hasResourceProperties('AWS::IAM::Role', Match.objectLike({
      ManagedPolicyArns: Match.arrayWith([
        {
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':iam::aws:policy/ReadOnlyAccess',
            ],
          ],
        },
      ]),
    }));
  });
});

describe('with notification topic key', () => {
  const stack = createTestStack();
  const topicKey = new Key(stack, 'TopicKey');
  new CloudFormationStackDriftDetector(stack, 'Detector', {
    notificationTopic: getNotificationTopic(stack),
    notificationTopicKey: topicKey,
  });
  const template = Template.fromStack(stack);

  it('should grant encrypt and decrypt on the topic key', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              'kms:Decrypt',
              'kms:Encrypt',
              'kms:GenerateDataKey*',
            ]),
            Resource: {
              'Fn::GetAtt': [
                Match.stringLikeRegexp('TopicKey'),
                'Arn',
              ],
            },
          }),
        ]),
      },
    });
  });
});

describe('with target resource', () => {
  const app = new App();
  const stack = new Stack(app, 'TestStack', {
    env: {
      account: '123456789012',
      region: 'us-east-1',
    },
  });
  new CloudFormationStackDriftDetector(stack, 'Detector', {
    notificationTopic: getNotificationTopic(stack),
    targetResource: {
      tagKey: 'DriftDetection',
      tagValues: ['enabled'],
    },
  });
  const template = Template.fromStack(stack);

  it('should pass tag key and values to the detector', () => {
    template.hasResourceProperties('AWS::Scheduler::Schedule', Match.objectLike({
      Target: Match.objectLike({
        Input: '{"tagKey":"DriftDetection","tagValues":["enabled"]}',
      }),
    }));
  });
});

describe('with invalid tag criteria', () => {
  it('rejects a blank tag key', () => {
    const stack = createTestStack();

    expect(() => {
      new CloudFormationStackDriftDetector(stack, 'Detector', {
        notificationTopic: getNotificationTopic(stack),
        targetResource: {
          tagKey: ' ',
          tagValues: ['enabled'],
        },
      });
    }).toThrow('props.targetResource.tagKey must be a non-blank string.');
  });

  it('rejects an empty tag value list', () => {
    const stack = createTestStack();

    expect(() => {
      new CloudFormationStackDriftDetector(stack, 'Detector', {
        notificationTopic: getNotificationTopic(stack),
        targetResource: {
          tagKey: 'DriftDetection',
          tagValues: [],
        },
      });
    }).toThrow('props.targetResource.tagValues must contain at least one value.');
  });
});

describe('with durable execution settings', () => {
  const stack = createTestStack();
  new CloudFormationStackDriftDetector(stack, 'Detector', {
    notificationTopic: getNotificationTopic(stack),
    executionTimeout: Duration.hours(2),
    retentionPeriod: Duration.days(14),
  });
  const template = Template.fromStack(stack);

  it('should apply execution timeout and retention period', () => {
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      DurableConfig: {
        ExecutionTimeout: 7200,
        RetentionPeriodInDays: 14,
      },
    }));
  });
});
