import { ProjenCdkConstructLibrary } from '@gammarers/projen-projects';
const project = new ProjenCdkConstructLibrary({
  projenrcTs: true,
  name: 'cloudformation-stack-drift-detector',
  repository: 'https://github.com/gammarers-aws-cdk-constructs/cloudformation-stack-drift-detector.git',
  devDeps: [
    '@gammarers/projen-projects@^0.2.0',
  ],
  cdkVersion: '2.232.0',
});
project.addPackageIgnore('/.devcontainer');
project.synth();