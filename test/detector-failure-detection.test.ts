import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { CloudFormationStackDriftDetector } from '../src';

const NOTIFICATION_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:existing-topic';

const createStack = (): Stack => {
  const app = new App();
  return new Stack(app, 'TestStack', {
    env: {
      account: '123456789012',
      region: 'us-east-1',
    },
  });
};

describe('CloudFormationStackDriftDetector failure detection', () => {
  it('creates a retained log group and a log alarm when enabled', () => {
    const stack = createStack();
    const alarmTopic = new sns.Topic(stack, 'AlarmTopic');
    new CloudFormationStackDriftDetector(stack, 'Detector', {
      notificationTopic: sns.Topic.fromTopicArn(stack, 'NotificationTopic', NOTIFICATION_TOPIC_ARN),
      failureDetection: {
        enabled: true,
        alarm: {
          topic: alarmTopic,
        },
      },
    });
    const template = Template.fromStack(stack);

    template.hasResource('AWS::Logs::LogGroup', {
      DeletionPolicy: 'RetainExceptOnCreate',
      UpdateReplacePolicy: 'Retain',
      Properties: Match.objectLike({
        RetentionInDays: 365,
      }),
    });
    template.hasResourceProperties('AWS::Logs::MetricFilter', {
      FilterPattern: '"DriftDetectionFailed"',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', Match.objectLike({
      MetricName: 'DriftDetectionFailed',
      Namespace: 'CloudFormationStackDriftDetector',
      AlarmActions: Match.anyValue(),
    }));
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      LoggingConfig: Match.objectLike({
        LogGroup: Match.anyValue(),
      }),
    }));
  });

  it('leaves alarms without an SNS action when no alarm topic is set', () => {
    const stack = createStack();
    new CloudFormationStackDriftDetector(stack, 'Detector', {
      notificationTopic: sns.Topic.fromTopicArn(stack, 'NotificationTopic', NOTIFICATION_TOPIC_ARN),
      failureDetection: {
        enabled: true,
      },
    });
    const template = Template.fromStack(stack);
    const alarms = template.findResources('AWS::CloudWatch::Alarm');

    expect(Object.keys(alarms).length).toBeGreaterThan(0);
    for (const alarm of Object.values(alarms)) {
      expect(alarm.Properties?.AlarmActions).toBeUndefined();
    }
  });
});
