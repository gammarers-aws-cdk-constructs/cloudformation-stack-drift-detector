import { ArnFormat, Duration, Stack } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { DetectorFunction } from './funcs/detector-function';

/**
 * Tag filter used to select CloudFormation stacks for drift detection.
 * When `tagValues` is omitted, all stacks that have `tagKey` are selected.
 */
export interface TargetResource {
  /**
   * Tag key used for stack discovery.
   */
  readonly tagKey: string;
  /**
   * Tag values to match. If omitted, any value for {@link TargetResource.tagKey} is accepted.
   */
  readonly tagValues?: string[];
}

/**
 * Properties for {@link CloudformationStackDriftDetector}.
 */
export interface CloudformationStackDriftDetectorProps {
  /**
   * Tag filter used to select target stacks.
   * If omitted, all stacks in the account and region are inspected.
   */
  readonly targetResource?: TargetResource;
  /**
   * SNS topic used to notify when a stack has drifted.
   *
   * @default - a new topic is created
   */
  readonly notificationTopic?: sns.ITopic;
  /**
   * Maximum duration of a durable execution.
   *
   * @default Duration.hours(1)
   */
  readonly executionTimeout?: Duration;
  /**
   * How long durable execution history is retained after completion.
   *
   * @default Duration.days(30)
   */
  readonly retentionPeriod?: Duration;
}

/**
 * CDK construct that runs CloudFormation stack drift detection daily and publishes
 * drifted stacks to SNS.
 *
 * Target stacks are selected by {@link TargetResource} when provided. When omitted,
 * every stable stack in the account and region is inspected.
 */
export class CloudformationStackDriftDetector extends Construct {
  /**
   * SNS topic that receives drift notifications.
   */
  readonly notificationTopic: sns.ITopic;

  /**
   * Creates the durable detector Lambda, IAM policies, SNS topic, and daily EventBridge rule.
   *
   * @param scope - Parent construct.
   * @param id - Construct id.
   * @param props - Optional tag filter, notification topic, and durable execution settings.
   */
  constructor(scope: Construct, id: string, props: CloudformationStackDriftDetectorProps = {}) {
    super(scope, id);

    this.notificationTopic = props.notificationTopic ?? new sns.Topic(this, 'NotificationTopic');

    const durableFunction = new DetectorFunction(this, 'Function', {
      environment: {
        NOTIFICATION_TOPIC_ARN: this.notificationTopic.topicArn,
      },
      durableConfig: {
        executionTimeout: props.executionTimeout ?? Duration.hours(1),
        retentionPeriod: props.retentionPeriod ?? Duration.days(30),
      },
      timeout: Duration.minutes(15),
    });

    durableFunction.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicDurableExecutionRolePolicy'),
    );

    durableFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudformation:DetectStackDrift',
        'cloudformation:DescribeStackResourceDrifts',
      ],
      resources: this.getStackArns(),
    }));

    durableFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudformation:DescribeStackDriftDetectionStatus',
        'cloudformation:ListStacks',
      ],
      resources: ['*'],
    }));

    durableFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'tag:GetResources',
      ],
      resources: ['*'],
    }));

    this.notificationTopic.grantPublish(durableFunction);

    const alias = new lambda.Alias(this, 'Live', {
      aliasName: 'live',
      version: durableFunction.currentVersion,
    });

    new events.Rule(this, 'Schedule', {
      schedule: events.Schedule.rate(Duration.days(1)),
      targets: [
        new targets.LambdaFunction(alias, {
          event: events.RuleTargetInput.fromObject(this.getEventInput(props.targetResource)),
        }),
      ],
    });
  }

  /**
   * Returns the CloudFormation stack ARN pattern used for drift-detection IAM grants.
   *
   * @returns A single ARN that matches all stacks in the current account and region.
   */
  private getStackArns(): string[] {
    const stack = Stack.of(this);
    return [
      stack.formatArn({
        service: 'cloudformation',
        resource: 'stack',
        resourceName: '*/*',
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      }),
    ];
  }

  /**
   * Builds the EventBridge target payload passed to the detector Lambda.
   *
   * @param targetResource - Optional tag filter. When omitted, an empty payload selects all stacks.
   * @returns Tag key and values for the Lambda event, or an empty object.
   */
  private getEventInput(targetResource?: TargetResource): { tagKey?: string; tagValues?: string[] } {
    if (!targetResource) {
      return {};
    }
    if (targetResource.tagValues && targetResource.tagValues.length > 0) {
      return {
        tagKey: targetResource.tagKey,
        tagValues: targetResource.tagValues,
      };
    }
    return {
      tagKey: targetResource.tagKey,
    };
  }
}
