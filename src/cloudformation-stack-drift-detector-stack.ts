import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CloudformationStackDriftDetector,
  CloudformationStackDriftDetectorProps,
} from './cloudformation-stack-drift-detector';

/**
 * Properties for {@link CloudformationStackDriftDetectorStack}.
 */
export interface CloudformationStackDriftDetectorStackProps extends CloudformationStackDriftDetectorProps, StackProps {}

/**
 * CDK stack that deploys {@link CloudformationStackDriftDetector}.
 */
export class CloudformationStackDriftDetectorStack extends Stack {
  /**
   * Creates a stack containing the drift detector.
   *
   * @param scope - Parent construct, usually an App.
   * @param id - Stack id.
   * @param props - Detector settings and standard stack settings.
   */
  constructor(scope: Construct, id: string, props: CloudformationStackDriftDetectorStackProps) {
    super(scope, id, props);

    new CloudformationStackDriftDetector(this, 'Detector', {
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
