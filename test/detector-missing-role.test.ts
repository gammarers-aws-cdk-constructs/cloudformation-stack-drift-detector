jest.mock('../src/funcs/detector-function', () => {
  return {
    DetectorFunction: class DetectorFunction {
      public readonly role = undefined;
    },
  };
});

import { App, Stack } from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import { CloudFormationStackDriftDetector } from '../src';

describe('CloudFormationStackDriftDetector without a Lambda role', () => {
  it('throws when the detector Lambda has no IAM role', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');
    const topic = sns.Topic.fromTopicArn(
      stack,
      'NotificationTopic',
      'arn:aws:sns:us-east-1:123456789012:existing-topic',
    );

    expect(() => {
      new CloudFormationStackDriftDetector(stack, 'Detector', {
        notificationTopic: topic,
      });
    }).toThrow('Detector Lambda must have an IAM role');
  });
});
