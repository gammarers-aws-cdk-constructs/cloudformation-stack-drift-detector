# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### CloudformationStackDriftDetector <a name="CloudformationStackDriftDetector" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector"></a>

CDK construct that runs CloudFormation stack drift detection daily and publishes drifted stacks to SNS.

Target stacks are selected by {@link TargetResource} when provided. When omitted,
every stable stack in the account and region is inspected.

#### Initializers <a name="Initializers" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector.Initializer"></a>

```typescript
import { CloudformationStackDriftDetector } from 'cloudformation-stack-drift-detector'

new CloudformationStackDriftDetector(scope: Construct, id: string, props: CloudformationStackDriftDetectorProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetector.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | - Parent construct. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetector.Initializer.parameter.id">id</a></code> | <code>string</code> | - Construct id. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetector.Initializer.parameter.props">props</a></code> | <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps">CloudformationStackDriftDetectorProps</a></code> | - Notification topic, optional tag filter, and durable execution settings. |

---

##### `scope`<sup>Required</sup> <a name="scope" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

Parent construct.

---

##### `id`<sup>Required</sup> <a name="id" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector.Initializer.parameter.id"></a>

- *Type:* string

Construct id.

---

##### `props`<sup>Required</sup> <a name="props" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector.Initializer.parameter.props"></a>

- *Type:* <a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps">CloudformationStackDriftDetectorProps</a>

Notification topic, optional tag filter, and durable execution settings.

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetector.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetector.with">with</a></code> | Applies one or more mixins to this construct. |

---

##### `toString` <a name="toString" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `with` <a name="with" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector.with"></a>

```typescript
public with(mixins: ...IMixin[]): IConstruct
```

Applies one or more mixins to this construct.

Mixins are applied in order. The list of constructs is captured at the
start of the call, so constructs added by a mixin will not be visited.
Use multiple `with()` calls if subsequent mixins should apply to added
constructs.

###### `mixins`<sup>Required</sup> <a name="mixins" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector.with.parameter.mixins"></a>

- *Type:* ...constructs.IMixin[]

The mixins to apply.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetector.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### `isConstruct` <a name="isConstruct" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector.isConstruct"></a>

```typescript
import { CloudformationStackDriftDetector } from 'cloudformation-stack-drift-detector'

CloudformationStackDriftDetector.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetector.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetector.property.notificationTopic">notificationTopic</a></code> | <code>aws-cdk-lib.aws_sns.ITopic</code> | SNS topic that receives drift notifications. |

---

##### `node`<sup>Required</sup> <a name="node" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `notificationTopic`<sup>Required</sup> <a name="notificationTopic" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector.property.notificationTopic"></a>

```typescript
public readonly notificationTopic: ITopic;
```

- *Type:* aws-cdk-lib.aws_sns.ITopic

SNS topic that receives drift notifications.

---


## Structs <a name="Structs" id="Structs"></a>

### CloudformationStackDriftDetectorProps <a name="CloudformationStackDriftDetectorProps" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps"></a>

Properties for {@link CloudformationStackDriftDetector}.

#### Initializer <a name="Initializer" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.Initializer"></a>

```typescript
import { CloudformationStackDriftDetectorProps } from 'cloudformation-stack-drift-detector'

const cloudformationStackDriftDetectorProps: CloudformationStackDriftDetectorProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.notificationTopic">notificationTopic</a></code> | <code>aws-cdk-lib.aws_sns.ITopic</code> | SNS topic used to notify when a stack has drifted. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.executionTimeout">executionTimeout</a></code> | <code>aws-cdk-lib.Duration</code> | Maximum duration of a durable execution. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.retentionPeriod">retentionPeriod</a></code> | <code>aws-cdk-lib.Duration</code> | How long durable execution history is retained after completion. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.targetResource">targetResource</a></code> | <code><a href="#cloudformation-stack-drift-detector.TargetResource">TargetResource</a></code> | Tag filter used to select target stacks. |

---

##### `notificationTopic`<sup>Required</sup> <a name="notificationTopic" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.notificationTopic"></a>

```typescript
public readonly notificationTopic: ITopic;
```

- *Type:* aws-cdk-lib.aws_sns.ITopic

SNS topic used to notify when a stack has drifted.

---

##### `executionTimeout`<sup>Optional</sup> <a name="executionTimeout" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.executionTimeout"></a>

```typescript
public readonly executionTimeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.hours(1)

Maximum duration of a durable execution.

---

##### `retentionPeriod`<sup>Optional</sup> <a name="retentionPeriod" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.retentionPeriod"></a>

```typescript
public readonly retentionPeriod: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.days(30)

How long durable execution history is retained after completion.

---

##### `targetResource`<sup>Optional</sup> <a name="targetResource" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.targetResource"></a>

```typescript
public readonly targetResource: TargetResource;
```

- *Type:* <a href="#cloudformation-stack-drift-detector.TargetResource">TargetResource</a>

Tag filter used to select target stacks.

If omitted, all stacks in the account and region are inspected.

---

### TargetResource <a name="TargetResource" id="cloudformation-stack-drift-detector.TargetResource"></a>

Tag filter used to select CloudFormation stacks for drift detection.

When `tagValues` is omitted, all stacks that have `tagKey` are selected.

#### Initializer <a name="Initializer" id="cloudformation-stack-drift-detector.TargetResource.Initializer"></a>

```typescript
import { TargetResource } from 'cloudformation-stack-drift-detector'

const targetResource: TargetResource = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#cloudformation-stack-drift-detector.TargetResource.property.tagKey">tagKey</a></code> | <code>string</code> | Tag key used for stack discovery. |
| <code><a href="#cloudformation-stack-drift-detector.TargetResource.property.tagValues">tagValues</a></code> | <code>string[]</code> | Tag values to match. |

---

##### `tagKey`<sup>Required</sup> <a name="tagKey" id="cloudformation-stack-drift-detector.TargetResource.property.tagKey"></a>

```typescript
public readonly tagKey: string;
```

- *Type:* string

Tag key used for stack discovery.

---

##### `tagValues`<sup>Optional</sup> <a name="tagValues" id="cloudformation-stack-drift-detector.TargetResource.property.tagValues"></a>

```typescript
public readonly tagValues: string[];
```

- *Type:* string[]

Tag values to match.

If omitted, any value for {@link TargetResource.tagKey} is accepted.

---



