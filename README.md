# CloudFormation Stack Drift Detector (CDK v2)

[![npm version](https://img.shields.io/npm/v/cloudformation-stack-drift-detector?style=flat-square)](https://www.npmjs.com/package/cloudformation-stack-drift-detector)
[![license](https://img.shields.io/npm/l/cloudformation-stack-drift-detector?style=flat-square)](https://www.npmjs.com/package/cloudformation-stack-drift-detector)
[![Node.js](https://img.shields.io/node/v/cloudformation-stack-drift-detector?style=flat-square)](https://www.npmjs.com/package/cloudformation-stack-drift-detector)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-aws-cdk-constructs/cloudformation-stack-drift-detector/build.yml?label=build&style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/cloudformation-stack-drift-detector/actions/workflows/build.yml)

[![View on Construct Hub](https://constructs.dev/badge?package=cloudformation-stack-drift-detector)](https://constructs.dev/packages/cloudformation-stack-drift-detector)

AWS CDK construct that runs CloudFormation stack drift detection on a daily schedule and publishes drifted stacks to Amazon SNS.

## Features

- Daily EventBridge schedule that invokes a durable Lambda alias
- Optional tag-based selection of stable stacks, or inspect all stable stacks in the account and region
- SNS notifications when a stack is `DRIFTED`, including modified and deleted resource drifts
- Per-stack failure isolation: a failed stack is published to the same SNS topic, remaining stacks are still inspected, and the invocation returns succeeded and failed counts
- Caller-provided SNS topic (the construct does not create a topic)
- Configurable durable execution timeout and history retention
- Optional resource read grants so DetectStackDrift can describe resources in target stacks
- Optional KMS key grant when publishing to an encrypted SNS topic
- `CloudFormationStackDriftDetectorStack`, a stack that deploys the detector

## How it works

A daily EventBridge rule invokes the detector Lambda `live` alias. The function selects stable CloudFormation stacks by tag, or every stable stack in the account and region when no tag is set. Stacks outside `CREATE_COMPLETE`, `UPDATE_COMPLETE`, `UPDATE_ROLLBACK_COMPLETE`, `IMPORT_COMPLETE`, and `IMPORT_ROLLBACK_COMPLETE` are skipped, including stacks that are creating, updating, or deleting. DetectStackDrift does not run for a skipped stack, and no notification is published for it. The function runs DetectStackDrift on each selected stack, waits until detection finishes, and publishes drifted resource details to the caller-provided SNS topic. If detection fails for one stack, the function publishes a failure notification to the same topic and continues with the remaining stacks. The invocation result reports how many stacks succeeded and how many failed.

DetectStackDrift also reads the live configuration of resources in those stacks. Grant those Describe/Get permissions through `grantReadOnlyAccess`, `additionalPolicyStatements`, or the public `role`.

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

Inspect every stable CloudFormation stack in the account and region. Provide an SNS topic for drift notifications:

```typescript
import { Stack } from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { CloudFormationStackDriftDetector } from 'cloudformation-stack-drift-detector';

export class DetectorStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const topic = new sns.Topic(this, 'DriftNotifications');

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
import * as sns from 'aws-cdk-lib/aws-sns';

const topic = sns.Topic.fromTopicArn(
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
  executionTimeout: Duration.hours(2),
  retentionPeriod: Duration.days(14),
});
```

### Grant resource read permissions for drift detection

DetectStackDrift also needs Describe/Get on resources inside the target stacks. Without those permissions, detection often finishes as `DETECTION_FAILED` or `NOT_CHECKED`. Attach AWS managed `ReadOnlyAccess`, pass least-privilege statements, or grant on the exposed role:

```typescript
import { ReadOnlyAccessGrant } from 'cloudformation-stack-drift-detector';

new CloudFormationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
  grantReadOnlyAccess: ReadOnlyAccessGrant.ENABLED,
});
```

```typescript
import * as iam from 'aws-cdk-lib/aws-iam';

const detector = new CloudFormationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
  additionalPolicyStatements: [
    new iam.PolicyStatement({
      actions: ['s3:GetBucket*', 'ec2:Describe*'],
      resources: ['*'],
    }),
  ],
});

detector.role.addManagedPolicy(
  iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
);
```

### Publish to a KMS-encrypted imported SNS topic

When the topic is imported with `fromTopicArn`, `grantPublish` cannot see the encryption key. Pass `notificationTopicKey` so the detector can call `kms:GenerateDataKey` and `kms:Decrypt`:

```typescript
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';

const topic = sns.Topic.fromTopicArn(
  this,
  'ExistingTopic',
  'arn:aws:sns:us-east-1:123456789012:drift-notifications',
);
const topicKey = kms.Key.fromKeyArn(
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
import * as sns from 'aws-cdk-lib/aws-sns';
import { CloudFormationStackDriftDetectorStack } from 'cloudformation-stack-drift-detector';

const app = new App();
const topicStack = new Stack(app, 'TopicStack');
const topic = new sns.Topic(topicStack, 'DriftNotifications');

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
| `executionTimeout` | `Duration` | No | Maximum duration of a durable execution (default: `Duration.hours(1)`). |
| `retentionPeriod` | `Duration` | No | How long durable execution history is retained after completion (default: `Duration.days(30)`). |
| `additionalPolicyStatements` | `iam.PolicyStatement[]` | No | Extra IAM statements attached to the detector Lambda role (for example resource Describe/Get). |
| `grantReadOnlyAccess` | `ReadOnlyAccessGrant` | No | Attach AWS managed `ReadOnlyAccess` when set to `ReadOnlyAccessGrant.ENABLED` (default: `ReadOnlyAccessGrant.DISABLED`). |

### ReadOnlyAccessGrant

| Value | Description |
|-------|-------------|
| `ENABLED` | Attach AWS managed `ReadOnlyAccess`. |
| `DISABLED` | Do not attach `ReadOnlyAccess`. |

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

## License

This project is licensed under the Apache-2.0 License.
