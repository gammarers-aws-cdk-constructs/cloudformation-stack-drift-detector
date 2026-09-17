import { ArnFormat, Duration, Stack } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { DetectorFunction } from './funcs/detector-function';

/** AWS managed policy required for Lambda durable execution. */
const DURABLE_EXECUTION_POLICY_NAME = 'service-role/AWSLambdaBasicDurableExecutionRolePolicy';
/**
 * AWS managed policy that grants read access to resources inspected by DetectStackDrift.
 * Without resource Describe/Get permissions, drift detection often returns
 * `DETECTION_FAILED` or `NOT_CHECKED`.
 */
const READ_ONLY_ACCESS_POLICY_NAME = 'ReadOnlyAccess';

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
   * SNS topic used to notify when a stack has drifted.
   */
  readonly notificationTopic: sns.ITopic;
  /**
   * Customer-managed KMS key that encrypts {@link CloudformationStackDriftDetectorProps.notificationTopic}.
   *
   * `grantPublish` already grants KMS when the topic is a `sns.Topic` with `masterKey`.
   * Pass this for imported topics (`fromTopicArn`), where the encryption key is otherwise unknown.
   *
   * @default - no extra KMS grant; relies on `grantPublish` when the topic exposes a key
   */
  readonly notificationTopicKey?: kms.IKey;
  /**
   * Tag filter used to select target stacks.
   * If omitted, all stacks in the account and region are inspected.
   */
  readonly targetResource?: TargetResource;
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
  /**
   * Extra IAM statements attached to the detector Lambda role.
   * Use this to grant Describe/Get permissions for resources in target stacks
   * (for example `s3:GetBucket*` or `ec2:Describe*`).
   *
   * @default - no extra inline statements
   */
  readonly additionalPolicyStatements?: iam.PolicyStatement[];
  /**
   * When true, attach the AWS managed `ReadOnlyAccess` policy so DetectStackDrift
   * can describe resources in target stacks.
   *
   * @default false
   */
  readonly grantReadOnlyAccess?: boolean;
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
   * IAM role used by the detector Lambda.
   * Attach extra Describe/Get permissions for resources in target stacks when
   * {@link CloudformationStackDriftDetectorProps.grantReadOnlyAccess} is not enough.
   */
  readonly role: iam.IRole;

  /**
   * Creates the durable detector Lambda, IAM policies, and daily EventBridge rule.
   *
   * @param scope - Parent construct.
   * @param id - Construct id.
   * @param props - Notification topic, IAM grants, optional tag filter, and durable execution settings.
   */
  constructor(scope: Construct, id: string, props: CloudformationStackDriftDetectorProps) {
    super(scope, id);

    this.notificationTopic = props.notificationTopic;

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

    if (!durableFunction.role) {
      throw new Error('Detector Lambda must have an IAM role');
    }
    this.role = durableFunction.role;

    this.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(DURABLE_EXECUTION_POLICY_NAME),
    );

    if (props.grantReadOnlyAccess) {
      this.role.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName(READ_ONLY_ACCESS_POLICY_NAME),
      );
    }

    // DetectStackDrift internally calls DetectStackResourceDrift and, for registry
    // types, BatchDescribeTypeConfigurations. Missing these actions yields
    // DETECTION_FAILED or NOT_CHECKED even when DetectStackDrift itself is allowed.
    durableFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudformation:DetectStackDrift',
        'cloudformation:DetectStackResourceDrift',
        'cloudformation:DescribeStackResourceDrifts',
      ],
      resources: this.getStackArns(),
    }));

    durableFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudformation:DescribeStackDriftDetectionStatus',
        'cloudformation:ListStacks',
        'cloudformation:BatchDescribeTypeConfigurations',
      ],
      resources: ['*'],
    }));

    durableFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'tag:GetResources',
      ],
      resources: ['*'],
    }));

    for (const statement of props.additionalPolicyStatements ?? []) {
      durableFunction.addToRolePolicy(statement);
    }

    this.notificationTopic.grantPublish(durableFunction);
    props.notificationTopicKey?.grantEncryptDecrypt(durableFunction);

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
