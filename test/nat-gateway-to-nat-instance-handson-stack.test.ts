import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { NatGatewayToNatInstanceHandsonStack } from '../lib/nat-gateway-to-nat-instance-handson-stack';

function synthesizeTemplate(): Template {
  const app = new cdk.App();
  const stack = new NatGatewayToNatInstanceHandsonStack(app, 'TestStack', {
    env: { account: '111111111111', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
}

test('creates the one-AZ network with exact public and private CIDRs', () => {
  const template = synthesizeTemplate();

  template.hasResourceProperties('AWS::EC2::VPC', {
    CidrBlock: '10.0.0.0/16',
    EnableDnsHostnames: true,
    EnableDnsSupport: true,
  });
  template.hasResourceProperties('AWS::EC2::Subnet', {
    CidrBlock: '10.0.0.0/24',
    MapPublicIpOnLaunch: true,
  });
  template.hasResourceProperties('AWS::EC2::Subnet', {
    CidrBlock: '10.0.1.0/24',
    MapPublicIpOnLaunch: false,
  });
  template.resourceCountIs('AWS::EC2::NatGateway', 1);
  template.resourceCountIs('AWS::EC2::EIP', 1);
});

test('routes the private subnet through the NAT Gateway initially', () => {
  const template = synthesizeTemplate();

  template.hasResourceProperties('AWS::EC2::Route', {
    DestinationCidrBlock: '0.0.0.0/0',
    NatGatewayId: Match.anyValue(),
  });
});

test('creates a private, encrypted, SSM-managed test instance', () => {
  const template = synthesizeTemplate();

  template.hasResourceProperties('AWS::EC2::Instance', {
    InstanceType: 't3.nano',
    IamInstanceProfile: Match.anyValue(),
    SecurityGroupIds: [Match.anyValue()],
    BlockDeviceMappings: [
      {
        DeviceName: '/dev/xvda',
        Ebs: {
          DeleteOnTermination: true,
          Encrypted: true,
          VolumeSize: 8,
          VolumeType: 'gp3',
        },
      },
    ],
  });
  template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
    LaunchTemplateData: Match.objectLike({
      MetadataOptions: Match.objectLike({
        HttpTokens: 'required',
      }),
    }),
  });
  template.hasResourceProperties('AWS::EC2::SecurityGroup', {
    SecurityGroupIngress: Match.absent(),
    SecurityGroupEgress: [
      Match.objectLike({
        IpProtocol: '-1',
        CidrIp: '0.0.0.0/0',
      }),
    ],
  });
  template.hasResourceProperties('AWS::IAM::Role', {
    ManagedPolicyArns: [
      Match.objectLike({
        'Fn::Join': Match.anyValue(),
      }),
    ],
  });
});

test('publishes the identifiers needed by students', () => {
  const template = synthesizeTemplate();
  const outputs = template.findOutputs('*');

  expect(outputs).toEqual(
    expect.objectContaining({
      VpcId: expect.any(Object),
      PublicSubnetId: expect.any(Object),
      PrivateSubnetId: expect.any(Object),
      PrivateInstanceId: expect.any(Object),
      NatGatewayPublicIp: expect.any(Object),
      SessionManagerInstanceProfileName: expect.any(Object),
    }),
  );
});

test('rejects deployment to a region other than us-east-1', () => {
  const app = new cdk.App();

  expect(
    () =>
      new NatGatewayToNatInstanceHandsonStack(app, 'WrongRegionStack', {
        env: { account: '111111111111', region: 'ap-northeast-1' },
      }),
  ).toThrow('must be deployed in us-east-1');
});
