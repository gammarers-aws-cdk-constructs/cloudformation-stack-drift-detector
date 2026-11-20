import { App, Duration, Stack, TimeZone } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ScheduleExpression } from 'aws-cdk-lib/aws-scheduler';
import * as sns from 'aws-cdk-lib/aws-sns';
import {
  CloudFormationStackDriftDetectorStack,
  DetectionScheduleState,
} from '../src';

const TEST_ENV = {
  account: '123456789012',
  region: 'us-east-1',
};

describe('CloudFormationStackDriftDetectorStack', () => {
  it('deploys the detector and forwards construct props', () => {
    const app = new App();
    const topicStack = new Stack(app, 'TopicStack', { env: TEST_ENV });
    const topic = new sns.Topic(topicStack, 'Notifications');
    const stack = new CloudFormationStackDriftDetectorStack(app, 'DetectorStack', {
      env: TEST_ENV,
      notificationTopic: topic,
      executionTimeout: Duration.hours(2),
      waitInterval: Duration.seconds(45),
      maxStatusChecks: 10,
      maxConcurrency: 8,
      targetResource: {
        tagKey: 'DriftDetection',
        tagValues: ['enabled'],
      },
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::SNS::Topic', 0);
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      DurableConfig: Match.objectLike({
        ExecutionTimeout: 7200,
      }),
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          DETECTION_WAIT_INTERVAL_SECONDS: '45',
          DETECTION_MAX_STATUS_CHECKS: '10',
          STACK_DETECTION_MAX_CONCURRENCY: '8',
        }),
      }),
    }));
    template.hasResourceProperties('AWS::Scheduler::Schedule', Match.objectLike({
      ScheduleExpression: 'cron(12 9 * * ? *)',
      ScheduleExpressionTimezone: 'Etc/UTC',
      Target: Match.objectLike({
        Input: '{"tagKey":"DriftDetection","tagValues":["enabled"]}',
      }),
    }));
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

  it('forwards the schedule', () => {
    const app = new App();
    const topicStack = new Stack(app, 'TopicStack', { env: TEST_ENV });
    const topic = new sns.Topic(topicStack, 'Notifications');
    const stack = new CloudFormationStackDriftDetectorStack(app, 'DetectorStack', {
      env: TEST_ENV,
      notificationTopic: topic,
      schedule: ScheduleExpression.cron({
        minute: '0',
        hour: '9',
        weekDay: 'MON',
        timeZone: TimeZone.ASIA_TOKYO,
      }),
      scheduleState: DetectionScheduleState.DISABLED,
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'cron(0 9 ? * MON *)',
      ScheduleExpressionTimezone: 'Asia/Tokyo',
      State: 'DISABLED',
    });
  });
});
