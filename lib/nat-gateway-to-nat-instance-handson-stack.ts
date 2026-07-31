import {
  Aws,
  CfnOutput,
  Stack,
  StackProps,
  Tags,
} from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class NatGatewayToNatInstanceHandsonStack extends Stack {
  public constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    if (Stack.of(this).region !== 'us-east-1') {
      throw new Error('This hands-on stack must be deployed in us-east-1.');
    }

    const vpc = new ec2.CfnVPC(this, 'Vpc', {
      cidrBlock: '10.0.0.0/16',
      enableDnsHostnames: true,
      enableDnsSupport: true,
      instanceTenancy: 'default',
      tags: [{ key: 'Name', value: 'nat-handson-vpc' }],
    });

    const internetGateway = new ec2.CfnInternetGateway(this, 'InternetGateway', {
      tags: [{ key: 'Name', value: 'nat-handson-igw' }],
    });

    const internetGatewayAttachment = new ec2.CfnVPCGatewayAttachment(
      this,
      'InternetGatewayAttachment',
      {
        vpcId: vpc.ref,
        internetGatewayId: internetGateway.ref,
      },
    );

    const publicSubnet = new ec2.CfnSubnet(this, 'PublicSubnet', {
      vpcId: vpc.ref,
      cidrBlock: '10.0.0.0/24',
      availabilityZone: `${Aws.REGION}a`,
      mapPublicIpOnLaunch: true,
      tags: [{ key: 'Name', value: 'nat-handson-public-subnet' }],
    });

    const privateSubnet = new ec2.CfnSubnet(this, 'PrivateSubnet', {
      vpcId: vpc.ref,
      cidrBlock: '10.0.1.0/24',
      availabilityZone: `${Aws.REGION}a`,
      mapPublicIpOnLaunch: false,
      tags: [{ key: 'Name', value: 'nat-handson-private-subnet' }],
    });

    const publicRouteTable = new ec2.CfnRouteTable(this, 'PublicRouteTable', {
      vpcId: vpc.ref,
      tags: [{ key: 'Name', value: 'nat-handson-public-rt' }],
    });

    const publicDefaultRoute = new ec2.CfnRoute(this, 'PublicDefaultRoute', {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: internetGateway.ref,
    });
    publicDefaultRoute.addResourceDependency(internetGatewayAttachment);

    new ec2.CfnSubnetRouteTableAssociation(this, 'PublicRouteTableAssociation', {
      subnetId: publicSubnet.ref,
      routeTableId: publicRouteTable.ref,
    });

    const natGatewayEip = new ec2.CfnEIP(this, 'NatGatewayEip', {
      domain: 'vpc',
      tags: [{ key: 'Name', value: 'nat-handson-nat-gateway-eip' }],
    });
    natGatewayEip.addResourceDependency(internetGatewayAttachment);

    const natGateway = new ec2.CfnNatGateway(this, 'NatGateway', {
      subnetId: publicSubnet.ref,
      allocationId: natGatewayEip.attrAllocationId,
      connectivityType: 'public',
      tags: [{ key: 'Name', value: 'nat-handson-nat-gateway' }],
    });

    const privateRouteTable = new ec2.CfnRouteTable(this, 'PrivateRouteTable', {
      vpcId: vpc.ref,
      tags: [{ key: 'Name', value: 'nat-handson-private-rt' }],
    });

    const privateDefaultRoute = new ec2.CfnRoute(this, 'PrivateDefaultRoute', {
      routeTableId: privateRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: natGateway.ref,
    });

    new ec2.CfnSubnetRouteTableAssociation(this, 'PrivateRouteTableAssociation', {
      subnetId: privateSubnet.ref,
      routeTableId: privateRouteTable.ref,
    });

    const ssmRole = new iam.CfnRole(this, 'SessionManagerRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'ec2.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      managedPolicyArns: [
        `arn:${Aws.PARTITION}:iam::aws:policy/AmazonSSMManagedInstanceCore`,
      ],
      tags: [{ key: 'Name', value: 'nat-handson-session-manager-role' }],
    });

    const ssmInstanceProfile = new iam.CfnInstanceProfile(
      this,
      'SessionManagerInstanceProfile',
      {
        roles: [ssmRole.ref],
      },
    );

    const privateInstanceSecurityGroup = new ec2.CfnSecurityGroup(
      this,
      'PrivateInstanceSecurityGroup',
      {
        groupDescription: 'No ingress; allow outbound traffic for the private test instance',
        vpcId: vpc.ref,
        securityGroupEgress: [
          {
            ipProtocol: '-1',
            cidrIp: '0.0.0.0/0',
            description: 'Allow outbound IPv4 traffic',
          },
        ],
        tags: [{ key: 'Name', value: 'nat-handson-private-ec2-sg' }],
      },
    );

    const privateInstance = new ec2.CfnInstance(this, 'PrivateInstance', {
      imageId:
        '{{resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64}}',
      instanceType: 't3.nano',
      subnetId: privateSubnet.ref,
      securityGroupIds: [privateInstanceSecurityGroup.attrGroupId],
      iamInstanceProfile: ssmInstanceProfile.ref,
      metadataOptions: {
        httpEndpoint: 'enabled',
        httpTokens: 'required',
      },
      blockDeviceMappings: [
        {
          deviceName: '/dev/xvda',
          ebs: {
            deleteOnTermination: true,
            encrypted: true,
            volumeSize: 8,
            volumeType: 'gp3',
          },
        },
      ],
      tags: [{ key: 'Name', value: 'nat-handson-private-ec2' }],
    });
    privateInstance.addResourceDependency(privateDefaultRoute);

    Tags.of(this).add('Project', 'nat-gateway-to-nat-instance-handson');

    new CfnOutput(this, 'VpcId', {
      value: vpc.ref,
      description: 'VPC used by the hands-on',
    });
    new CfnOutput(this, 'PublicSubnetId', {
      value: publicSubnet.ref,
      description: 'Subnet in which to launch the NAT instance',
    });
    new CfnOutput(this, 'PrivateSubnetId', {
      value: privateSubnet.ref,
      description: 'Subnet containing the private test instance',
    });
    new CfnOutput(this, 'PrivateRouteTableId', {
      value: privateRouteTable.ref,
      description: 'Route table whose default route is changed during the hands-on',
    });
    new CfnOutput(this, 'PrivateInstanceId', {
      value: privateInstance.ref,
      description: 'Private test EC2 instance for Session Manager',
    });
    new CfnOutput(this, 'NatGatewayPublicIp', {
      value: natGatewayEip.ref,
      description: 'Initial outbound public IPv4 address through the NAT Gateway',
    });
    new CfnOutput(this, 'SessionManagerInstanceProfileName', {
      value: ssmInstanceProfile.ref,
      description: 'Instance profile to select when launching the NAT instance',
    });
  }
}
