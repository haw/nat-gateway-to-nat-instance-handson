#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NatGatewayToNatInstanceHandsonStack } from '../lib/nat-gateway-to-nat-instance-handson-stack';

const app = new cdk.App();

new NatGatewayToNatInstanceHandsonStack(app, 'NatGatewayToNatInstanceHandsonStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  description: 'Hands-on environment for replacing a NAT Gateway with a NAT instance',
});
