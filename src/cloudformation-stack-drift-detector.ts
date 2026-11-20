import { ArnFormat, Duration, Stack, TimeZone } from 'aws-cdk-lib';
import { ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { type IKey } from 'aws-cdk-lib/aws-kms';
import { Alias } from 'aws-cdk-lib/aws-lambda';
import { Schedule, ScheduleExpression, ScheduleTargetInput } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
import { type ITopic } from 'aws-cdk-lib/aws-sns';
import { ConstructResourceCriteria, ConstructResourceTagCriteria as TargetResource } from 'construct-resource-criteria';
import { Construct } from 'constructs';
import { DetectorFunction } from './funcs/detector-function';
import {
  DEFAULT_DETECTION_WAIT_INTERVAL_SECONDS,
  DEFAULT_EXECUTION_TIMEOUT_HOURS,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_MAX_STATUS_CHECKS,
  DETECTION_MAX_STATUS_CHECKS_ENV,
  DETECTION_WAIT_INTERVAL_SECONDS_ENV,
  STACK_DETECTION_MAX_CONCURRENCY_ENV,
} from './settings/consts';

/** Default maximum duration of a durable execution. */
const DEFAULT_EXECUTION_TIMEOUT = Duration.hours(DEFAULT_EXECUTION_TIMEOUT_HOURS);
/** Default retention for durable execution history after completion. */
const DEFAULT_RETENTION_PERIOD = Duration.days(30);
/** Invoke timeout for a single Lambda worker. */
const LAMBDA_INVOKE_TIMEOUT = Duration.minutes(15);
/** Minute field of the default daily cron. 09:12 UTC. */
const DEFAULT_SCHEDULE_MINUTE = '12';
/** Hour field of the default daily cron. 09:12 UTC. */
const DEFAULT_SCHEDULE_HOUR = '9';

/** AWS managed policy required for Lambda durable execution. */
const DURABLE_EXECUTION_POLICY_NAME = 'service-role/AWSLambdaBasicDurableExecutionRolePolicy';
/**
 * AWS managed policy that grants read access to resources inspected by DetectStackDrift.
 * Without resource Describe/Get permissions, drift detection often returns
 * `DETECTION_FAILED` or `NOT_CHECKED`.
 */
const READ_ONLY_ACCESS_POLICY_NAME = 'ReadOnlyAccess';

/**
 * Returns the wait interval in whole seconds.
 *
 * @param waitInterval - Interval between status checks after the first check.
 * @returns The interval in seconds.
 * @throws When `waitInterval` is shorter than 1 second or includes a fraction of a second.
 */
const assertWholeSeconds = (waitInterval: Duration): number => {
  const waitIntervalSeconds = waitInterval.toMilliseconds() / 1000;
  if (!Number.isInteger(waitIntervalSeconds) || waitIntervalSeconds < 1) {
    throw new Error('waitInterval must be a whole number of seconds greater than or equal to 1');
  }
  return waitIntervalSeconds;
};

/**
 * Rejects a count that is not an integer greater than or equal to 1.
 *
 * @param value - Prop value to check.
 * @param fieldName - Prop name included in the error.
 * @throws When `value` is not an integer greater than or equal to 1.
 */
const assertPositiveInteger = (value: number, fieldName: string): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${fieldName} must be an integer greater than or equal to 1`);
  }
};

/**
 * Uses the caller schedule when one is set, otherwise 09:12 UTC every day.
 * A provided schedule replaces the default, including its time zone.
 *
 * @param schedule - Caller cron expression, or undefined for the default.
 * @returns The schedule to create.
 * @throws When `schedule` is not a cron expression or does not name a time zone.
 */
const resolveSchedule = (schedule: ScheduleExpression | undefined): ScheduleExpression => {
  const selected = schedule ?? ScheduleExpression.cron({
    minute: DEFAULT_SCHEDULE_MINUTE,
    hour: DEFAULT_SCHEDULE_HOUR,
    timeZone: TimeZone.ETC_UTC,
  });
  if (!selected.expressionString.startsWith('cron(')) {
    throw new Error('schedule must be a cron expression');
  }

  const timeZoneName = selected.timeZone ? selected.timeZone.timezoneName.trim() : '';
  if (timeZoneName === '') {
    throw new Error('schedule must name a time zone');
  }

  return selected;
};

/**
 * Whether the detector EventBridge Scheduler schedule is enabled.
 */
export enum DetectionScheduleState {
  /**
   * EventBridge Scheduler runs the detector on the schedule.
   */
  ENABLED = 'ENABLED',
  /**
   * EventBridge Scheduler does not run the detector.
   */
  DISABLED = 'DISABLED',
}

/**
 * Properties for {@link CloudFormationStackDriftDetector}.
 */
export interface CloudFormationStackDriftDetectorProps {
  /**
   * SNS topic that receives drift and failure notifications.
   */
  readonly notificationTopic: ITopic;
  /**
   * Customer-managed KMS key that encrypts {@link CloudFormationStackDriftDetectorProps.notificationTopic}.
   *
   * `grantPublish` already grants KMS when the topic is a `sns.Topic` with `masterKey`.
   * Pass this for imported topics (`fromTopicArn`), where the encryption key is otherwise unknown.
   *
   * @default - no extra KMS grant; relies on `grantPublish` when the topic exposes a key
   */
  readonly notificationTopicKey?: IKey;
  /**
   * Tag criteria used to select target stacks.
   * When set, {@link TargetResource.tagKey} must be non-blank and
   * {@link TargetResource.tagValues} must contain at least one non-blank value.
   * Tagged stacks are limited to stable statuses: `CREATE_COMPLETE`,
   * `UPDATE_COMPLETE`, `UPDATE_ROLLBACK_COMPLETE`, `IMPORT_COMPLETE`, and
   * `IMPORT_ROLLBACK_COMPLETE`.
   * If omitted, every stable stack in the account and region is inspected.
   */
  readonly targetResource?: TargetResource;
  /**
   * Maximum duration of a durable execution.
   *
   * @default Duration.hours(12)
   */
  readonly executionTimeout?: Duration;
  /**
   * Seconds between drift detection status checks after the first check.
   * The first check runs immediately.
   *
   * @default Duration.seconds(30)
   */
  readonly waitInterval?: Duration;
  /**
   * Maximum DescribeStackDriftDetectionStatus calls for one stack, including the first check.
   * The stack fails when detection is still `DETECTION_IN_PROGRESS` after this many checks.
   *
   * @default 20
   */
  readonly maxStatusChecks?: number;
  /**
   * Maximum number of stacks detected at the same time.
   *
   * @default 5
   */
  readonly maxConcurrency?: number;
  /**
   * How long durable execution history is retained after completion.
   *
   * @default Duration.days(30)
   */
  readonly retentionPeriod?: Duration;
  /**
   * Cron schedule that starts a detection run.
   * When set, this expression replaces the default, including its time zone.
   * Rate expressions are rejected.
   *
   * @default 09:12 UTC every day (`cron(12 9 * * ? *)`)
   */
  readonly schedule?: ScheduleExpression;
  /**
   * Whether the EventBridge Scheduler schedule is enabled.
   *
   * @default {@link DetectionScheduleState.ENABLED}
   */
  readonly scheduleState?: DetectionScheduleState;
}

/**
 * CDK construct that runs CloudFormation stack drift detection on an EventBridge Scheduler
 * cron and publishes drifted stacks to SNS.
 * The default schedule is 09:12 UTC every day. Pass `schedule` to replace it.
 * The detector role includes the AWS managed ReadOnlyAccess policy so
 * DetectStackDrift can read resource configuration.
 *
 * Target stacks are selected by {@link TargetResource} when provided.
 * Tagged stacks are still limited to stable statuses. When the filter is omitted,
 * every stable stack in the account and region is inspected.
 */
export class CloudFormationStackDriftDetector extends Construct {
  /**
   * Creates the durable detector Lambda, IAM policies, and EventBridge Scheduler schedule.
   *
   * @param scope - Parent construct.
   * @param id - Construct id.
   * @param props - Notification topic, optional tag filter, and durable execution settings.
   */
  constructor(scope: Construct, id: string, props: CloudFormationStackDriftDetectorProps) {
    super(scope, id);

    if (props.targetResource) {
      ConstructResourceCriteria.assertTagCriteria(props.targetResource, {
        propPath: 'props.targetResource',
      });
    }

    const waitInterval = props.waitInterval ?? Duration.seconds(DEFAULT_DETECTION_WAIT_INTERVAL_SECONDS);
    const maxStatusChecks = props.maxStatusChecks ?? DEFAULT_MAX_STATUS_CHECKS;
    const maxConcurrency = props.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    const waitIntervalSeconds = assertWholeSeconds(waitInterval);
    assertPositiveInteger(maxStatusChecks, 'maxStatusChecks');
    assertPositiveInteger(maxConcurrency, 'maxConcurrency');

    const durableFunction = new DetectorFunction(this, 'Function', {
      environment: {
        NOTIFICATION_TOPIC_ARN: props.notificationTopic.topicArn,
        [DETECTION_WAIT_INTERVAL_SECONDS_ENV]: String(waitIntervalSeconds),
        [DETECTION_MAX_STATUS_CHECKS_ENV]: String(maxStatusChecks),
        [STACK_DETECTION_MAX_CONCURRENCY_ENV]: String(maxConcurrency),
      },
      durableConfig: {
        executionTimeout: props.executionTimeout ?? DEFAULT_EXECUTION_TIMEOUT,
        retentionPeriod: props.retentionPeriod ?? DEFAULT_RETENTION_PERIOD,
      },
      timeout: LAMBDA_INVOKE_TIMEOUT,
    });

    if (!durableFunction.role) {
      throw new Error('Detector Lambda must have an IAM role');
    }
    const role = durableFunction.role;

    role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(DURABLE_EXECUTION_POLICY_NAME),
    );
    role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(READ_ONLY_ACCESS_POLICY_NAME),
    );

    // DetectStackDrift internally calls DetectStackResourceDrift and, for registry
    // types, BatchDescribeTypeConfigurations. Missing these actions yields
    // DETECTION_FAILED or NOT_CHECKED even when DetectStackDrift itself is allowed.
    durableFunction.addToRolePolicy(new PolicyStatement({
      actions: [
        'cloudformation:DetectStackDrift',
        'cloudformation:DetectStackResourceDrift',
        'cloudformation:DescribeStackResourceDrifts',
      ],
      resources: this.getStackArns(),
    }));

    durableFunction.addToRolePolicy(new PolicyStatement({
      actions: [
        'cloudformation:DescribeStackDriftDetectionStatus',
        'cloudformation:ListStacks',
        'cloudformation:BatchDescribeTypeConfigurations',
      ],
      resources: ['*'],
    }));

    durableFunction.addToRolePolicy(new PolicyStatement({
      actions: [
        'tag:GetResources',
      ],
      resources: ['*'],
    }));

    props.notificationTopic.grantPublish(durableFunction);
    props.notificationTopicKey?.grantEncryptDecrypt(durableFunction);

    // Durable execution accepts a published alias as its invoke target.
    const live = new Alias(this, 'Live', {
      aliasName: 'live',
      version: durableFunction.currentVersion,
    });

    const scheduleState = props.scheduleState ?? DetectionScheduleState.ENABLED;
    new Schedule(this, 'Schedule', {
      schedule: resolveSchedule(props.schedule),
      enabled: scheduleState === DetectionScheduleState.ENABLED,
      target: new LambdaInvoke(live, {
        input: ScheduleTargetInput.fromObject(this.getEventInput(props.targetResource)),
      }),
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
   * Builds the Scheduler target payload passed to the detector Lambda.
   *
   * @param targetResource - Optional tag criteria. When omitted, an empty payload selects all stable stacks.
   * @returns Tag key and values for the Lambda event, or an empty object.
   */
  private getEventInput(targetResource?: TargetResource): { tagKey?: string; tagValues?: string[] } {
    if (!targetResource) {
      return {};
    }

    return {
      tagKey: targetResource.tagKey,
      tagValues: targetResource.tagValues,
    };
  }
}
