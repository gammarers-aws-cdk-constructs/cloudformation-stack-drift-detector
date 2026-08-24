import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { CloudformationStackDriftDetector } from '../src';

describe('CloudformationStackDriftDetector', () => {
  describe('default', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    new CloudformationStackDriftDetector(stack, 'Detector');
    const template = Template.fromStack(stack);

    it('should create an SNS topic', () => {
      template.resourceCountIs('AWS::SNS::Topic', 1);
    });

    it('should have a durable lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
        Description: 'src/funcs/detector.lambda.ts',
        Runtime: 'nodejs22.x',
        Handler: 'index.handler',
        Timeout: 900,
        DurableConfig: {
          ExecutionTimeout: 3600,
          RetentionPeriodInDays: 30,
        },
        Environment: Match.objectLike({
          Variables: Match.objectLike({
            AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
            NOTIFICATION_TOPIC_ARN: Match.anyValue(),
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
                'cloudformation:DescribeStackResourceDrifts',
              ],
              Resource: Match.anyValue(),
            }),
            Match.objectLike({
              Action: [
                'cloudformation:DescribeStackDriftDetectionStatus',
                'cloudformation:ListStacks',
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

    it('should have a live alias', () => {
      template.hasResourceProperties('AWS::Lambda::Alias', {
        Name: 'live',
      });
    });

    it('should schedule daily detection with an empty tag filter', () => {
      template.hasResourceProperties('AWS::Events::Rule', Match.objectLike({
        ScheduleExpression: 'rate(1 day)',
        State: 'ENABLED',
        Targets: Match.arrayWith([
          Match.objectLike({
            Input: '{}',
          }),
        ]),
      }));
      template.resourceCountIs('AWS::Events::Rule', 1);
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
    new CloudformationStackDriftDetector(stack, 'Detector', {
      targetResource: {
        tagKey: 'DriftDetection',
        tagValues: ['enabled'],
      },
    });
    const template = Template.fromStack(stack);

    it('should pass tag key and values to the detector', () => {
      template.hasResourceProperties('AWS::Events::Rule', Match.objectLike({
        Targets: Match.arrayWith([
          Match.objectLike({
            Input: '{"tagKey":"DriftDetection","tagValues":["enabled"]}',
          }),
        ]),
      }));
    });
  });

  describe('with tag key only', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    new CloudformationStackDriftDetector(stack, 'Detector', {
      targetResource: {
        tagKey: 'DriftDetection',
      },
    });
    const template = Template.fromStack(stack);

    it('should pass only the tag key to the detector', () => {
      template.hasResourceProperties('AWS::Events::Rule', Match.objectLike({
        Targets: Match.arrayWith([
          Match.objectLike({
            Input: '{"tagKey":"DriftDetection"}',
          }),
        ]),
      }));
    });
  });

  describe('with existing notification topic', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const topic = sns.Topic.fromTopicArn(
      stack,
      'ExistingTopic',
      'arn:aws:sns:us-east-1:123456789012:existing-topic',
    );
    new CloudformationStackDriftDetector(stack, 'Detector', {
      notificationTopic: topic,
    });
    const template = Template.fromStack(stack);

    it('should not create an SNS topic', () => {
      template.resourceCountIs('AWS::SNS::Topic', 0);
    });

    it('should use the provided topic ARN', () => {
      template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
        Environment: Match.objectLike({
          Variables: Match.objectLike({
            NOTIFICATION_TOPIC_ARN: 'arn:aws:sns:us-east-1:123456789012:existing-topic',
          }),
        }),
      }));
    });
  });
});
