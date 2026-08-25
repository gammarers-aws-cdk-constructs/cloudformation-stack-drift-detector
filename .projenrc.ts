import { ProjenCdkConstructLibrary } from '@gammarers/projen-projects';
import { awscdk } from 'projen';

const project = new ProjenCdkConstructLibrary({
  projenrcTs: true,
  releaseToNpm: true,
  npmTrustedPublishing: true,
  name: 'cloudformation-stack-drift-detector',
  repository: 'https://github.com/gammarers-aws-cdk-constructs/cloudformation-stack-drift-detector.git',
  description: 'AWS CDK construct that runs CloudFormation stack drift detection on a daily schedule and publishes drifted stacks to Amazon SNS.',
  keywords: ['aws', 'cdk', 'construct', 'cloudformation', 'stack', 'drift', 'detector', 'sns'],
  devDeps: [
    '@gammarers/projen-projects@^0.2.0',
    '@aws/durable-execution-sdk-js@^2.3.0',
    '@aws-sdk/client-cloudformation@^3.1116.0',
    '@aws-sdk/client-resource-groups-tagging-api@^3.1116.0',
    '@aws-sdk/client-sns@^3.1116.0',
    'aws-sdk-client-mock@^4.1.0',
    'aws-sdk-client-mock-jest@^4.1.0',
  ],
  cdkVersion: '2.232.0',
  lambdaOptions: {
    runtime: awscdk.LambdaRuntime.NODEJS_22_X,
  },
});
project.addPackageIgnore('/.devcontainer');
project.synth();
