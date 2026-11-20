# CloudFormation Stack Drift Detector (CDK v2)

[![npm version](https://img.shields.io/npm/v/cloudformation-stack-drift-detector?style=flat-square)](https://www.npmjs.com/package/cloudformation-stack-drift-detector)
[![license](https://img.shields.io/npm/l/cloudformation-stack-drift-detector?style=flat-square)](https://www.npmjs.com/package/cloudformation-stack-drift-detector)
[![Node.js](https://img.shields.io/node/v/cloudformation-stack-drift-detector?style=flat-square)](https://www.npmjs.com/package/cloudformation-stack-drift-detector)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-aws-cdk-constructs/cloudformation-stack-drift-detector/build.yml?label=build&style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/cloudformation-stack-drift-detector/actions/workflows/build.yml)

[![View on Construct Hub](https://constructs.dev/badge?package=cloudformation-stack-drift-detector)](https://constructs.dev/packages/cloudformation-stack-drift-detector)

AWS CDK construct that runs CloudFormation stack drift detection every day at 09:12 UTC and publishes drifted stacks to Amazon SNS.

## Features

- EventBridge Scheduler cron. The default is 09:12 UTC every day, and another cron expression replaces it
- Optional tag-based selection of stable stacks, or inspect all stable stacks in the account and region
- SNS notifications when a stack is `DRIFTED`, including modified and deleted resource drifts
- Per-stack failure isolation: a failed stack is published to the same SNS topic and the remaining stacks are still inspected. If any stack fails, the invocation throws after the run and names the failed stacks
- Caller-provided SNS topic (the construct does not create a topic)
- Configurable status-check interval, per-stack check limit, concurrency, durable execution timeout, and history retention
- AWS managed `ReadOnlyAccess` on the detector role so DetectStackDrift can describe resources in target stacks
- Optional KMS key grant when publishing to an encrypted SNS topic
- `CloudFormationStackDriftDetectorStack`, a stack that deploys the detector

## How it works

An EventBridge Scheduler schedule invokes the detector Lambda through its published `live` alias. Durable execution uses that alias as the invoke target. The default is `cron(12 9 * * ? *)` at 09:12 UTC, and the schedule is enabled. Pass `schedule` to replace that cron, including its time zone. Pass `scheduleState` to disable the schedule. The function selects stable CloudFormation stacks by tag, or every stable stack in the account and region when no tag is set. Stacks outside `CREATE_COMPLETE`, `UPDATE_COMPLETE`, `UPDATE_ROLLBACK_COMPLETE`, `IMPORT_COMPLETE`, and `IMPORT_ROLLBACK_COMPLETE` are skipped, including stacks that are creating, updating, or deleting. DetectStackDrift does not run for a skipped stack, and no notification is published for it.

The function runs DetectStackDrift on the selected stacks, up to `maxConcurrency` stacks at a time. For each stack it reads the detection status immediately, then waits `waitInterval` between later checks while the status is `DETECTION_IN_PROGRESS`, and stops that stack after `maxStatusChecks` checks. Drifted stacks publish modified and deleted resource details to the caller-provided SNS topic. If detection fails for one stack, the function publishes a failure notification to the same topic and continues with the remaining stacks. When any stack fails, the invocation throws after the run and names the failed stacks. A run where every stack succeeds returns succeeded and failed counts, with failed equal to 0.

| Limit | Default | Prop |
|-------|---------|------|
| First status check | no wait | not configurable via props today |
| Later status checks | every 30 seconds | `waitInterval` |
| Status checks per stack | 20, including the first | `maxStatusChecks` |
| Stacks detected at once | 5 | `maxConcurrency` |
| Lambda invocation timeout | 15 minutes | not configurable via props today |
| Durable execution timeout | 12 hours | `executionTimeout` |
| Durable history retention | 30 days | `retentionPeriod` |

The detector role includes the AWS managed `ReadOnlyAccess` policy. DetectStackDrift uses it to read the live configuration of resources in those stacks.

## Installation

### npm

```bash
npm install cloudformation-stack-drift-detector
```

### yarn

```bash
yarn add cloudformation-stack-drift-detector
```

### pnpm

```bash
pnpm add cloudformation-stack-drift-detector
```

## Usage

### Minimal deployable app

Use `CloudFormationStackDriftDetectorStack` when you want a dedicated stack you can deploy as-is. The app also creates the notification topic.

```typescript
import { App, Stack } from 'aws-cdk-lib';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { CloudFormationStackDriftDetectorStack } from 'cloudformation-stack-drift-detector';

const app = new App();

const topicStack = new Stack(app, 'TopicStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
const topic = new Topic(topicStack, 'DriftNotifications');

new CloudFormationStackDriftDetectorStack(app, 'DetectorStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  notificationTopic: topic,
});

app.synth();
```

Deploy checklist:

1. Install this package and its peers (`aws-cdk-lib`, `constructs`, `construct-resource-criteria`, `lambda-failure-detector`) in your CDK app.
2. The example creates the notification topic. Detection covers the stable stacks in that account and region. No extra secret is required.
3. From the CDK app: `npx cdk deploy TopicStack DetectorStack`

### Add the detector to an existing stack

Inspect every stable CloudFormation stack in the account and region. Provide an SNS topic for drift notifications:

```typescript
import { Stack } from 'aws-cdk-lib';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { CloudFormationStackDriftDetector } from 'cloudformation-stack-drift-detector';

export class DetectorStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const topic = new Topic(this, 'DriftNotifications');

    new CloudFormationStackDriftDetector(this, 'Detector', {
      notificationTopic: topic,
    });
  }
}
```

### Select stacks by tag

Pass `targetResource` to discover stacks through the Resource Groups Tagging API. `tagKey` and at least one `tagValues` entry are required. Only tagged stacks in a stable status are inspected:

```typescript
new CloudFormationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
  targetResource: {
    tagKey: 'DriftDetection',
    tagValues: ['enabled'],
  },
});
```

### Use an existing SNS topic

```typescript
import { Topic } from 'aws-cdk-lib/aws-sns';

const topic = Topic.fromTopicArn(
  this,
  'ExistingTopic',
  'arn:aws:sns:us-east-1:123456789012:drift-notifications',
);

new CloudFormationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
});
```

### Durable execution settings

```typescript
import { Duration } from 'aws-cdk-lib';

new CloudFormationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
  executionTimeout: Duration.hours(6),
  retentionPeriod: Duration.days(14),
  waitInterval: Duration.seconds(20),
  maxStatusChecks: 40,
  maxConcurrency: 10,
});
```

### Replace the schedule

The default runs every day at 09:12 UTC. Pass `schedule` to replace that expression and its time zone. Rate expressions are rejected.

```typescript
import { TimeZone } from 'aws-cdk-lib';
import { ScheduleExpression } from 'aws-cdk-lib/aws-scheduler';
import { DetectionScheduleState } from 'cloudformation-stack-drift-detector';

new CloudFormationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
  schedule: ScheduleExpression.cron({
    minute: '0',
    hour: '9',
    weekDay: 'MON',
    timeZone: TimeZone.ASIA_TOKYO,
  }),
  scheduleState: DetectionScheduleState.ENABLED,
});
```

### Alarm on detector failures

Failure alarms are off until `failureDetection.enabled` is true. The construct then creates a one-year log group and CloudWatch alarms for Lambda errors and for the `DriftDetectionFailed` log line. Pass an existing topic when those alarms should notify. The construct does not create that topic.

```typescript
import { CloudFormationStackDriftDetector } from 'cloudformation-stack-drift-detector';

new CloudFormationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
  failureDetection: {
    enabled: true,
    alarm: {
      topic: alarmTopic,
    },
  },
});
```

### Publish to a KMS-encrypted imported SNS topic

When the topic is imported with `fromTopicArn`, `grantPublish` cannot see the encryption key. Pass `notificationTopicKey` so the detector can call `kms:GenerateDataKey` and `kms:Decrypt`:

```typescript
import { Key } from 'aws-cdk-lib/aws-kms';
import { Topic } from 'aws-cdk-lib/aws-sns';

const topic = Topic.fromTopicArn(
  this,
  'ExistingTopic',
  'arn:aws:sns:us-east-1:123456789012:drift-notifications',
);
const topicKey = Key.fromKeyArn(
  this,
  'TopicKey',
  'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
);

new CloudFormationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
  notificationTopicKey: topicKey,
});
```

### Use the included stack

`CloudFormationStackDriftDetectorStack` deploys the same detector. Pass the notification topic from another stack, and any other detector option:

```typescript
import { App, Stack } from 'aws-cdk-lib';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { CloudFormationStackDriftDetectorStack } from 'cloudformation-stack-drift-detector';

const app = new App();
const topicStack = new Stack(app, 'TopicStack');
const topic = new Topic(topicStack, 'DriftNotifications');

new CloudFormationStackDriftDetectorStack(app, 'DetectorStack', {
  notificationTopic: topic,
});
```

## Options

These options apply to `CloudFormationStackDriftDetector` and `CloudFormationStackDriftDetectorStack`. The stack also accepts standard `StackProps`.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `notificationTopic` | `sns.ITopic` | Yes | SNS topic that receives drift and failure notifications. The construct does not create a topic. |
| `notificationTopicKey` | `kms.IKey` | No | Customer-managed KMS key that encrypts `notificationTopic`. Use with imported topics, where `grantPublish` cannot grant KMS. |
| `targetResource` | `TargetResource` | No | Tag criteria used to select stacks. Requires a non-blank `tagKey` and at least one `tagValues` entry. Tagged stacks must also be in a stable status. If omitted, all stable stacks in the account and region are inspected. |
| `executionTimeout` | `Duration` | No | Maximum duration of a durable execution (default: `Duration.hours(12)`). |
| `waitInterval` | `Duration` | No | Seconds between status checks after the first check. The first check runs immediately (default: `Duration.seconds(30)`). |
| `maxStatusChecks` | `number` | No | Maximum status checks for one stack, including the first. The stack fails if detection is still `DETECTION_IN_PROGRESS` after this many checks (default: `20`). |
| `maxConcurrency` | `number` | No | Maximum number of stacks detected at the same time (default: `5`). |
| `retentionPeriod` | `Duration` | No | How long durable execution history is retained after completion (default: `Duration.days(30)`). |
| `schedule` | `ScheduleExpression` | No | Cron that replaces the default, including its time zone. Rate expressions are rejected (default: 09:12 UTC every day, `cron(12 9 * * ? *)`). |
| `scheduleState` | `DetectionScheduleState` | No | Whether the EventBridge Scheduler schedule is enabled (default: `DetectionScheduleState.ENABLED`). |
| `failureDetection` | `CloudFormationStackDriftDetectorFailureDetectionProps` | No | Opt-in CloudWatch alarms for detector failures. Alarms are created only when `enabled` is true. |

### CloudFormationStackDriftDetectorFailureDetectionProps

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `enabled` | `boolean` | No | Create the detector log group and failure alarms when true (default: `false`). |
| `alarm` | `CloudFormationStackDriftDetectorFailureAlarmProps` | No | Optional alarm notification settings. `alarm.topic` is an existing SNS topic. When omitted, the alarms have no SNS action. |

### DetectionScheduleState

| Value | Description |
|-------|-------------|
| `ENABLED` | EventBridge Scheduler runs the detector on the schedule. |
| `DISABLED` | EventBridge Scheduler does not run the detector. |

### TargetResource

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `tagKey` | `string` | Yes | Tag key used for stack discovery. Blank strings are rejected. |
| `tagValues` | `string[]` | Yes | Tag values to match. At least one non-blank value is required. |

## API

See [API.md](./API.md).

## Requirements

- Node.js `>= 20.0.0`
- `aws-cdk-lib` `^2.232.0`
- `constructs` `^10.5.1`
- `construct-resource-criteria` `^0.1.5`
- `lambda-failure-detector` `^0.3.1`

## Troubleshooting

A stack failure notification says detection timed out, and the invocation then fails:

- The SNS `reason` includes the stack name, the last status, how many checks ran, and `maxStatusChecks`. Raise `maxStatusChecks` or `waitInterval` when the status is still `DETECTION_IN_PROGRESS`.
- The invocation error lists failed stack names up to a cap. The function log `DriftDetectionFailed` includes those names in `stackNames` and the error message.

The durable execution reaches `executionTimeout` before every stack is checked:

- Raise `executionTimeout`, raise `maxConcurrency`, or set `targetResource` so fewer stacks are inspected. Time spent in durable waits is not part of the 15 minute Lambda invocation timeout.

## License

This project is licensed under the Apache-2.0 License.
