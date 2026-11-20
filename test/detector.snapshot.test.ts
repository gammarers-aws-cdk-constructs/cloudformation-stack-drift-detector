import { App, Duration, Stack, TimeZone } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Key } from 'aws-cdk-lib/aws-kms';
import { ScheduleExpression } from 'aws-cdk-lib/aws-scheduler';
import { Topic } from 'aws-cdk-lib/aws-sns';
import {
  CloudFormationStackDriftDetector,
  DetectionScheduleState,
  type CloudFormationStackDriftDetectorProps,
} from '../src';

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

type SnapshotProps = (
  stack: Stack,
) => Omit<CloudFormationStackDriftDetectorProps, 'notificationTopic'>;

const cases: ReadonlyArray<{ readonly name: string; readonly extra: SnapshotProps }> = [
  {
    name: 'defaults',
    extra: () => ({}),
  },
  {
    name: 'custom timing',
    extra: () => ({
      executionTimeout: Duration.hours(2),
      waitInterval: Duration.seconds(60),
      maxStatusChecks: 10,
      maxConcurrency: 2,
      retentionPeriod: Duration.days(14),
    }),
  },
  {
    name: 'notification topic key',
    extra: (stack) => ({
      notificationTopicKey: new Key(stack, 'TopicKey'),
    }),
  },
  {
    name: 'target resource',
    extra: () => ({
      targetResource: {
        tagKey: 'DriftDetection',
        tagValues: ['enabled'],
      },
    }),
  },
  {
    name: 'custom schedule',
    extra: () => ({
      schedule: ScheduleExpression.cron({
        minute: '0',
        hour: '9',
        weekDay: 'MON',
        timeZone: TimeZone.ASIA_TOKYO,
      }),
      scheduleState: DetectionScheduleState.DISABLED,
    }),
  },
  {
    name: 'failure detection',
    extra: (stack) => ({
      failureDetection: {
        enabled: true,
        alarm: {
          topic: new Topic(stack, 'AlarmTopic'),
        },
      },
    }),
  },
];

describe('CloudFormationStackDriftDetector snapshots', () => {
  it.each(cases)('matches $name', ({ name, extra }) => {
    const stack = createTestStack();
    new CloudFormationStackDriftDetector(stack, 'Detector', {
      notificationTopic: Topic.fromTopicArn(stack, 'NotificationTopic', NOTIFICATION_TOPIC_ARN),
      ...extra(stack),
    });

    expect(Template.fromStack(stack).toJSON()).toMatchSnapshot(name);
  });
});
