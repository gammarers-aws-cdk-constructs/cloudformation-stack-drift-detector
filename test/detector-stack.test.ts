import { App, Duration, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { CloudformationStackDriftDetectorStack, ReadOnlyAccessGrant } from '../src';

const TEST_ENV = {
  account: '123456789012',
  region: 'us-east-1',
};

describe('CloudformationStackDriftDetectorStack', () => {
  it('deploys the detector and forwards construct props', () => {
    const app = new App();
    const topicStack = new Stack(app, 'TopicStack', { env: TEST_ENV });
    const topic = new sns.Topic(topicStack, 'Notifications');
    const stack = new CloudformationStackDriftDetectorStack(app, 'DetectorStack', {
      env: TEST_ENV,
      notificationTopic: topic,
      executionTimeout: Duration.hours(2),
      grantReadOnlyAccess: ReadOnlyAccessGrant.ENABLED,
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
    }));
    template.hasResourceProperties('AWS::Events::Rule', Match.objectLike({
      ScheduleExpression: 'rate(1 day)',
      Targets: Match.arrayWith([
        Match.objectLike({
          Input: '{"tagKey":"DriftDetection","tagValues":["enabled"]}',
        }),
      ]),
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
});
