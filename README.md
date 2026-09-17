# CloudFormation Stack Drift Detector (CDK v2)

[![npm version](https://img.shields.io/npm/v/cloudformation-stack-drift-detector?style=flat-square)](https://www.npmjs.com/package/cloudformation-stack-drift-detector)
[![license](https://img.shields.io/npm/l/cloudformation-stack-drift-detector?style=flat-square)](https://www.npmjs.com/package/cloudformation-stack-drift-detector)
[![Node.js](https://img.shields.io/node/v/cloudformation-stack-drift-detector?style=flat-square)](https://www.npmjs.com/package/cloudformation-stack-drift-detector)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-aws-cdk-constructs/cloudformation-stack-drift-detector/build.yml?branch=main&label=build&style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/cloudformation-stack-drift-detector/actions/workflows/build.yml)

[![View on Construct Hub](https://constructs.dev/badge?package=cloudformation-stack-drift-detector)](https://constructs.dev/packages/cloudformation-stack-drift-detector)

AWS CDK construct that runs CloudFormation stack drift detection on a daily schedule and publishes drifted stacks to Amazon SNS.

## Features

- Daily EventBridge schedule that invokes a durable Lambda alias
- Optional tag-based stack selection, or inspect all stable stacks in the account and region
- SNS notifications when a stack is `DRIFTED`, including modified and deleted resource drifts
- Caller-provided SNS topic (the construct does not create a topic)
- Configurable durable execution timeout and history retention
- Optional resource read grants so DetectStackDrift can describe resources in target stacks
- Optional KMS key grant when publishing to an encrypted SNS topic

## How it works

A daily EventBridge rule invokes the detector Lambda `live` alias. The function selects stable CloudFormation stacks (by tag, or every stack in the account and region), runs DetectStackDrift on each stack, waits until detection finishes, and publishes drifted resource details to the caller-provided SNS topic.

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
import { CloudformationStackDriftDetector } from 'cloudformation-stack-drift-detector';

export class DetectorStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const topic = new sns.Topic(this, 'DriftNotifications');

    new CloudformationStackDriftDetector(this, 'Detector', {
      notificationTopic: topic,
    });
  }
}
```

### Select stacks by tag

Pass `targetResource` to discover stacks through the Resource Groups Tagging API:

```typescript
new CloudformationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
  targetResource: {
    tagKey: 'DriftDetection',
    tagValues: ['enabled'],
  },
});
```

Omit `tagValues` to select every stack that has the tag key, regardless of value:

```typescript
new CloudformationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
  targetResource: {
    tagKey: 'DriftDetection',
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

new CloudformationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
});
```

### Durable execution settings

```typescript
import { Duration } from 'aws-cdk-lib';

new CloudformationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
  executionTimeout: Duration.hours(2),
  retentionPeriod: Duration.days(14),
});
```

### Grant resource read permissions for drift detection

DetectStackDrift also needs Describe/Get on resources inside the target stacks. Without those permissions, detection often finishes as `DETECTION_FAILED` or `NOT_CHECKED`. Attach AWS managed `ReadOnlyAccess`, pass least-privilege statements, or grant on the exposed role:

```typescript
new CloudformationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
  grantReadOnlyAccess: true,
});
```

```typescript
import * as iam from 'aws-cdk-lib/aws-iam';

const detector = new CloudformationStackDriftDetector(this, 'Detector', {
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

new CloudformationStackDriftDetector(this, 'Detector', {
  notificationTopic: topic,
  notificationTopicKey: topicKey,
});
```

## Options

These options apply to `CloudformationStackDriftDetector`.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `notificationTopic` | `sns.ITopic` | Yes | SNS topic that receives drift notifications. The construct does not create a topic. |
| `notificationTopicKey` | `kms.IKey` | No | Customer-managed KMS key that encrypts `notificationTopic`. Use with imported topics, where `grantPublish` cannot grant KMS. |
| `targetResource` | `TargetResource` | No | Tag filter used to select stacks. If omitted, all stable stacks in the account and region are inspected. |
| `executionTimeout` | `Duration` | No | Maximum duration of a durable execution (default: `Duration.hours(1)`). |
| `retentionPeriod` | `Duration` | No | How long durable execution history is retained after completion (default: `Duration.days(30)`). |
| `additionalPolicyStatements` | `iam.PolicyStatement[]` | No | Extra IAM statements attached to the detector Lambda role (for example resource Describe/Get). |
| `grantReadOnlyAccess` | `boolean` | No | When `true`, attach AWS managed `ReadOnlyAccess` so DetectStackDrift can describe resources (default: `false`). |

### TargetResource

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `tagKey` | `string` | Yes | Tag key used for stack discovery. |
| `tagValues` | `string[]` | No | Tag values to match. If omitted, any value for `tagKey` is accepted. |

## API

See [API.md](./API.md).

## Requirements

- Node.js `>= 20.0.0`
- `aws-cdk-lib` `^2.232.0`
- `constructs` `^10.5.1`

## License

This project is licensed under the Apache-2.0 License.
