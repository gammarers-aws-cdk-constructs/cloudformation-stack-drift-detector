import { App, Duration, Stack } from 'aws-cdk-lib';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { CloudFormationStackDriftDetector } from '../src';

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

describe('CloudFormationStackDriftDetector runtime limits', () => {
  it.each([
    {
      label: 'a wait interval of 0 seconds',
      props: { waitInterval: Duration.seconds(0) },
      message: 'waitInterval must be a whole number of seconds greater than or equal to 1',
    },
    {
      label: 'a fractional wait interval',
      props: { waitInterval: Duration.millis(1500) },
      message: 'waitInterval must be a whole number of seconds greater than or equal to 1',
    },
    {
      label: 'maxStatusChecks of 0',
      props: { maxStatusChecks: 0 },
      message: 'maxStatusChecks must be an integer greater than or equal to 1',
    },
    {
      label: 'a fractional maxStatusChecks',
      props: { maxStatusChecks: 1.5 },
      message: 'maxStatusChecks must be an integer greater than or equal to 1',
    },
    {
      label: 'maxConcurrency of 0',
      props: { maxConcurrency: 0 },
      message: 'maxConcurrency must be an integer greater than or equal to 1',
    },
    {
      label: 'a fractional maxConcurrency',
      props: { maxConcurrency: 1.5 },
      message: 'maxConcurrency must be an integer greater than or equal to 1',
    },
  ])('rejects $label', ({ props, message }) => {
    const stack = createTestStack();
    const topic = Topic.fromTopicArn(stack, 'NotificationTopic', NOTIFICATION_TOPIC_ARN);

    expect(() => {
      new CloudFormationStackDriftDetector(stack, 'Detector', {
        notificationTopic: topic,
        ...props,
      });
    }).toThrow(message);
  });
});
