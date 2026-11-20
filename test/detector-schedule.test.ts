import { App, Duration, Stack, TimeZone } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ScheduleExpression } from 'aws-cdk-lib/aws-scheduler';
import * as sns from 'aws-cdk-lib/aws-sns';
import { CloudFormationStackDriftDetector, DetectionScheduleState } from '../src';

const NOTIFICATION_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:existing-topic';

const createTestStack = (): Stack => {
  const app = new App();
  return new Stack(app, 'TestStack', {
    env: {
      account: '123456789012',
      region: 'us-east-1',
    },
  });
};

describe('CloudFormationStackDriftDetector schedule', () => {
  it('replaces the default cron when a schedule is provided', () => {
    const stack = createTestStack();
    new CloudFormationStackDriftDetector(stack, 'Detector', {
      notificationTopic: sns.Topic.fromTopicArn(stack, 'NotificationTopic', NOTIFICATION_TOPIC_ARN),
      schedule: ScheduleExpression.cron({
        minute: '0',
        hour: '9',
        weekDay: 'MON',
        timeZone: TimeZone.ASIA_TOKYO,
      }),
      scheduleState: DetectionScheduleState.ENABLED,
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Scheduler::Schedule', Match.objectLike({
      ScheduleExpression: 'cron(0 9 ? * MON *)',
      ScheduleExpressionTimezone: 'Asia/Tokyo',
      State: 'ENABLED',
      Target: Match.objectLike({
        Input: '{}',
      }),
    }));
    template.resourceCountIs('AWS::Events::Rule', 0);
  });

  it.each([
    {
      label: 'a rate expression',
      schedule: ScheduleExpression.rate(Duration.days(1)),
      message: 'schedule must be a cron expression',
    },
    {
      label: 'a cron expression without a time zone',
      schedule: { expressionString: 'cron(0 9 * * ? *)' } as ScheduleExpression,
      message: 'schedule must name a time zone',
    },
    {
      label: 'a cron expression with a blank time zone',
      schedule: ScheduleExpression.cron({
        minute: '0',
        hour: '9',
        timeZone: TimeZone.of('   '),
      }),
      message: 'schedule must name a time zone',
    },
  ])('rejects $label', ({ schedule, message }) => {
    const stack = createTestStack();

    expect(() => {
      new CloudFormationStackDriftDetector(stack, 'Detector', {
        notificationTopic: sns.Topic.fromTopicArn(stack, 'NotificationTopic', NOTIFICATION_TOPIC_ARN),
        schedule,
      });
    }).toThrow(message);
  });
});
