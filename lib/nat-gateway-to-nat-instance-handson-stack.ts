import { CfnOutput, Stack, StackProps, Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class NatGatewayToNatInstanceHandsonStack extends Stack {
  public constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    if (Stack.of(this).region !== 'us-east-1') {
      throw new Error('This hands-on stack must be deployed in us-east-1.');
    }

    const natGatewayEip = new ec2.CfnEIP(this, 'NatGatewayEip', {
      domain: 'vpc',
    });

    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 1,
      natGateways: 1,
      natGatewayProvider: ec2.NatProvider.gateway({
        eipAllocationIds: [natGatewayEip.attrAllocationId],
      }),
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    const sessionManagerRole = new iam.Role(this, 'SessionManagerRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore',
        ),
      ],
    });

    const sessionManagerInstanceProfile = new iam.CfnInstanceProfile(
      this,
      'SessionManagerInstanceProfile',
      {
        roles: [sessionManagerRole.roleName],
      },
    );

    const privateInstanceSecurityGroup = new ec2.SecurityGroup(
      this,
      'PrivateInstanceSecurityGroup',
      {
        vpc,
        description: 'No ingress; allow outbound traffic for the private test instance',
        allowAllOutbound: true,
      },
    );

    const privateInstance = new ec2.Instance(this, 'PrivateInstance', {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      instanceType: new ec2.InstanceType('t3.nano'),
      role: sessionManagerRole,
      securityGroup: privateInstanceSecurityGroup,
      requireImdsv2: true,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            encrypted: true,
            deleteOnTermination: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
    });

    Tags.of(vpc.node.defaultChild as ec2.CfnVPC).add(
      'Name',
      'nat-handson-vpc',
    );
    Tags.of(vpc.publicSubnets[0].node.defaultChild as ec2.CfnSubnet).add(
      'Name',
      'nat-handson-public-subnet',
    );
    Tags.of(vpc.privateSubnets[0].node.defaultChild as ec2.CfnSubnet).add(
      'Name',
      'nat-handson-private-subnet',
    );
    Tags.of(natGatewayEip).add('Name', 'nat-handson-nat-gateway-eip');
    Tags.of(privateInstance.node.defaultChild as ec2.CfnInstance).add(
      'Name',
      'nat-handson-private-ec2',
    );
    Tags.of(
      privateInstanceSecurityGroup.node.defaultChild as ec2.CfnSecurityGroup,
    ).add(
      'Name',
      'nat-handson-private-ec2-sg',
    );
    Tags.of(sessionManagerRole.node.defaultChild as iam.CfnRole).add(
      'Name',
      'nat-handson-session-manager-role',
    );
    Tags.of(this).add('Project', 'nat-gateway-to-nat-instance-handson');

    new CfnOutput(this, 'VpcId', {
      value: vpc.vpcId,
      description: 'VPC used by the hands-on',
    });
    new CfnOutput(this, 'PublicSubnetId', {
      value: vpc.publicSubnets[0].subnetId,
      description: 'Subnet in which to launch the NAT instance',
    });
    new CfnOutput(this, 'PrivateSubnetId', {
      value: vpc.privateSubnets[0].subnetId,
      description: 'Subnet containing the private test instance',
    });
    new CfnOutput(this, 'PrivateInstanceId', {
      value: privateInstance.instanceId,
      description: 'Private test EC2 instance for Session Manager',
    });
    new CfnOutput(this, 'NatGatewayPublicIp', {
      value: natGatewayEip.ref,
      description: 'Initial outbound public IPv4 address through the NAT Gateway',
    });
    new CfnOutput(this, 'SessionManagerInstanceProfileName', {
      value: sessionManagerInstanceProfile.ref,
      description: 'Instance profile to select when launching the NAT instance',
    });
  }
}
