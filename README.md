# CloudFormation Stack Drift Detector (AWS CDK V2)

[![npm version](https://img.shields.io/npm/v/cloudformation-stack-drift-detector.svg)](https://www.npmjs.com/package/cloudformation-stack-drift-detector)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

AWS CDK construct that runs CloudFormation stack drift detection on a daily schedule and publishes drifted stacks to Amazon SNS.

## Features

- Daily EventBridge schedule (`rate(1 day)`) that invokes a durable Lambda alias
- Optional tag-based stack selection; omit the filter to inspect all stable stacks in the account and region
- Match a tag key with specific values, or any value when `tagValues` is omitted
- Sequential DetectStackDrift per stack, with status polling until detection completes
- SNS notifications when a stack is `DRIFTED`, including modified and deleted resource drifts
- Caller-provided SNS topic for notifications (the construct does not create a topic)
- Configurable durable execution timeout and history retention

## Installation

```bash
npm install cloudformation-stack-drift-detector
```

```bash
yarn add cloudformation-stack-drift-detector
```

`aws-cdk-lib` and `constructs` are peer dependencies and must be installed in your project.

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

## Options

These options apply to `CloudformationStackDriftDetector`.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `notificationTopic` | `sns.ITopic` | Yes | SNS topic that receives drift notifications. The construct does not create a topic. |
| `targetResource` | `TargetResource` | No | Tag filter used to select stacks. If omitted, all stable stacks in the account and region are inspected. |
| `executionTimeout` | `Duration` | No | Maximum duration of a durable execution (default: `Duration.hours(1)`). |
| `retentionPeriod` | `Duration` | No | How long durable execution history is retained after completion (default: `Duration.days(30)`). |

### TargetResource

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `tagKey` | `string` | Yes | Tag key used for stack discovery. |
| `tagValues` | `string[]` | No | Tag values to match. If omitted, any value for `tagKey` is accepted. |

## Requirements

- Node.js `>= 20.0.0`
- `aws-cdk-lib` `^2.232.0`
- `constructs` `^10.5.1`
- AWS – EventBridge; Lambda with Durable Execution (Node.js 22.x) and a `live` alias; CloudFormation (`DetectStackDrift`, `DescribeStackDriftDetectionStatus`, `DescribeStackResourceDrifts`, `ListStacks`); Resource Groups Tagging API (`tag:GetResources`); SNS

## License

This project is licensed under the Apache-2.0 License.
