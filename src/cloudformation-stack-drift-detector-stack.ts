import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CloudFormationStackDriftDetector,
  CloudFormationStackDriftDetectorProps,
} from './cloudformation-stack-drift-detector';

/**
 * Properties for {@link CloudFormationStackDriftDetectorStack}.
 */
export interface CloudFormationStackDriftDetectorStackProps extends CloudFormationStackDriftDetectorProps, StackProps {}

/**
 * CDK stack that deploys {@link CloudFormationStackDriftDetector}.
 */
export class CloudFormationStackDriftDetectorStack extends Stack {
  /**
   * Creates a stack containing the drift detector.
   *
   * @param scope - Parent construct, usually an App.
   * @param id - Stack id.
   * @param props - Detector settings and standard stack settings.
   */
  constructor(scope: Construct, id: string, props: CloudFormationStackDriftDetectorStackProps) {
    super(scope, id, props);

    new CloudFormationStackDriftDetector(this, 'Detector', {
      notificationTopic: props.notificationTopic,
      notificationTopicKey: props.notificationTopicKey,
      targetResource: props.targetResource,
      executionTimeout: props.executionTimeout,
      retentionPeriod: props.retentionPeriod,
      additionalPolicyStatements: props.additionalPolicyStatements,
      grantReadOnlyAccess: props.grantReadOnlyAccess,
    });
  }
}
