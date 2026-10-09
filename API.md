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
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetector.Initializer.parameter.props">props</a></code> | <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps">CloudformationStackDriftDetectorProps</a></code> | - Notification topic, IAM grants, optional tag filter, and durable execution settings. |

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

Notification topic, IAM grants, optional tag filter, and durable execution settings.

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
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetector.property.notificationTopic">notificationTopic</a></code> | <code>aws-cdk-lib.aws_sns.ITopic</code> | SNS topic that receives drift and failure notifications. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetector.property.role">role</a></code> | <code>aws-cdk-lib.aws_iam.IRole</code> | IAM role used by the detector Lambda. |

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

SNS topic that receives drift and failure notifications.

---

##### `role`<sup>Required</sup> <a name="role" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetector.property.role"></a>

```typescript
public readonly role: IRole;
```

- *Type:* aws-cdk-lib.aws_iam.IRole

IAM role used by the detector Lambda.

Attach extra Describe/Get permissions for resources in target stacks when
{@link CloudformationStackDriftDetectorProps.grantReadOnlyAccess} is not enough.

---


### CloudformationStackDriftDetectorStack <a name="CloudformationStackDriftDetectorStack" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack"></a>

CDK stack that deploys {@link CloudformationStackDriftDetector}.

#### Initializers <a name="Initializers" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.Initializer"></a>

```typescript
import { CloudformationStackDriftDetectorStack } from 'cloudformation-stack-drift-detector'

new CloudformationStackDriftDetectorStack(scope: Construct, id: string, props: CloudformationStackDriftDetectorStackProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | - Parent construct, usually an App. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.Initializer.parameter.id">id</a></code> | <code>string</code> | - Stack id. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.Initializer.parameter.props">props</a></code> | <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps">CloudformationStackDriftDetectorStackProps</a></code> | - Detector settings and standard stack settings. |

---

##### `scope`<sup>Required</sup> <a name="scope" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

Parent construct, usually an App.

---

##### `id`<sup>Required</sup> <a name="id" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.Initializer.parameter.id"></a>

- *Type:* string

Stack id.

---

##### `props`<sup>Required</sup> <a name="props" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.Initializer.parameter.props"></a>

- *Type:* <a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps">CloudformationStackDriftDetectorStackProps</a>

Detector settings and standard stack settings.

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.with">with</a></code> | Applies one or more mixins to this construct. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addDependency">addDependency</a></code> | Add a dependency between this stack and another stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addMetadata">addMetadata</a></code> | Adds an arbitrary key-value pair, with information you want to record about the stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addStackTag">addStackTag</a></code> | Configure a stack tag. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addTransform">addTransform</a></code> | Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.exportStringListValue">exportStringListValue</a></code> | Create a CloudFormation Export for a string list value. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.exportValue">exportValue</a></code> | Create a CloudFormation Export for a string value. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.formatArn">formatArn</a></code> | Creates an ARN from components. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.getLogicalId">getLogicalId</a></code> | Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.regionalFact">regionalFact</a></code> | Look up a fact value for the given fact for the region of this stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.removeStackTag">removeStackTag</a></code> | Remove a stack tag. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.renameLogicalId">renameLogicalId</a></code> | Rename a generated logical identities. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.reportMissingContextKey">reportMissingContextKey</a></code> | Indicate that a context key was expected. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.resolve">resolve</a></code> | Resolve a tokenized value in the context of the current stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.splitArn">splitArn</a></code> | Splits the provided ARN into its components. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.toJsonString">toJsonString</a></code> | Convert an object, potentially containing tokens, to a JSON string. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.toYamlString">toYamlString</a></code> | Convert an object, potentially containing tokens, to a YAML string. |

---

##### `toString` <a name="toString" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `with` <a name="with" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.with"></a>

```typescript
public with(mixins: ...IMixin[]): IConstruct
```

Applies one or more mixins to this construct.

Mixins are applied in order. The list of constructs is captured at the
start of the call, so constructs added by a mixin will not be visited.
Use multiple `with()` calls if subsequent mixins should apply to added
constructs.

###### `mixins`<sup>Required</sup> <a name="mixins" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.with.parameter.mixins"></a>

- *Type:* ...constructs.IMixin[]

The mixins to apply.

---

##### `addDependency` <a name="addDependency" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addDependency"></a>

```typescript
public addDependency(target: Stack, reason?: string): void
```

Add a dependency between this stack and another stack.

This can be used to define dependencies between any two stacks within an
app, and also supports nested stacks.

###### `target`<sup>Required</sup> <a name="target" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addDependency.parameter.target"></a>

- *Type:* aws-cdk-lib.Stack

---

###### `reason`<sup>Optional</sup> <a name="reason" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addDependency.parameter.reason"></a>

- *Type:* string

---

##### `addMetadata` <a name="addMetadata" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addMetadata"></a>

```typescript
public addMetadata(key: string, value: any): void
```

Adds an arbitrary key-value pair, with information you want to record about the stack.

These get translated to the Metadata section of the generated template.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html)

###### `key`<sup>Required</sup> <a name="key" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addMetadata.parameter.key"></a>

- *Type:* string

---

###### `value`<sup>Required</sup> <a name="value" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addMetadata.parameter.value"></a>

- *Type:* any

---

##### `addStackTag` <a name="addStackTag" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addStackTag"></a>

```typescript
public addStackTag(tagName: string, tagValue: string): void
```

Configure a stack tag.

At deploy time, CloudFormation will automatically apply all stack tags to all resources in the stack.

###### `tagName`<sup>Required</sup> <a name="tagName" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addStackTag.parameter.tagName"></a>

- *Type:* string

---

###### `tagValue`<sup>Required</sup> <a name="tagValue" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addStackTag.parameter.tagValue"></a>

- *Type:* string

---

##### `addTransform` <a name="addTransform" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addTransform"></a>

```typescript
public addTransform(transform: string): void
```

Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template.

Duplicate values are removed when stack is synthesized.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html)

*Example*

```typescript
declare const stack: Stack;

stack.addTransform('AWS::Serverless-2016-10-31')
```


###### `transform`<sup>Required</sup> <a name="transform" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.addTransform.parameter.transform"></a>

- *Type:* string

The transform to add.

---

##### `exportStringListValue` <a name="exportStringListValue" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.exportStringListValue"></a>

```typescript
public exportStringListValue(exportedValue: any, options?: ExportValueOptions): string[]
```

Create a CloudFormation Export for a string list value.

Returns a string list representing the corresponding `Fn.importValue()`
expression for this Export. The export expression is automatically wrapped with an
`Fn::Join` and the import value with an `Fn::Split`, since CloudFormation can only
export strings. You can control the name for the export by passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

See `exportValue` for an example of this process.

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.exportStringListValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.exportStringListValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `exportValue` <a name="exportValue" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.exportValue"></a>

```typescript
public exportValue(exportedValue: any, options?: ExportValueOptions): string
```

Create a CloudFormation Export for a string value.

Returns a string representing the corresponding `Fn.importValue()`
expression for this Export. You can control the name for the export by
passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

Here is how the process works. Let's say there are two stacks,
`producerStack` and `consumerStack`, and `producerStack` has a bucket
called `bucket`, which is referenced by `consumerStack` (perhaps because
an AWS Lambda Function writes into it, or something like that).

It is not safe to remove `producerStack.bucket` because as the bucket is being
deleted, `consumerStack` might still be using it.

Instead, the process takes two deployments:

**Deployment 1: break the relationship**:

- Make sure `consumerStack` no longer references `bucket.bucketName` (maybe the consumer
  stack now uses its own bucket, or it writes to an AWS DynamoDB table, or maybe you just
  remove the Lambda Function altogether).
- In the `ProducerStack` class, call `this.exportValue(this.bucket.bucketName)`. This
  will make sure the CloudFormation Export continues to exist while the relationship
  between the two stacks is being broken.
- Deploy (this will effectively only change the `consumerStack`, but it's safe to deploy both).

**Deployment 2: remove the bucket resource**:

- You are now free to remove the `bucket` resource from `producerStack`.
- Don't forget to remove the `exportValue()` call as well.
- Deploy again (this time only the `producerStack` will be changed -- the bucket will be deleted).

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.exportValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.exportValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `formatArn` <a name="formatArn" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.formatArn"></a>

```typescript
public formatArn(components: ArnComponents): string
```

Creates an ARN from components.

If `partition`, `region` or `account` are not specified, the stack's
partition, region and account will be used.

If any component is the empty string, an empty string will be inserted
into the generated ARN at the location that component corresponds to.

The ARN will be formatted as follows:

  arn:{partition}:{service}:{region}:{account}:{resource}{sep}{resource-name}

The required ARN pieces that are omitted will be taken from the stack that
the 'scope' is attached to. If all ARN pieces are supplied, the supplied scope
can be 'undefined'.

###### `components`<sup>Required</sup> <a name="components" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.formatArn.parameter.components"></a>

- *Type:* aws-cdk-lib.ArnComponents

---

##### `getLogicalId` <a name="getLogicalId" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.getLogicalId"></a>

```typescript
public getLogicalId(element: CfnElement): string
```

Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource.

This method is called when a `CfnElement` is created and used to render the
initial logical identity of resources. Logical ID renames are applied at
this stage.

This method uses the protected method `allocateLogicalId` to render the
logical ID for an element. To modify the naming scheme, extend the `Stack`
class and override this method.

###### `element`<sup>Required</sup> <a name="element" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.getLogicalId.parameter.element"></a>

- *Type:* aws-cdk-lib.CfnElement

The CloudFormation element for which a logical identity is needed.

---

##### `regionalFact` <a name="regionalFact" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.regionalFact"></a>

```typescript
public regionalFact(factName: string, defaultValue?: string): string
```

Look up a fact value for the given fact for the region of this stack.

Will return a definite value only if the region of the current stack is resolved.
If not, a lookup map will be added to the stack and the lookup will be done at
CDK deployment time.

What regions will be included in the lookup map is controlled by the
`@aws-cdk/core:target-partitions` context value: it must be set to a list
of partitions, and only regions from the given partitions will be included.
If no such context key is set, all regions will be included.

This function is intended to be used by construct library authors. Application
builders can rely on the abstractions offered by construct libraries and do
not have to worry about regional facts.

If `defaultValue` is not given, it is an error if the fact is unknown for
the given region.

###### `factName`<sup>Required</sup> <a name="factName" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.regionalFact.parameter.factName"></a>

- *Type:* string

---

###### `defaultValue`<sup>Optional</sup> <a name="defaultValue" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.regionalFact.parameter.defaultValue"></a>

- *Type:* string

---

##### `removeStackTag` <a name="removeStackTag" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.removeStackTag"></a>

```typescript
public removeStackTag(tagName: string): void
```

Remove a stack tag.

At deploy time, CloudFormation will automatically apply all stack tags to all resources in the stack.

###### `tagName`<sup>Required</sup> <a name="tagName" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.removeStackTag.parameter.tagName"></a>

- *Type:* string

---

##### `renameLogicalId` <a name="renameLogicalId" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.renameLogicalId"></a>

```typescript
public renameLogicalId(oldId: string, newId: string): void
```

Rename a generated logical identities.

To modify the naming scheme strategy, extend the `Stack` class and
override the `allocateLogicalId` method.

###### `oldId`<sup>Required</sup> <a name="oldId" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.renameLogicalId.parameter.oldId"></a>

- *Type:* string

---

###### `newId`<sup>Required</sup> <a name="newId" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.renameLogicalId.parameter.newId"></a>

- *Type:* string

---

##### `reportMissingContextKey` <a name="reportMissingContextKey" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.reportMissingContextKey"></a>

```typescript
public reportMissingContextKey(report: MissingContext): void
```

Indicate that a context key was expected.

Contains instructions which will be emitted into the cloud assembly on how
the key should be supplied.

###### `report`<sup>Required</sup> <a name="report" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.reportMissingContextKey.parameter.report"></a>

- *Type:* aws-cdk-lib.cloud_assembly_schema.MissingContext

The set of parameters needed to obtain the context.

---

##### `resolve` <a name="resolve" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.resolve"></a>

```typescript
public resolve(obj: any): any
```

Resolve a tokenized value in the context of the current stack.

###### `obj`<sup>Required</sup> <a name="obj" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.resolve.parameter.obj"></a>

- *Type:* any

---

##### `splitArn` <a name="splitArn" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.splitArn"></a>

```typescript
public splitArn(arn: string, arnFormat: ArnFormat): ArnComponents
```

Splits the provided ARN into its components.

Works both if 'arn' is a string like 'arn:aws:s3:::bucket',
and a Token representing a dynamic CloudFormation expression
(in which case the returned components will also be dynamic CloudFormation expressions,
encoded as Tokens).

###### `arn`<sup>Required</sup> <a name="arn" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.splitArn.parameter.arn"></a>

- *Type:* string

the ARN to split into its components.

---

###### `arnFormat`<sup>Required</sup> <a name="arnFormat" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.splitArn.parameter.arnFormat"></a>

- *Type:* aws-cdk-lib.ArnFormat

the expected format of 'arn' - depends on what format the service 'arn' represents uses.

---

##### `toJsonString` <a name="toJsonString" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.toJsonString"></a>

```typescript
public toJsonString(obj: any, space?: number): string
```

Convert an object, potentially containing tokens, to a JSON string.

###### `obj`<sup>Required</sup> <a name="obj" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.toJsonString.parameter.obj"></a>

- *Type:* any

---

###### `space`<sup>Optional</sup> <a name="space" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.toJsonString.parameter.space"></a>

- *Type:* number

---

##### `toYamlString` <a name="toYamlString" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.toYamlString"></a>

```typescript
public toYamlString(obj: any): string
```

Convert an object, potentially containing tokens, to a YAML string.

###### `obj`<sup>Required</sup> <a name="obj" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.toYamlString.parameter.obj"></a>

- *Type:* any

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.isStack">isStack</a></code> | Return whether the given object is a Stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.of">of</a></code> | Looks up the first stack scope in which `construct` is defined. |

---

##### `isConstruct` <a name="isConstruct" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.isConstruct"></a>

```typescript
import { CloudformationStackDriftDetectorStack } from 'cloudformation-stack-drift-detector'

CloudformationStackDriftDetectorStack.isConstruct(x: any)
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

###### `x`<sup>Required</sup> <a name="x" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `isStack` <a name="isStack" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.isStack"></a>

```typescript
import { CloudformationStackDriftDetectorStack } from 'cloudformation-stack-drift-detector'

CloudformationStackDriftDetectorStack.isStack(x: any)
```

Return whether the given object is a Stack.

We do attribute detection since we can't reliably use 'instanceof'.

###### `x`<sup>Required</sup> <a name="x" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.isStack.parameter.x"></a>

- *Type:* any

---

##### `of` <a name="of" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.of"></a>

```typescript
import { CloudformationStackDriftDetectorStack } from 'cloudformation-stack-drift-detector'

CloudformationStackDriftDetectorStack.of(construct: IConstruct)
```

Looks up the first stack scope in which `construct` is defined.

Fails if there is no stack up the tree.

###### `construct`<sup>Required</sup> <a name="construct" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.of.parameter.construct"></a>

- *Type:* constructs.IConstruct

The construct to start the search from.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.account">account</a></code> | <code>string</code> | The AWS account into which this stack will be deployed. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.artifactId">artifactId</a></code> | <code>string</code> | The ID of the cloud assembly artifact for this stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.availabilityZones">availabilityZones</a></code> | <code>string[]</code> | Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.bundlingRequired">bundlingRequired</a></code> | <code>boolean</code> | Indicates whether the stack requires bundling or not. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.dependencies">dependencies</a></code> | <code>aws-cdk-lib.Stack[]</code> | Return the stacks this stack depends on. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.environment">environment</a></code> | <code>string</code> | The environment coordinates in which this stack is deployed. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.nested">nested</a></code> | <code>boolean</code> | Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.notificationArns">notificationArns</a></code> | <code>string[]</code> | Returns the list of notification Amazon Resource Names (ARNs) for the current stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.partition">partition</a></code> | <code>string</code> | The partition in which this stack is defined. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.region">region</a></code> | <code>string</code> | The AWS region into which this stack will be deployed (e.g. `us-west-2`). |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.stackId">stackId</a></code> | <code>string</code> | The ID of the stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.stackName">stackName</a></code> | <code>string</code> | The concrete CloudFormation physical stack name. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method for this stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.tags">tags</a></code> | <code>aws-cdk-lib.TagManager</code> | Tags to be applied to the stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.templateFile">templateFile</a></code> | <code>string</code> | The name of the CloudFormation template file emitted to the output directory during synthesis. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.templateOptions">templateOptions</a></code> | <code>aws-cdk-lib.ITemplateOptions</code> | Options for CloudFormation template (like version, transform, description). |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.urlSuffix">urlSuffix</a></code> | <code>string</code> | The Amazon domain suffix for the region in which this stack is defined. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.nestedStackParent">nestedStackParent</a></code> | <code>aws-cdk-lib.Stack</code> | If this is a nested stack, returns it's parent stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.nestedStackResource">nestedStackResource</a></code> | <code>aws-cdk-lib.CfnResource</code> | If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether termination protection is enabled for this stack. |

---

##### `node`<sup>Required</sup> <a name="node" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `account`<sup>Required</sup> <a name="account" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

The AWS account into which this stack will be deployed.

This value is resolved according to the following rules:

1. The value provided to `env.account` when the stack is defined. This can
   either be a concrete account (e.g. `585695031111`) or the
   `Aws.ACCOUNT_ID` token.
3. `Aws.ACCOUNT_ID`, which represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::AccountId" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.account)` returns
`true`), this implies that the user wishes that this stack will synthesize
into an **account-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other account-agnostic behavior.

---

##### `artifactId`<sup>Required</sup> <a name="artifactId" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.artifactId"></a>

```typescript
public readonly artifactId: string;
```

- *Type:* string

The ID of the cloud assembly artifact for this stack.

---

##### `availabilityZones`<sup>Required</sup> <a name="availabilityZones" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.availabilityZones"></a>

```typescript
public readonly availabilityZones: string[];
```

- *Type:* string[]

Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack.

If the stack is environment-agnostic (either account and/or region are
tokens), this property will return an array with 2 tokens that will resolve
at deploy-time to the first two availability zones returned from CloudFormation's
`Fn::GetAZs` intrinsic function.

If they are not available in the context, returns a set of dummy values and
reports them as missing, and let the CLI resolve them by calling EC2
`DescribeAvailabilityZones` on the target environment.

To specify a different strategy for selecting availability zones override this method.

---

##### `bundlingRequired`<sup>Required</sup> <a name="bundlingRequired" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.bundlingRequired"></a>

```typescript
public readonly bundlingRequired: boolean;
```

- *Type:* boolean

Indicates whether the stack requires bundling or not.

---

##### `dependencies`<sup>Required</sup> <a name="dependencies" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.dependencies"></a>

```typescript
public readonly dependencies: Stack[];
```

- *Type:* aws-cdk-lib.Stack[]

Return the stacks this stack depends on.

---

##### `environment`<sup>Required</sup> <a name="environment" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.environment"></a>

```typescript
public readonly environment: string;
```

- *Type:* string

The environment coordinates in which this stack is deployed.

In the form
`aws://account/region`. Use `stack.account` and `stack.region` to obtain
the specific values, no need to parse.

You can use this value to determine if two stacks are targeting the same
environment.

If either `stack.account` or `stack.region` are not concrete values (e.g.
`Aws.ACCOUNT_ID` or `Aws.REGION`) the special strings `unknown-account` and/or
`unknown-region` will be used respectively to indicate this stack is
region/account-agnostic.

---

##### `nested`<sup>Required</sup> <a name="nested" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.nested"></a>

```typescript
public readonly nested: boolean;
```

- *Type:* boolean

Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent.

---

##### `notificationArns`<sup>Required</sup> <a name="notificationArns" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.notificationArns"></a>

```typescript
public readonly notificationArns: string[];
```

- *Type:* string[]

Returns the list of notification Amazon Resource Names (ARNs) for the current stack.

---

##### `partition`<sup>Required</sup> <a name="partition" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.partition"></a>

```typescript
public readonly partition: string;
```

- *Type:* string

The partition in which this stack is defined.

---

##### `region`<sup>Required</sup> <a name="region" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

The AWS region into which this stack will be deployed (e.g. `us-west-2`).

This value is resolved according to the following rules:

1. The value provided to `env.region` when the stack is defined. This can
   either be a concrete region (e.g. `us-west-2`) or the `Aws.REGION`
   token.
3. `Aws.REGION`, which is represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::Region" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.region)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **region-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `stackId`<sup>Required</sup> <a name="stackId" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.stackId"></a>

```typescript
public readonly stackId: string;
```

- *Type:* string

The ID of the stack.

---

*Example*

```typescript
// After resolving, looks like
'arn:aws:cloudformation:us-west-2:123456789012:stack/teststack/51af3dc0-da77-11e4-872e-1234567db123'
```


##### `stackName`<sup>Required</sup> <a name="stackName" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string

The concrete CloudFormation physical stack name.

This is either the name defined explicitly in the `stackName` prop or
allocated based on the stack's location in the construct tree. Stacks that
are directly defined under the app use their construct `id` as their stack
name. Stacks that are defined deeper within the tree will use a hashed naming
scheme based on the construct path to ensure uniqueness.

If you wish to obtain the deploy-time AWS::StackName intrinsic,
you can use `Aws.STACK_NAME` directly.

---

##### `synthesizer`<sup>Required</sup> <a name="synthesizer" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer

Synthesis method for this stack.

---

##### `tags`<sup>Required</sup> <a name="tags" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.tags"></a>

```typescript
public readonly tags: TagManager;
```

- *Type:* aws-cdk-lib.TagManager

Tags to be applied to the stack.

---

##### `templateFile`<sup>Required</sup> <a name="templateFile" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.templateFile"></a>

```typescript
public readonly templateFile: string;
```

- *Type:* string

The name of the CloudFormation template file emitted to the output directory during synthesis.

Example value: `MyStack.template.json`

---

##### `templateOptions`<sup>Required</sup> <a name="templateOptions" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.templateOptions"></a>

```typescript
public readonly templateOptions: ITemplateOptions;
```

- *Type:* aws-cdk-lib.ITemplateOptions

Options for CloudFormation template (like version, transform, description).

---

##### `urlSuffix`<sup>Required</sup> <a name="urlSuffix" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.urlSuffix"></a>

```typescript
public readonly urlSuffix: string;
```

- *Type:* string

The Amazon domain suffix for the region in which this stack is defined.

---

##### `nestedStackParent`<sup>Optional</sup> <a name="nestedStackParent" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.nestedStackParent"></a>

```typescript
public readonly nestedStackParent: Stack;
```

- *Type:* aws-cdk-lib.Stack

If this is a nested stack, returns it's parent stack.

---

##### `nestedStackResource`<sup>Optional</sup> <a name="nestedStackResource" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.nestedStackResource"></a>

```typescript
public readonly nestedStackResource: CfnResource;
```

- *Type:* aws-cdk-lib.CfnResource

If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource.

`undefined` for top-level (non-nested) stacks.

---

##### `terminationProtection`<sup>Required</sup> <a name="terminationProtection" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStack.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean

Whether termination protection is enabled for this stack.

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
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.notificationTopic">notificationTopic</a></code> | <code>aws-cdk-lib.aws_sns.ITopic</code> | SNS topic that receives drift and failure notifications. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.additionalPolicyStatements">additionalPolicyStatements</a></code> | <code>aws-cdk-lib.aws_iam.PolicyStatement[]</code> | Extra IAM statements attached to the detector Lambda role. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.executionTimeout">executionTimeout</a></code> | <code>aws-cdk-lib.Duration</code> | Maximum duration of a durable execution. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.grantReadOnlyAccess">grantReadOnlyAccess</a></code> | <code><a href="#cloudformation-stack-drift-detector.ReadOnlyAccessGrant">ReadOnlyAccessGrant</a></code> | Whether to attach the AWS managed `ReadOnlyAccess` policy so DetectStackDrift can describe resources in target stacks. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.notificationTopicKey">notificationTopicKey</a></code> | <code>aws-cdk-lib.aws_kms.IKey</code> | Customer-managed KMS key that encrypts {@link CloudformationStackDriftDetectorProps.notificationTopic}. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.retentionPeriod">retentionPeriod</a></code> | <code>aws-cdk-lib.Duration</code> | How long durable execution history is retained after completion. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.targetResource">targetResource</a></code> | <code><a href="#cloudformation-stack-drift-detector.TargetResource">TargetResource</a></code> | Tag filter used to select target stacks. |

---

##### `notificationTopic`<sup>Required</sup> <a name="notificationTopic" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.notificationTopic"></a>

```typescript
public readonly notificationTopic: ITopic;
```

- *Type:* aws-cdk-lib.aws_sns.ITopic

SNS topic that receives drift and failure notifications.

---

##### `additionalPolicyStatements`<sup>Optional</sup> <a name="additionalPolicyStatements" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.additionalPolicyStatements"></a>

```typescript
public readonly additionalPolicyStatements: PolicyStatement[];
```

- *Type:* aws-cdk-lib.aws_iam.PolicyStatement[]
- *Default:* no extra inline statements

Extra IAM statements attached to the detector Lambda role.

Use this to grant Describe/Get permissions for resources in target stacks
(for example `s3:GetBucket*` or `ec2:Describe*`).

---

##### `executionTimeout`<sup>Optional</sup> <a name="executionTimeout" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.executionTimeout"></a>

```typescript
public readonly executionTimeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.hours(1)

Maximum duration of a durable execution.

---

##### `grantReadOnlyAccess`<sup>Optional</sup> <a name="grantReadOnlyAccess" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.grantReadOnlyAccess"></a>

```typescript
public readonly grantReadOnlyAccess: ReadOnlyAccessGrant;
```

- *Type:* <a href="#cloudformation-stack-drift-detector.ReadOnlyAccessGrant">ReadOnlyAccessGrant</a>
- *Default:* {@link ReadOnlyAccessGrant.DISABLED }

Whether to attach the AWS managed `ReadOnlyAccess` policy so DetectStackDrift can describe resources in target stacks.

---

##### `notificationTopicKey`<sup>Optional</sup> <a name="notificationTopicKey" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorProps.property.notificationTopicKey"></a>

```typescript
public readonly notificationTopicKey: IKey;
```

- *Type:* aws-cdk-lib.aws_kms.IKey
- *Default:* no extra KMS grant; relies on `grantPublish` when the topic exposes a key

Customer-managed KMS key that encrypts {@link CloudformationStackDriftDetectorProps.notificationTopic}.

`grantPublish` already grants KMS when the topic is a `sns.Topic` with `masterKey`.
Pass this for imported topics (`fromTopicArn`), where the encryption key is otherwise unknown.

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

If omitted, every stable stack in the account and region is inspected.

---

### CloudformationStackDriftDetectorStackProps <a name="CloudformationStackDriftDetectorStackProps" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps"></a>

Properties for {@link CloudformationStackDriftDetectorStack}.

#### Initializer <a name="Initializer" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.Initializer"></a>

```typescript
import { CloudformationStackDriftDetectorStackProps } from 'cloudformation-stack-drift-detector'

const cloudformationStackDriftDetectorStackProps: CloudformationStackDriftDetectorStackProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.notificationTopic">notificationTopic</a></code> | <code>aws-cdk-lib.aws_sns.ITopic</code> | SNS topic that receives drift and failure notifications. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.additionalPolicyStatements">additionalPolicyStatements</a></code> | <code>aws-cdk-lib.aws_iam.PolicyStatement[]</code> | Extra IAM statements attached to the detector Lambda role. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.executionTimeout">executionTimeout</a></code> | <code>aws-cdk-lib.Duration</code> | Maximum duration of a durable execution. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.grantReadOnlyAccess">grantReadOnlyAccess</a></code> | <code><a href="#cloudformation-stack-drift-detector.ReadOnlyAccessGrant">ReadOnlyAccessGrant</a></code> | Whether to attach the AWS managed `ReadOnlyAccess` policy so DetectStackDrift can describe resources in target stacks. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.notificationTopicKey">notificationTopicKey</a></code> | <code>aws-cdk-lib.aws_kms.IKey</code> | Customer-managed KMS key that encrypts {@link CloudformationStackDriftDetectorProps.notificationTopic}. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.retentionPeriod">retentionPeriod</a></code> | <code>aws-cdk-lib.Duration</code> | How long durable execution history is retained after completion. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.targetResource">targetResource</a></code> | <code><a href="#cloudformation-stack-drift-detector.TargetResource">TargetResource</a></code> | Tag filter used to select target stacks. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.analyticsReporting">analyticsReporting</a></code> | <code>boolean</code> | Include runtime versioning information in this Stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.crossRegionReferences">crossRegionReferences</a></code> | <code>boolean</code> | Enable this flag to allow native cross region stack references. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.description">description</a></code> | <code>string</code> | A description of the stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.env">env</a></code> | <code>aws-cdk-lib.Environment</code> | The AWS environment (account/region) where this stack will be deployed. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.notificationArns">notificationArns</a></code> | <code>string[]</code> | SNS Topic ARNs that will receive stack events. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.permissionsBoundary">permissionsBoundary</a></code> | <code>aws-cdk-lib.PermissionsBoundary</code> | Options for applying a permissions boundary to all IAM Roles and Users created within this Stage. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.propertyInjectors">propertyInjectors</a></code> | <code>aws-cdk-lib.IPropertyInjector[]</code> | A list of IPropertyInjector attached to this Stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.stackName">stackName</a></code> | <code>string</code> | Name to deploy the stack with. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.suppressTemplateIndentation">suppressTemplateIndentation</a></code> | <code>boolean</code> | Enable this flag to suppress indentation in generated CloudFormation templates. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method to use while deploying this stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.tags">tags</a></code> | <code>{[ key: string ]: string}</code> | Tags that will be applied to the Stack. |
| <code><a href="#cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether to enable termination protection for this stack. |

---

##### `notificationTopic`<sup>Required</sup> <a name="notificationTopic" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.notificationTopic"></a>

```typescript
public readonly notificationTopic: ITopic;
```

- *Type:* aws-cdk-lib.aws_sns.ITopic

SNS topic that receives drift and failure notifications.

---

##### `additionalPolicyStatements`<sup>Optional</sup> <a name="additionalPolicyStatements" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.additionalPolicyStatements"></a>

```typescript
public readonly additionalPolicyStatements: PolicyStatement[];
```

- *Type:* aws-cdk-lib.aws_iam.PolicyStatement[]
- *Default:* no extra inline statements

Extra IAM statements attached to the detector Lambda role.

Use this to grant Describe/Get permissions for resources in target stacks
(for example `s3:GetBucket*` or `ec2:Describe*`).

---

##### `executionTimeout`<sup>Optional</sup> <a name="executionTimeout" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.executionTimeout"></a>

```typescript
public readonly executionTimeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.hours(1)

Maximum duration of a durable execution.

---

##### `grantReadOnlyAccess`<sup>Optional</sup> <a name="grantReadOnlyAccess" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.grantReadOnlyAccess"></a>

```typescript
public readonly grantReadOnlyAccess: ReadOnlyAccessGrant;
```

- *Type:* <a href="#cloudformation-stack-drift-detector.ReadOnlyAccessGrant">ReadOnlyAccessGrant</a>
- *Default:* {@link ReadOnlyAccessGrant.DISABLED }

Whether to attach the AWS managed `ReadOnlyAccess` policy so DetectStackDrift can describe resources in target stacks.

---

##### `notificationTopicKey`<sup>Optional</sup> <a name="notificationTopicKey" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.notificationTopicKey"></a>

```typescript
public readonly notificationTopicKey: IKey;
```

- *Type:* aws-cdk-lib.aws_kms.IKey
- *Default:* no extra KMS grant; relies on `grantPublish` when the topic exposes a key

Customer-managed KMS key that encrypts {@link CloudformationStackDriftDetectorProps.notificationTopic}.

`grantPublish` already grants KMS when the topic is a `sns.Topic` with `masterKey`.
Pass this for imported topics (`fromTopicArn`), where the encryption key is otherwise unknown.

---

##### `retentionPeriod`<sup>Optional</sup> <a name="retentionPeriod" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.retentionPeriod"></a>

```typescript
public readonly retentionPeriod: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.days(30)

How long durable execution history is retained after completion.

---

##### `targetResource`<sup>Optional</sup> <a name="targetResource" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.targetResource"></a>

```typescript
public readonly targetResource: TargetResource;
```

- *Type:* <a href="#cloudformation-stack-drift-detector.TargetResource">TargetResource</a>

Tag filter used to select target stacks.

If omitted, every stable stack in the account and region is inspected.

---

##### `analyticsReporting`<sup>Optional</sup> <a name="analyticsReporting" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.analyticsReporting"></a>

```typescript
public readonly analyticsReporting: boolean;
```

- *Type:* boolean
- *Default:* `analyticsReporting` setting of containing `App`, or value of 'aws:cdk:version-reporting' context key

Include runtime versioning information in this Stack.

---

##### `crossRegionReferences`<sup>Optional</sup> <a name="crossRegionReferences" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.crossRegionReferences"></a>

```typescript
public readonly crossRegionReferences: boolean;
```

- *Type:* boolean
- *Default:* false

Enable this flag to allow native cross region stack references.

Enabling this will create a CloudFormation custom resource
in both the producing stack and consuming stack in order to perform the export/import

This feature is currently experimental

---

##### `description`<sup>Optional</sup> <a name="description" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string
- *Default:* No description.

A description of the stack.

---

##### `env`<sup>Optional</sup> <a name="env" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.env"></a>

```typescript
public readonly env: Environment;
```

- *Type:* aws-cdk-lib.Environment
- *Default:* The environment of the containing `Stage` if available, otherwise create the stack will be environment-agnostic.

The AWS environment (account/region) where this stack will be deployed.

Set the `region`/`account` fields of `env` to either a concrete value to
select the indicated environment (recommended for production stacks), or to
the values of environment variables
`CDK_DEFAULT_REGION`/`CDK_DEFAULT_ACCOUNT` to let the target environment
depend on the AWS credentials/configuration that the CDK CLI is executed
under (recommended for development stacks).

If the `Stack` is instantiated inside a `Stage`, any undefined
`region`/`account` fields from `env` will default to the same field on the
encompassing `Stage`, if configured there.

If either `region` or `account` are not set nor inherited from `Stage`, the
Stack will be considered "*environment-agnostic*"". Environment-agnostic
stacks can be deployed to any environment but may not be able to take
advantage of all features of the CDK. For example, they will not be able to
use environmental context lookups such as `ec2.Vpc.fromLookup` and will not
automatically translate Service Principals to the right format based on the
environment's AWS partition, and other such enhancements.

---

*Example*

```typescript
// Use a concrete account and region to deploy this stack to:
// `.account` and `.region` will simply return these values.
new Stack(app, 'Stack1', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  },
});

// Use the CLI's current credentials to determine the target environment:
// `.account` and `.region` will reflect the account+region the CLI
// is configured to use (based on the user CLI credentials)
new Stack(app, 'Stack2', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
});

// Define multiple stacks stage associated with an environment
const myStage = new Stage(app, 'MyStage', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  }
});

// both of these stacks will use the stage's account/region:
// `.account` and `.region` will resolve to the concrete values as above
new MyStack(myStage, 'Stack1');
new YourStack(myStage, 'Stack2');

// Define an environment-agnostic stack:
// `.account` and `.region` will resolve to `{ "Ref": "AWS::AccountId" }` and `{ "Ref": "AWS::Region" }` respectively.
// which will only resolve to actual values by CloudFormation during deployment.
new MyStack(app, 'Stack1');
```


##### `notificationArns`<sup>Optional</sup> <a name="notificationArns" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.notificationArns"></a>

```typescript
public readonly notificationArns: string[];
```

- *Type:* string[]
- *Default:* no notification arns.

SNS Topic ARNs that will receive stack events.

---

##### `permissionsBoundary`<sup>Optional</sup> <a name="permissionsBoundary" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.permissionsBoundary"></a>

```typescript
public readonly permissionsBoundary: PermissionsBoundary;
```

- *Type:* aws-cdk-lib.PermissionsBoundary
- *Default:* no permissions boundary is applied

Options for applying a permissions boundary to all IAM Roles and Users created within this Stage.

---

##### `propertyInjectors`<sup>Optional</sup> <a name="propertyInjectors" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.propertyInjectors"></a>

```typescript
public readonly propertyInjectors: IPropertyInjector[];
```

- *Type:* aws-cdk-lib.IPropertyInjector[]
- *Default:* no PropertyInjectors

A list of IPropertyInjector attached to this Stack.

---

##### `stackName`<sup>Optional</sup> <a name="stackName" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string
- *Default:* Derived from construct path.

Name to deploy the stack with.

---

##### `suppressTemplateIndentation`<sup>Optional</sup> <a name="suppressTemplateIndentation" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.suppressTemplateIndentation"></a>

```typescript
public readonly suppressTemplateIndentation: boolean;
```

- *Type:* boolean
- *Default:* the value of `@aws-cdk/core:suppressTemplateIndentation`, or `false` if that is not set.

Enable this flag to suppress indentation in generated CloudFormation templates.

If not specified, the value of the `@aws-cdk/core:suppressTemplateIndentation`
context key will be used. If that is not specified, then the
default value `false` will be used.

---

##### `synthesizer`<sup>Optional</sup> <a name="synthesizer" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer
- *Default:* The synthesizer specified on `App`, or `DefaultStackSynthesizer` otherwise.

Synthesis method to use while deploying this stack.

The Stack Synthesizer controls aspects of synthesis and deployment,
like how assets are referenced and what IAM roles to use. For more
information, see the README of the main CDK package.

If not specified, the `defaultStackSynthesizer` from `App` will be used.
If that is not specified, `DefaultStackSynthesizer` is used if
`@aws-cdk/core:newStyleStackSynthesis` is set to `true` or the CDK major
version is v2. In CDK v1 `LegacyStackSynthesizer` is the default if no
other synthesizer is specified.

---

##### `tags`<sup>Optional</sup> <a name="tags" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.tags"></a>

```typescript
public readonly tags: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}
- *Default:* {}

Tags that will be applied to the Stack.

These tags are applied to the CloudFormation Stack itself. They will not
appear in the CloudFormation template.

However, at deployment time, CloudFormation will apply these tags to all
resources in the stack that support tagging. You will not be able to exempt
resources from tagging (using the `excludeResourceTypes` property of
`Tags.of(...).add()`) for tags applied in this way.

---

##### `terminationProtection`<sup>Optional</sup> <a name="terminationProtection" id="cloudformation-stack-drift-detector.CloudformationStackDriftDetectorStackProps.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean
- *Default:* false

Whether to enable termination protection for this stack.

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



## Enums <a name="Enums" id="Enums"></a>

### ReadOnlyAccessGrant <a name="ReadOnlyAccessGrant" id="cloudformation-stack-drift-detector.ReadOnlyAccessGrant"></a>

Whether the detector role receives the AWS managed ReadOnlyAccess policy.

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#cloudformation-stack-drift-detector.ReadOnlyAccessGrant.DISABLED">DISABLED</a></code> | Do not attach AWS managed ReadOnlyAccess. |
| <code><a href="#cloudformation-stack-drift-detector.ReadOnlyAccessGrant.ENABLED">ENABLED</a></code> | Attach AWS managed ReadOnlyAccess so DetectStackDrift can describe resources. |

---

##### `DISABLED` <a name="DISABLED" id="cloudformation-stack-drift-detector.ReadOnlyAccessGrant.DISABLED"></a>

Do not attach AWS managed ReadOnlyAccess.

---


##### `ENABLED` <a name="ENABLED" id="cloudformation-stack-drift-detector.ReadOnlyAccessGrant.ENABLED"></a>

Attach AWS managed ReadOnlyAccess so DetectStackDrift can describe resources.

---

